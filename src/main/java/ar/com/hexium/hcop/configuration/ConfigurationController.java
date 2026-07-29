package ar.com.hexium.hcop.configuration;

import ar.com.hexium.hcop.auth.AuthContext;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

@RestController
public class ConfigurationController {
  private final ConfigurationService configurations;
  private final AuthContext auth;

  public ConfigurationController(ConfigurationService configurations, AuthContext auth) {
    this.configurations = configurations;
    this.auth = auth;
  }

  @GetMapping("/api/clinical/configuration/{kind}")
  Map<String, Object> list(
      @PathVariable String kind,
      @RequestParam(defaultValue = "0") int includeInactive,
      HttpServletRequest request) {
    auth.requirePermission(request, "section.configuration.view");
    List<Map<String, Object>> items = configurations.list(kind, includeInactive == 1);
    return Map.of("ok", true, "items", items, "total", items.size());
  }

  @PostMapping("/api/clinical/configuration/{kind}")
  ResponseEntity<Map<String, Object>> create(
      @PathVariable String kind,
      @RequestBody JsonNode body,
      HttpServletRequest request) {
    auth.requirePermission(request, "section.configuration.manage");
    Map<String, Object> item = configurations.create(kind, body, auth.require(request).userId());
    return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("ok", true, "item", item));
  }

  @PutMapping("/api/clinical/configuration/{kind}/{id}")
  Map<String, Object> update(
      @PathVariable String kind,
      @PathVariable long id,
      @RequestBody JsonNode body,
      HttpServletRequest request) {
    auth.requirePermission(request, "section.configuration.manage");
    return Map.of("ok", true, "item", configurations.update(kind, id, body, auth.require(request).userId()));
  }

  @DeleteMapping("/api/clinical/configuration/{kind}/{id}")
  Map<String, Object> archive(
      @PathVariable String kind,
      @PathVariable long id,
      HttpServletRequest request) {
    auth.requirePermission(request, "section.configuration.manage");
    return Map.of("ok", true, "item", configurations.archive(kind, id, auth.require(request).userId()));
  }

  @GetMapping("/api/clinical/configuration/{kind}/{id}/versions")
  Map<String, Object> versions(
      @PathVariable String kind,
      @PathVariable long id,
      HttpServletRequest request) {
    auth.requirePermission(request, "section.configuration.view");
    List<Map<String, Object>> versions = configurations.versions(kind, id);
    return Map.of("ok", true, "versions", versions, "total", versions.size());
  }

  @GetMapping("/api/clinical/configuration/{kind}/{id}/versions/{revision}")
  Map<String, Object> version(
      @PathVariable String kind,
      @PathVariable long id,
      @PathVariable long revision,
      HttpServletRequest request) {
    auth.requirePermission(request, "section.configuration.view");
    return Map.of("ok", true, "version", configurations.version(kind, id, revision));
  }
}
