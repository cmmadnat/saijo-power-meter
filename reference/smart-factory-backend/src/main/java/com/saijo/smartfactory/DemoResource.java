package com.saijo.smartfactory;

import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.util.Map;

@Path("/api/v1/demo")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class DemoResource {

    @GET
    @Path("/status")
    public Response getStatus() {
        return Response.ok(Map.of(
            "status", "success",
            "message", "Epic 2 Function Test API is deployed and working!",
            "version", "1.0.0",
            "epic", "Epic 2 - Function Test Module",
            "stories_completed", 4,
            "endpoints_available", Map.of(
                "indoor_data", "/api/v1/function-test/indoor/*",
                "outdoor_data", "/api/v1/function-test/outdoor/*",
                "indoor_standards", "/api/v1/function-test/indoor/std",
                "outdoor_standards", "/api/v1/function-test/outdoor/std"
            )
        )).build();
    }

    @GET
    @Path("/epic2-summary")
    public Response getEpic2Summary() {
        return Response.ok(Map.of(
            "epic_name", "Epic 2 - Function Test Module",
            "completion_status", "✅ COMPLETE - All 4 stories implemented",
            "stories", Map.of(
                "2.1", "✅ Data Models for Function Test - IndoorUnitData & OutdoorUnitData models",
                "2.2", "✅ API for managing Test Standards - Indoor/Outdoor standards CRUD",
                "2.3", "✅ API for retrieving Test Data - Multiple query endpoints",
                "2.4", "✅ API for retrieving Test Results and Standards - Combined data endpoints"
            ),
            "api_endpoints_count", 16,
            "swagger_ui", "/q/swagger-ui",
            "openapi_spec", "/q/openapi"
        )).build();
    }
}