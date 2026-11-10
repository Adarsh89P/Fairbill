package com.fairbill.config;

import java.io.IOException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.lang.NonNull;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

/**
 * Serves the exported web build of the app (single-page app) from the same
 * origin as the API when fairbill.web-dir is set. Unknown non-API paths fall
 * back to index.html so deep links like /bill/123/review work.
 */
@Configuration
public class WebAppConfig implements WebMvcConfigurer {
    private final String webDir;

    public WebAppConfig(@Value("${fairbill.web-dir:}") String webDir) {
        this.webDir = webDir;
    }

    @Override
    public void addViewControllers(@NonNull ViewControllerRegistry registry) {
        if (webDir != null && !webDir.isBlank()) registry.addViewController("/").setViewName("forward:/index.html");
    }

    @Override
    public void addResourceHandlers(@NonNull ResourceHandlerRegistry registry) {
        if (webDir == null || webDir.isBlank()) return;
        String location = "file:" + (webDir.endsWith("/") ? webDir : webDir + "/");
        registry.addResourceHandler("/**")
                .addResourceLocations(location)
                .resourceChain(true)
                .addResolver(new PathResourceResolver() {
                    @Override
                    protected Resource getResource(@NonNull String path, @NonNull Resource base) throws IOException {
                        Resource r = base.createRelative(path);
                        if (r.exists() && r.isReadable()) return r;
                        if (path.startsWith("api/") || path.startsWith("s/") || path.startsWith("actuator/")) return null;
                        return base.createRelative("index.html");
                    }
                });
    }
}
