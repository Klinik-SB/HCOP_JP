package ar.com.hexium.hcop.configuration.application.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import ar.com.hexium.hcop.configuration.application.port.in.ConfigurationManagementUseCase.CreateCommand;
import ar.com.hexium.hcop.configuration.application.port.out.ConfigurationStore;
import ar.com.hexium.hcop.configuration.domain.ConfigurationDefinition;
import ar.com.hexium.hcop.configuration.domain.TrialConfigurationDefaults;
import ar.com.hexium.hcop.sharedkernel.domain.UserId;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;

class TrialConfigurationApplicationServiceTest {
  private static final UserId ACTOR = UserId.of(7);

  private final ConfigurationStore store = mock(ConfigurationStore.class);
  private final ConfigurationApplicationService service = new ConfigurationApplicationService(store);

  @Test
  void traduceUnaFuenteInseguraAUnErrorFuncionalEstableSinPersistir() {
    var definition = mutable(TrialConfigurationDefaults.sources().getFirst());
    definition.put("token", "secreto-en-texto-plano");

    assertThatThrownBy(() -> service.create(new CreateCommand(
        "trial-source",
        "insegura",
        "Fuente insegura",
        "",
        true,
        ConfigurationDefinition.of(definition),
        ACTOR)))
        .isInstanceOfSatisfying(ConfigurationFailure.class, failure -> {
          assertThat(failure.type()).isEqualTo(ConfigurationFailure.Type.INVALID);
          assertThat(failure.code()).isEqualTo("TRIAL_SOURCE_DEFINITION_INVALID");
        });
    verifyNoInteractions(store);
  }

  @Test
  void traduceUnaPoliticaQueEnviaPhiAUnErrorFuncionalEstableSinPersistir() {
    var definition = mutable(TrialConfigurationDefaults.screeningPolicy());
    definition.put("sendPhiToRepositories", true);

    assertThatThrownBy(() -> service.create(new CreateCommand(
        "trial-screening-settings",
        "default",
        "Evaluación",
        "",
        true,
        ConfigurationDefinition.of(definition),
        ACTOR)))
        .isInstanceOfSatisfying(ConfigurationFailure.class, failure -> {
          assertThat(failure.type()).isEqualTo(ConfigurationFailure.Type.INVALID);
          assertThat(failure.code()).isEqualTo("TRIAL_SCREENING_SETTINGS_INVALID");
        });
    verifyNoInteractions(store);
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> mutable(TrialConfigurationDefaults.Seed seed) {
    return new LinkedHashMap<>((Map<String, Object>) seed.definition().value());
  }
}
