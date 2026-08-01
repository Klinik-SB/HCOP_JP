package ar.com.hexium.hcop.patient;

import ar.com.hexium.hcop.auth.AuthContext;
import ar.com.hexium.hcop.auth.SessionPrincipal;
import ar.com.hexium.hcop.common.ApiException;
import ar.com.hexium.hcop.patient.PatientDocumentRepository.StoredDocument;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api/hc")
public class ClinicalDocumentController {
  private final PatientDocumentService documents;
  private final AuthContext auth;
  private final ClinicalDocumentAccessPolicy accessPolicy;

  public ClinicalDocumentController(
      PatientDocumentService documents,
      AuthContext auth,
      ClinicalDocumentAccessPolicy accessPolicy) {
    this.documents = documents;
    this.auth = auth;
    this.accessPolicy = accessPolicy;
  }

  @GetMapping
  ResponseEntity<JsonNode> get(HttpServletRequest request) {
    auth.requirePermission(request, "section.history.view");
    SessionPrincipal principal = auth.require(request);
    JsonNode state = principal.activePatientId() == null
        ? documents.blankTemplate()
        : documents.state(documents.require(principal.activePatientId()));
    state = accessPolicy.visibleState(state, principal);
    return ResponseEntity.ok()
        .cacheControl(CacheControl.noStore())
        .header(HttpHeaders.PRAGMA, "no-cache")
        .body(state);
  }

  @PutMapping
  ResponseEntity<Map<String, Object>> put(
      @RequestBody JsonNode state,
      HttpServletRequest request) {
    auth.requirePermission(request, "section.history.edit");
    SessionPrincipal principal = auth.require(request);
    if (principal.activePatientId() == null) {
      throw new ApiException(HttpStatus.CONFLICT, "Abra un paciente antes de guardar.");
    }
    StoredDocument current = documents.require(principal.activePatientId());
    JsonNode stateToSave = accessPolicy.writableState(state, current.document(), principal);
    long expected = state.path("meta").path("persistenceRevision").asLong(0);
    if (expected < 1) {
      throw new ApiException(HttpStatus.CONFLICT, "Falta la revisión de la historia clínica.");
    }
    StoredDocument saved = documents.save(
        principal.activePatientId(),
        stateToSave,
        expected,
        principal.userId());
    return ResponseEntity.ok()
        .cacheControl(CacheControl.noStore())
        .body(Map.of(
            "ok", true,
            "unified", Map.of("persisted", true, "revision", saved.revision())));
  }

  @PostMapping("/restore-demo-on-reload")
  Map<String, Object> restoreDemo() {
    return Map.of("ok", true, "restored", false, "persistent", true);
  }
}
