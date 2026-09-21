package com.saijo.smartfactory.model.fieldreliability;

import java.time.LocalDateTime;

public class ReliabilityMetrics {
    private String equipmentId;
    private String equipmentName;
    private double mtbf; // Mean Time Between Failures (hours)
    private double mttr; // Mean Time To Repair (hours) 
    private double oee; // Overall Equipment Effectiveness (%)
    private double availability; // Availability percentage
    private double performance; // Performance efficiency (%)
    private double quality; // Quality rate (%)
    private LocalDateTime calculatedAt;
    private String periodStart;
    private String periodEnd;
    
    public ReliabilityMetrics() {}
    
    public ReliabilityMetrics(String equipmentId, String equipmentName) {
        this.equipmentId = equipmentId;
        this.equipmentName = equipmentName;
        this.calculatedAt = LocalDateTime.now();
        
        // Demo data with realistic values
        this.mtbf = 168.5 + Math.random() * 50; // 168-218 hours
        this.mttr = 2.5 + Math.random() * 2; // 2.5-4.5 hours
        this.availability = 85.0 + Math.random() * 10; // 85-95%
        this.performance = 80.0 + Math.random() * 15; // 80-95%
        this.quality = 88.0 + Math.random() * 10; // 88-98%
        this.oee = (availability * performance * quality) / 10000; // OEE calculation
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
    
    public double getMtbf() {
        return mtbf;
    }
    
    public void setMtbf(double mtbf) {
        this.mtbf = mtbf;
    }
    
    public double getMttr() {
        return mttr;
    }
    
    public void setMttr(double mttr) {
        this.mttr = mttr;
    }
    
    public double getOee() {
        return oee;
    }
    
    public void setOee(double oee) {
        this.oee = oee;
    }
    
    public double getAvailability() {
        return availability;
    }
    
    public void setAvailability(double availability) {
        this.availability = availability;
    }
    
    public double getPerformance() {
        return performance;
    }
    
    public void setPerformance(double performance) {
        this.performance = performance;
    }
    
    public double getQuality() {
        return quality;
    }
    
    public void setQuality(double quality) {
        this.quality = quality;
    }
    
    public LocalDateTime getCalculatedAt() {
        return calculatedAt;
    }
    
    public void setCalculatedAt(LocalDateTime calculatedAt) {
        this.calculatedAt = calculatedAt;
    }
    
    public String getPeriodStart() {
        return periodStart;
    }
    
    public void setPeriodStart(String periodStart) {
        this.periodStart = periodStart;
    }
    
    public String getPeriodEnd() {
        return periodEnd;
    }
    
    public void setPeriodEnd(String periodEnd) {
        this.periodEnd = periodEnd;
    }
}