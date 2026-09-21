package com.saijo.smartfactory.resource;

import com.saijo.smartfactory.model.*;
import com.saijo.smartfactory.FirestoreService;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.*;
import java.util.concurrent.ExecutionException;
import com.google.cloud.firestore.*;
import java.util.stream.Collectors;

@Path("/api/v1")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class PowerMeterResource {

    @Inject
    FirestoreService firestoreService;

    /**
     * Get dashboard metrics for power meters
     */
    @GET
    @Path("/dashboard/metrics")
    public Response getDashboardMetrics() {
        try {
            DocumentReference docRef = firestoreService.getFirestore().collection("dashboard").document("metrics");
            DocumentSnapshot document = docRef.get().get();
            if (document.exists()) {
                Map<String, Object> data = document.getData();
                return Response.ok(data).build();
            } else {
                return Response.status(404).entity(Map.of("error", "Dashboard metrics not found")).build();
            }
        } catch (Exception e) {
            return Response.status(500)
                .entity(Map.of("error", "Failed to get dashboard metrics", "message", e.getMessage()))
                .build();
        }
    }

    /**
     * Get all power meter readings
     */
    @GET
    @Path("/power-meter/readings")
    public Response getPowerMeterReadings() {
        try {
            CollectionReference colRef = firestoreService.getFirestore().collection("power-readings");
            QuerySnapshot querySnapshot = colRef.get().get();
            List<Map<String, Object>> readings = new ArrayList<>();
            for (DocumentSnapshot document : querySnapshot.getDocuments()) {
                readings.add(document.getData());
            }
            return Response.ok(readings).build();
        } catch (Exception e) {
            return Response.status(500)
                .entity(Map.of("error", "Failed to get power meter readings", "message", e.getMessage()))
                .build();
        }
    }

    /**
     * Get power meter statuses
     */
    @GET
    @Path("/power-meter/statuses")
    public Response getPowerMeterStatuses() {
        try {
            CollectionReference colRef = firestoreService.getFirestore().collection("power-meters");
            QuerySnapshot querySnapshot = colRef.get().get();
            List<Map<String, Object>> statuses = new ArrayList<>();
            for (DocumentSnapshot document : querySnapshot.getDocuments()) {
                statuses.add(document.getData());
            }
            return Response.ok(statuses).build();
        } catch (Exception e) {
            return Response.status(500)
                .entity(Map.of("error", "Failed to get power meter statuses", "message", e.getMessage()))
                .build();
        }
    }

    /**
      * Get real-time power series data
      */
     @GET
     @Path("/power-meter/realtime")
     public Response getRealtimeSeries(
             @QueryParam("hours") @DefaultValue("24") int hours,
             @QueryParam("interval") @DefaultValue("5m") String interval) {
         try {
             // Calculate time range
             LocalDateTime endTime = LocalDateTime.now();
             LocalDateTime startTime = endTime.minusHours(hours);

             // Query Firestore for power readings within the time range
             CollectionReference colRef = firestoreService.getFirestore().collection("power-readings");
             Query query = colRef.whereGreaterThanOrEqualTo("timestamp", startTime.toString())
                 .whereLessThanOrEqualTo("timestamp", endTime.toString())
                 .orderBy("timestamp", Query.Direction.DESCENDING);

             QuerySnapshot querySnapshot = query.get().get();
             List<Map<String, Object>> dataPoints = new ArrayList<>();

             // Group readings by timestamp (assuming readings are taken at regular intervals)
             Map<String, List<Map<String, Object>>> readingsByTimestamp = new HashMap<>();

             for (DocumentSnapshot document : querySnapshot.getDocuments()) {
                 Map<String, Object> data = document.getData();
                 String timestamp = (String) data.get("timestamp");

                 if (timestamp != null) {
                     readingsByTimestamp.computeIfAbsent(timestamp, k -> new ArrayList<>()).add(data);
                 }
             }

             // Process grouped readings to create time series points
             for (Map.Entry<String, List<Map<String, Object>>> entry : readingsByTimestamp.entrySet()) {
                 String timestampStr = entry.getKey();
                 List<Map<String, Object>> readings = entry.getValue();

                 // Aggregate readings from multiple meters
                 double totalP1 = 0, totalP2 = 0, totalP3 = 0, totalPower = 0;
                 int count = 0;

                 for (Map<String, Object> reading : readings) {
                     Map<String, Object> power = (Map<String, Object>) reading.get("power");
                     if (power != null) {
                         Double p1 = ((Number) power.get("p1")).doubleValue();
                         Double p2 = ((Number) power.get("p2")).doubleValue();
                         Double p3 = ((Number) power.get("p3")).doubleValue();
                         Double total = ((Number) power.get("total")).doubleValue();

                         if (p1 != null && p2 != null && p3 != null && total != null) {
                             totalP1 += p1;
                             totalP2 += p2;
                             totalP3 += p3;
                             totalPower += total;
                             count++;
                         }
                     }
                 }

                 if (count > 0) {
                     // Create average values across meters
                     Map<String, Object> point = new HashMap<>();
                     point.put("timestamp", LocalDateTime.parse(timestampStr).toInstant(ZoneOffset.UTC).toEpochMilli());

                     Map<String, Object> power = new HashMap<>();
                     power.put("p1", totalP1 / count);
                     power.put("p2", totalP2 / count);
                     power.put("p3", totalP3 / count);
                     power.put("total", totalPower / count);

                     point.put("power", power);
                     dataPoints.add(point);
                 }
             }

             // Sort by timestamp ascending
             dataPoints.sort((a, b) -> Long.compare(
                 ((Number) a.get("timestamp")).longValue(),
                 ((Number) b.get("timestamp")).longValue()
             ));

             Map<String, Object> response = new HashMap<>();
             response.put("dataPoints", dataPoints);
             response.put("metersCount", readingsByTimestamp.size() > 0 ? readingsByTimestamp.values().iterator().next().size() : 0);
             response.put("interval", interval);

             return Response.ok(response).build();
         } catch (Exception e) {
             return Response.status(500)
                 .entity(Map.of("error", "Failed to get real-time series", "message", e.getMessage()))
                 .build();
         }
     }

    /**
     * Get uptime metrics for a specific meter
     */
    @GET
    @Path("/power-meter/{meterId}/uptime")
    public Response getUptimeMetrics(@PathParam("meterId") String meterId) {
        try {
            DocumentReference docRef = firestoreService.getFirestore().collection("meters").document(meterId).collection("uptime").document("current");
            DocumentSnapshot document = docRef.get().get();
            if (document.exists()) {
                Map<String, Object> data = document.getData();
                return Response.ok(data).build();
            } else {
                return Response.status(404).entity(Map.of("error", "Uptime metrics not found")).build();
            }
        } catch (Exception e) {
            return Response.status(500)
                .entity(Map.of("error", "Failed to get uptime metrics", "message", e.getMessage()))
                .build();
        }
    }

    /**
     * Get comprehensive meter data
     */
    @GET
    @Path("/power-meter/{meterId}")
    public Response getComprehensiveMeterData(@PathParam("meterId") String meterId) {
        try {
            DocumentReference docRef = firestoreService.getFirestore().collection("meters").document(meterId);
            DocumentSnapshot document = docRef.get().get();
            if (document.exists()) {
                Map<String, Object> data = document.getData();
                return Response.ok(data).build();
            } else {
                return Response.status(404).entity(Map.of("error", "Meter data not found")).build();
            }
        } catch (Exception e) {
            return Response.status(500)
                .entity(Map.of("error", "Failed to get comprehensive meter data", "message", e.getMessage()))
                .build();
        }
    }

    /**
     * Get historical data
     */
    @GET
    @Path("/power-meter/historical")
    public Response getHistoricalData(@QueryParam("startDate") String startDate, @QueryParam("endDate") String endDate) {
        try {
            CollectionReference colRef = firestoreService.getFirestore().collection("power-readings");
            Query query = colRef.whereGreaterThanOrEqualTo("timestamp", startDate)
                .whereLessThanOrEqualTo("timestamp", endDate);
            QuerySnapshot querySnapshot = query.get().get();
            List<Map<String, Object>> points = new ArrayList<>();
            for (DocumentSnapshot document : querySnapshot.getDocuments()) {
                Map<String, Object> data = document.getData();
                Map<String, Object> point = new HashMap<>();
                Map<String, Object> power = (Map<String, Object>) data.get("power");
                Map<String, Object> voltage = (Map<String, Object>) data.get("voltage");
                Map<String, Object> amperage = (Map<String, Object>) data.get("amperage");
                Map<String, Object> powerFactor = (Map<String, Object>) data.get("powerFactor");
                point.put("timestamp", data.get("timestamp"));
                point.put("power_kw", power != null ? power.get("total") : 0);
                point.put("voltage_v", voltage != null ? voltage.get("p1") : 0);
                point.put("current_a", amperage != null ? amperage.get("p1") : 0);
                point.put("power_factor", powerFactor != null ? powerFactor.get("p1") : 0);
                points.add(point);
            }
            return Response.ok(points).build();
        } catch (Exception e) {
            return Response.status(500)
                .entity(Map.of("error", "Failed to get historical data", "message", e.getMessage()))
                .build();
        }
    }

    /**
     * Helper method to create a power reading map
     */
    private Map<String, Object> createPowerReading(String meterId, double p1Power, double p2Power, double p3Power,
            double p1Voltage, double p2Voltage, double p3Voltage, double p1Current, double p2Current, double p3Current,
            double p1Pf, double p2Pf, double p3Pf) {

        Map<String, Object> reading = new HashMap<>();
        reading.put("meterId", meterId);
        reading.put("timestamp", LocalDateTime.now());

        Map<String, Object> power = new HashMap<>();
        power.put("p1", p1Power);
        power.put("p2", p2Power);
        power.put("p3", p3Power);
        power.put("total", p1Power + p2Power + p3Power);
        reading.put("power", power);

        Map<String, Object> voltage = new HashMap<>();
        voltage.put("p1", p1Voltage);
        voltage.put("p2", p2Voltage);
        voltage.put("p3", p3Voltage);
        reading.put("voltage", voltage);

        Map<String, Object> amperage = new HashMap<>();
        amperage.put("p1", p1Current);
        amperage.put("p2", p2Current);
        amperage.put("p3", p3Current);
        reading.put("amperage", amperage);

        Map<String, Object> powerFactor = new HashMap<>();
        powerFactor.put("p1", p1Pf);
        powerFactor.put("p2", p2Pf);
        powerFactor.put("p3", p3Pf);
        reading.put("powerFactor", powerFactor);

        return reading;
    }
}