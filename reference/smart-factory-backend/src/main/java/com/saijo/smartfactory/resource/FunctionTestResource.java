package com.saijo.smartfactory.resource;

import com.saijo.smartfactory.model.*;
import com.saijo.smartfactory.service.FunctionTestService;


import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.logging.Logger;

@Path("/api/v1/function-test")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class FunctionTestResource {
    
    private static final Logger LOGGER = Logger.getLogger(FunctionTestResource.class.getName());
    
    @Inject
    FunctionTestService functionTestService;

    // Indoor Unit Data Endpoints
    @GET
    @Path("/indoor/model")
    public Response getIndoorUnitModel(@QueryParam("serial") String serial, @QueryParam("item") String item) {
        try {
            if (serial == null || item == null) {
                return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Both serial and item parameters are required"))
                    .build();
            }
            
            IndoorUnitData result = functionTestService.getIndoorUnitModel(serial, item);
            if (result == null) {
                return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", "Indoor unit not found"))
                    .build();
            }
            
            return Response.ok(result).build();
        } catch (Exception e) {
            LOGGER.severe("Error getting indoor unit model: " + e.getMessage());
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                .entity(Map.of("error", "Internal server error"))
                .build();
        }
    }
    
    @GET
    @Path("/indoor/all")
    public Response getAllIndoorUnits() {
        try {
            List<IndoorUnitData> results = functionTestService.getAllIndoorUnits();
            return Response.ok(results).build();
        } catch (Exception e) {
            LOGGER.severe("Error getting all indoor units: " + e.getMessage());
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                .entity(Map.of("error", "Internal server error"))
                .build();
        }
    }
    
    @GET
    @Path("/indoor/by-serial")
    public Response getIndoorUnitsBySerial(@QueryParam("serial") String serial) {
        try {
            if (serial == null) {
                return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Serial parameter is required"))
                    .build();
            }
            
            List<IndoorUnitData> results = functionTestService.getIndoorUnitsBySerial(serial);
            return Response.ok(results).build();
        } catch (Exception e) {
            LOGGER.severe("Error getting indoor units by serial: " + e.getMessage());
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                .entity(Map.of("error", "Internal server error"))
                .build();
        }
    }
    
    @GET
    @Path("/indoor/by-date-range")
    public Response getIndoorUnitsByDateRange(@QueryParam("startDate") String startDate, @QueryParam("endDate") String endDate) {
        try {
            if (startDate == null || endDate == null) {
                return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Both startDate and endDate parameters are required"))
                    .build();
            }
            
            List<IndoorUnitData> results = functionTestService.getIndoorUnitsByDateRange(startDate, endDate);
            return Response.ok(results).build();
        } catch (Exception e) {
            LOGGER.severe("Error getting indoor units by date range: " + e.getMessage());
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                .entity(Map.of("error", "Internal server error"))
                .build();
        }
    }

    // Outdoor Unit Data Endpoints
    @GET
    @Path("/outdoor/model")
    public Response getOutdoorUnitModel(@QueryParam("serial") String serial, @QueryParam("item") String item) {
        try {
            if (serial == null || item == null) {
                return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Both serial and item parameters are required"))
                    .build();
            }
            
            OutdoorUnitData result = functionTestService.getOutdoorUnitModel(serial, item);
            if (result == null) {
                return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", "Outdoor unit not found"))
                    .build();
            }
            
            return Response.ok(result).build();
        } catch (Exception e) {
            LOGGER.severe("Error getting outdoor unit model: " + e.getMessage());
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                .entity(Map.of("error", "Internal server error"))
                .build();
        }
    }
    
    @GET
    @Path("/outdoor/all")
    public Response getAllOutdoorUnits() {
        try {
            List<OutdoorUnitData> results = functionTestService.getAllOutdoorUnits();
            return Response.ok(results).build();
        } catch (Exception e) {
            LOGGER.severe("Error getting all outdoor units: " + e.getMessage());
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                .entity(Map.of("error", "Internal server error"))
                .build();
        }
    }
    
    @GET
    @Path("/outdoor/by-serial")
    public Response getOutdoorUnitsBySerial(@QueryParam("serial") String serial) {
        try {
            if (serial == null) {
                return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Serial parameter is required"))
                    .build();
            }
            
            List<OutdoorUnitData> results = functionTestService.getOutdoorUnitsBySerial(serial);
            return Response.ok(results).build();
        } catch (Exception e) {
            LOGGER.severe("Error getting outdoor units by serial: " + e.getMessage());
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                .entity(Map.of("error", "Internal server error"))
                .build();
        }
    }
    
    @GET
    @Path("/outdoor/by-date-range")
    public Response getOutdoorUnitsByDateRange(@QueryParam("startDate") String startDate, @QueryParam("endDate") String endDate) {
        try {
            if (startDate == null || endDate == null) {
                return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Both startDate and endDate parameters are required"))
                    .build();
            }
            
            List<OutdoorUnitData> results = functionTestService.getOutdoorUnitsByDateRange(startDate, endDate);
            return Response.ok(results).build();
        } catch (Exception e) {
            LOGGER.severe("Error getting outdoor units by date range: " + e.getMessage());
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                .entity(Map.of("error", "Internal server error"))
                .build();
        }
    }

    // Indoor Standards Endpoints
    @POST
    @Path("/indoor/std")
    public Response addIndoorStandard(IndoorUnitStd standard) {
        try {
            if (standard.getItem() == null || standard.getItem().trim().isEmpty()) {
                return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Item is required"))
                    .build();
            }
            
            String id = functionTestService.addIndoorStandard(standard);
            return Response.status(Response.Status.CREATED)
                .entity(Map.of("success", true, "id", id))
                .build();
        } catch (Exception e) {
            LOGGER.severe("Error adding indoor standard: " + e.getMessage());
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                .entity(Map.of("error", "Internal server error"))
                .build();
        }
    }
    
    @GET
    @Path("/indoor/std")
    public Response getIndoorStandard(@QueryParam("item") String item) {
        try {
            if (item == null) {
                return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Item parameter is required"))
                    .build();
            }
            
            IndoorUnitStd result = functionTestService.getIndoorStandard(item);
            if (result == null) {
                return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", "Indoor standard not found"))
                    .build();
            }
            
            return Response.ok(result).build();
        } catch (Exception e) {
            LOGGER.severe("Error getting indoor standard: " + e.getMessage());
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                .entity(Map.of("error", "Internal server error"))
                .build();
        }
    }
    
    @PUT
    @Path("/indoor/std")
    public Response updateIndoorStandard(IndoorUnitStd standard) {
        try {
            if (standard.getItem() == null || standard.getItem().trim().isEmpty()) {
                return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Item is required"))
                    .build();
            }
            
            functionTestService.updateIndoorStandard(standard);
            return Response.ok(Map.of("success", true)).build();
        } catch (RuntimeException e) {
            LOGGER.warning("Indoor standard not found: " + e.getMessage());
            return Response.status(Response.Status.NOT_FOUND)
                .entity(Map.of("error", e.getMessage()))
                .build();
        } catch (Exception e) {
            LOGGER.severe("Error updating indoor standard: " + e.getMessage());
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                .entity(Map.of("error", "Internal server error"))
                .build();
        }
    }

    // Outdoor Standards Endpoints
    @POST
    @Path("/outdoor/std")
    public Response addOutdoorStandard(OutdoorUnitStd standard) {
        try {
            if (standard.getItem() == null || standard.getItem().trim().isEmpty()) {
                return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Item is required"))
                    .build();
            }
            
            String id = functionTestService.addOutdoorStandard(standard);
            return Response.status(Response.Status.CREATED)
                .entity(Map.of("success", true, "id", id))
                .build();
        } catch (Exception e) {
            LOGGER.severe("Error adding outdoor standard: " + e.getMessage());
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                .entity(Map.of("error", "Internal server error"))
                .build();
        }
    }
    
    @GET
    @Path("/outdoor/std")
    public Response getOutdoorStandard(@QueryParam("item") String item) {
        try {
            if (item == null) {
                return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Item parameter is required"))
                    .build();
            }
            
            OutdoorUnitStd result = functionTestService.getOutdoorStandard(item);
            if (result == null) {
                return Response.status(Response.Status.NOT_FOUND)
                    .entity(Map.of("error", "Outdoor standard not found"))
                    .build();
            }
            
            return Response.ok(result).build();
        } catch (Exception e) {
            LOGGER.severe("Error getting outdoor standard: " + e.getMessage());
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                .entity(Map.of("error", "Internal server error"))
                .build();
        }
    }
    
    @PUT
    @Path("/outdoor/std")
    public Response updateOutdoorStandard(OutdoorUnitStd standard) {
        try {
            if (standard.getItem() == null || standard.getItem().trim().isEmpty()) {
                return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "Item is required"))
                    .build();
            }
            
            functionTestService.updateOutdoorStandard(standard);
            return Response.ok(Map.of("success", true)).build();
        } catch (RuntimeException e) {
            LOGGER.warning("Outdoor standard not found: " + e.getMessage());
            return Response.status(Response.Status.NOT_FOUND)
                .entity(Map.of("error", e.getMessage()))
                .build();
        } catch (Exception e) {
            LOGGER.severe("Error updating outdoor standard: " + e.getMessage());
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                .entity(Map.of("error", "Internal server error"))
                .build();
        }
    }

    // Result and Standard Endpoints
    @GET
    @Path("/indoor/result-and-std")
    public Response getIndoorResultAndStandard(@QueryParam("testNo") String testNo) {
        try {
            if (testNo == null) {
                return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "TestNo parameter is required"))
                    .build();
            }

            DetailedTestResultResponse<IndoorUnitData, IndoorUnitStd, IndoorFieldResults> result =
                functionTestService.getIndoorResultAndStandard(testNo);

            return Response.ok(result).build();
        } catch (RuntimeException e) {
            LOGGER.warning("Indoor result not found: " + e.getMessage());
            return Response.status(Response.Status.NOT_FOUND)
                .entity(Map.of("error", e.getMessage()))
                .build();
        } catch (Exception e) {
            LOGGER.severe("Error getting indoor result and standard: " + e.getMessage());
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                .entity(Map.of("error", "Internal server error"))
                .build();
        }
    }

    @GET
    @Path("/outdoor/result-and-std")
    public Response getOutdoorResultAndStandard(@QueryParam("testNo") String testNo) {
        try {
            if (testNo == null) {
                return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "TestNo parameter is required"))
                    .build();
            }

            DetailedTestResultResponse<OutdoorUnitData, OutdoorUnitStd, OutdoorFieldResults> result =
                functionTestService.getOutdoorResultAndStandard(testNo);

            return Response.ok(result).build();
        } catch (RuntimeException e) {
            LOGGER.warning("Outdoor result not found: " + e.getMessage());
            return Response.status(Response.Status.NOT_FOUND)
                .entity(Map.of("error", e.getMessage()))
                .build();
        } catch (Exception e) {
            LOGGER.severe("Error getting outdoor result and standard: " + e.getMessage());
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                .entity(Map.of("error", "Internal server error"))
                .build();
        }
    }
}