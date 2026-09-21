package com.saijo.smartfactory.model.fieldreliability;

import java.time.LocalDateTime;
import java.util.List;

public class MaintenanceTask {
    private String id;
    private String equipmentId;
    private String equipmentName;
    private String title;
    private String description;
    private MaintenanceType type;
    private Priority priority;
    private Status status;
    private LocalDateTime scheduledDate;
    private int estimatedDurationMinutes;
    private String assignedTechnician;
    private List<String> requiredParts;
    private String safetyNotes;
    private LocalDateTime createdAt;
    private LocalDateTime completedAt;
    private String createdBy;
    
    public enum MaintenanceType {
        PREVENTIVE, CORRECTIVE, PREDICTIVE, EMERGENCY
    }
    
    public enum Priority {
        LOW, MEDIUM, HIGH, CRITICAL
    }
    
    public enum Status {
        PLANNED, IN_PROGRESS, COMPLETED, POSTPONED, CANCELLED
    }
    
    public MaintenanceTask() {}
    
    public MaintenanceTask(String equipmentId, String title, MaintenanceType type) {
        this.equipmentId = equipmentId;
        this.title = title;
        this.type = type;
        this.createdAt = LocalDateTime.now();
        this.status = Status.PLANNED;
        this.priority = Priority.MEDIUM;
    }
    
    public String getId() {
        return id;
    }
    
    public void setId(String id) {
        this.id = id;
    }
    
    public String getEquipmentId() {
        return equipmentId;
    }
    
    public void setEquipmentId(String equipmentId) {
        this.equipmentId = equipmentId;
    }
    
    public String getEquipmentName() {
        return equipmentName;
    }
    
    public void setEquipmentName(String equipmentName) {
        this.equipmentName = equipmentName;
    }
    
    public String getTitle() {
        return title;
    }
    
    public void setTitle(String title) {
        this.title = title;
    }
    
    public String getDescription() {
        return description;
    }
    
    public void setDescription(String description) {
        this.description = description;
    }
    
    public MaintenanceType getType() {
        return type;
    }
    
    public void setType(MaintenanceType type) {
        this.type = type;
    }
    
    public Priority getPriority() {
        return priority;
    }
    
    public void setPriority(Priority priority) {
        this.priority = priority;
    }
    
    public Status getStatus() {
        return status;
    }
    
    public void setStatus(Status status) {
        this.status = status;
    }
    
    public LocalDateTime getScheduledDate() {
        return scheduledDate;
    }
    
    public void setScheduledDate(LocalDateTime scheduledDate) {
        this.scheduledDate = scheduledDate;
    }
    
    public int getEstimatedDurationMinutes() {
        return estimatedDurationMinutes;
    }
    
    public void setEstimatedDurationMinutes(int estimatedDurationMinutes) {
        this.estimatedDurationMinutes = estimatedDurationMinutes;
    }
    
    public String getAssignedTechnician() {
        return assignedTechnician;
    }
    
    public void setAssignedTechnician(String assignedTechnician) {
        this.assignedTechnician = assignedTechnician;
    }
    
    public List<String> getRequiredParts() {
        return requiredParts;
    }
    
    public void setRequiredParts(List<String> requiredParts) {
        this.requiredParts = requiredParts;
    }
    
    public String getSafetyNotes() {
        return safetyNotes;
    }
    
    public void setSafetyNotes(String safetyNotes) {
        this.safetyNotes = safetyNotes;
    }
    
    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
    
    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
    
    public LocalDateTime getCompletedAt() {
        return completedAt;
    }
    
    public void setCompletedAt(LocalDateTime completedAt) {
        this.completedAt = completedAt;
    }
    
    public String getCreatedBy() {
        return createdBy;
    }
    
    public void setCreatedBy(String createdBy) {
        this.createdBy = createdBy;
    }
}