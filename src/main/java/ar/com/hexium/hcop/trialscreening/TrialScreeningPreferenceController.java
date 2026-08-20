package ar.com.hexium.hcop.trialscreening;

import ar.com.hexium.hcop.auth.AuthContext;
import ar.com.hexium.hcop.common.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

@RestController
public class TrialScreeningPreferenceController {
  private static final String PERMISSION = "section.research.view";
  private static final Set<String> UPDATE_FIELDS = Set.of("researchActive", "expectedRevision");

  private final TrialScreeningPreferenceService preferences;
  private final AuthContext auth;

  public TrialScreeningPreferenceController(
      TrialScreeningPreferenceService preferences,
      AuthContext auth) {
    this.preferences = preferences;
    this.auth = auth;
  }

  @GetMapping("/api/clinical/trial-screening/me")
  TrialScreeningPreferenceService.View me(HttpServletRequest request) {
    auth.requirePermission(request, PERMISSION);
    return preferences.view(auth.require(request).userId());
  }

  @PutMapping("/api/clinical/trial-screening/me")
  TrialScreeningPreferenceService.View update(
      @RequestBody JsonNode body,
      HttpServletRequest request) {
    auth.requirePermission(request, PERMISSION);
    validate(body);
    long userId = auth.require(request).userId();
    return preferences.update(
        userId,
        body.path("researchActive").booleanValue(),
        body.path("expectedRevision").longValue());
  }

  private void validate(JsonNode body) {
    if (body == null
        || !body.isObject()
        || body.size() != UPDATE_FIELDS.size()
        || !body.has("researchActive")
        || !body.path("researchActive").isBoolean()
        || !body.has("expectedRevision")
        || !body.path("expectedRevision").isIntegralNumber()
        || !body.path("expectedRevision").canConvertToLong()
        || body.path("expectedRevision").longValue() < 0) {
      throw invalid();
    }
    body.properties().forEach(entry -> {
      if (!UPDATE_FIELDS.contains(entry.getKey())) throw invalid();
    });
  }

  private ApiException invalid() {
    return new ApiException(
        HttpStatus.BAD_REQUEST,
        "Envíe únicamente researchActive y expectedRevision con valores válidos.",
        "TRIAL_SCREENING_PREFERENCE_INVALID");
  }
}
