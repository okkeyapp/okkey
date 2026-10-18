-- Rebuild template payloads with an allowlist of structural section/field keys only.
--
-- After applying this migration (and 0037) on an upgraded database:
-- - Pre-filled template field values are no longer stored; existing templates become empty forms.
-- - Cleared values may still exist in Postgres `pg_wal`, archived WAL / PITR history, replicas,
--   filesystem/volume snapshots, and older logical backups until those are rotated or expire.
-- - Recommended post-upgrade hygiene during a maintenance window:
--   `VACUUM (FULL) workspace_item_templates;`
--   Warning: `VACUUM (FULL)` takes an exclusive lock on the table (blocks reads/writes) for the
--   duration of the rewrite. Prefer a quiet window; a full-database `VACUUM (FULL)` has the same
--   locking cost for each rewritten relation.
-- - Rotate backups / snapshot retention so retained dumps no longer include previous payloads.

UPDATE workspace_item_templates AS wit
SET
  payload_json = (
    SELECT jsonb_strip_nulls(
      jsonb_build_object(
        'record_name', '""'::jsonb,
        'vault_id', COALESCE(wit.payload_json->'vault_id', '""'::jsonb),
        'folder_id', COALESCE(wit.payload_json->'folder_id', '""'::jsonb),
        'tags', '[]'::jsonb,
        'favicon_source', CASE
          WHEN wit.payload_json->>'favicon_source' IN ('manual', 'website')
            THEN wit.payload_json->'favicon_source'
          ELSE NULL
        END,
        'sections', COALESCE(
          (
            SELECT jsonb_agg(section_obj ORDER BY section_ordinality)
            FROM (
              SELECT
                section_ordinality,
                jsonb_strip_nulls(
                  jsonb_build_object(
                    'id', CASE WHEN jsonb_typeof(section->'id') = 'string' THEN section->'id' ELSE NULL END,
                    'variant', CASE
                      WHEN section->>'variant' IN ('primary', 'additional') THEN section->'variant'
                      ELSE NULL
                    END,
                    'title', CASE WHEN jsonb_typeof(section->'title') = 'string' THEN section->'title' ELSE NULL END,
                    'fields', COALESCE(
                      (
                        SELECT jsonb_agg(field_obj ORDER BY field_ordinality)
                        FROM (
                          SELECT
                            field_ordinality,
                            jsonb_strip_nulls(
                              jsonb_build_object(
                                'id', CASE WHEN jsonb_typeof(field->'id') = 'string' THEN field->'id' ELSE NULL END,
                                'type', CASE WHEN jsonb_typeof(field->'type') = 'string' THEN field->'type' ELSE NULL END,
                                'label', CASE WHEN jsonb_typeof(field->'label') = 'string' THEN field->'label' ELSE NULL END,
                                'value', '""'::jsonb,
                                'editableLabel', CASE WHEN jsonb_typeof(field->'editableLabel') = 'boolean' THEN field->'editableLabel' ELSE NULL END,
                                'secret', CASE WHEN jsonb_typeof(field->'secret') = 'boolean' THEN field->'secret' ELSE NULL END,
                                'secretKind', CASE
                                  WHEN field->>'secretKind' IN ('password', 'single-line', 'multi-line')
                                    THEN field->'secretKind'
                                  ELSE NULL
                                END,
                                'deletable', CASE WHEN jsonb_typeof(field->'deletable') = 'boolean' THEN field->'deletable' ELSE NULL END,
                                'required', CASE WHEN jsonb_typeof(field->'required') = 'boolean' THEN field->'required' ELSE NULL END,
                                'urlAutofillScope', CASE
                                  WHEN field->>'urlAutofillScope' IN ('entire-site', 'exact-url', 'none')
                                    THEN field->'urlAutofillScope'
                                  ELSE NULL
                                END,
                                'disableClickCopy', CASE WHEN jsonb_typeof(field->'disableClickCopy') = 'boolean' THEN field->'disableClickCopy' ELSE NULL END,
                                'selectOptions', CASE
                                  WHEN jsonb_typeof(field->'selectOptions') = 'array' THEN (
                                    SELECT COALESCE(
                                      jsonb_agg(
                                        jsonb_build_object(
                                          'value', opt->'value',
                                          'label', opt->'label'
                                        )
                                      ),
                                      '[]'::jsonb
                                    )
                                    FROM jsonb_array_elements(field->'selectOptions') AS opt
                                    WHERE jsonb_typeof(opt) = 'object'
                                      AND jsonb_typeof(opt->'value') = 'string'
                                      AND jsonb_typeof(opt->'label') = 'string'
                                  )
                                  ELSE NULL
                                END
                              )
                            ) AS field_obj
                          FROM jsonb_array_elements(COALESCE(section->'fields', '[]'::jsonb))
                            WITH ORDINALITY AS field_rows(field, field_ordinality)
                          WHERE jsonb_typeof(field) = 'object'
                            AND jsonb_typeof(field->'id') = 'string'
                            AND jsonb_typeof(field->'type') = 'string'
                            AND jsonb_typeof(field->'label') = 'string'
                        ) AS fields_built
                      ),
                      '[]'::jsonb
                    )
                  )
                ) AS section_obj
              FROM jsonb_array_elements(COALESCE(wit.payload_json->'sections', '[]'::jsonb))
                WITH ORDINALITY AS section_rows(section, section_ordinality)
              WHERE jsonb_typeof(section) = 'object'
                AND jsonb_typeof(section->'id') = 'string'
            ) AS sections_built
          ),
          '[]'::jsonb
        )
      )
    )
  ),
  updated_at = now();
