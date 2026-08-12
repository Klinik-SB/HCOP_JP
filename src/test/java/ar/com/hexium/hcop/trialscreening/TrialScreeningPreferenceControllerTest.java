package ar.com.hexium.hcop.trialscreening;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ar.com.hexium.hcop.auth.AuthContext;
import ar.com.hexium.hcop.auth.SessionPrincipal;
import ar.com.hexium.hcop.common.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import tools.jackson.databind.ObjectMapper;

class TrialScreeningPreferenceControllerTest {
  private final TrialScreeningPreferenceService service =
      mock(TrialScreeningPreferenceService.class);
  private final AuthContext auth = mock(AuthContext.class);
  private final HttpServletRequest request = mock(HttpServletRequest.class);
  private final TrialScreeningPreferenceController controller =
      new TrialScreeningPreferenceController(service, auth);
  private final ObjectMapper mapper = new ObjectMapper();

  @Test
  void updatesOnlyTheAuthenticatedUsersPreference() {
    when(auth.require(request)).thenReturn(principal(7L));
    var body = mapper.createObjectNode()
        .put("researchActive", true)
        .put("expectedRevision", 2);

    controller.update(body, request);

    verify(auth).requirePermission(request, "section.research.view");
    verify(service).update(7L, true, 2);
  }

  @Test
  void rejectsAClientSuppliedUserIdBeforeCallingTheService() {
    var body = mapper.createObjectNode()
        .put("researchActive", true)
        .put("expectedRevision", 0)
        .put("userId", 99);

    assertThatThrownBy(() -> controller.update(body, request))
        .isInstanceOfSatisfying(ApiException.class, failure -> {
          org.assertj.core.api.Assertions.assertThat(failure.status())
              .isEqualTo(HttpStatus.BAD_REQUEST);
          org.assertj.core.api.Assertions.assertThat(failure.code())
              .isEqualTo("TRIAL_SCREENING_PREFERENCE_INVALID");
        });
    verify(auth).requirePermission(request, "section.research.view");
    verifyNoInteractions(service);
  }

  @Test
  void rejectsAnExpectedRevisionOutsideSignedInt64WithoutTruncatingItToZero() throws Exception {
    var body = mapper.readTree("""
        {"researchActive":true,"expectedRevision":9223372036854775808}
        """);

    assertThatThrownBy(() -> controller.update(body, request))
        .isInstanceOfSatisfying(ApiException.class, failure -> {
          org.assertj.core.api.Assertions.assertThat(failure.status())
              .isEqualTo(HttpStatus.BAD_REQUEST);
          org.assertj.core.api.Assertions.assertThat(failure.code())
              .isEqualTo("TRIAL_SCREENING_PREFERENCE_INVALID");
        });
    verify(auth).requirePermission(request, "section.research.view");
    verifyNoInteractions(service);
  }

  private SessionPrincipal principal(long userId) {
    return new SessionPrincipal(
        userId,
        "oncologo",
        "",
        "Oncólogo",
        "Oncología",
        "MP 1",
        true,
        null,
        List.of(),
        Set.of("section.research.view"));
  }
}
