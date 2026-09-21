package com.saijo.smartfactory.resource;

import com.saijo.smartfactory.model.EMCDetails;
import com.saijo.smartfactory.model.EMCTestResult;
import com.saijo.smartfactory.service.EMCService;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.jboss.logging.Logger;

import java.util.HashMap;
import java.util.Map;

@Path("/api/v1/emc")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class EMCResource {
    
    private static final Logger LOG = Logger.getLogger(EMCResource.class);
    
    @Inject
    EMCService emcService;
    
    @POST
    @Path("/suggestion")
    public Response getSuggestion(EMCSuggestionRequest request) {
        LOG.info("Received EMC suggestion request");
        
        try {
            // Validate required fields
            if (request.getEmcDetails() == null) {
                return Response.status(Response.Status.BAD_REQUEST)
                    .entity(createErrorResponse("emc_details is required"))
                    .build();
            }
            
            if (request.getEmcTestResult() == null) {
                return Response.status(Response.Status.BAD_REQUEST)
                    .entity(createErrorResponse("emc_test_result is required"))
                    .build();
            }
            
            // Generate suggestion using the service
            String suggestion = emcService.generateSuggestion(
                request.getEmcDetails(),
                request.getEmcTestResult()
            );
            
            // Create response
            EMCSuggestionResponse response = new EMCSuggestionResponse();
            response.setResponseArea(suggestion);
            
            LOG.info("Successfully generated EMC suggestion");
            return Response.ok(response).build();
            
        } catch (Exception e) {
            LOG.error("Error processing EMC suggestion request", e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                .entity(createErrorResponse("Internal server error occurred while generating EMC suggestion"))
                .build();
        }
    }
    
    private Map<String, String> createErrorResponse(String message) {
        Map<String, String> error = new HashMap<>();
        error.put("error", message);
        return error;
    }
    
    // Request DTO
    public static class EMCSuggestionRequest {
        
        private EMCDetails emcDetails;
        
        private EMCTestResult emcTestResult;
        
        public EMCSuggestionRequest() {}
        
        public EMCDetails getEmcDetails() {
            return emcDetails;
        }
        
        public void setEmcDetails(EMCDetails emcDetails) {
            this.emcDetails = emcDetails;
        }
        
        public EMCTestResult getEmcTestResult() {
            return emcTestResult;
        }
        
        public void setEmcTestResult(EMCTestResult emcTestResult) {
            this.emcTestResult = emcTestResult;
        }
    }
    
    // Response DTO
    public static class EMCSuggestionResponse {
        
        private String responseArea;
        
        public EMCSuggestionResponse() {}
        
        public String getResponseArea() {
            return responseArea;
        }
        
        public void setResponseArea(String responseArea) {
            this.responseArea = responseArea;
        }
    }
}