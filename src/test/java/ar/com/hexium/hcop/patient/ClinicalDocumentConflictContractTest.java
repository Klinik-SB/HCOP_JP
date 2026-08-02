package ar.com.hexium.hcop.patient;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ar.com.hexium.hcop.auth.AuthContext;
import ar.com.hexium.hcop.auth.SessionPrincipal;
import ar.com.hexium.hcop.common.ApiExceptionHandler;
import ar.com.hexium.hcop.config.HcopProperties;
import ar.com.hexium.hcop.patient.PatientDocumentRepository.StoredDocument;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

class ClinicalDocumentConflictContractTest {
  private final PatientRepository patients = mock(PatientRepository.class);
  private final PatientDocumentRepository repository = mock(PatientDocumentRepository.class);
  private final AuthContext auth = mock(AuthContext.class);
  private final ObjectMapper mapper = new ObjectMapper();
  private MockMvc mvc;

  @BeforeEach
  void setUp() {
    PatientDocumentService service = new PatientDocumentService(
        patients,
        repository,
        mapper,
        mock(HcopProperties.class),
        Clock.systemUTC());
    ClinicalDocumentController controller = new ClinicalDocumentController(
        service,
        auth,
        new ClinicalDocumentAccessPolicy());
    mvc = MockMvcBuilders.standaloneSetup(controller)
        .setControllerAdvice(new ApiExceptionHandler())
        .build();
  }

  @Test
  void exigePacienteActivoConCodigoEstable() throws Exception {
    when(auth.require(any(HttpServletRequest.class))).thenReturn(principal(null));

    mvc.perform(put("/api/hc")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{}"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.ok").value(false))
        .andExpect(jsonPath("$.status").value(409))
        .andExpect(jsonPath("$.code").value("ACTIVE_PATIENT_REQUIRED"))
        .andExpect(jsonPath("$.error").value("Abra un paciente antes de guardar."));

    verifyNoInteractions(repository);
  }

  @Test
  void exigeRevisionClinicaSinIntentarActualizar() throws Exception {
    when(auth.require(any(HttpServletRequest.class))).thenReturn(principal(42L));
    when(repository.find(42L)).thenReturn(Optional.of(stored(42L, mapper.createObjectNode(), 3L)));

    mvc.perform(put("/api/hc")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{}"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("CLINICAL_REVISION_REQUIRED"))
        .andExpect(jsonPath("$.status").value(409));

    verify(repository, never()).update(anyLong(), any(JsonNode.class), anyLong(), anyLong());
  }

  @Test
  void rechazaUnDocumentoDeOtroPacienteSinIntentarActualizar() throws Exception {
    when(auth.require(any(HttpServletRequest.class))).thenReturn(principal(42L));
    when(repository.find(42L)).thenReturn(Optional.of(stored(42L, mapper.createObjectNode(), 3L)));

    mvc.perform(put("/api/hc")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {
                  "meta": {"persistenceRevision": 3, "liraImport": {"patientId": "43"}},
                  "patient": {"liraId": "43"}
                }
                """))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("CLINICAL_PATIENT_MISMATCH"))
        .andExpect(jsonPath("$.status").value(409));

    verify(repository, never()).update(anyLong(), any(JsonNode.class), anyLong(), anyLong());
  }

  @Test
  void informaVersionConflictSinSobrescribirLaVersionGanadora() throws Exception {
    when(auth.require(any(HttpServletRequest.class))).thenReturn(principal(42L));
    when(repository.find(42L)).thenReturn(Optional.of(stored(42L, mapper.createObjectNode(), 4L)));
    when(repository.update(eq(42L), any(JsonNode.class), eq(3L), eq(7L)))
        .thenReturn(Optional.empty());

    mvc.perform(put("/api/hc")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {
                  "meta": {"persistenceRevision": 3, "liraImport": {"patientId": "42"}},
                  "patient": {"liraId": "42"},
                  "narrative": {"summary": "Borrador concurrente"}
                }
                """))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.ok").value(false))
        .andExpect(jsonPath("$.status").value(409))
        .andExpect(jsonPath("$.code").value("VERSION_CONFLICT"))
        .andExpect(jsonPath("$.error").value("La historia fue modificada en otra ventana."));

    verify(repository).update(eq(42L), any(JsonNode.class), eq(3L), eq(7L));
  }

  private SessionPrincipal principal(Long activePatientId) {
    return new SessionPrincipal(
        7L,
        "oncologia",
        "",
        "Oncología",
        "",
        "",
        true,
        activePatientId,
        List.of(),
        Set.of(
            "section.history.view",
            "section.history.edit",
            "section.prescriptions.view",
            "section.prescriptions.edit"));
  }

  private StoredDocument stored(long patientId, JsonNode document, long revision) {
    Instant now = Instant.parse("2026-08-02T16:00:00Z");
    return new StoredDocument(patientId, document, revision, null, now, now);
  }
}
