package ar.com.hexium.hcop.config;

import ar.com.hexium.hcop.auth.AuthInterceptor;
import java.time.Duration;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfiguration implements WebMvcConfigurer {
  private final AuthInterceptor authInterceptor;

  public WebConfiguration(AuthInterceptor authInterceptor) {
    this.authInterceptor = authInterceptor;
  }

  @Override
  public void addInterceptors(InterceptorRegistry registry) {
    registry.addInterceptor(authInterceptor).addPathPatterns("/api/**");
  }

  @Override
  public void addViewControllers(ViewControllerRegistry registry) {
    // Angular se sirve como una SPA propia en /app. La interfaz legacy continúa
    // en / mientras cada recorrido alcanza paridad y puede retirarse con seguridad.
    registry.addRedirectViewController("/app", "/app/");
    registry.addViewController("/app/").setViewName("forward:/app/index.html");
    registry.addRedirectViewController("/configuration", "/configuration/index.html");
    registry.addRedirectViewController("/configuration/", "/configuration/index.html");
    registry.addRedirectViewController("/herramientas", "/herramientas/index.html");
    registry.addRedirectViewController("/herramientas/", "/herramientas/index.html");
    registry.addRedirectViewController("/protocol-admin", "/protocol-admin/index.html");
    registry.addRedirectViewController("/protocol-admin/", "/protocol-admin/index.html");
    registry.addRedirectViewController("/docs", "/docs/index.html");
    registry.addRedirectViewController("/docs/", "/docs/index.html");
  }

  @Override
  public void addResourceHandlers(ResourceHandlerRegistry registry) {
    registry.addResourceHandler("/**")
        .addResourceLocations("classpath:/static/")
        .setCacheControl(CacheControl.maxAge(Duration.ZERO).mustRevalidate());
  }
}
