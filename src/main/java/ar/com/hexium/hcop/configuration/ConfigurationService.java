package ar.com.hexium.hcop.configuration;

import ar.com.hexium.hcop.common.ApiException;
import ar.com.hexium.hcop.configuration.ConfigurationRepository.Item;
import ar.com.hexium.hcop.configuration.ConfigurationRepository.Version;
import java.text.Normalizer;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Service
public class ConfigurationService {
  private final ConfigurationRepository repository;
  private final ObjectMapper mapper;

  public ConfigurationService(ConfigurationRepository repository, ObjectMapper mapper) {
    this.repository = repository;
    this.mapper = mapper;
  }

  public List<Map<String, Object>> list(String routeKind, boolean includeInactive) {
    String kind = kind(routeKind);
    List<Item> items = repository.list(kind, includeInactive);
    if (items.isEmpty() && "day-hospital-settings".equals(kind)) {
      return List.of(defaultDayHospitalSettings());
    }
    if (items.isEmpty() && "tool-settings".equals(kind)) {
      return List.of(defaultToolSettings());
    }
    return items.stream().map(this::view).toList();
  }

  @Transactional
  public Map<String, Object> create(String routeKind, JsonNode input, long actorId) {
    String kind = kind(routeKind);
    String name = text(input, "name", "displayName", "nombre");
    if (name.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "El nombre es obligatorio.");
    String key = text(input, "key", "itemKey", "slug");
    if (key.isBlank()) key = uniqueKey(kind, name);
    JsonNode definition = definition(input);
    try {
      return view(repository.insert(
          kind, key, name, text(input, "description", "descripcion"),
          !input.has("active") || input.path("active").asBoolean(true),
          definition, actorId));
    } catch (DuplicateKeyException duplicate) {
      throw new ApiException(HttpStatus.CONFLICT, "Ya existe una configuración con esa clave.");
    }
  }

  @Transactional
  public Map<String, Object> update(String routeKind, long id, JsonNode input, long actorId) {
    String kind = kind(routeKind);
    Item current = repository.find(id, kind)
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Configuración no encontrada."));
    long expected = input.path("revision").asLong(current.revision());
    String name = text(input, "name", "displayName", "nombre");
    if (name.isBlank()) name = current.name();
    String key = text(input, "key", "itemKey", "slug");
    if (key.isBlank()) key = current.key();
    JsonNode definition = input.has("definition") ? definition(input) : current.definition();
    boolean active = input.has("active") ? input.path("active").asBoolean() : current.active();
    String description = input.has("description")
        ? input.path("description").asText("") : current.description();
    try {
      return view(repository.update(
          id, kind, expected, key, name, description, active, definition, actorId)
          .orElseThrow(() -> new ApiException(
              HttpStatus.CONFLICT, "La configuración fue modificada por otro usuario.", "VERSION_CONFLICT")));
    } catch (DuplicateKeyException duplicate) {
      throw new ApiException(HttpStatus.CONFLICT, "Ya existe una configuración con esa clave.");
    }
  }

  @Transactional
  public Map<String, Object> archive(String routeKind, long id, long actorId) {
    String kind = kind(routeKind);
    return view(repository.archive(id, kind, actorId)
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Configuración no encontrada.")));
  }

  public Map<String, Object> view(Item item) {
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("id", Long.toString(item.id()));
    result.put("kind", item.kind());
    result.put("itemKind", item.kind());
    result.put("key", item.key());
    result.put("itemKey", item.key());
    result.put("name", item.name());
    result.put("displayName", item.name());
    result.put("description", item.description());
    result.put("active", item.active());
    result.put("definition", item.definition());
    result.put("revision", item.revision());
    result.put("createdAt", item.createdAt().toString());
    result.put("updatedAt", item.updatedAt().toString());
    return result;
  }

  public List<Map<String, Object>> versions(String routeKind, long itemId) {
    String kind = kind(routeKind);
    if (repository.find(itemId, kind).isEmpty()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Configuración no encontrada.");
    }
    return repository.versions(itemId, kind).stream().map(this::versionView).toList();
  }

  public Map<String, Object> version(String routeKind, long itemId, long revision) {
    String kind = kind(routeKind);
    Version version = repository.version(itemId, kind, revision)
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Versión no encontrada."));
    return versionView(version);
  }

  private Map<String, Object> versionView(Version version) {
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("revision", version.revision());
    result.put("name", version.name());
    result.put("displayName", version.name());
    result.put("description", version.description());
    result.put("active", version.active());
    result.put("definition", version.definition());
    result.put("changedBy", Long.toString(version.changedBy()));
    result.put("changedByName", version.changedByName());
    result.put("createdAt", version.createdAt().toString());
    return result;
  }

  private JsonNode definition(JsonNode input) {
    JsonNode definition = input.path("definition");
    if (definition.isObject() || definition.isArray()) return definition.deepCopy();
    var copy = mapper.createObjectNode();
    input.properties().forEach(entry -> {
      if (!SetHolder.METADATA.contains(entry.getKey())) copy.set(entry.getKey(), entry.getValue().deepCopy());
    });
    return copy;
  }

  private String uniqueKey(String kind, String name) {
    String base = slug(name);
    String candidate = base;
    int suffix = 2;
    while (repository.findByKey(kind, candidate).isPresent()) candidate = base + "-" + suffix++;
    return candidate;
  }

  private String slug(String value) {
    String slug = Normalizer.normalize(value, Normalizer.Form.NFD)
        .replaceAll("\\p{M}", "")
        .toLowerCase(Locale.ROOT)
        .replaceAll("[^a-z0-9]+", "-")
        .replaceAll("(^-|-$)", "");
    return slug.isBlank() ? "item" : slug;
  }

  private String kind(String routeKind) {
    if (!SetHolder.KINDS.contains(routeKind)) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Tipo de configuración desconocido.");
    }
    return routeKind;
  }

  private String text(JsonNode node, String... keys) {
    for (String key : keys) {
      String value = node.path(key).asText("").trim();
      if (!value.isBlank()) return value;
    }
    return "";
  }

  private Map<String, Object> defaultDayHospitalSettings() {
    return Map.of(
        "id", "",
        "kind", "day-hospital-settings",
        "key", "default",
        "name", "Hospital de día",
        "active", true,
        "revision", 0,
        "definition", Map.of(
            "chairCount", 6,
            "slotMinutes", 10,
            "startTime", "08:00",
            "endTime", "16:00",
            "workdayStart", "08:00",
            "workdayEnd", "16:00",
            "visibleChairs", 6));
  }

  private Map<String, Object> defaultToolSettings() {
    return Map.of(
        "id", "",
        "kind", "tool-settings",
        "key", "default",
        "name", "Herramientas",
        "active", true,
        "revision", 0,
        "definition", Map.of("enabled", true));
  }

  private static final class SetHolder {
    private static final java.util.Set<String> KINDS = java.util.Set.of(
        "guide", "study-template", "diagnosis-setting", "diagnosis-equivalence",
        "calculator", "tool-settings", "day-hospital-settings", "research-form", "protocol");
    private static final java.util.Set<String> METADATA = java.util.Set.of(
        "id", "kind", "itemKind", "key", "itemKey", "name", "displayName", "nombre",
        "description", "descripcion", "active", "revision", "reason");
  }
}
