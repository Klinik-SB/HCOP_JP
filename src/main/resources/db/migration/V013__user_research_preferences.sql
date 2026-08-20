CREATE TABLE local_user_preferences (
  user_id bigint PRIMARY KEY REFERENCES local_users(id) ON DELETE CASCADE,
  research_active boolean NOT NULL DEFAULT false,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

COMMENT ON TABLE local_user_preferences IS
  'Preferencias personales persistentes; no reemplazan la política institucional.';
COMMENT ON COLUMN local_user_preferences.research_active IS
  'Opt-in personal para avisos proactivos de investigación. No habilita por sí solo ningún motor.';
