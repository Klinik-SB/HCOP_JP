package ar.com.hexium.hcop.patient;

import ar.com.hexium.hcop.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

/** Validates newly edited clinical fields without rejecting unchanged legacy values. */
@Component
public class ClinicalDocumentChangeValidator {
  static final int MAX_NARRATIVE_FIELD_CHARS = 50_000;

  public void validate(JsonNode incoming, JsonNode stored) {
    validateTextChange(
        incoming,
        stored,
        "chiefComplaint",
        "El motivo de consulta",
        "CLINICAL_CHIEF_COMPLAINT",
        true);
    validateTextChange(
        incoming,
        stored,
        "currentIllness",
        "El campo Antecedentes de enfermedad actual",
        "CLINICAL_CURRENT_ILLNESS",
        true);
    validateTextChange(
        incoming,
        stored,
        "summary",
        "La conclusión / resumen",
        "CLINICAL_SUMMARY",
        false);
    validateTextChange(
        incoming,
        stored,
        "plan",
        "La conducta / plan",
        "CLINICAL_PLAN",
        false);
  }

  private void validateTextChange(
      JsonNode incoming,
      JsonNode stored,
      String field,
      String label,
      String codePrefix,
      boolean blankMissingEquivalent) {
    JsonNode next = incoming.path("narrative").path(field);
    JsonNode previous = stored.path("narrative").path(field);
    if (next.equals(previous)) return;
    if (blankMissingEquivalent && isClinicallyBlank(next) && isClinicallyBlank(previous)) return;

    if (!next.isTextual()) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          label + " debe ser texto.",
          codePrefix + "_INVALID");
    }
    if (next.textValue().length() > MAX_NARRATIVE_FIELD_CHARS) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          label + " no puede superar " + MAX_NARRATIVE_FIELD_CHARS + " caracteres.",
          codePrefix + "_TOO_LONG");
    }
  }

  private boolean isClinicallyBlank(JsonNode value) {
    return value.isMissingNode()
        || value.isNull()
        || (value.isTextual() && value.textValue().isBlank());
  }
}
