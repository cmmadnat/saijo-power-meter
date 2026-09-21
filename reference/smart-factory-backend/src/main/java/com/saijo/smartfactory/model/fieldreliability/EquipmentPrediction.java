package com.saijo.smartfactory.model.fieldreliability;

import java.time.LocalDateTime;

public class EquipmentPrediction {
    private String equipmentId;
    private String equipmentName;
    private String failureType;
    private LocalDateTime predictedDate;
    private double confidence; // Confidence percentage 0-100
    private String riskLevel; // LOW, MEDIUM, HIGH, CRITICAL
    private String description;
    private String recommendedAction;
    private LocalDateTime createdAt;
    
    public EquipmentPrediction() {}
    
    public EquipmentPrediction(String equipmentId, String equipmentName, String failureType) {
        this.equipmentId = equipmentId;
        this.equipmentName = equipmentName;
        this.failureType = failureType;
        this.createdAt = LocalDateTime.now();
        
        // Generate realistic demo predictions
        this.confidence = 65.0 + Math.random() * 25; // 65-90% confidence
        this.predictedDate = LocalDateTime.now().plusDays((long)(7 + Math.random() * 30)); // 1-5 weeks
        
        // Set risk level based on predicted date
        long daysUntilFailure = java.time.temporal.ChronoUnit.DAYS.between(LocalDateTime.now(), this.predictedDate);
        if (daysUntilFailure < 7) {
            this.riskLevel = "CRITICAL";
        } else if (daysUntilFailure < 14) {
            this.riskLevel = "HIGH";
        } else if (daysUntilFailure < 21) {
            this.riskLevel = "MEDIUM";
        } else {
            this.riskLevel = "LOW";
        }
        
        // Set description and action based on failure type
        switch (failureType.toLowerCase()) {
            case "compressor":
                this.description = "Compressor efficiency degradation detected";
                this.recommendedAction = "Schedule compressor maintenance and refrigerant check";
                break;
            case "sensor":
                this.description = "Temperature sensor accuracy drift observed";
                this.recommendedAction = "Calibrate temperature sensors and check connections";
                break;
            case "motor":
                this.description = "Motor vibration patterns indicate bearing wear";
                this.recommendedAction = "Replace motor bearings and check alignment";
                break;
            default:
                this.description = "Equipment performance degradation detected";
                this.recommendedAction = "Schedule preventive maintenance inspection";
        }
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
    
    public String getFailureType() {
        return failureType;
    }
    
    public void setFailureType(String failureType) {
        this.failureType = failureType;
    }
    
    public LocalDateTime getPredictedDate() {
        return predictedDate;
    }
    
    public void setPredictedDate(LocalDateTime predictedDate) {
        this.predictedDate = predictedDate;
    }
    
    public double getConfidence() {
        return confidence;
    }
    
    public void setConfidence(double confidence) {
        this.confidence = confidence;
    }
    
    public String getRiskLevel() {
        return riskLevel;
    }
    
    public void setRiskLevel(String riskLevel) {
        this.riskLevel = riskLevel;
    }
    
    public String getDescription() {
        return description;
    }
    
    public void setDescription(String description) {
        this.description = description;
    }
    
    public String getRecommendedAction() {
        return recommendedAction;
    }
    
    public void setRecommendedAction(String recommendedAction) {
        this.recommendedAction = recommendedAction;
    }
    
    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
    
    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}