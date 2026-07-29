package ar.com.hexium.hcop.catalog;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/ajcc8")
public class AjccCatalogController {
    private final AjccCatalogService catalog;

    public AjccCatalogController(AjccCatalogService catalog) {
        this.catalog = catalog;
    }

    @GetMapping
    public Map<String, Object> list() {
        var sites = catalog.list();
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("ok", true);
        response.put("offline", true);
        response.put("edition", "AJCC 8");
        response.put("source", "Catálogo local validado");
        response.put("count", sites.size());
        response.put("sites", sites);
        return response;
    }

    @GetMapping("/detail")
    public Map<String, Object> detail(@RequestParam String id) {
        return catalog.detail(id);
    }

    @PostMapping("/stage")
    public Map<String, Object> stage(@RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        Map<String, Object> values = body.get("values") instanceof Map<?, ?> map
            ? (Map<String, Object>) map : Map.of();
        return catalog.stage(String.valueOf(body.getOrDefault("id", "")), values);
    }
}
