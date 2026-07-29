package ar.com.hexium.hcop.catalog;

import ar.com.hexium.hcop.auth.AuthContext;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.Map;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class GuideCatalogController {
  private final GuideCatalogService guides;
  private final AuthContext auth;

  public GuideCatalogController(GuideCatalogService guides, AuthContext auth) {
    this.guides = guides;
    this.auth = auth;
  }

  @GetMapping("/api/guides")
  Map<String, Object> list(
      @RequestParam(defaultValue = "0") int includeInactive,
      HttpServletRequest request) {
    auth.requirePermission(request, "section.tools.view");
    var items = guides.list(includeInactive == 1);
    return Map.of("ok", true, "guides", items, "count", items.size());
  }

  @GetMapping("/api/guides/file")
  ResponseEntity<FileSystemResource> file(
      @RequestParam String name, HttpServletRequest request) throws IOException {
    auth.requirePermission(request, "section.tools.view");
    var path = guides.file(name);
    return ResponseEntity.ok()
        .contentType(MediaType.APPLICATION_PDF)
        .contentLength(java.nio.file.Files.size(path))
        .header(HttpHeaders.CONTENT_DISPOSITION,
            ContentDisposition.inline().filename(path.getFileName().toString()).build().toString())
        .body(new FileSystemResource(path));
  }

  @PutMapping(value = "/api/guides/import", consumes = MediaType.APPLICATION_PDF_VALUE)
  Map<String, Object> upload(
      @RequestParam String name,
      HttpServletRequest request) throws IOException {
    auth.requirePermission(request, "section.configuration.manage");
    return guides.store(name, request.getInputStream(), request.getContentLengthLong());
  }
}
