package ar.com.hexium.hcop.patient;

import ar.com.hexium.hcop.auth.SessionPrincipal;
import ar.com.hexium.hcop.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/** Applies field-level RBAC to the versioned clinical document. */
@Component
public class ClinicalDocumentAccessPolicy {

  public JsonNode visibleState(JsonNode state, SessionPrincipal principal) {
    JsonNode visible = state.deepCopy();
    if (!principal.hasPermission("section.prescriptions.view") && visible instanceof ObjectNode root) {
      root.remove("prescriptions");
    }
    return visible;
  }

  public JsonNode writableState(JsonNode incoming, JsonNode stored, SessionPrincipal principal) {
    if (principal.hasPermission("section.prescriptions.view")
        && principal.hasPermission("section.prescriptions.edit")) {
      return incoming;
    }
    if (incoming.has("prescriptions")
        && !stored.path("prescriptions").equals(incoming.path("prescriptions"))) {
      throw new ApiException(HttpStatus.FORBIDDEN,
          "No tiene permiso para modificar prescripciones.");
    }
    if (!(incoming instanceof ObjectNode)) return incoming;
    ObjectNode protectedState = (ObjectNode) incoming.deepCopy();
    if (stored.has("prescriptions")) {
      protectedState.set("prescriptions", stored.path("prescriptions").deepCopy());
    } else {
      protectedState.remove("prescriptions");
    }
    return protectedState;
  }
}
