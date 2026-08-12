package ar.com.hexium.hcop.trialscreening;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ar.com.hexium.hcop.common.ApiException;
import ar.com.hexium.hcop.configuration.application.port.in.ConfigurationManagementUseCase;
import ar.com.hexium.hcop.configuration.domain.ConfigurationDefinition;
import ar.com.hexium.hcop.trialscreening.TrialScreeningPreferenceRepository.Preference;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class TrialScreeningPreferenceServiceTest {
  private final TrialScreeningPreferenceRepository repository =
      mock(TrialScreeningPreferenceRepository.class);
  private final ConfigurationManagementUseCase configurations =
      mock(ConfigurationManagementUseCase.class);
  private final TrialScreeningPreferenceService service =
      new TrialScreeningPreferenceService(repository, configurations);

  @Test
  void defaultsToInactiveWithoutCreatingAUserPreference() {
    when(repository.find(7L)).thenReturn(Optional.empty());
    scheduledInstitution(true);

    var view = service.view(7L);

    assertThat(view.researchActive()).isFalse();
    assertThat(view.revision()).isZero();
    assertThat(view.institutionalEnabled()).isTrue();
    assertThat(view.mode()).isEqualTo("scheduled");
    assertThat(view.proactiveActive()).isFalse();
    assertThat(view.engineReady()).isFalse();
    assertThat(view.effective()).isFalse();
  }

  @Test
  void persistsTheSelfOptInButKeepsTheMissingEngineIneffective() {
    when(repository.insert(7L, true)).thenReturn(true);
    when(repository.find(7L)).thenReturn(Optional.of(new Preference(true, 1)));
    scheduledInstitution(true);

    var view = service.update(7L, true, 0);

    verify(repository).insert(7L, true);
    assertThat(view.researchActive()).isTrue();
    assertThat(view.proactiveActive()).isTrue();
    assertThat(view.engineReady()).isFalse();
    assertThat(view.effective()).isFalse();
    assertThat(view.revision()).isEqualTo(1);
  }

  @Test
  void manualModeDoesNotDependOnTheProactivePreference() {
    when(repository.find(7L)).thenReturn(Optional.of(new Preference(true, 4)));
    when(configurations.list("trial-screening-settings", false))
        .thenReturn(List.of(settings(true, "manual")));

    var view = service.view(7L);

    assertThat(view.researchActive()).isTrue();
    assertThat(view.proactiveActive()).isFalse();
    assertThat(view.effective()).isFalse();
  }

  @Test
  void failsClosedWhenOnlyANonDefaultInstitutionalPolicyExists() {
    when(repository.find(7L)).thenReturn(Optional.of(new Preference(true, 4)));
    when(configurations.list("trial-screening-settings", false))
        .thenReturn(List.of(settings("secondary-policy", true, "realtime")));

    var view = service.view(7L);

    assertThat(view.researchActive()).isTrue();
    assertThat(view.institutionalEnabled()).isFalse();
    assertThat(view.mode()).isEqualTo("manual");
    assertThat(view.proactiveActive()).isFalse();
    assertThat(view.effective()).isFalse();
  }

  @Test
  void reportsAnOptimisticConflictInsteadOfOverwritingAnotherSession() {
    when(repository.update(7L, false, 3)).thenReturn(false);

    assertThatThrownBy(() -> service.update(7L, false, 3))
        .isInstanceOfSatisfying(ApiException.class, failure -> {
          assertThat(failure.status()).isEqualTo(HttpStatus.CONFLICT);
          assertThat(failure.code()).isEqualTo("TRIAL_SCREENING_PREFERENCE_VERSION_CONFLICT");
        });
  }

  private void scheduledInstitution(boolean enabled) {
    when(configurations.list("trial-screening-settings", false))
        .thenReturn(List.of(settings(enabled, "scheduled")));
  }

  private ConfigurationManagementUseCase.ConfigurationView settings(
      boolean enabled,
      String mode) {
    return settings("trial-screening:default", enabled, mode);
  }

  private ConfigurationManagementUseCase.ConfigurationView settings(
      String key,
      boolean enabled,
      String mode) {
    Instant now = Instant.parse("2026-08-11T12:00:00Z");
    return new ConfigurationManagementUseCase.ConfigurationView(
        "41",
        "trial-screening-settings",
        key,
        "Preselección",
        "",
        true,
        ConfigurationDefinition.of(Map.of("enabled", enabled, "mode", mode)),
        1,
        now,
        now);
  }
}
