package ar.com.hexium.hcop.common;

import jakarta.validation.ConstraintViolationException;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@RestControllerAdvice
public class ApiExceptionHandler {
  private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

  @ExceptionHandler(ApiException.class)
  ResponseEntity<Map<String, Object>> api(ApiException exception) {
    return response(exception.status(), exception.getMessage(), exception.code());
  }

  @ExceptionHandler({
      MethodArgumentNotValidException.class,
      ConstraintViolationException.class,
      HttpMessageNotReadableException.class
  })
  ResponseEntity<Map<String, Object>> invalid(Exception exception) {
    return response(HttpStatus.BAD_REQUEST, "La solicitud contiene datos inválidos.");
  }

  @ExceptionHandler(DataIntegrityViolationException.class)
  ResponseEntity<Map<String, Object>> conflict(DataIntegrityViolationException exception) {
    return response(HttpStatus.CONFLICT, "La operación entra en conflicto con datos existentes.");
  }

  @ExceptionHandler(ConcurrencyFailureException.class)
  ResponseEntity<Map<String, Object>> concurrency(ConcurrencyFailureException exception) {
    return response(HttpStatus.CONFLICT, "El registro fue modificado por otra operación.");
  }

  @ExceptionHandler(NoResourceFoundException.class)
  ResponseEntity<Map<String, Object>> notFound(NoResourceFoundException exception) {
    return response(HttpStatus.NOT_FOUND, "El recurso solicitado no existe.");
  }

  @ExceptionHandler(Exception.class)
  ResponseEntity<Map<String, Object>> unexpected(Exception exception) {
    log.error("Unhandled API error", exception);
    return response(HttpStatus.INTERNAL_SERVER_ERROR, "No se pudo completar la operación.");
  }

  private ResponseEntity<Map<String, Object>> response(HttpStatus status, String message) {
    return response(status, message, "");
  }

  private ResponseEntity<Map<String, Object>> response(HttpStatus status, String message, String code) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("ok", false);
    body.put("error", message);
    if (code != null && !code.isBlank()) body.put("code", code);
    body.put("status", status.value());
    return ResponseEntity.status(status).body(body);
  }
}
