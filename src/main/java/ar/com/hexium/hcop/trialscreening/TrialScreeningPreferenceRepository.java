package ar.com.hexium.hcop.trialscreening;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class TrialScreeningPreferenceRepository {
  private final JdbcTemplate jdbc;

  public TrialScreeningPreferenceRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  Optional<Preference> find(long userId) {
    return jdbc.query("""
        SELECT research_active, revision
          FROM local_user_preferences
         WHERE user_id = ?
        """, this::preference, userId).stream().findFirst();
  }

  boolean insert(long userId, boolean researchActive) {
    return jdbc.update("""
        INSERT INTO local_user_preferences (user_id, research_active)
        VALUES (?, ?)
        ON CONFLICT (user_id) DO NOTHING
        """, userId, researchActive) == 1;
  }

  boolean update(long userId, boolean researchActive, long expectedRevision) {
    return jdbc.update("""
        UPDATE local_user_preferences
           SET research_active = ?,
               revision = revision + 1,
               updated_at = clock_timestamp()
         WHERE user_id = ? AND revision = ?
        """, researchActive, userId, expectedRevision) == 1;
  }

  private Preference preference(ResultSet result, int rowNumber) throws SQLException {
    return new Preference(result.getBoolean("research_active"), result.getLong("revision"));
  }

  record Preference(boolean researchActive, long revision) {
  }
}
