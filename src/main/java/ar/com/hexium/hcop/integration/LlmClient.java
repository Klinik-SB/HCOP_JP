package ar.com.hexium.hcop.integration;

import ar.com.hexium.hcop.common.ApiException;
import ar.com.hexium.hcop.integration.SystemConfigService.Config;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

@Service
public class LlmClient {
  private final ObjectMapper mapper;
  private final HttpClient http;

  public LlmClient(ObjectMapper mapper) {
    this.mapper = mapper;
    this.http = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(15))
        .followRedirects(HttpClient.Redirect.NEVER)
        .build();
  }

  public Completion complete(Config config, List<Message> messages, boolean requireEnabled) {
    if (requireEnabled && !config.enabled()) {
      throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "El servicio LLM está desactivado.", "LLM_DISABLED");
    }
    boolean ollama = "ollama".equalsIgnoreCase(config.provider())
        || config.baseUrl().contains(":11434");
    URI endpoint = URI.create(config.baseUrl() + (ollama ? "/api/chat" : "/chat/completions"));
    ObjectNode body = mapper.createObjectNode();
    body.put("model", config.model());
    body.put("stream", false);
    ArrayNode messageNodes = body.putArray("messages");
    messages.forEach(message -> {
      ObjectNode node = messageNodes.addObject();
      node.put("role", message.role());
      node.put("content", message.content());
    });
    if (ollama) {
      ObjectNode options = body.putObject("options");
      options.put("temperature", config.temperature());
      options.put("num_predict", config.maxTokens());
    } else {
      body.put("temperature", config.temperature());
      body.put("max_tokens", config.maxTokens());
    }
    HttpRequest.Builder request = HttpRequest.newBuilder(endpoint)
        .timeout(Duration.ofMillis(config.timeoutMs()))
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .POST(HttpRequest.BodyPublishers.ofString(body.toString(), StandardCharsets.UTF_8));
    if (!config.apiKey().isBlank()) request.header("Authorization", "Bearer " + config.apiKey());
    try {
      HttpResponse<String> response = http.send(request.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
      JsonNode payload = mapper.readTree(response.body());
      if (response.statusCode() < 200 || response.statusCode() >= 300) {
        String detail = payload.path("error").path("message").asText(
            payload.path("error").asText("HTTP " + response.statusCode()));
        throw new ApiException(HttpStatus.BAD_GATEWAY, "El servicio LLM respondió con error: " + detail, "LLM_UPSTREAM_ERROR");
      }
      String content = ollama
          ? payload.path("message").path("content").asText("")
          : payload.path("choices").path(0).path("message").path("content").asText("");
      if (content.isBlank()) {
        throw new ApiException(HttpStatus.BAD_GATEWAY, "El servicio LLM devolvió una respuesta vacía.", "LLM_EMPTY_RESPONSE");
      }
      return new Completion(content, payload.path("model").asText(config.model()), payload);
    } catch (ApiException exception) {
      throw exception;
    } catch (java.net.http.HttpTimeoutException timeout) {
      throw new ApiException(HttpStatus.GATEWAY_TIMEOUT, "El servicio LLM excedió el tiempo de espera.", "LLM_TIMEOUT");
    } catch (InterruptedException interrupted) {
      Thread.currentThread().interrupt();
      throw new ApiException(
          HttpStatus.BAD_GATEWAY,
          "La conexión con el servicio LLM fue interrumpida.",
          "LLM_CONNECTION_INTERRUPTED");
    } catch (Exception exception) {
      throw new ApiException(
          HttpStatus.BAD_GATEWAY,
          "No se pudo conectar con el servicio LLM configurado: " + exception.getMessage(),
          "LLM_CONNECTION_ERROR");
    }
  }

  public JsonNode parseJson(String content) {
    String value = content == null ? "" : content.trim();
    if (value.startsWith("```")) {
      value = value.replaceFirst("^```(?:json)?\\s*", "").replaceFirst("\\s*```$", "");
    }
    try {
      return mapper.readTree(value);
    } catch (Exception invalid) {
      throw new ApiException(HttpStatus.BAD_GATEWAY, "El LLM no devolvió JSON válido.", "LLM_INVALID_JSON");
    }
  }

  public record Message(String role, String content) {
  }

  public record Completion(String content, String model, JsonNode raw) {
  }
}
