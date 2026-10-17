-- Workspace item templates store form structure only (no pre-filled field values).

COMMENT ON TABLE workspace_item_templates IS
  'Workspace-shared new-item form templates (structure only; field values are not stored).';

UPDATE workspace_item_templates
SET
  payload_json = jsonb_set(
    jsonb_set(
      jsonb_set(
        payload_json,
        '{record_name}',
        '""'::jsonb
      ),
      '{tags}',
      '[]'::jsonb
    ),
    '{sections}',
    COALESCE(
      (
        SELECT jsonb_agg(
          CASE
            WHEN jsonb_typeof(section) = 'object' THEN
              jsonb_set(
                section,
                '{fields}',
                COALESCE(
                  (
                    SELECT jsonb_agg(
                      CASE
                        WHEN jsonb_typeof(field) = 'object' THEN
                          (field - 'copyValue') || jsonb_build_object('value', '')
                        ELSE field
                      END
                      ORDER BY field_ordinality
                    )
                    FROM jsonb_array_elements(COALESCE(section->'fields', '[]'::jsonb))
                      WITH ORDINALITY AS field_rows(field, field_ordinality)
                  ),
                  '[]'::jsonb
                )
              )
            ELSE section
          END
          ORDER BY section_ordinality
        )
        FROM jsonb_array_elements(COALESCE(payload_json->'sections', '[]'::jsonb))
          WITH ORDINALITY AS section_rows(section, section_ordinality)
      ),
      '[]'::jsonb
    )
  ),
  updated_at = now();
