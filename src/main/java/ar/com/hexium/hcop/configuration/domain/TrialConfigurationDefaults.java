package ar.com.hexium.hcop.configuration.domain;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Catálogo inicial de fuentes oficiales y política conservadora de evaluación. */
public final class TrialConfigurationDefaults {
  public static final String LOCAL_MATCHING_NOTICE =
      "El cruce se realiza localmente en HCOP. No se envían datos personales, "
          + "identificatorios ni información clínica del paciente a los repositorios externos.";

  private static final List<String> DEFAULT_RECRUITMENT_STATUSES = List.of(
      "Recruiting", "Not yet recruiting", "Active, not recruiting");

  private TrialConfigurationDefaults() {
  }

  public static List<Seed> sources() {
    return List.of(
        source(
            "clinicaltrials-gov",
            "ClinicalTrials.gov",
            "Registro global con API pública v2, sin clave.",
            true,
            "clinicaltrials-gov",
            "api",
            "https://clinicaltrials.gov/api/v2",
            "scheduled",
            true,
            true,
            "not-required",
            "ClinicalTrials.gov · U.S. National Library of Medicine",
            "https://clinicaltrials.gov/about-site/terms-conditions",
            "Catálogo público; la consulta nunca incluye datos del paciente."),
        source(
            "nci-clinical-trials",
            "NCI Clinical Trials",
            "Fuente oncológica complementaria. Requiere una clave administrada fuera de esta configuración.",
            false,
            "nci",
            "api",
            "https://clinicaltrialsapi.cancer.gov/api/v2",
            "manual",
            false,
            false,
            "pending",
            "National Cancer Institute (NCI)",
            "https://www.cancer.gov/policies/copyright-reuse",
            "Inactiva hasta disponer de un conector seguro; no se guarda la clave en esta definición."),
        source(
            "who-ictrp",
            "WHO ICTRP",
            "Portal global y descargas oficiales. La consulta inicial es manual.",
            true,
            "who-ictrp",
            "file",
            "https://www.who.int/tools/clinical-trials-registry-platform",
            "manual",
            false,
            false,
            "not-required",
            "World Health Organization · ICTRP",
            "https://www.who.int/tools/clinical-trials-registry-platform/network/who-data-set/downloading-records-from-the-ictrp-database",
            "Portal y descarga oficial; no se declara una API en tiempo real."),
        source(
            "eu-ctis",
            "EU CTIS",
            "Portal europeo con RSS por búsqueda y exportación CSV.",
            true,
            "eu-ctis",
            "portal",
            "https://euclinicaltrials.eu/search-for-clinical-trials/",
            "manual",
            false,
            false,
            "not-required",
            "European Medicines Agency · CTIS",
            "https://www.ema.europa.eu/en/about-us/about-website/legal-notice",
            "RSS y CSV oficiales; automatización deshabilitada hasta implementar el adaptador."),
        source(
            "anmat-estudios",
            "ANMAT · Estudios de farmacología clínica",
            "Base oficial argentina publicada en formato XLSX.",
            true,
            "anmat",
            "file",
            "https://www.argentina.gob.ar/anmat/regulados/base-de-datos-estudios-de-farmacologia-clinica",
            "manual",
            false,
            false,
            "not-required",
            "Administración Nacional de Medicamentos, Alimentos y Tecnología Médica · Argentina",
            "https://www.argentina.gob.ar/terminos-y-condiciones",
            "Archivo XLSX oficial; automatización deshabilitada hasta implementar el adaptador."),
        source(
            "renis",
            "RENIS",
            "Registro Nacional de Investigaciones en Salud. Consulta pública manual.",
            true,
            "renis",
            "portal",
            "https://www.argentina.gob.ar/salud/epidemiologia/registro-nacional-investigaciones-salud-renis",
            "manual",
            false,
            false,
            "not-required",
            "Registro Nacional de Investigaciones en Salud · Argentina",
            "https://www.argentina.gob.ar/terminos-y-condiciones",
            "Consulta manual hasta disponer de un mecanismo oficial de intercambio."));
  }

  public static Seed screeningPolicy() {
    Map<String, Object> definition = new LinkedHashMap<>();
    definition.put("schemaVersion", 1);
    definition.put("enabled", true);
    definition.put("mode", "scheduled");
    definition.put("intervalHours", 24);
    definition.put("cooldownHours", 24);
    definition.put("maxQuestionsPerModal", 3);
    definition.put("snoozeHours", 24);
    definition.put("localEvaluationOnly", true);
    definition.put(
        "triggerFields", List.of("diagnosis", "staging", "pathology", "biomarkers", "treatment"));
    definition.put("maxModalsPerConsultation", 1);
    definition.put("minQuestionsPerModal", 1);
    definition.put("matchingExecution", "local-only");
    definition.put("sendPhiToRepositories", false);
    definition.put("privacyNotice", LOCAL_MATCHING_NOTICE);
    return new Seed(
        ConfigurationKind.TRIAL_SCREENING_SETTINGS,
        "trial-screening:default",
        "Preselección de protocolos oncológicos",
        "Política institucional local y gradual. No constituye un motor de matching.",
        true,
        ConfigurationDefinition.of(definition));
  }

  private static Seed source(
      String key,
      String name,
      String description,
      boolean active,
      String connector,
      String accessType,
      String endpointUrl,
      String syncPolicy,
      boolean automationCapable,
      boolean realtimeCapable,
      String secureConnectorState,
      String attribution,
      String termsUrl,
      String notes) {
    Map<String, Object> definition = new LinkedHashMap<>();
    definition.put("schemaVersion", 1);
    definition.put("connector", connector);
    definition.put("accessType", accessType);
    definition.put("endpointUrl", endpointUrl);
    definition.put("countries", List.of());
    definition.put("recruitmentStatuses", DEFAULT_RECRUITMENT_STATUSES);
    definition.put("phases", List.of());
    definition.put("syncPolicy", syncPolicy);
    definition.put("syncIntervalHours", 24);
    definition.put("automationCapable", automationCapable);
    definition.put("realtimeCapable", realtimeCapable);
    definition.put("secureConnectorState", secureConnectorState);
    definition.put("attribution", attribution);
    definition.put("termsUrl", termsUrl);
    definition.put("notes", notes);
    return new Seed(
        ConfigurationKind.TRIAL_SOURCE,
        key,
        name,
        description,
        active,
        ConfigurationDefinition.of(definition));
  }

  public record Seed(
      ConfigurationKind kind,
      String key,
      String name,
      String description,
      boolean active,
      ConfigurationDefinition definition) {
  }
}
