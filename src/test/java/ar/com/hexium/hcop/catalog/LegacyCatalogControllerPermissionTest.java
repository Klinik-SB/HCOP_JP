package ar.com.hexium.hcop.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ar.com.hexium.hcop.auth.AuthContext;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class LegacyCatalogControllerPermissionTest {

  @Test
  void exigeLecturaDePrescripcionParaBuscarMedicamentos() {
    LegacyProtocolCatalogService protocols = mock(LegacyProtocolCatalogService.class);
    SeerTnmCatalogService tnm = mock(SeerTnmCatalogService.class);
    DrugCatalogService drugs = mock(DrugCatalogService.class);
    AuthContext auth = mock(AuthContext.class);
    HttpServletRequest request = mock(HttpServletRequest.class);
    when(drugs.search("ondansetron")).thenReturn(List.of(Map.of(
        "id", "drug-1",
        "genericName", "Ondansetron",
        "presentation", "8 mg")));

    LegacyCatalogController controller = new LegacyCatalogController(protocols, tnm, drugs, auth);

    Map<String, Object> response = controller.medicationSearch("ondansetron", request);

    verify(auth).requirePermission(request, "section.prescriptions.view");
    assertThat(response.get("count")).isEqualTo(1);
  }
}
