package ar.com.hexium.hcop.integration;

import ar.com.hexium.hcop.auth.AuthContext;
import ar.com.hexium.hcop.catalog.SystemicFormCatalogService;
import ar.com.hexium.hcop.common.ApiException;
import ar.com.hexium.hcop.integration.LlmClient.Completion;
import ar.com.hexium.hcop.integration.LlmClient.Message;
import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

@RestController
public class LlmController {
  private static final int MAX_CLINICAL_TEXT = 350_000;
  private final SystemConfigService configuration;
  private final LlmClient llm;
  private final SystemicFormCatalogService forms;
  private final AuthContext auth;
  private final ObjectMapper mapper;

  public LlmController(
      SystemConfigService configuration,
      LlmClient llm,
      SystemicFormCatalogService forms,
      AuthContext auth,
      ObjectMapper mapper) {
    this.configuration = configuration;
    this.llm = llm;
    this.forms = forms;
    this.auth = auth;
    this.mapper = mapper;
  }

  @GetMapping("/api/config")
  Map<String, Object> config(HttpServletRequest request) {
    auth.requirePermission(request, "section.configuration.view");
    return configuration.publicView();
  }

  @PutMapping("/api/config")
  Map<String, Object> updateConfig(@RequestBody JsonNode body, HttpServletRequest request) {
    auth.requirePermission(request, "section.configuration.manage");
    return configuration.update(body, auth.require(request).userId());
  }

  @GetMapping("/api/llm/status")
  Map<String, Object> status(HttpServletRequest request) {
    auth.requirePermission(request, "section.agent.view");
    var config = configuration.internal();
    return Map.of(
        "ok", true, "enabled", config.enabled(), "model", config.model(),
        "provider", config.provider(), "configured", !config.baseUrl().isBlank());
  }

  @PostMapping("/api/llm/test")
  Map<String, Object> test(@RequestBody JsonNode body, HttpServletRequest request) {
    auth.requirePermission(request, "section.configuration.manage");
    var config = configuration.draft(body);
    Completion response = llm.complete(config, List.of(
        new Message("system", "Respondé únicamente con la palabra OK."),
        new Message("user", "Prueba de conexión HCOP JP.")), false);
    return Map.of(
        "ok", true, "model", response.model(),
        "response", response.content().trim(), "message", "Conexión correcta");
  }

  @PostMapping("/api/llm/extract-timeline")
  Map<String, Object> timeline(@RequestBody JsonNode body, HttpServletRequest request) {
    auth.requirePermission(request, "section.timeline.view");
    String text = limited(body.path("text").asText(""));
    if (text.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "No hay historia para analizar.");
    String prompt = """
        Extraé una cronología clínica oncológica exhaustiva. Respondé SOLO JSON válido con:
        {"events":[{"date":"YYYY-MM-DD","datePrecision":"day|month|year","category":"diagnosis|evolution|study|pathology|prescription|surgery|chemotherapy|radiotherapy|immunotherapy|hormone|targeted|research|indication","title":"","body":"","highlighted":false,"phase":"","clinicalStatus":"","sourceQuote":""}],"warnings":[]}.
        No inventes datos, preservá todas las fechas y separá eventos distintos.

        HISTORIA:
        """ + text;
    Completion response = llm.complete(
        configuration.internal(),
        List.of(new Message("system", "Sos un extractor clínico preciso y auditable."),
            new Message("user", prompt)), true);
    JsonNode parsed = llm.parseJson(response.content());
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("ok", true);
    result.put("events", parsed.path("events").isArray() ? parsed.path("events") : List.of());
    result.put("warnings", parsed.path("warnings").isArray() ? parsed.path("warnings") : List.of());
    result.put("model", response.model());
    result.put("extractorVersion", "timeline-java-v1");
    return result;
  }

  @PostMapping("/api/llm/summarize")
  Map<String, Object> summarize(@RequestBody JsonNode body, HttpServletRequest request) {
    auth.requirePermission(request, "section.timeline.view");
    JsonNode inputEvents = body.path("events");
    if (!inputEvents.isArray() || inputEvents.isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "No se recibieron eventos.");
    }
    var events = mapper.createArrayNode();
    int count = 0;
    for (JsonNode event : inputEvents) {
      if (count++ >= 250) break;
      events.add(event.deepCopy());
    }
    String prompt = """
        Resumí solamente los datos aportados, sin inventar. Omití nombres de profesionales.
        Priorizá diagnóstico, estadio, tratamientos, respuesta, progresión, toxicidad,
        internaciones y conducta. Respondé en español con puntos breves pero completos.

        PERÍODO:
        """ + limited(body.path("period").asText("")) + "\nEVENTOS:\n" + limited(events.toString());
    Completion response = llm.complete(
        configuration.internal(),
        List.of(
            new Message("system", "Sos un asistente de resumen clínico oncológico preciso y auditable."),
            new Message("user", prompt)),
        true);
    return Map.of("ok", true, "model", response.model(), "summary", response.content());
  }

  @PostMapping("/api/agent/chat")
  Map<String, Object> agent(@RequestBody JsonNode body, HttpServletRequest request) {
    auth.requirePermission(request, "section.agent.view");
    String message = body.path("message").asText("").trim();
    if (message.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "Escriba una consulta.");
    List<Message> messages = new ArrayList<>();
    messages.add(new Message("system", """
        Sos un asistente para revisión de historia clínica oncológica. No inventes información.
        Diferenciá hechos documentados de inferencias, señalá incertidumbre y no reemplaces el criterio médico.
        Respondé en español claro y conciso.
        """));
    String clinical = limited(body.path("clinicalText").asText(""));
    messages.add(new Message("system", "CONTEXTO CLÍNICO:\n" + clinical));
    JsonNode history = body.path("history");
    if (history.isArray()) history.forEach(item -> {
      String role = item.path("role").asText("user");
      if (!List.of("user", "assistant").contains(role)) role = "user";
      String content = item.path("content").asText("");
      if (!content.isBlank()) messages.add(new Message(role, limited(content)));
    });
    messages.add(new Message("user", limited(message)));
    Completion response = llm.complete(configuration.internal(), messages, true);
    return Map.of(
        "ok", true, "answer", response.content(), "model", response.model(),
        "artifacts", List.of(), "followUps", List.of(), "highlights", List.of());
  }

  @PostMapping("/api/llm/fill-systemic-form")
  Map<String, Object> fillSystemic(@RequestBody JsonNode body, HttpServletRequest request) {
    auth.requirePermission(request, "section.prescriptions.edit");
    String templateId = body.path("templateId").asText("");
    JsonNode template = forms.find(templateId);
    if (template == null) throw new ApiException(HttpStatus.NOT_FOUND, "Formulario no encontrado.");
    ObjectNode manifest = mapper.createObjectNode();
    template.path("fields").forEach(field -> {
      if ("llm".equals(field.path("source").asText(""))) {
        manifest.put(field.path("id").asText(""), field.path("label").asText(""));
      }
    });
    String prompt = """
        Completá los campos del formulario usando exclusivamente el texto clínico.
        Respondé SOLO un objeto JSON cuyas claves sean exactamente las del manifiesto.
        Para casillas usá true/false. Si falta un dato usá cadena vacía. No inventes.
        MANIFIESTO:
        """ + manifest + "\nTEXTO CLÍNICO:\n" + limited(body.path("clinicalText").asText(""))
        + "\nINDICACIÓN ADICIONAL DEL PROFESIONAL:\n" + limited(body.path("notes").asText(""));
    Completion response = llm.complete(
        configuration.internal(),
        List.of(new Message("system", "Sos un extractor de formularios clínicos."),
            new Message("user", prompt)), true);
    JsonNode parsed = llm.parseJson(response.content());
    return Map.of("ok", true, "templateId", templateId, "fields", parsed, "model", response.model());
  }

  private String limited(String value) {
    String text = value == null ? "" : value;
    return text.length() <= MAX_CLINICAL_TEXT ? text : text.substring(0, MAX_CLINICAL_TEXT);
  }
}
