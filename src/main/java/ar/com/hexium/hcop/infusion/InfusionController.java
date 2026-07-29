package ar.com.hexium.hcop.infusion;

import ar.com.hexium.hcop.auth.AuthContext;
import ar.com.hexium.hcop.auth.SessionPrincipal;
import ar.com.hexium.hcop.infusion.InfusionService.Finalization;
import jakarta.servlet.http.HttpServletRequest;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

@RestController
public class InfusionController {
  private final InfusionService infusions;
  private final AuthContext auth;

  public InfusionController(InfusionService infusions, AuthContext auth) {
    this.infusions = infusions;
    this.auth = auth;
  }

  @GetMapping("/api/clinical/infusions")
  Map<String, Object> list(
      @RequestParam(required = false) Long patientId,
      @RequestParam(required = false) LocalDate date,
      HttpServletRequest request) {
    auth.requirePermission(request, "section.day-hospital.view");
    List<Map<String, Object>> result = infusions.list(patientId, date);
    return Map.of("ok", true, "infusions", result, "total", result.size());
  }

  @PostMapping("/api/clinical/infusions")
  ResponseEntity<Map<String, Object>> create(
      @RequestBody JsonNode body,
      HttpServletRequest request) {
    auth.requirePermission(request, "section.day-hospital.edit");
    SessionPrincipal actor = auth.require(request);
    return ResponseEntity.status(HttpStatus.CREATED)
        .body(Map.of("ok", true, "infusion", infusions.create(body, actor)));
  }

  @PatchMapping("/api/clinical/infusions/{id}")
  Map<String, Object> update(
      @PathVariable long id,
      @RequestBody JsonNode body,
      HttpServletRequest request) {
    auth.requirePermission(request, "section.day-hospital.edit");
    return Map.of("ok", true, "infusion", infusions.update(id, body, auth.require(request)));
  }

  @GetMapping("/api/clinical/infusion-candidates")
  Map<String, Object> candidates(
      @RequestParam(defaultValue = "") String q,
      HttpServletRequest request) {
    auth.requirePermission(request, "section.day-hospital.view");
    List<Map<String, Object>> result = infusions.candidates(q);
    return Map.of("ok", true, "candidates", result, "total", result.size());
  }

  @PatchMapping("/api/clinical/treatment-cycles/{patientId}/{treatmentId}/{cycleNumber}/logistics")
  Map<String, Object> logistics(
      @PathVariable long patientId,
      @PathVariable String treatmentId,
      @PathVariable int cycleNumber,
      @RequestBody JsonNode body,
      HttpServletRequest request) {
    auth.requirePermission(request, "section.day-hospital.edit");
    return Map.of(
        "ok", true,
        "logistics", infusions.updateLogistics(
            patientId, treatmentId, cycleNumber, body, auth.require(request)));
  }

  @PostMapping("/api/clinical/infusions/{id}/finalize")
  Map<String, Object> finalizeInfusion(
      @PathVariable long id,
      @RequestBody JsonNode body,
      HttpServletRequest request) {
    auth.requirePermission(request, "section.day-hospital.edit");
    Finalization result = infusions.finalizeInfusion(id, body, auth.require(request));
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("ok", true);
    response.put("infusion", result.infusion());
    response.put("evolution", result.evolution());
    response.put("documentRevision", result.documentRevision());
    response.put("idempotent", result.idempotent());
    return response;
  }
}
