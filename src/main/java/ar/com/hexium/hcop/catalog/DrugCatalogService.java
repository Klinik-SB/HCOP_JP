package ar.com.hexium.hcop.catalog;

import ar.com.hexium.hcop.config.HcopProperties;
import java.io.IOException;
import java.nio.file.Files;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Service
public class DrugCatalogService {
  private final List<Map<String, Object>> drugs;

  public DrugCatalogService(HcopProperties properties, ObjectMapper mapper) {
    Map<String, Map<String, Object>> unique = new LinkedHashMap<>();
    try {
      JsonNode source = mapper.readTree(
          Files.readString(properties.catalogRoot().resolve("medicamentos-ar-demo.json")));
      if (source.isArray()) {
        int index = 0;
        for (JsonNode item : source) {
          String generic = item.path("generic").asText("").trim();
          String brand = item.path("brand").asText("").trim();
          String presentation = item.path("presentation").asText("").trim();
          String name = !generic.isBlank() ? generic : brand;
          if (name.isBlank()) continue;
          String key = normalize(name + "|" + presentation);
          Map<String, Object> value = new LinkedHashMap<>();
          value.put("id", "med-" + (++index));
          value.put("name", name);
          value.put("nombre", name);
          value.put("genericName", generic);
          value.put("brand", brand);
          value.put("presentation", presentation);
          value.put("form", item.path("form").asText(""));
          value.put("laboratory", item.path("laboratory").asText(""));
          value.put("source", "catalogo-local");
          unique.putIfAbsent(key, value);
        }
      }
    } catch (IOException ignored) {
      // El administrador de protocolos permite crear drogas manuales si falta el catálogo.
    }
    this.drugs = List.copyOf(unique.values());
  }

  public List<Map<String, Object>> search(String query) {
    String needle = normalize(query);
    List<Map<String, Object>> result = new ArrayList<>();
    for (Map<String, Object> drug : drugs) {
      if (!needle.isBlank() && !normalize(String.join(" ",
          String.valueOf(drug.get("name")),
          String.valueOf(drug.get("brand")),
          String.valueOf(drug.get("presentation")))).contains(needle)) continue;
      result.add(drug);
      if (result.size() >= 100) break;
    }
    return result;
  }

  private static String normalize(String value) {
    return Normalizer.normalize(value == null ? "" : value, Normalizer.Form.NFD)
        .replaceAll("\\p{M}", "")
        .toLowerCase(Locale.ROOT)
        .replaceAll("\\s+", " ")
        .trim();
  }
}
