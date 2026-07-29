package ar.com.hexium.hcop.configuration;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Repository
public class ConfigurationRepository {
  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper;
  private final Clock clock;

  public ConfigurationRepository(JdbcTemplate jdbc, ObjectMapper mapper, Clock clock) {
    this.jdbc = jdbc;
    this.mapper = mapper;
    this.clock = clock;
  }

  public List<Item> list(String kind, boolean includeInactive) {
    return jdbc.query(select() + """
         WHERE item_kind = ? AND (? OR active = true)
         ORDER BY lower(display_name), id
        """, this::map, kind, includeInactive);
  }

  public Optional<Item> find(long id, String kind) {
    return jdbc.query(select() + " WHERE id = ? AND item_kind = ?", this::map, id, kind)
        .stream().findFirst();
  }

  public Optional<Item> findByKey(String kind, String key) {
    return jdbc.query(select() + " WHERE item_kind = ? AND item_key = ?", this::map, kind, key)
        .stream().findFirst();
  }

  public List<Version> versions(long itemId, String kind) {
    return jdbc.query("""
        SELECT v.revision, v.display_name, v.description, v.active,
               v.definition_json::text, v.changed_by, u.display_name AS changed_by_name,
               v.created_at
          FROM clinical_configuration_versions v
          JOIN clinical_configuration_items i ON i.id = v.configuration_item_id
          LEFT JOIN local_users u ON u.id = v.changed_by
         WHERE v.configuration_item_id = ? AND i.item_kind = ?
         ORDER BY v.revision DESC
        """, this::mapVersion, itemId, kind);
  }

  public Optional<Version> version(long itemId, String kind, long revision) {
    return versions(itemId, kind).stream()
        .filter(candidate -> candidate.revision() == revision)
        .findFirst();
  }

  public Item insert(
      String kind, String key, String name, String description, boolean active,
      JsonNode definition, long actorId) {
    Instant now = clock.instant();
    long id = jdbc.queryForObject("""
        INSERT INTO clinical_configuration_items (
          item_kind, item_key, display_name, description, active, definition_json,
          revision, created_by, updated_by, created_at, updated_at
        ) VALUES (?, ?, ?, NULLIF(?, ''), ?, CAST(? AS jsonb), 1, ?, ?, ?, ?)
        RETURNING id
        """, Long.class, kind, key, name, description, active, definition.toString(),
        actorId, actorId, java.sql.Timestamp.from(now), java.sql.Timestamp.from(now));
    Item item = find(id, kind).orElseThrow();
    version(item, actorId);
    return item;
  }

  public Optional<Item> update(
      long id, String kind, long expectedRevision, String key, String name,
      String description, boolean active, JsonNode definition, long actorId) {
    Instant now = clock.instant();
    int changed = jdbc.update("""
        UPDATE clinical_configuration_items
           SET item_key = ?,
               display_name = ?,
               description = NULLIF(?, ''),
               active = ?,
               definition_json = CAST(? AS jsonb),
               revision = revision + 1,
               updated_by = ?,
               updated_at = ?
         WHERE id = ? AND item_kind = ? AND revision = ?
        """, key, name, description, active, definition.toString(), actorId, java.sql.Timestamp.from(now),
        id, kind, expectedRevision);
    if (changed == 0) return Optional.empty();
    Item item = find(id, kind).orElseThrow();
    version(item, actorId);
    return Optional.of(item);
  }

  public Optional<Item> archive(long id, String kind, long actorId) {
    Item item = find(id, kind).orElse(null);
    if (item == null) return Optional.empty();
    return update(id, kind, item.revision(), item.key(), item.name(), item.description(),
        false, item.definition(), actorId);
  }

  private void version(Item item, long actorId) {
    jdbc.update("""
        INSERT INTO clinical_configuration_versions (
          configuration_item_id, revision, display_name, description, active,
          definition_json, changed_by, created_at
        ) VALUES (?, ?, ?, NULLIF(?, ''), ?, CAST(? AS jsonb), ?, ?)
        """, item.id(), item.revision(), item.name(), item.description(), item.active(),
        item.definition().toString(), actorId, java.sql.Timestamp.from(item.updatedAt()));
  }

  private String select() {
    return """
        SELECT id, item_kind, item_key, display_name, description, active,
               definition_json::text, revision, created_at, updated_at
          FROM clinical_configuration_items
        """;
  }

  private Item map(ResultSet result, int row) throws SQLException {
    return new Item(
        result.getLong("id"), result.getString("item_kind"), result.getString("item_key"),
        result.getString("display_name"), text(result, "description"),
        result.getBoolean("active"), mapper.readTree(result.getString("definition_json")),
        result.getLong("revision"), result.getTimestamp("created_at").toInstant(),
        result.getTimestamp("updated_at").toInstant());
  }

  private Version mapVersion(ResultSet result, int row) throws SQLException {
    return new Version(
        result.getLong("revision"),
        result.getString("display_name"),
        text(result, "description"),
        result.getBoolean("active"),
        mapper.readTree(result.getString("definition_json")),
        result.getLong("changed_by"),
        text(result, "changed_by_name"),
        result.getTimestamp("created_at").toInstant());
  }

  private String text(ResultSet result, String field) throws SQLException {
    String value = result.getString(field);
    return value == null ? "" : value;
  }

  public record Item(
      long id, String kind, String key, String name, String description, boolean active,
      JsonNode definition, long revision, Instant createdAt, Instant updatedAt) {
  }

  public record Version(
      long revision, String name, String description, boolean active,
      JsonNode definition, long changedBy, String changedByName, Instant createdAt) {
  }
}
