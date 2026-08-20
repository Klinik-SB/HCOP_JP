package ar.com.hexium.hcop.configuration.domain;

import java.net.URI;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** Validación cerrada para impedir conectores arbitrarios, PHI saliente y secretos en JSON. */
public final class TrialConfigurationDefinitionPolicy {
  private static final Set<String> SOURCE_FIELDS = Set.of(
      "schemaVersion",
      "connector",
      "accessType",
      "endpointUrl",
      "countries",
      "recruitmentStatuses",
      "phases",
      "syncPolicy",
      "syncIntervalHours",
      "automationCapable",
      "realtimeCapable",
      "secureConnectorState",
      "attribution",
      "termsUrl",
      "notes");
  private static final Set<String> SCREENING_CLIENT_FIELDS = Set.of(
      "schemaVersion",
      "enabled",
      "mode",
      "intervalHours",
      "cooldownHours",
      "maxQuestionsPerModal",
      "snoozeHours",
      "localEvaluationOnly",
      "triggerFields");
  private static final Set<String> SCREENING_FIELDS = Set.of(
      "schemaVersion",
      "enabled",
      "mode",
      "intervalHours",
      "cooldownHours",
      "maxQuestionsPerModal",
      "snoozeHours",
      "localEvaluationOnly",
      "triggerFields",
      "maxModalsPerConsultation",
      "minQuestionsPerModal",
      "matchingExecution",
      "sendPhiToRepositories",
      "privacyNotice");
  private static final Set<String> TRIGGER_FIELDS = Set.of(
      "diagnosis", "staging", "pathology", "biomarkers", "treatment");
  private static final Set<String> SECRET_FIELDS = Set.of(
      "apikey",
      "api_key",
      "x-api-key",
      "token",
      "access_token",
      "password",
      "secret",
      "clientsecret",
      "credential",
      "credentials",
      "authorization",
      "headers");
  private static final Map<String, ConnectorRule> CONNECTORS = Map.of(
      "clinicaltrials-gov",
      new ConnectorRule(
          "api",
          "https://clinicaltrials.gov/api/v2",
          "https://clinicaltrials.gov/about-site/terms-conditions",
          true,
          true,
          "not-required"),
      "nci",
      new ConnectorRule(
          "api",
          "https://clinicaltrialsapi.cancer.gov/api/v2",
          "https://www.cancer.gov/policies/copyright-reuse",
          false,
          false,
          "pending"),
      "who-ictrp",
      new ConnectorRule(
          "file",
          "https://www.who.int/tools/clinical-trials-registry-platform",
          "https://www.who.int/tools/clinical-trials-registry-platform/network/who-data-set/downloading-records-from-the-ictrp-database",
          false,
          false,
          "not-required"),
      "eu-ctis",
      new ConnectorRule(
          "portal",
          "https://euclinicaltrials.eu/search-for-clinical-trials/",
          "https://www.ema.europa.eu/en/about-us/about-website/legal-notice",
          false,
          false,
          "not-required"),
      "anmat",
      new ConnectorRule(
          "file",
          "https://www.argentina.gob.ar/anmat/regulados/base-de-datos-estudios-de-farmacologia-clinica",
          "https://www.argentina.gob.ar/terminos-y-condiciones",
          false,
          false,
          "not-required"),
      "renis",
      new ConnectorRule(
          "portal",
          "https://www.argentina.gob.ar/salud/epidemiologia/registro-nacional-investigaciones-salud-renis",
          "https://www.argentina.gob.ar/terminos-y-condiciones",
          false,
          false,
          "not-required"));

  private TrialConfigurationDefinitionPolicy() {
  }

  public static void validate(ConfigurationKind kind, ConfigurationDefinition definition) {
    validateAndCanonicalize(kind, definition);
  }

  /**
   * Completa exclusivamente las garantías de seguridad controladas por el servidor.
   * El resto del contrato se conserva sin pérdida para que la interfaz pueda editarlo y recargarlo.
   */
  public static ConfigurationDefinition validateAndCanonicalize(
      ConfigurationKind kind,
      ConfigurationDefinition definition) {
    if (kind != ConfigurationKind.TRIAL_SOURCE
        && kind != ConfigurationKind.TRIAL_SCREENING_SETTINGS) {
      return definition;
    }
    Map<?, ?> values = object(definition);
    assertNoSecretFields(values);
    if (kind == ConfigurationKind.TRIAL_SOURCE) {
      exactFields(values, SOURCE_FIELDS, SOURCE_FIELDS, "repositorio");
      validateSource(values);
      return definition;
    }

    exactFields(values, SCREENING_FIELDS, SCREENING_CLIENT_FIELDS, "política de evaluación");
    Map<String, Object> canonical = stringMap(values);
    canonical.putIfAbsent("maxModalsPerConsultation", 1);
    canonical.putIfAbsent("minQuestionsPerModal", 1);
    canonical.putIfAbsent("matchingExecution", "local-only");
    canonical.putIfAbsent("sendPhiToRepositories", false);
    canonical.putIfAbsent("privacyNotice", TrialConfigurationDefaults.LOCAL_MATCHING_NOTICE);
    ConfigurationDefinition result = ConfigurationDefinition.of(canonical);
    validateScreening(object(result));
    return result;
  }

  public static void validateActivation(
      ConfigurationKind kind,
      ConfigurationDefinition definition,
      boolean active) {
    if (!active || kind != ConfigurationKind.TRIAL_SOURCE) return;
    Map<?, ?> values = object(definition);
    if ("nci".equals(values.get("connector"))
        && "pending".equals(values.get("secureConnectorState"))) {
      throw invalid(
          "NCI debe permanecer inactivo hasta que exista un conector seguro con su clave fuera de esta configuración.");
    }
  }

  private static void validateSource(Map<?, ?> values) {
    schemaVersion(values);
    String connector = text(values, "connector", 80, false);
    ConnectorRule rule = CONNECTORS.get(connector);
    if (rule == null) {
      throw invalid("Sólo se permiten los seis repositorios oficiales configurados por HCOP.");
    }
    if (!rule.accessType().equals(text(values, "accessType", 32, false))) {
      throw invalid("El tipo de acceso no coincide con el conector oficial.");
    }
    officialUrl(values, "endpointUrl", rule.endpointUrl());
    officialUrl(values, "termsUrl", rule.termsUrl());
    stringList(values, "countries", 250, 120);
    stringList(values, "recruitmentStatuses", 30, 120);
    stringList(values, "phases", 30, 120);
    String syncPolicy = text(values, "syncPolicy", 32, false);
    if (!Set.of("manual", "scheduled").contains(syncPolicy)) {
      throw invalid("La política de actualización no está permitida.");
    }
    if ("scheduled".equals(syncPolicy) && !rule.automationCapable()) {
      throw invalid("La fuente no dispone de un conector automático habilitado.");
    }
    integer(values, "syncIntervalHours", 1, 168);
    if (bool(values, "automationCapable") != rule.automationCapable()
        || bool(values, "realtimeCapable") != rule.realtimeCapable()) {
      throw invalid("Las capacidades declaradas no coinciden con el conector oficial.");
    }
    if (!rule.secureConnectorState().equals(text(values, "secureConnectorState", 32, false))) {
      throw invalid("El estado del conector seguro no coincide con la fuente oficial.");
    }
    text(values, "attribution", 500, false);
    text(values, "notes", 2_000, true);
  }

  private static void validateScreening(Map<?, ?> values) {
    exactFields(values, SCREENING_FIELDS, SCREENING_FIELDS, "política de evaluación");
    schemaVersion(values);
    bool(values, "enabled");
    if (!Set.of("manual", "scheduled", "realtime")
        .contains(text(values, "mode", 32, false))) {
      throw invalid("La modalidad de evaluación no está permitida.");
    }
    integer(values, "intervalHours", 1, 168);
    integer(values, "cooldownHours", 1, 720);
    int maximumQuestions = integer(values, "maxQuestionsPerModal", 1, 3);
    integer(values, "snoozeHours", 1, 720);
    if (!bool(values, "localEvaluationOnly")) {
      throw invalid("La evaluación de coincidencias debe ejecutarse localmente.");
    }
    List<String> triggers = stringList(values, "triggerFields", 5, 40);
    if (triggers.isEmpty()) {
      throw invalid("La política debe conservar al menos un disparador clínico.");
    }
    triggers.forEach(trigger -> {
      if (!TRIGGER_FIELDS.contains(trigger)) {
        throw invalid("La política contiene un disparador no permitido.");
      }
    });
    if (integer(values, "maxModalsPerConsultation", 1, 1) != 1) {
      throw invalid("Sólo se admite un aviso por consulta.");
    }
    int minimumQuestions = integer(values, "minQuestionsPerModal", 1, 1);
    if (minimumQuestions > maximumQuestions) {
      throw invalid("El mínimo de preguntas no puede superar el máximo.");
    }
    if (!"local-only".equals(text(values, "matchingExecution", 32, false))) {
      throw invalid("La evaluación de coincidencias debe ejecutarse localmente.");
    }
    if (bool(values, "sendPhiToRepositories")) {
      throw invalid("No está permitido enviar PHI a repositorios externos.");
    }
    if (!TrialConfigurationDefaults.LOCAL_MATCHING_NOTICE.equals(
        text(values, "privacyNotice", 1_000, false))) {
      throw invalid("El aviso debe explicar que el cruce es local y que no envía PHI ni identificadores.");
    }
  }

  private static Map<?, ?> object(ConfigurationDefinition definition) {
    if (definition == null || !(definition.value() instanceof Map<?, ?> values)) {
      throw invalid("La definición debe ser un objeto JSON.");
    }
    return values;
  }

  private static void schemaVersion(Map<?, ?> values) {
    integer(values, "schemaVersion", 1, 1);
  }

  private static void exactFields(
      Map<?, ?> values,
      Set<String> allowed,
      Set<String> required,
      String label) {
    for (Object candidate : values.keySet()) {
      if (!(candidate instanceof String key) || !allowed.contains(key)) {
        throw invalid("La definición del " + label + " contiene un campo no permitido.");
      }
    }
    if (!values.keySet().containsAll(required)) {
      throw invalid("La definición del " + label + " está incompleta.");
    }
  }

  private static void assertNoSecretFields(Map<?, ?> values) {
    for (Map.Entry<?, ?> entry : values.entrySet()) {
      String key = String.valueOf(entry.getKey()).toLowerCase(Locale.ROOT);
      if (SECRET_FIELDS.contains(key)) {
        throw invalid("Las credenciales no pueden guardarse como texto en la configuración versionada.");
      }
      Object nested = entry.getValue();
      if (nested instanceof Map<?, ?> map) assertNoSecretFields(map);
      if (nested instanceof Iterable<?> iterable) {
        for (Object item : iterable) {
          if (item instanceof Map<?, ?> map) assertNoSecretFields(map);
        }
      }
    }
  }

  private static String text(
      Map<?, ?> values,
      String key,
      int maximum,
      boolean allowBlank) {
    Object candidate = values.get(key);
    if (!(candidate instanceof String value)
        || (!allowBlank && value.isBlank())
        || value.length() > maximum
        || value.chars().anyMatch(character -> Character.isISOControl(character)
            && character != '\n' && character != '\r' && character != '\t')) {
      throw invalid("El campo " + key + " no es válido.");
    }
    return value.strip();
  }

  private static boolean bool(Map<?, ?> values, String key) {
    Object candidate = values.get(key);
    if (!(candidate instanceof Boolean value)) {
      throw invalid("El campo " + key + " debe ser verdadero o falso.");
    }
    return value;
  }

  private static int integer(Map<?, ?> values, String key, int minimum, int maximum) {
    Object candidate = values.get(key);
    if (!(candidate instanceof Number number)) {
      throw invalid("El campo " + key + " debe ser un número entero.");
    }
    double numeric = number.doubleValue();
    int value = number.intValue();
    if (!Double.isFinite(numeric) || numeric != value || value < minimum || value > maximum) {
      throw invalid("El campo " + key + " está fuera del rango permitido.");
    }
    return value;
  }

  private static List<String> stringList(
      Map<?, ?> values,
      String key,
      int maximumItems,
      int maximumLength) {
    Object candidate = values.get(key);
    if (!(candidate instanceof List<?> list) || list.size() > maximumItems) {
      throw invalid("El campo " + key + " debe ser una lista acotada.");
    }
    var normalized = new java.util.ArrayList<String>(list.size());
    var unique = new java.util.HashSet<String>();
    for (Object item : list) {
      if (!(item instanceof String value) || value.isBlank() || value.length() > maximumLength) {
        throw invalid("El campo " + key + " contiene un valor no válido.");
      }
      String clean = value.strip();
      if (!unique.add(clean)) {
        throw invalid("El campo " + key + " contiene valores repetidos.");
      }
      normalized.add(clean);
    }
    return List.copyOf(normalized);
  }

  private static void officialUrl(Map<?, ?> values, String key, String expected) {
    String raw = text(values, key, 1_000, false);
    try {
      URI uri = URI.create(raw);
      if (!"https".equalsIgnoreCase(uri.getScheme())
          || uri.getHost() == null
          || uri.getUserInfo() != null
          || uri.getPort() != -1
          || uri.getQuery() != null
          || uri.getFragment() != null
          || !canonicalUrl(expected).equals(canonicalUrl(uri.toString()))) {
        throw invalid("El campo " + key + " debe usar la URL HTTPS del conector oficial.");
      }
    } catch (ConfigurationDefinitionException invalid) {
      throw invalid;
    } catch (IllegalArgumentException invalidUri) {
      throw invalid("El campo " + key + " no contiene una URL válida.");
    }
  }

  private static String canonicalUrl(String value) {
    return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
  }

  private static Map<String, Object> stringMap(Map<?, ?> values) {
    Map<String, Object> result = new LinkedHashMap<>();
    values.forEach((key, value) -> result.put((String) key, value));
    return result;
  }

  private static ConfigurationDefinitionException invalid(String message) {
    return new ConfigurationDefinitionException(message);
  }

  private record ConnectorRule(
      String accessType,
      String endpointUrl,
      String termsUrl,
      boolean automationCapable,
      boolean realtimeCapable,
      String secureConnectorState) {
  }

  /** Excepción de dominio traducida a un código estable por la capa de aplicación. */
  public static final class ConfigurationDefinitionException extends IllegalArgumentException {
    private ConfigurationDefinitionException(String message) {
      super(message);
    }
  }
}
