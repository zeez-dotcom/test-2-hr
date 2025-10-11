DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'payroll_frequencies'
  ) THEN
    ALTER TABLE companies
      ADD COLUMN payroll_frequencies jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN payroll_calendars jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN payroll_export_formats jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;

DO $$
DECLARE
  legacy_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'payroll_settings'
  ) INTO legacy_exists;

  IF legacy_exists THEN
    UPDATE companies
    SET
      payroll_frequencies = COALESCE(
        CASE
          WHEN payroll_settings IS NULL OR trim(payroll_settings) = '' THEN NULL
          ELSE (
            CASE jsonb_typeof(payroll_settings::jsonb)
              WHEN 'array' THEN payroll_settings::jsonb
              WHEN 'object' THEN (
                CASE
                  WHEN jsonb_typeof((payroll_settings::jsonb)->'frequencies') = 'array' THEN
                    (payroll_settings::jsonb)->'frequencies'
                  WHEN (payroll_settings::jsonb ? 'frequency') THEN
                    jsonb_build_array(
                      jsonb_build_object(
                        'id', coalesce((payroll_settings::jsonb)->>'frequencyId', (payroll_settings::jsonb)->>'frequency', 'default'),
                        'name', coalesce((payroll_settings::jsonb)->>'frequencyLabel', (payroll_settings::jsonb)->>'frequency', 'Default Cycle'),
                        'cadence', coalesce((payroll_settings::jsonb)->>'frequency', 'monthly')
                      )
                    )
                  ELSE '[]'::jsonb
                END
              )
              ELSE '[]'::jsonb
            END
          END,
        '[]'::jsonb
      ),
      payroll_calendars = COALESCE(
        CASE
          WHEN payroll_settings IS NULL OR trim(payroll_settings) = '' THEN NULL
          ELSE (
            CASE jsonb_typeof(payroll_settings::jsonb)
              WHEN 'array' THEN payroll_settings::jsonb
              WHEN 'object' THEN (
                CASE
                  WHEN jsonb_typeof((payroll_settings::jsonb)->'calendars') = 'array' THEN
                    (payroll_settings::jsonb)->'calendars'
                  ELSE jsonb_build_array(
                    jsonb_build_object(
                      'id', coalesce((payroll_settings::jsonb)->>'calendarId', 'default'),
                      'frequencyId', coalesce((payroll_settings::jsonb)->>'frequencyId', (payroll_settings::jsonb)->>'frequency', 'default'),
                      'name', coalesce((payroll_settings::jsonb)->>'calendarName', 'Default Calendar')
                    )
                  )
                END
              )
              ELSE '[]'::jsonb
            END
          END,
        '[]'::jsonb
      ),
      payroll_export_formats = COALESCE(
        CASE
          WHEN payroll_settings IS NULL OR trim(payroll_settings) = '' THEN NULL
          ELSE (
            CASE jsonb_typeof(payroll_settings::jsonb)
              WHEN 'object' THEN (
                CASE
                  WHEN jsonb_typeof((payroll_settings::jsonb)->'exportFormats') = 'array' THEN
                    (payroll_settings::jsonb)->'exportFormats'
                  ELSE '[]'::jsonb
                END
              )
              WHEN 'array' THEN payroll_settings::jsonb
              ELSE '[]'::jsonb
            END
          END,
        '[]'::jsonb
      );

    UPDATE companies
    SET payroll_calendars = CASE
      WHEN jsonb_array_length(payroll_calendars) = 0 THEN jsonb_build_array(
        jsonb_build_object(
          'id', 'default',
          'frequencyId', COALESCE(
            NULLIF((payroll_frequencies->0)->>'id', ''),
            NULLIF((payroll_frequencies->0)->>'frequencyId', ''),
            'default'
          ),
          'name', 'Default Calendar'
        )
      )
      ELSE payroll_calendars
    END;

    UPDATE companies
    SET payroll_export_formats = CASE
      WHEN jsonb_array_length(payroll_export_formats) = 0 THEN jsonb_build_array(
        jsonb_build_object(
          'id', 'bank-default',
          'type', 'bank',
          'format', 'csv',
          'name', 'Default Bank Export',
          'enabled', true
        ),
        jsonb_build_object(
          'id', 'gl-default',
          'type', 'gl',
          'format', 'xlsx',
          'name', 'Default GL Export',
          'enabled', true
        ),
        jsonb_build_object(
          'id', 'statutory-default',
          'type', 'statutory',
          'format', 'pdf',
          'name', 'Default Statutory Export',
          'enabled', true
        )
      )
      ELSE payroll_export_formats
    END;

    ALTER TABLE companies DROP COLUMN payroll_settings;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payroll_runs' AND column_name = 'calendar_id'
  ) THEN
    ALTER TABLE payroll_runs
      ADD COLUMN calendar_id text,
      ADD COLUMN cycle_label text,
      ADD COLUMN scenario_key text,
      ADD COLUMN scenario_toggles jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN export_artifacts jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;

UPDATE payroll_runs
SET scenario_key = COALESCE(scenario_key, 'baseline');

UPDATE payroll_runs
SET scenario_toggles = '{}'::jsonb
WHERE scenario_toggles IS NULL;

UPDATE payroll_runs
SET export_artifacts = '[]'::jsonb
WHERE export_artifacts IS NULL;
