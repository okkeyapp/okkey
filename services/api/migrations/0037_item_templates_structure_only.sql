-- Workspace item templates store form structure only (no pre-filled field values).
--
-- After applying this migration on an upgraded database:
-- - Pre-filled template field values are no longer stored; existing templates become empty forms.
-- - Cleared values may still exist in Postgres WAL and older backups until those are rotated.
-- - Operators should run `VACUUM (FULL) workspace_item_templates;` (or a full-DB vacuum during
--   a maintenance window) and rotate backups so retained dumps no longer contain old payloads.

COMMENT ON TABLE workspace_item_templates IS
  'Workspace-shared new-item form templates (structure only; field values are not stored).';

-- Rebuild payload_json with an allowlist of structural keys only.
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
                    'id', section->'id',
                    'variant', section->'variant',
                    'title', section->'title',
                    'fields', COALESCE(
                      (
                        SELECT jsonb_agg(field_obj ORDER BY field_ordinality)
                        FROM (
                          SELECT
                            field_ordinality,
                            jsonb_strip_nulls(
                              jsonb_build_object(
                                'id', field->'id',
                                'type', field->'type',
                                'label', field->'label',
                                'value', '""'::jsonb,
                                'editableLabel', field->'editableLabel',
                                'secret', field->'secret',
                                'secretKind', field->'secretKind',
                                'deletable', field->'deletable',
                                'required', field->'required',
                                'urlAutofillScope', field->'urlAutofillScope',
                                'disableClickCopy', field->'disableClickCopy',
                                'selectOptions', field->'selectOptions'
                              )
                            ) AS field_obj
                          FROM jsonb_array_elements(COALESCE(section->'fields', '[]'::jsonb))
                            WITH ORDINALITY AS field_rows(field, field_ordinality)
                          WHERE jsonb_typeof(field) = 'object'
                        ) AS fields_built
                      ),
                      '[]'::jsonb
                    )
                  )
                ) AS section_obj
              FROM jsonb_array_elements(COALESCE(wit.payload_json->'sections', '[]'::jsonb))
                WITH ORDINALITY AS section_rows(section, section_ordinality)
              WHERE jsonb_typeof(section) = 'object'
            ) AS sections_built
          ),
          '[]'::jsonb
        )
      )
    )
  ),
  updated_at = now();
