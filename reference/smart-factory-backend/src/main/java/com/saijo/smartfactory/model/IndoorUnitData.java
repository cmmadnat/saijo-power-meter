package com.saijo.smartfactory.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.google.cloud.firestore.annotation.DocumentId;
import com.google.cloud.firestore.annotation.PropertyName;

import java.time.LocalDateTime;

public class IndoorUnitData {
    
    @DocumentId
    private String id;
    
    @JsonProperty("tester_no")
    @PropertyName("testerNo")
    private String testerNo;
    
    @JsonProperty("serial_number")
    @PropertyName("serialNumber")
    private String serialNumber;
    
    @JsonProperty("item")
    @PropertyName("item")
    private String item;
    
    @JsonProperty("model")
    @PropertyName("model")
    private String model;
    
    @JsonProperty("timestamp")
    @PropertyName("timestamp")
    private LocalDateTime timestamp;
    
    @JsonProperty("voltage_l1_v")
    @PropertyName("voltageL1V")
    private Double voltageL1V;
    
    @JsonProperty("voltage_l2_v")
    @PropertyName("voltageL2V")
    private Double voltageL2V;
    
    @JsonProperty("voltage_l3_v")
    @PropertyName("voltageL3V")
    private Double voltageL3V;
    
    @JsonProperty("current_l1_a")
    @PropertyName("currentL1A")
    private Double currentL1A;
    
    @JsonProperty("current_l2_a")
    @PropertyName("currentL2A")
    private Double currentL2A;
    
    @JsonProperty("current_l3_a")
    @PropertyName("currentL3A")
    private Double currentL3A;
    
    @JsonProperty("power_kw")
    @PropertyName("powerKw")
    private Double powerKw;
    
    @JsonProperty("power_factor")
    @PropertyName("powerFactor")
    private Double powerFactor;
    
    @JsonProperty("error_code")
    @PropertyName("errorCode")
    private String errorCode;
    
    @JsonProperty("room_temp_c")
    @PropertyName("roomTempC")
    private Double roomTempC;
    
    @JsonProperty("evap_inlet_temp_c")
    @PropertyName("evapInletTempC")
    private Double evapInletTempC;
    
    @JsonProperty("evap_outlet_temp_c")
    @PropertyName("evapOutletTempC")
    private Double evapOutletTempC;
    
    @JsonProperty("room_humidity_percent")
    @PropertyName("roomHumidityPercent")
    private Double roomHumidityPercent;
    
    @JsonProperty("pm25_ug_m3")
    @PropertyName("pm25UgM3")
    private Double pm25UgM3;
    
    @JsonProperty("co2_ppm")
    @PropertyName("co2Ppm")
    private Integer co2Ppm;
    
    @JsonProperty("wifi_status")
    @PropertyName("wifiStatus")
    private String wifiStatus;

    // Constructors
    public IndoorUnitData() {}
    
    public IndoorUnitData(String testerNo, String serialNumber, String item, String model) {
        this.testerNo = testerNo;
        this.serialNumber = serialNumber;
        this.item = item;
        this.model = model;
        this.timestamp = LocalDateTime.now();
    }

    // Getters and Setters
    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getTesterNo() {
        return testerNo;
    }

    public void setTesterNo(String testerNo) {
        this.testerNo = testerNo;
    }

    public String getSerialNumber() {
        return serialNumber;
    }

    public void setSerialNumber(String serialNumber) {
        this.serialNumber = serialNumber;
    }

    public String getItem() {
        return item;
    }

    public void setItem(String item) {
        this.item = item;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public LocalDateTime getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(LocalDateTime timestamp) {
        this.timestamp = timestamp;
    }

    public Double getVoltageL1V() {
        return voltageL1V;
    }

    public void setVoltageL1V(Double voltageL1V) {
        this.voltageL1V = voltageL1V;
    }

    public Double getVoltageL2V() {
        return voltageL2V;
    }

    public void setVoltageL2V(Double voltageL2V) {
        this.voltageL2V = voltageL2V;
    }

    public Double getVoltageL3V() {
        return voltageL3V;
    }

    public void setVoltageL3V(Double voltageL3V) {
        this.voltageL3V = voltageL3V;
    }

    public Double getCurrentL1A() {
        return currentL1A;
    }

    public void setCurrentL1A(Double currentL1A) {
        this.currentL1A = currentL1A;
    }

    public Double getCurrentL2A() {
        return currentL2A;
    }

    public void setCurrentL2A(Double currentL2A) {
        this.currentL2A = currentL2A;
    }

    public Double getCurrentL3A() {
        return currentL3A;
    }

    public void setCurrentL3A(Double currentL3A) {
        this.currentL3A = currentL3A;
    }

    public Double getPowerKw() {
        return powerKw;
    }

    public void setPowerKw(Double powerKw) {
        this.powerKw = powerKw;
    }

    public Double getPowerFactor() {
        return powerFactor;
    }

    public void setPowerFactor(Double powerFactor) {
        this.powerFactor = powerFactor;
    }

    public String getErrorCode() {
        return errorCode;
    }

    public void setErrorCode(String errorCode) {
        this.errorCode = errorCode;
    }

    public Double getRoomTempC() {
        return roomTempC;
    }

    public void setRoomTempC(Double roomTempC) {
        this.roomTempC = roomTempC;
    }

    public Double getEvapInletTempC() {
        return evapInletTempC;
    }

    public void setEvapInletTempC(Double evapInletTempC) {
        this.evapInletTempC = evapInletTempC;
    }

    public Double getEvapOutletTempC() {
        return evapOutletTempC;
    }

    public void setEvapOutletTempC(Double evapOutletTempC) {
        this.evapOutletTempC = evapOutletTempC;
    }

    public Double getRoomHumidityPercent() {
        return roomHumidityPercent;
    }

    public void setRoomHumidityPercent(Double roomHumidityPercent) {
        this.roomHumidityPercent = roomHumidityPercent;
    }

    public Double getPm25UgM3() {
        return pm25UgM3;
    }

    public void setPm25UgM3(Double pm25UgM3) {
        this.pm25UgM3 = pm25UgM3;
    }

    public Integer getCo2Ppm() {
        return co2Ppm;
    }

    public void setCo2Ppm(Integer co2Ppm) {
        this.co2Ppm = co2Ppm;
    }

    public String getWifiStatus() {
        return wifiStatus;
    }

    public void setWifiStatus(String wifiStatus) {
        this.wifiStatus = wifiStatus;
    }
}