package com.saijo.resources;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.io.InputStream;

/**
 * Resource to handle Single Page Application (SPA) routing.
 * This ensures that React Router routes work correctly when users
 * refresh the page or navigate directly to internal routes.
 */
@Path("/")
public class SPAResource {

    /**
     * Catch-all handler for SPA routes.
     * Any path that doesn't match API routes will serve the React app's index.html
     * This allows React Router to handle client-side routing properly.
     */
    @GET
    @Path("{path:.*}")
    @Produces(MediaType.TEXT_HTML)
    public Response serveSPA(@PathParam("path") String path) {
        // Don't intercept API calls or static resources
        if (path.startsWith("api/") || 
            path.startsWith("q/") || 
            path.startsWith("static/") ||
            path.contains(".")) {
            // Let these go through normal processing (will return 404 if not found)
            return Response.status(Response.Status.NOT_FOUND).build();
        }
        
        // For all other paths, serve the React app's index.html
        InputStream indexHtml = getClass().getClassLoader()
            .getResourceAsStream("META-INF/resources/index.html");
            
        if (indexHtml == null) {
            return Response.status(Response.Status.NOT_FOUND)
                .entity("React app not found").build();
        }
        
        return Response.ok(indexHtml, MediaType.TEXT_HTML).build();
    }
    
    /**
     * Serve the root path
     */
    @GET
    @Produces(MediaType.TEXT_HTML)
    public Response serveRoot() {
        InputStream indexHtml = getClass().getClassLoader()
            .getResourceAsStream("META-INF/resources/index.html");
            
        if (indexHtml == null) {
            return Response.status(Response.Status.NOT_FOUND)
                .entity("React app not found").build();
        }
        
        return Response.ok(indexHtml, MediaType.TEXT_HTML).build();
    }
}