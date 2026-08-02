package ar.com.hexium.hcop.patient;

import ar.com.hexium.hcop.auth.SessionPrincipal;
import ar.com.hexium.hcop.common.ApiException;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Makes the server the sole authority for the audit trail of conclusion/summary and plan.
 * Client-generated audit metadata is treated as an optimistic preview and is never trusted.
 */
@Component
public class ClinicalSummaryPlanAuthority {
  static final int MAX_REASON_CHARS = 50_000;
  static final String SECTION_KEY = "summaryPlan";

  private final ObjectMapper mapper;
  private final Clock clock;

  public ClinicalSummaryPlanAuthority(ObjectMapper mapper, Clock clock) {
    this.mapper = mapper;
    this.clock = clock;
  }

  public JsonNode canonicalize(JsonNode incoming, JsonNode stored, SessionPrincipal principal) {
    if (!(incoming instanceof ObjectNode incomingRoot)) return incoming;

    ObjectNode result = incomingRoot.deepCopy();
    ObjectNode resultMeta = ensureObject(result, "meta");
    JsonNode reasonRequest = resultMeta.path("sectionChangeRequests").path(SECTION_KEY).path("reason");
    removeTransientRequest(resultMeta);

    boolean summaryChanged = !result.path("narrative").path("summary")
        .equals(stored.path("narrative").path("summary"));
    boolean planChanged = !result.path("narrative").path("plan")
        .equals(stored.path("narrative").path("plan"));
    if (!summaryChanged && !planChanged) {
      restoreProtectedSectionMetadata(resultMeta, stored.path("meta"));
      return result;
    }

    String reason = validatedReason(reasonRequest);
    ArrayNode versions = storedVersions(stored);
    String previousSummary = scalarText(stored.path("narrative").path("summary"));
    String previousPlan = scalarText(stored.path("narrative").path("plan"));
    String previousContent = snapshot(previousSummary, previousPlan);
    boolean storedHasClinicalContent = hasClinicalContent(
        stored.path("narrative").path("summary"))
        || hasClinicalContent(stored.path("narrative").path("plan"));
    boolean initial = !storedHasClinicalContent && versions.isEmpty();
    if (initial
        && scalarText(result.path("narrative").path("summary")).isBlank()
        && scalarText(result.path("narrative").path("plan")).isBlank()) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "Complete al menos la conclusión / resumen o la conducta / plan.",
          "CLINICAL_SUMMARY_PLAN_EMPTY");
    }
    if (!initial && reason.isBlank()) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "Indique el motivo de la modificación.",
          "CLINICAL_SUMMARY_PLAN_REASON_REQUIRED");
    }

    Instant now = clock.instant();
    String at = now.toString();
    String displayName = actorName(principal);
    String license = actorLicense(principal);
    String versionId = "sec-summaryPlan-" + UUID.randomUUID();

    if (!initial && !hasInitialVersion(versions)) {
      String initialAt = firstText(
          stored.path("meta").path("createdAt"),
          stored.path("meta").path("updatedAt"),
          at);
      String firstContent = versions.isEmpty()
          ? previousContent
          : firstText(versions.get(0).path("content"), previousContent);
      versions.insert(0, version(
          versionId + "-initial",
          "Carga inicial",
          firstContent.isBlank() ? "Sin datos cargados." : firstContent,
          audit("cargado", displayName, license, initialAt)));
    }

    String currentContent = snapshot(
        scalarText(result.path("narrative").path("summary")),
        scalarText(result.path("narrative").path("plan")));
    ObjectNode currentAudit = audit(
        initial ? "cargado" : "modificado",
        displayName,
        license,
        at);
    versions.add(version(
        versionId,
        initial ? "Carga inicial" : reason,
        currentContent.isBlank() ? "Sin datos cargados." : currentContent,
        currentAudit));

    protectedContainer(resultMeta, stored.path("meta"), "sectionVersions")
        .set(SECTION_KEY, versions);
    protectedContainer(resultMeta, stored.path("meta"), "sectionAudit")
        .set(SECTION_KEY, currentAudit.deepCopy());
    protectedContainer(resultMeta, stored.path("meta"), "sectionFormModes")
        .put(SECTION_KEY, "structured");
    resultMeta.put("currentUser", displayName);
    ObjectNode professional = ensureObject(resultMeta, "currentProfessional");
    professional.put("firstName", displayName);
    professional.put("lastName", displayName);
    professional.put("license", license);
    professional.put("userId", principal.userId());
    professional.put("username", principal.username());
    if (principal.specialty() != null && !principal.specialty().isBlank()) {
      professional.put("specialty", principal.specialty().trim());
    } else {
      professional.remove("specialty");
    }
    resultMeta.put("updatedAt", at);
    return result;
  }

  private String validatedReason(JsonNode request) {
    if (!request.isMissingNode() && !request.isNull() && !request.isTextual()) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "El motivo de la modificación debe ser texto.",
          "CLINICAL_SUMMARY_PLAN_REASON_INVALID");
    }
    String reason = request.isTextual() ? request.textValue().trim() : "";
    if (reason.length() > MAX_REASON_CHARS) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "El motivo no puede superar " + MAX_REASON_CHARS + " caracteres.",
          "CLINICAL_SUMMARY_PLAN_REASON_TOO_LONG");
    }
    return reason;
  }

  private ArrayNode storedVersions(JsonNode stored) {
    JsonNode storedVersions = stored.path("meta").path("sectionVersions").path(SECTION_KEY);
    return storedVersions.isArray()
        ? (ArrayNode) storedVersions.deepCopy()
        : mapper.createArrayNode();
  }

  private void restoreProtectedSectionMetadata(ObjectNode resultMeta, JsonNode storedMeta) {
    restoreChild(resultMeta, storedMeta, "sectionVersions");
    restoreChild(resultMeta, storedMeta, "sectionAudit");
    restoreChild(resultMeta, storedMeta, "sectionFormModes");
  }

  private void restoreChild(ObjectNode resultMeta, JsonNode storedMeta, String containerName) {
    JsonNode storedContainer = storedMeta.path(containerName);
    JsonNode storedValue = storedContainer.path(SECTION_KEY);
    JsonNode resultContainer = resultMeta.path(containerName);
    if (!(resultContainer instanceof ObjectNode)) {
      if (!storedContainer.isMissingNode()) {
        resultMeta.set(containerName, storedContainer.deepCopy());
      } else {
        resultMeta.remove(containerName);
      }
      return;
    }
    if (!storedValue.isMissingNode()) {
      ((ObjectNode) resultContainer).set(SECTION_KEY, storedValue.deepCopy());
    } else {
      ((ObjectNode) resultContainer).remove(SECTION_KEY);
    }
  }

  private ObjectNode protectedContainer(
      ObjectNode resultMeta,
      JsonNode storedMeta,
      String containerName) {
    JsonNode current = resultMeta.path(containerName);
    if (current instanceof ObjectNode object) return object;
    JsonNode stored = storedMeta.path(containerName);
    ObjectNode replacement = stored instanceof ObjectNode object
        ? object.deepCopy()
        : mapper.createObjectNode();
    resultMeta.set(containerName, replacement);
    return replacement;
  }

  private void removeTransientRequest(ObjectNode meta) {
    JsonNode requestsNode = meta.path("sectionChangeRequests");
    if (requestsNode.isMissingNode()) return;
    if (!(requestsNode instanceof ObjectNode requests)) {
      meta.remove("sectionChangeRequests");
      return;
    }
    requests.remove(SECTION_KEY);
    if (requests.isEmpty()) meta.remove("sectionChangeRequests");
  }

  private boolean hasInitialVersion(ArrayNode versions) {
    for (JsonNode version : versions) {
      if ("cargado".equals(version.path("audit").path("action").asText(""))) return true;
    }
    return false;
  }

  private ObjectNode version(
      String id,
      String reason,
      String content,
      ObjectNode audit) {
    ObjectNode version = mapper.createObjectNode();
    version.put("id", id);
    version.put("createdAt", audit.path("at").asText());
    version.put("author", audit.path("lastName").asText());
    version.put("license", audit.path("license").asText());
    version.put("reason", reason);
    version.put("content", content);
    version.set("audit", audit.deepCopy());
    return version;
  }

  private ObjectNode audit(String action, String displayName, String license, String at) {
    ObjectNode audit = mapper.createObjectNode();
    audit.put("action", action);
    audit.put("lastName", displayName);
    audit.put("license", license);
    audit.put("at", at);
    return audit;
  }

  private String snapshot(String summary, String plan) {
    StringBuilder content = new StringBuilder();
    if (!summary.isBlank()) content.append("Conclusion / resumen: ").append(summary);
    if (!plan.isBlank()) {
      if (!content.isEmpty()) content.append('\n');
      content.append("Conducta / plan: ").append(plan);
    }
    return content.toString().trim();
  }

  private String scalarText(JsonNode value) {
    if (value.isTextual() || value.isNumber()) return value.asText().trim();
    return "";
  }

  private boolean hasClinicalContent(JsonNode value) {
    if (value.isMissingNode() || value.isNull()) return false;
    if (value.isTextual() || value.isNumber()) return !value.asText().trim().isBlank();
    return true;
  }

  private String actorName(SessionPrincipal principal) {
    return firstText(principal.displayName(), principal.username(), "Profesional");
  }

  private String actorLicense(SessionPrincipal principal) {
    return firstText(principal.licenseNumber(), "s/d");
  }

  private String firstText(JsonNode first, JsonNode second, String fallback) {
    return firstText(
        first.isTextual() ? first.textValue() : "",
        second.isTextual() ? second.textValue() : "",
        fallback);
  }

  private String firstText(JsonNode first, String fallback) {
    return firstText(first.isTextual() ? first.textValue() : "", fallback);
  }

  private String firstText(String... values) {
    for (String value : values) {
      if (value != null && !value.isBlank()) return value.trim();
    }
    return "";
  }

  private ObjectNode ensureObject(ObjectNode parent, String field) {
    JsonNode current = parent.get(field);
    if (current instanceof ObjectNode object) return object;
    ObjectNode replacement = mapper.createObjectNode();
    parent.set(field, replacement);
    return replacement;
  }
}
