package com.saijo.smartfactory;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.util.Map;

@Path("/api/v1/health")
public class HealthCheckResource {
    
    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public Response healthCheck() {
        Map<String, String> status = Map.of("status", "UP");
        return Response.ok(status).build();
    }
}