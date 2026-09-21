package com.saijo.smartfactory.resource;

import com.saijo.smartfactory.model.AirConditionerDetails;
import com.saijo.smartfactory.model.TestResults;
import com.saijo.smartfactory.service.CalorieMeterService;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.jboss.logging.Logger;

import java.util.HashMap;
import java.util.Map;

@Path("/api/v1/calorie-meter")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class CalorieMeterResource {
    
    private static final Logger LOG = Logger.getLogger(CalorieMeterResource.class);
    
    @Inject
    CalorieMeterService calorieMeterService;
    
    @POST
    @Path("/suggestion")
    public Response getSuggestion(CalorieMeterSuggestionRequest request) {
        LOG.info("Received calorie meter suggestion request");
        
        try {
            // Validate required fields
            if (request.getAirConditionerDetails() == null) {
                return Response.status(Response.Status.BAD_REQUEST)
                    .entity(createErrorResponse("air_conditioner_details is required"))
                    .build();
            }
            
            if (request.getTestResults() == null) {
                return Response.status(Response.Status.BAD_REQUEST)
                    .entity(createErrorResponse("test_results is required"))
                    .build();
            }
            
            // Generate suggestion using the service
            String suggestion = calorieMeterService.generateSuggestion(
                request.getAirConditionerDetails(),
                request.getTestResults()
            );
            
            // Create response
            CalorieMeterSuggestionResponse response = new CalorieMeterSuggestionResponse();
            response.setResponseArea(suggestion);
            
            LOG.info("Successfully generated calorie meter suggestion");
            return Response.ok(response).build();
            
        } catch (Exception e) {
            LOG.error("Error processing calorie meter suggestion request", e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                .entity(createErrorResponse("Internal server error occurred while generating suggestion"))
                .build();
        }
    }
    
    private Map<String, String> createErrorResponse(String message) {
        Map<String, String> error = new HashMap<>();
        error.put("error", message);
        return error;
    }
    
    // Request DTO
    public static class CalorieMeterSuggestionRequest {
        
        private AirConditionerDetails airConditionerDetails;
        
        private TestResults testResults;
        
        public CalorieMeterSuggestionRequest() {}
        
        public AirConditionerDetails getAirConditionerDetails() {
            return airConditionerDetails;
        }
        
        public void setAirConditionerDetails(AirConditionerDetails airConditionerDetails) {
            this.airConditionerDetails = airConditionerDetails;
        }
        
        public TestResults getTestResults() {
            return testResults;
        }
        
        public void setTestResults(TestResults testResults) {
            this.testResults = testResults;
        }
    }
    
    // Response DTO
    public static class CalorieMeterSuggestionResponse {
        
        private String responseArea;
        
        public CalorieMeterSuggestionResponse() {}
        
        public String getResponseArea() {
            return responseArea;
        }
        
        public void setResponseArea(String responseArea) {
            this.responseArea = responseArea;
        }
    }
}