package ar.com.hexium.hcop.configuration.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class TrialConfigurationDefaultsTest {

  @Test
  void defineLasSeisFuentesOficialesConCapacidadesConservadoras() {
    var sources = TrialConfigurationDefaults.sources();

    assertThat(sources).extracting(TrialConfigurationDefaults.Seed::key)
        .containsExactly(
            "clinicaltrials-gov",
            "nci-clinical-trials",
            "who-ictrp",
            "eu-ctis",
            "anmat-estudios",
            "renis");
    assertThat(sources).allSatisfy(source -> {
      assertThat(source.kind()).isEqualTo(ConfigurationKind.TRIAL_SOURCE);
      assertThatCode(() -> TrialConfigurationDefinitionPolicy.validate(
          source.kind(), source.definition())).doesNotThrowAnyException();
      assertThat(definition(source))
          .containsKeys(
              "connector",
              "accessType",
              "endpointUrl",
              "countries",
              "recruitmentStatuses",
              "phases",
              "syncPolicy",
              "syncIntervalHours",
              "secureConnectorState")
          .doesNotContainKeys("apiKey", "token", "password", "secret", "headers");
    });

    assertThat(definition(sources.getFirst()))
        .containsEntry("connector", "clinicaltrials-gov")
        .containsEntry("accessType", "api")
        .containsEntry("syncPolicy", "scheduled")
        .containsEntry("automationCapable", true)
        .containsEntry("realtimeCapable", true);

    var nci = sources.get(1);
    assertThat(nci.active()).isFalse();
    assertThat(definition(nci))
        .containsEntry("connector", "nci")
        .containsEntry("secureConnectorState", "pending")
        .containsEntry("automationCapable", false)
        .containsEntry("realtimeCapable", false);
  }

  @Test
  void defineUnaPoliticaLocalSinMatchingFicticioYConAntifatiga() {
    var policy = TrialConfigurationDefaults.screeningPolicy();

    assertThat(policy.kind()).isEqualTo(ConfigurationKind.TRIAL_SCREENING_SETTINGS);
    assertThatCode(() -> TrialConfigurationDefinitionPolicy.validate(
        policy.kind(), policy.definition())).doesNotThrowAnyException();
    assertThat(definition(policy))
        .containsEntry("enabled", true)
        .containsEntry("mode", "scheduled")
        .containsEntry("intervalHours", 24)
        .containsEntry("matchingExecution", "local-only")
        .containsEntry("sendPhiToRepositories", false)
        .containsEntry("maxModalsPerConsultation", 1)
        .containsEntry("minQuestionsPerModal", 1)
        .containsEntry("maxQuestionsPerModal", 3)
        .containsEntry("cooldownHours", 24)
        .containsEntry("snoozeHours", 24)
        .containsEntry("privacyNotice", TrialConfigurationDefaults.LOCAL_MATCHING_NOTICE);
    assertThat(policy.description()).contains("No constituye un motor de matching");
  }

  @Test
  void aceptaYConservaElPayloadExactoDelFrontendParaUnaFuenteOficial() {
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("schemaVersion", 1);
    payload.put("connector", "clinicaltrials-gov");
    payload.put("accessType", "api");
    payload.put("endpointUrl", "https://clinicaltrials.gov/api/v2");
    payload.put("countries", List.of("Argentina"));
    payload.put("recruitmentStatuses", List.of("Recruiting"));
    payload.put("phases", List.of("PHASE2"));
    payload.put("syncPolicy", "scheduled");
    payload.put("syncIntervalHours", 24);
    payload.put("automationCapable", true);
    payload.put("realtimeCapable", true);
    payload.put("secureConnectorState", "not-required");
    payload.put("attribution", "ClinicalTrials.gov · U.S. National Library of Medicine");
    payload.put("termsUrl", "https://clinicaltrials.gov/about-site/terms-conditions");
    payload.put("notes", "Filtro institucional");
    var definition = ConfigurationDefinition.of(payload);

    ConfigurationDefinition canonical =
        TrialConfigurationDefinitionPolicy.validateAndCanonicalize(
            ConfigurationKind.TRIAL_SOURCE, definition);

    assertThat(canonical).isSameAs(definition);
    assertThat(canonical.value()).isEqualTo(payload);
  }

  @Test
  void aceptaElPayloadExactoDelFrontendYCompletaLasGarantiasDelServidor() {
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("schemaVersion", 1);
    payload.put("enabled", true);
    payload.put("mode", "realtime");
    payload.put("intervalHours", 24);
    payload.put("cooldownHours", 24);
    payload.put("maxQuestionsPerModal", 3);
    payload.put("snoozeHours", 24);
    payload.put("localEvaluationOnly", true);
    payload.put("triggerFields", List.of("diagnosis", "staging", "biomarkers"));

    ConfigurationDefinition canonical =
        TrialConfigurationDefinitionPolicy.validateAndCanonicalize(
            ConfigurationKind.TRIAL_SCREENING_SETTINGS,
            ConfigurationDefinition.of(payload));

    assertThat(definition(canonical))
        .containsAllEntriesOf(payload)
        .containsEntry("maxModalsPerConsultation", 1)
        .containsEntry("minQuestionsPerModal", 1)
        .containsEntry("matchingExecution", "local-only")
        .containsEntry("sendPhiToRepositories", false)
        .containsEntry("privacyNotice", TrialConfigurationDefaults.LOCAL_MATCHING_NOTICE);
  }

  @Test
  void rechazaCredencialesConectoresPersonalizadosEndpointsArbitrariosYSalidaDePhi() {
    var source = new LinkedHashMap<>(definition(TrialConfigurationDefaults.sources().getFirst()));
    source.put("apiKey", "no-debe-persistirse");
    assertThatThrownBy(() -> TrialConfigurationDefinitionPolicy.validate(
        ConfigurationKind.TRIAL_SOURCE, ConfigurationDefinition.of(source)))
        .isInstanceOf(TrialConfigurationDefinitionPolicy.ConfigurationDefinitionException.class)
        .hasMessageContaining("credenciales");

    source.remove("apiKey");
    source.put("endpointUrl", "https://example.com/api");
    assertThatThrownBy(() -> TrialConfigurationDefinitionPolicy.validate(
        ConfigurationKind.TRIAL_SOURCE, ConfigurationDefinition.of(source)))
        .isInstanceOf(TrialConfigurationDefinitionPolicy.ConfigurationDefinitionException.class)
        .hasMessageContaining("conector oficial");

    source.put("connector", "custom-api");
    assertThatThrownBy(() -> TrialConfigurationDefinitionPolicy.validate(
        ConfigurationKind.TRIAL_SOURCE, ConfigurationDefinition.of(source)))
        .isInstanceOf(TrialConfigurationDefinitionPolicy.ConfigurationDefinitionException.class)
        .hasMessageContaining("seis repositorios oficiales");

    var policy = new LinkedHashMap<>(definition(TrialConfigurationDefaults.screeningPolicy()));
    policy.put("sendPhiToRepositories", true);
    assertThatThrownBy(() -> TrialConfigurationDefinitionPolicy.validate(
        ConfigurationKind.TRIAL_SCREENING_SETTINGS, ConfigurationDefinition.of(policy)))
        .isInstanceOf(TrialConfigurationDefinitionPolicy.ConfigurationDefinitionException.class)
        .hasMessageContaining("PHI");
  }

  @Test
  void rechazaActivarNciSinConectorSeguroYAvisosIntrusivos() {
    var nci = TrialConfigurationDefaults.sources().get(1);
    assertThatThrownBy(() -> TrialConfigurationDefinitionPolicy.validateActivation(
        nci.kind(), nci.definition(), true))
        .isInstanceOf(TrialConfigurationDefinitionPolicy.ConfigurationDefinitionException.class)
        .hasMessageContaining("inactivo");

    var policy = new LinkedHashMap<>(definition(TrialConfigurationDefaults.screeningPolicy()));
    policy.put("maxModalsPerConsultation", 2);
    assertThatThrownBy(() -> TrialConfigurationDefinitionPolicy.validate(
        ConfigurationKind.TRIAL_SCREENING_SETTINGS, ConfigurationDefinition.of(policy)))
        .isInstanceOf(TrialConfigurationDefinitionPolicy.ConfigurationDefinitionException.class)
        .hasMessageContaining("rango permitido");

    policy.put("maxModalsPerConsultation", 1);
    policy.put("syncState", "running");
    assertThatThrownBy(() -> TrialConfigurationDefinitionPolicy.validate(
        ConfigurationKind.TRIAL_SCREENING_SETTINGS, ConfigurationDefinition.of(policy)))
        .isInstanceOf(TrialConfigurationDefinitionPolicy.ConfigurationDefinitionException.class)
        .hasMessageContaining("campo no permitido");
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> definition(TrialConfigurationDefaults.Seed seed) {
    return (Map<String, Object>) seed.definition().value();
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> definition(ConfigurationDefinition definition) {
    return (Map<String, Object>) definition.value();
  }
}
