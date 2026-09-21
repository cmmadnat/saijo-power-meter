package com.saijo.smartfactory.model.fieldreliability;

import java.time.LocalDateTime;

public class SensorReading {
    private String id;
    private String equipmentId;
    private String sensorType;
    private double value;
    private String unit;
    private LocalDateTime timestamp;
    private String status;
    private String location;
    private String gatewayId;
    
    public SensorReading() {}
    
    public SensorReading(String equipmentId, String sensorType, double value, String unit) {
        this.equipmentId = equipmentId;
        this.sensorType = sensorType;
        this.value = value;
        this.unit = unit;
        this.timestamp = LocalDateTime.now();
        this.status = "normal";
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
    
    public String getSensorType() {
        return sensorType;
    }
    
    public void setSensorType(String sensorType) {
        this.sensorType = sensorType;
    }
    
    public double getValue() {
        return value;
    }
    
    public void setValue(double value) {
        this.value = value;
    }
    
    public String getUnit() {
        return unit;
    }
    
    public void setUnit(String unit) {
        this.unit = unit;
    }
    
    public LocalDateTime getTimestamp() {
        return timestamp;
    }
    
    public void setTimestamp(LocalDateTime timestamp) {
        this.timestamp = timestamp;
    }
    
    public String getStatus() {
        return status;
    }
    
    public void setStatus(String status) {
        this.status = status;
    }
    
    public String getLocation() {
        return location;
    }
    
    public void setLocation(String location) {
        this.location = location;
    }
    
    public String getGatewayId() {
        return gatewayId;
    }
    
    public void setGatewayId(String gatewayId) {
        this.gatewayId = gatewayId;
    }
}