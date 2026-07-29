package ar.com.hexium.hcop;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

class DatabaseMigrationResourceTest {

    @Test
    void packagesEveryFlywayMigrationRequiredByAnEmptyInstallation() throws Exception {
        Resource[] migrations = new PathMatchingResourcePatternResolver()
                .getResources("classpath*:db/migration/V*.sql");

        assertThat(Arrays.stream(migrations).map(Resource::getFilename))
                .containsExactlyInAnyOrder(
                        "V001__core_schema.sql",
                        "V002__rbac_seed.sql",
                        "V003__scheduler_overlap_guard.sql",
                        "V004__file_session_grants.sql",
                        "V005__qr_workflow.sql",
                        "V006__clinical_role_permissions.sql");
    }
}
