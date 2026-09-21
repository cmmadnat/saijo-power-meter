package com.saijo.smartfactory.resource.fieldreliability;

import com.saijo.smartfactory.model.fieldreliability.SensorReading;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.HashMap;

@Path("/api/dashboard")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class DashboardResource {
    
    @GET
    @Path("/realtime")
    public Response getRealtimeData() {
        try {
            // Generate real-time sensor readings for demo
            List<SensorReading> readings = Arrays.asList(
                // Voltage readings
                createReading("AC001", "voltage_L1", 220 + Math.random() * 10, "V", "Bangkok Factory"),
                createReading("AC001", "voltage_L2", 219 + Math.random() * 12, "V", "Bangkok Factory"),
                createReading("AC001", "voltage_L3", 221 + Math.random() * 8, "V", "Bangkok Factory"),
                
                // Current readings
                createReading("AC001", "current_L1", 15.5 + Math.random() * 3, "A", "Bangkok Factory"),
                createReading("AC001", "current_L2", 14.8 + Math.random() * 2.5, "A", "Bangkok Factory"),
                createReading("AC001", "current_L3", 16.2 + Math.random() * 2.8, "A", "Bangkok Factory"),
                
                // Power readings
                createReading("AC001", "power", 11.2 + Math.random() * 2, "kW", "Bangkok Factory"),
                createReading("AC001", "power_factor", 0.85 + Math.random() * 0.1, "", "Bangkok Factory"),
                
                // Pressure readings
                createReading("AC001", "pressure_1", 145 + Math.random() * 20, "PSI", "Bangkok Factory"),
                createReading("AC001", "pressure_2", 32 + Math.random() * 8, "PSI", "Bangkok Factory"),
                
                // Temperature readings (16-point grid)
                createReading("AC001", "temp_01", 18.5 + Math.random() * 5, "°C", "Bangkok Factory"),
                createReading("AC001", "temp_02", 19.2 + Math.random() * 4, "°C", "Bangkok Factory"),
                createReading("AC001", "temp_03", 20.1 + Math.random() * 3, "°C", "Bangkok Factory"),
                createReading("AC001", "temp_04", 21.8 + Math.random() * 2, "°C", "Bangkok Factory"),
                
                // Environmental conditions
                createReading("AC001", "room_temperature", 23.5 + Math.random() * 2, "°C", "Bangkok Factory"),
                createReading("AC001", "room_humidity", 45 + Math.random() * 10, "%", "Bangkok Factory"),
                createReading("AC001", "pm25", 15 + Math.random() * 5, "µg/m³", "Bangkok Factory"),
                createReading("AC001", "co2", 420 + Math.random() * 80, "ppm", "Bangkok Factory")
            );
            
            Map<String, Object> response = new HashMap<>();
            response.put("timestamp", LocalDateTime.now());
            response.put("readings", readings);
            response.put("status", "online");
            response.put("lastUpdate", LocalDateTime.now().minusSeconds(5));
            
            return Response.ok(response).build();
        } catch (Exception e) {
            return Response.status(500)
                .entity("{\"error\": \"Failed to get realtime data\"}")
                .build();
        }
    }
    
    @GET
    @Path("/equipment/{equipmentId}")
    public Response getEquipmentData(@PathParam("equipmentId") String equipmentId) {
        try {
            Map<String, Object> equipmentData = new HashMap<>();
            equipmentData.put("equipmentId", equipmentId);
            equipmentData.put("name", "Equipment " + equipmentId);
            equipmentData.put("type", equipmentId.startsWith("AC") ? "Air Conditioner" : "Power Meter");
            equipmentData.put("status", Math.random() > 0.1 ? "online" : "offline");
            equipmentData.put("location", "Bangkok Factory");
            equipmentData.put("lastHeartbeat", LocalDateTime.now().minusSeconds(30));
            
            // Current readings for this specific equipment
            List<SensorReading> currentReadings = Arrays.asList(
                createReading(equipmentId, "voltage", 220 + Math.random() * 10, "V", "Bangkok Factory"),
                createReading(equipmentId, "current", 15 + Math.random() * 3, "A", "Bangkok Factory"),
                createReading(equipmentId, "power", 11 + Math.random() * 2, "kW", "Bangkok Factory"),
                createReading(equipmentId, "temperature", 23 + Math.random() * 5, "°C", "Bangkok Factory")
            );
            
            equipmentData.put("currentReadings", currentReadings);
            
            return Response.ok(equipmentData).build();
        } catch (Exception e) {
            return Response.status(500)
                .entity("{\"error\": \"Failed to get equipment data\"}")
                .build();
        }
    }
    
    @GET
    @Path("/alerts")
    public Response getActiveAlerts() {
        try {
            List<Map<String, Object>> alerts = Arrays.asList(
                createAlert("ALERT-001", "HIGH", "Temperature sensor out of range", 
                           "AC001", "Temperature reading 85°C exceeds threshold"),
                createAlert("ALERT-002", "MEDIUM", "Power factor below optimal", 
                           "AC002", "Power factor 0.75 is below 0.8 threshold"),
                createAlert("ALERT-003", "LOW", "Humidity slightly elevated", 
                           "AC001", "Room humidity 68% is above normal 60%")
            );
            
            Map<String, Object> response = new HashMap<>();
            response.put("alerts", alerts);
            response.put("totalActive", alerts.size());
            response.put("criticalCount", 0);
            response.put("highCount", 1);
            response.put("mediumCount", 1);
            response.put("lowCount", 1);
            
            return Response.ok(response).build();
        } catch (Exception e) {
            return Response.status(500)
                .entity("{\"error\": \"Failed to get alerts\"}")
                .build();
        }
    }
    
    @GET
    @Path("/overview")
    public Response getOverviewData() {
        try {
            Map<String, Object> overview = new HashMap<>();
            
            // System-wide KPIs
            overview.put("totalEquipment", 15);
            overview.put("onlineEquipment", 14);
            overview.put("offlineEquipment", 1);
            overview.put("activeAlerts", 3);
            overview.put("systemAvailability", 93.3);
            
            // Location performance
            List<Map<String, Object>> locationPerformance = Arrays.asList(
                createLocationPerformance("Bangkok Factory", 5, 5, 92.5),
                createLocationPerformance("Chonburi Plant", 4, 3, 88.7),
                createLocationPerformance("Rayong Facility", 3, 3, 95.1),
                createLocationPerformance("Samut Prakan Lab", 2, 2, 89.4),
                createLocationPerformance("Ayutthaya Site", 1, 1, 91.8)
            );
            
            overview.put("locationPerformance", locationPerformance);
            overview.put("lastUpdated", LocalDateTime.now());
            
            return Response.ok(overview).build();
        } catch (Exception e) {
            return Response.status(500)
                .entity("{\"error\": \"Failed to get overview data\"}")
                .build();
        }
    }
    
    private SensorReading createReading(String equipmentId, String sensorType, double value, String unit, String location) {
        SensorReading reading = new SensorReading(equipmentId, sensorType, value, unit);
        reading.setId("READING-" + System.currentTimeMillis() + "-" + Math.random());
        reading.setLocation(location);
        reading.setGatewayId("GW-" + equipmentId.substring(0, 2) + "001");
        
        // Set status based on sensor type and value
        reading.setStatus(determineStatus(sensorType, value));
        
        return reading;
    }
    
    private String determineStatus(String sensorType, double value) {
        // Simple status logic - in real implementation, use proper thresholds
        switch (sensorType.toLowerCase()) {
            case "voltage_l1":
            case "voltage_l2": 
            case "voltage_l3":
                return (value >= 210 && value <= 230) ? "normal" : "warning";
            case "temperature":
            case "room_temperature":
                return (value >= 15 && value <= 30) ? "normal" : "warning";
            case "pressure_1":
                return (value >= 140 && value <= 180) ? "normal" : "warning";
            case "current_l1":
            case "current_l2":
            case "current_l3":
                return (value >= 10 && value <= 20) ? "normal" : "warning";
            default:
                return "normal";
        }
    }
    
    private Map<String, Object> createAlert(String id, String severity, String title, String equipmentId, String description) {
        Map<String, Object> alert = new HashMap<>();
        alert.put("id", id);
        alert.put("severity", severity);
        alert.put("title", title);
        alert.put("equipmentId", equipmentId);
        alert.put("description", description);
        alert.put("timestamp", LocalDateTime.now().minusMinutes((long)(Math.random() * 60)));
        alert.put("acknowledged", false);
        return alert;
    }
    
    private Map<String, Object> createLocationPerformance(String location, int totalEquipment, int onlineEquipment, double performance) {
        Map<String, Object> perf = new HashMap<>();
        perf.put("location", location);
        perf.put("totalEquipment", totalEquipment);
        perf.put("onlineEquipment", onlineEquipment);
        perf.put("offlineEquipment", totalEquipment - onlineEquipment);
        perf.put("availabilityPercent", (double) onlineEquipment / totalEquipment * 100);
        perf.put("performanceScore", performance);
        return perf;
    }
}