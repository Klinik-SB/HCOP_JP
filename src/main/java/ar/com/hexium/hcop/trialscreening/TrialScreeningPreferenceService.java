package ar.com.hexium.hcop.trialscreening;

import ar.com.hexium.hcop.common.ApiException;
import ar.com.hexium.hcop.configuration.application.port.in.ConfigurationManagementUseCase;
import ar.com.hexium.hcop.trialscreening.TrialScreeningPreferenceRepository.Preference;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TrialScreeningPreferenceService {
  static final boolean ENGINE_READY = false;
  private static final String SETTINGS_KIND = "trial-screening-settings";
  private static final String DEFAULT_SETTINGS_KEY = "trial-screening:default";

  private final TrialScreeningPreferenceRepository preferences;
  private final ConfigurationManagementUseCase configurations;

  public TrialScreeningPreferenceService(
      TrialScreeningPreferenceRepository preferences,
      ConfigurationManagementUseCase configurations) {
    this.preferences = preferences;
    this.configurations = configurations;
  }

  @Transactional(readOnly = true)
  public View view(long userId) {
    return view(preferences.find(userId).orElse(new Preference(false, 0)));
  }

  @Transactional
  public View update(long userId, boolean researchActive, long expectedRevision) {
    if (expectedRevision < 0) {
      throw invalid("La revisión esperada no puede ser negativa.");
    }
    boolean saved = expectedRevision == 0
        ? preferences.insert(userId, researchActive)
        : preferences.update(userId, researchActive, expectedRevision);
    if (!saved) {
      throw new ApiException(
          HttpStatus.CONFLICT,
          "La preferencia cambió en otra sesión. Recargue su estado e intente nuevamente.",
          "TRIAL_SCREENING_PREFERENCE_VERSION_CONFLICT");
    }
    Preference stored = preferences.find(userId)
        .orElseThrow(() -> new IllegalStateException("La preferencia guardada no pudo recuperarse."));
    return view(stored);
  }

  private View view(Preference preference) {
    InstitutionalPolicy institution = institutionalPolicy();
    boolean proactiveMode = "scheduled".equals(institution.mode())
        || "realtime".equals(institution.mode());
    boolean proactiveActive = preference.researchActive()
        && institution.enabled()
        && proactiveMode;
    return new View(
        true,
        preference.researchActive(),
        institution.enabled(),
        institution.mode(),
        proactiveActive,
        proactiveActive && ENGINE_READY,
        preference.revision(),
        ENGINE_READY);
  }

  private InstitutionalPolicy institutionalPolicy() {
    List<ConfigurationManagementUseCase.ConfigurationView> configured =
        configurations.list(SETTINGS_KIND, false);
    var selected = configured.stream()
        .filter(ConfigurationManagementUseCase.ConfigurationView::active)
        .filter(item -> DEFAULT_SETTINGS_KEY.equals(item.key()))
        .findFirst()
        .orElse(null);
    if (selected == null || !(selected.definition().value() instanceof Map<?, ?> values)) {
      return new InstitutionalPolicy(false, "manual");
    }
    boolean enabled = Boolean.TRUE.equals(values.get("enabled"));
    String mode = values.get("mode") instanceof String value
        && List.of("manual", "scheduled", "realtime").contains(value)
        ? value
        : "manual";
    return new InstitutionalPolicy(enabled, mode);
  }

  private ApiException invalid(String message) {
    return new ApiException(
        HttpStatus.BAD_REQUEST,
        message,
        "TRIAL_SCREENING_PREFERENCE_INVALID");
  }

  private record InstitutionalPolicy(boolean enabled, String mode) {
  }

  public record View(
      boolean ok,
      boolean researchActive,
      boolean institutionalEnabled,
      String mode,
      boolean proactiveActive,
      boolean effective,
      long revision,
      boolean engineReady) {
  }
}
