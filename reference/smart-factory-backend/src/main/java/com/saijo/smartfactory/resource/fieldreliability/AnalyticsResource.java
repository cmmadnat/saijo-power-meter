package com.saijo.smartfactory.resource.fieldreliability;

import com.saijo.smartfactory.model.fieldreliability.ReliabilityMetrics;
import com.saijo.smartfactory.model.fieldreliability.EquipmentPrediction;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.HashMap;

@Path("/api/analytics")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class AnalyticsResource {
    
    @GET
    @Path("/reliability/{equipmentId}")
    public Response getReliabilityMetrics(@PathParam("equipmentId") String equipmentId) {
        try {
            // Demo equipment names
            Map<String, String> equipmentNames = Map.of(
                "AC001", "Bangkok Factory - AC Unit 001",
                "AC002", "Chonburi Plant - AC Unit 002", 
                "AC003", "Rayong Facility - AC Unit 003",
                "PM001", "Power Meter - Production Line 1",
                "PM002", "Power Meter - Production Line 2"
            );
            
            String equipmentName = equipmentNames.getOrDefault(equipmentId, "Equipment " + equipmentId);
            ReliabilityMetrics metrics = new ReliabilityMetrics(equipmentId, equipmentName);
            
            return Response.ok(metrics).build();
        } catch (Exception e) {
            return Response.status(500)
                .entity("{\"error\": \"Failed to calculate reliability metrics\"}")
                .build();
        }
    }
    
    @GET
    @Path("/trends/{equipmentId}")
    public Response getTrendData(@PathParam("equipmentId") String equipmentId) {
        try {
            // Generate demo trend data for charts
            Map<String, Object> trendData = new HashMap<>();
            trendData.put("equipmentId", equipmentId);
            trendData.put("dataPoints", generateDemoTrendData());
            trendData.put("period", "last_30_days");
            trendData.put("metrics", Arrays.asList("availability", "performance", "quality", "oee"));
            
            return Response.ok(trendData).build();
        } catch (Exception e) {
            return Response.status(500)
                .entity("{\"error\": \"Failed to get trend data\"}")
                .build();
        }
    }
    
    @GET
    @Path("/predictions/{equipmentId}")
    public Response getFailurePredictions(@PathParam("equipmentId") String equipmentId) {
        try {
            Map<String, String> equipmentNames = Map.of(
                "AC001", "Bangkok Factory - AC Unit 001",
                "AC002", "Chonburi Plant - AC Unit 002", 
                "AC003", "Rayong Facility - AC Unit 003"
            );
            
            String equipmentName = equipmentNames.getOrDefault(equipmentId, "Equipment " + equipmentId);
            
            // Generate demo predictions
            List<EquipmentPrediction> predictions = Arrays.asList(
                new EquipmentPrediction(equipmentId, equipmentName, "compressor"),
                new EquipmentPrediction(equipmentId, equipmentName, "sensor"),
                new EquipmentPrediction(equipmentId, equipmentName, "motor")
            );
            
            return Response.ok(predictions).build();
        } catch (Exception e) {
            return Response.status(500)
                .entity("{\"error\": \"Failed to get predictions\"}")
                .build();
        }
    }
    
    @GET
    @Path("/benchmark")
    public Response getBenchmarkData() {
        try {
            // Generate comparative performance data for multiple equipment
            List<Map<String, Object>> benchmarkData = Arrays.asList(
                createBenchmarkEntry("AC001", "Bangkok Factory", 89.5, 92.1, 95.3),
                createBenchmarkEntry("AC002", "Chonburi Plant", 78.2, 85.6, 91.7),
                createBenchmarkEntry("AC003", "Rayong Facility", 93.1, 89.4, 97.2),
                createBenchmarkEntry("PM001", "Production Line 1", 85.7, 91.2, 88.9),
                createBenchmarkEntry("PM002", "Production Line 2", 82.3, 87.8, 93.4)
            );
            
            return Response.ok(benchmarkData).build();
        } catch (Exception e) {
            return Response.status(500)
                .entity("{\"error\": \"Failed to get benchmark data\"}")
                .build();
        }
    }
    
    @POST
    @Path("/reports")
    public Response generateReport(Map<String, Object> reportRequest) {
        try {
            String reportType = (String) reportRequest.getOrDefault("type", "reliability");
            String format = (String) reportRequest.getOrDefault("format", "pdf");
            
            Map<String, Object> reportResult = new HashMap<>();
            reportResult.put("reportId", "RPT-" + System.currentTimeMillis());
            reportResult.put("type", reportType);
            reportResult.put("format", format);
            reportResult.put("status", "generating");
            reportResult.put("estimatedCompletion", "2025-08-31T21:05:00");
            reportResult.put("downloadUrl", "/api/reports/download/" + reportResult.get("reportId"));
            
            return Response.ok(reportResult).build();
        } catch (Exception e) {
            return Response.status(500)
                .entity("{\"error\": \"Failed to generate report\"}")
                .build();
        }
    }
    
    private List<Map<String, Object>> generateDemoTrendData() {
        // Generate 30 days of demo trend data
        java.util.List<Map<String, Object>> data = new java.util.ArrayList<>();
        for (int i = 0; i < 30; i++) {
            Map<String, Object> point = new HashMap<>();
            point.put("date", "2025-08-" + String.format("%02d", i + 1));
            point.put("availability", 85 + Math.random() * 10);
            point.put("performance", 80 + Math.random() * 15);
            point.put("quality", 88 + Math.random() * 10);
            
            // Calculate OEE
            double avail = (Double) point.get("availability");
            double perf = (Double) point.get("performance");
            double qual = (Double) point.get("quality");
            point.put("oee", (avail * perf * qual) / 10000);
            
            data.add(point);
        }
        return data;
    }
    
    private Map<String, Object> createBenchmarkEntry(String id, String location, double availability, double performance, double quality) {
        Map<String, Object> entry = new HashMap<>();
        entry.put("equipmentId", id);
        entry.put("location", location);
        entry.put("availability", availability);
        entry.put("performance", performance);
        entry.put("quality", quality);
        entry.put("oee", (availability * performance * quality) / 10000);
        entry.put("rank", 0); // Will be calculated on frontend
        return entry;
    }
}