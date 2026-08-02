package ar.com.hexium.hcop.patient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ar.com.hexium.hcop.common.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

class ClinicalDocumentChangeValidatorTest {
  private final ObjectMapper mapper = new ObjectMapper();
  private final ClinicalDocumentChangeValidator validator = new ClinicalDocumentChangeValidator();

  @Test
  void acceptsUnchangedInvalidLegacyNarrativeValues() {
    ObjectNode stored = mapper.createObjectNode();
    stored.withObject("/narrative").set(
        "chiefComplaint",
        mapper.createObjectNode().put("legacy", true));
    stored.withObject("/narrative").set(
        "currentIllness",
        mapper.createArrayNode().add("legacy"));
    stored.withObject("/narrative").set("summary", mapper.createObjectNode().put("legacy", true));
    stored.withObject("/narrative").set("plan", mapper.createArrayNode().add("legacy"));

    assertThatCode(() -> validator.validate(stored.deepCopy(), stored))
        .doesNotThrowAnyException();
  }

  @Test
  void acceptsMissingLegacyFieldsAndChangedTextAtTheLimit() {
    ObjectNode emptyLegacy = mapper.createObjectNode();
    assertThatCode(() -> validator.validate(emptyLegacy.deepCopy(), emptyLegacy))
        .doesNotThrowAnyException();

    ObjectNode stored = narrative("Anterior", "Plan anterior");
    ObjectNode incoming = stored.deepCopy();
    incoming.withObject("/narrative")
        .put("summary", "s".repeat(ClinicalDocumentChangeValidator.MAX_NARRATIVE_FIELD_CHARS))
        .put("plan", "");

    assertThatCode(() -> validator.validate(incoming, stored))
        .doesNotThrowAnyException();
  }

  @Test
  void acceptsOmittedChiefComplaintAndCurrentIllnessWhenStoredValuesAreBlank() {
    ObjectNode stored = narrative("Resumen anterior", "Plan vigente");
    stored.withObject("/narrative")
        .put("chiefComplaint", "   ")
        .put("currentIllness", "");
    ObjectNode incoming = narrative("Resumen actualizado", "Plan vigente");

    assertThatCode(() -> validator.validate(incoming, stored))
        .doesNotThrowAnyException();
  }

  @Test
  void acceptsMissingBlankAndNullAsEquivalentForOptionalSingleNarratives() {
    ObjectNode stored = narrative("Resumen", "Plan");
    stored.withObject("/narrative")
        .putNull("chiefComplaint")
        .putNull("currentIllness");
    ObjectNode incoming = narrative("Resumen", "Plan");
    incoming.withObject("/narrative")
        .put("chiefComplaint", "")
        .put("currentIllness", "  \n  ");

    assertThatCode(() -> validator.validate(incoming, stored))
        .doesNotThrowAnyException();
  }

  @Test
  void rejectsOmittingNonBlankChiefComplaintOrCurrentIllness() {
    ObjectNode storedChiefComplaint = narrative("Resumen", "Plan");
    storedChiefComplaint.withObject("/narrative").put("chiefComplaint", "Dolor abdominal");
    assertFailure(
        narrative("Resumen", "Plan"),
        storedChiefComplaint,
        "CLINICAL_CHIEF_COMPLAINT_INVALID");

    ObjectNode storedCurrentIllness = narrative("Resumen", "Plan");
    storedCurrentIllness.withObject("/narrative").put("currentIllness", "Tres meses");
    assertFailure(
        narrative("Resumen", "Plan"),
        storedCurrentIllness,
        "CLINICAL_CURRENT_ILLNESS_INVALID");
  }

  @Test
  void rejectsChangedNonTextSummary() {
    ObjectNode stored = narrative("Anterior", "Plan");
    ObjectNode incoming = stored.deepCopy();
    incoming.withObject("/narrative").set("summary", mapper.createObjectNode());

    assertFailure(incoming, stored, "CLINICAL_SUMMARY_INVALID");
  }

  @Test
  void rejectsChangedNonTextChiefComplaint() {
    ObjectNode stored = narrative("Anterior", "Plan");
    stored.withObject("/narrative").put("chiefComplaint", "Consulta anterior");
    ObjectNode incoming = stored.deepCopy();
    incoming.withObject("/narrative").set("chiefComplaint", mapper.createArrayNode());

    assertFailure(incoming, stored, "CLINICAL_CHIEF_COMPLAINT_INVALID");
  }

  @Test
  void rejectsChangedOversizedChiefComplaint() {
    ObjectNode stored = narrative("Anterior", "Plan");
    stored.withObject("/narrative").put("chiefComplaint", "Consulta anterior");
    ObjectNode incoming = stored.deepCopy();
    incoming.withObject("/narrative").put(
        "chiefComplaint",
        "m".repeat(ClinicalDocumentChangeValidator.MAX_NARRATIVE_FIELD_CHARS + 1));

    assertFailure(incoming, stored, "CLINICAL_CHIEF_COMPLAINT_TOO_LONG");
  }

  @Test
  void rejectsChangedNonTextCurrentIllness() {
    ObjectNode stored = narrative("Anterior", "Plan");
    stored.withObject("/narrative").put("currentIllness", "Historia anterior");
    ObjectNode incoming = stored.deepCopy();
    incoming.withObject("/narrative").set("currentIllness", mapper.createArrayNode());

    assertFailure(incoming, stored, "CLINICAL_CURRENT_ILLNESS_INVALID");
  }

  @Test
  void rejectsChangedOversizedCurrentIllness() {
    ObjectNode stored = narrative("Anterior", "Plan");
    stored.withObject("/narrative").put("currentIllness", "Historia anterior");
    ObjectNode incoming = stored.deepCopy();
    incoming.withObject("/narrative").put(
        "currentIllness",
        "e".repeat(ClinicalDocumentChangeValidator.MAX_NARRATIVE_FIELD_CHARS + 1));

    assertFailure(incoming, stored, "CLINICAL_CURRENT_ILLNESS_TOO_LONG");
  }

  @Test
  void rejectsChangedOversizedSummary() {
    ObjectNode stored = narrative("Anterior", "Plan");
    ObjectNode incoming = stored.deepCopy();
    incoming.withObject("/narrative").put(
        "summary",
        "s".repeat(ClinicalDocumentChangeValidator.MAX_NARRATIVE_FIELD_CHARS + 1));

    assertFailure(incoming, stored, "CLINICAL_SUMMARY_TOO_LONG");
  }

  @Test
  void rejectsChangedNonTextPlan() {
    ObjectNode stored = narrative("Resumen", "Anterior");
    ObjectNode incoming = stored.deepCopy();
    incoming.withObject("/narrative").set("plan", mapper.createArrayNode());

    assertFailure(incoming, stored, "CLINICAL_PLAN_INVALID");
  }

  @Test
  void rejectsChangedOversizedPlan() {
    ObjectNode stored = narrative("Resumen", "Anterior");
    ObjectNode incoming = stored.deepCopy();
    incoming.withObject("/narrative").put(
        "plan",
        "p".repeat(ClinicalDocumentChangeValidator.MAX_NARRATIVE_FIELD_CHARS + 1));

    assertFailure(incoming, stored, "CLINICAL_PLAN_TOO_LONG");
  }

  private ObjectNode narrative(String summary, String plan) {
    ObjectNode document = mapper.createObjectNode();
    document.withObject("/narrative").put("summary", summary).put("plan", plan);
    return document;
  }

  private void assertFailure(ObjectNode incoming, ObjectNode stored, String code) {
    assertThatThrownBy(() -> validator.validate(incoming, stored))
        .isInstanceOfSatisfying(ApiException.class, error -> {
          assertThat(error.status()).isEqualTo(HttpStatus.BAD_REQUEST);
          assertThat(error.code()).isEqualTo(code);
        });
  }
}
