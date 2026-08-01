package ar.com.hexium.hcop.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ar.com.hexium.hcop.config.HcopProperties;
import jakarta.servlet.http.Cookie;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

class AuthInterceptorTest {
  private final AuthService auth = mock(AuthService.class);
  private final HcopProperties properties = mock(HcopProperties.class);
  private final ObjectMapper mapper = new ObjectMapper();
  private final AuthInterceptor interceptor;

  AuthInterceptorTest() {
    when(properties.sessionCookieName()).thenReturn("HCOP_SESSION");
    interceptor = new AuthInterceptor(auth, mapper, properties);
  }

  @Test
  void rechazaAgenteAntesDelBindingSiLaSesionNoTienePermiso() throws Exception {
    MockHttpServletRequest request = agentRequest();
    MockHttpServletResponse response = new MockHttpServletResponse();
    when(auth.authenticate("token-low-role")).thenReturn(Optional.of(principal(Set.of())));

    boolean allowed = interceptor.preHandle(request, response, new Object());

    assertThat(allowed).isFalse();
    assertThat(response.getStatus()).isEqualTo(403);
    JsonNode body = mapper.readTree(response.getContentAsByteArray());
    assertThat(body.path("code").asText()).isEqualTo("PERMISSION_DENIED");
  }

  @Test
  void permiteAgenteAntesDelBindingConPermisoEspecifico() throws Exception {
    MockHttpServletRequest request = agentRequest();
    MockHttpServletResponse response = new MockHttpServletResponse();
    when(auth.authenticate("token-low-role"))
        .thenReturn(Optional.of(principal(Set.of("section.agent.view"))));

    boolean allowed = interceptor.preHandle(request, response, new Object());

    assertThat(allowed).isTrue();
    assertThat(request.getAttribute(AuthContext.PRINCIPAL_ATTRIBUTE))
        .isInstanceOf(SessionPrincipal.class);
  }

  @Test
  void conservaElRechazoDeSesionAusente() throws Exception {
    MockHttpServletRequest request = agentRequest();
    MockHttpServletResponse response = new MockHttpServletResponse();
    when(auth.authenticate("token-low-role")).thenReturn(Optional.empty());

    boolean allowed = interceptor.preHandle(request, response, new Object());

    assertThat(allowed).isFalse();
    assertThat(response.getStatus()).isEqualTo(401);
    JsonNode body = mapper.readTree(response.getContentAsByteArray());
    assertThat(body.path("code").asText()).isEqualTo("AUTHENTICATION_REQUIRED");
  }

  private MockHttpServletRequest agentRequest() {
    MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/agent/chat");
    request.setCookies(new Cookie("HCOP_SESSION", "token-low-role"));
    return request;
  }

  private SessionPrincipal principal(Set<String> permissions) {
    return new SessionPrincipal(
        7L,
        "qa-user",
        "",
        "Usuario QA",
        "",
        "",
        true,
        null,
        List.of(),
        permissions);
  }
}
