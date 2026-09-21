package com.saijo.smartfactory.resource.fieldreliability;

import com.saijo.smartfactory.model.fieldreliability.MaintenanceTask;
import com.saijo.smartfactory.model.fieldreliability.Technician;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.HashMap;

@Path("/api/maintenance")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class MaintenanceResource {
    
    @GET
    @Path("/tasks")
    public Response getTasks(@QueryParam("status") String status, 
                           @QueryParam("technician") String technician) {
        try {
            // Generate demo maintenance tasks
            List<MaintenanceTask> tasks = Arrays.asList(
                createDemoTask("TASK-001", "AC001", "Compressor Maintenance", 
                               MaintenanceTask.MaintenanceType.PREVENTIVE, "John Smith"),
                createDemoTask("TASK-002", "AC002", "Temperature Sensor Calibration", 
                               MaintenanceTask.MaintenanceType.CORRECTIVE, "Sarah Johnson"),
                createDemoTask("TASK-003", "PM001", "Power Meter Inspection", 
                               MaintenanceTask.MaintenanceType.PREDICTIVE, "Mike Brown"),
                createDemoTask("TASK-004", "AC003", "Emergency Repair", 
                               MaintenanceTask.MaintenanceType.EMERGENCY, "John Smith")
            );
            
            return Response.ok(tasks).build();
        } catch (Exception e) {
            return Response.status(500)
                .entity("{\"error\": \"Failed to get maintenance tasks\"}")
                .build();
        }
    }
    
    @POST
    @Path("/tasks")
    public Response createTask(MaintenanceTask task) {
        try {
            // In real implementation, save to Firestore
            task.setId("TASK-" + System.currentTimeMillis());
            task.setCreatedAt(LocalDateTime.now());
            task.setStatus(MaintenanceTask.Status.PLANNED);
            
            return Response.status(201).entity(task).build();
        } catch (Exception e) {
            return Response.status(500)
                .entity("{\"error\": \"Failed to create maintenance task\"}")
                .build();
        }
    }
    
    @PUT
    @Path("/tasks/{taskId}")
    public Response updateTask(@PathParam("taskId") String taskId, MaintenanceTask task) {
        try {
            task.setId(taskId);
            // In real implementation, update in Firestore
            
            return Response.ok(task).build();
        } catch (Exception e) {
            return Response.status(500)
                .entity("{\"error\": \"Failed to update maintenance task\"}")
                .build();
        }
    }
    
    @DELETE
    @Path("/tasks/{taskId}")
    public Response deleteTask(@PathParam("taskId") String taskId) {
        try {
            // In real implementation, soft delete in Firestore
            return Response.ok()
                .entity("{\"message\": \"Task deleted successfully\"}")
                .build();
        } catch (Exception e) {
            return Response.status(500)
                .entity("{\"error\": \"Failed to delete maintenance task\"}")
                .build();
        }
    }
    
    @GET
    @Path("/calendar/{date}")
    public Response getCalendar(@PathParam("date") String date) {
        try {
            // Generate demo calendar data
            Map<String, Object> calendarData = new HashMap<>();
            calendarData.put("date", date);
            calendarData.put("tasks", Arrays.asList(
                createCalendarEvent("TASK-001", "09:00", "11:00", "Compressor Maintenance", "AC001"),
                createCalendarEvent("TASK-002", "14:00", "16:00", "Sensor Calibration", "AC002"),
                createCalendarEvent("TASK-003", "08:00", "10:00", "Power Meter Inspection", "PM001")
            ));
            
            return Response.ok(calendarData).build();
        } catch (Exception e) {
            return Response.status(500)
                .entity("{\"error\": \"Failed to get calendar data\"}")
                .build();
        }
    }
    
    @GET
    @Path("/technicians")
    public Response getTechnicians() {
        try {
            List<Technician> technicians = Arrays.asList(
                createDemoTechnician("TECH-001", "John Smith", "john.smith@saijo.com", 
                                   Arrays.asList("HVAC", "Electrical", "Compressors")),
                createDemoTechnician("TECH-002", "Sarah Johnson", "sarah.johnson@saijo.com", 
                                   Arrays.asList("Sensors", "Calibration", "Electronics")),
                createDemoTechnician("TECH-003", "Mike Brown", "mike.brown@saijo.com", 
                                   Arrays.asList("Power Systems", "Meters", "Safety")),
                createDemoTechnician("TECH-004", "Lisa Chen", "lisa.chen@saijo.com", 
                                   Arrays.asList("Predictive Maintenance", "Analytics", "Systems"))
            );
            
            return Response.ok(technicians).build();
        } catch (Exception e) {
            return Response.status(500)
                .entity("{\"error\": \"Failed to get technicians\"}")
                .build();
        }
    }
    
    @GET
    @Path("/history/{equipmentId}")
    public Response getMaintenanceHistory(@PathParam("equipmentId") String equipmentId) {
        try {
            // Generate demo maintenance history
            List<Map<String, Object>> history = Arrays.asList(
                createHistoryEntry("2025-08-25", "Preventive", "Compressor oil change completed"),
                createHistoryEntry("2025-08-15", "Corrective", "Replaced faulty temperature sensor"),
                createHistoryEntry("2025-08-05", "Predictive", "Vibration analysis performed"),
                createHistoryEntry("2025-07-28", "Emergency", "Emergency repair - refrigerant leak")
            );
            
            Map<String, Object> response = new HashMap<>();
            response.put("equipmentId", equipmentId);
            response.put("history", history);
            response.put("totalTasks", history.size());
            
            return Response.ok(response).build();
        } catch (Exception e) {
            return Response.status(500)
                .entity("{\"error\": \"Failed to get maintenance history\"}")
                .build();
        }
    }
    
    @POST
    @Path("/predictions/convert")
    public Response convertPredictionToTask(Map<String, Object> predictionData) {
        try {
            String equipmentId = (String) predictionData.get("equipmentId");
            String failureType = (String) predictionData.get("failureType");
            
            MaintenanceTask task = new MaintenanceTask(equipmentId, 
                "Predicted Maintenance - " + failureType, 
                MaintenanceTask.MaintenanceType.PREDICTIVE);
            task.setId("TASK-PRED-" + System.currentTimeMillis());
            task.setPriority(MaintenanceTask.Priority.HIGH);
            task.setDescription("Auto-generated task from failure prediction");
            task.setScheduledDate(LocalDateTime.now().plusDays(7)); // Schedule for next week
            task.setEstimatedDurationMinutes(180); // 3 hours
            
            return Response.status(201).entity(task).build();
        } catch (Exception e) {
            return Response.status(500)
                .entity("{\"error\": \"Failed to convert prediction to task\"}")
                .build();
        }
    }
    
    private MaintenanceTask createDemoTask(String id, String equipmentId, String title, 
                                         MaintenanceTask.MaintenanceType type, String technician) {
        MaintenanceTask task = new MaintenanceTask(equipmentId, title, type);
        task.setId(id);
        task.setEquipmentName("Equipment " + equipmentId);
        task.setAssignedTechnician(technician);
        task.setDescription("Demo maintenance task for " + title);
        task.setScheduledDate(LocalDateTime.now().plusDays((long)(Math.random() * 14)));
        task.setEstimatedDurationMinutes(120 + (int)(Math.random() * 180));
        task.setSafetyNotes("Follow standard safety procedures");
        task.setRequiredParts(Arrays.asList("Filters", "Gaskets", "Oil"));
        return task;
    }
    
    private Technician createDemoTechnician(String id, String name, String email, List<String> specializations) {
        Technician tech = new Technician(name, email, specializations);
        tech.setId(id);
        tech.setPhone("+1-555-" + String.format("%04d", (int)(Math.random() * 10000)));
        tech.setAvailability(Math.random() > 0.7 ? "BUSY" : "AVAILABLE");
        tech.setLocation("Bangkok Factory");
        return tech;
    }
    
    private Map<String, Object> createCalendarEvent(String taskId, String startTime, String endTime, String title, String equipmentId) {
        Map<String, Object> event = new HashMap<>();
        event.put("taskId", taskId);
        event.put("startTime", startTime);
        event.put("endTime", endTime);
        event.put("title", title);
        event.put("equipmentId", equipmentId);
        event.put("type", "maintenance");
        return event;
    }
    
    private Map<String, Object> createHistoryEntry(String date, String type, String description) {
        Map<String, Object> entry = new HashMap<>();
        entry.put("date", date);
        entry.put("type", type);
        entry.put("description", description);
        entry.put("status", "COMPLETED");
        entry.put("technician", "John Smith");
        return entry;
    }
}