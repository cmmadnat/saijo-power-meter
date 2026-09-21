package com.saijo.smartfactory.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.google.cloud.firestore.annotation.DocumentId;
import com.google.cloud.firestore.annotation.PropertyName;

public class IndoorUnitStd {
    
    @DocumentId
    private String id;
    
    @JsonProperty("item")
    @PropertyName("item")
    private String item;
    
    @JsonProperty("voltage_l1_v_min")
    @PropertyName("voltageL1VMin")
    private Double voltageL1VMin;
    
    @JsonProperty("voltage_l1_v_max")
    @PropertyName("voltageL1VMax")
    private Double voltageL1VMax;
    
    @JsonProperty("voltage_l2_v_min")
    @PropertyName("voltageL2VMin")
    private Double voltageL2VMin;
    
    @JsonProperty("voltage_l2_v_max")
    @PropertyName("voltageL2VMax")
    private Double voltageL2VMax;
    
    @JsonProperty("voltage_l3_v_min")
    @PropertyName("voltageL3VMin")
    private Double voltageL3VMin;
    
    @JsonProperty("voltage_l3_v_max")
    @PropertyName("voltageL3VMax")
    private Double voltageL3VMax;
    
    @JsonProperty("current_l1_a_min")
    @PropertyName("currentL1AMin")
    private Double currentL1AMin;
    
    @JsonProperty("current_l1_a_max")
    @PropertyName("currentL1AMax")
    private Double currentL1AMax;
    
    @JsonProperty("current_l2_a_min")
    @PropertyName("currentL2AMin")
    private Double currentL2AMin;
    
    @JsonProperty("current_l2_a_max")
    @PropertyName("currentL2AMax")
    private Double currentL2AMax;
    
    @JsonProperty("current_l3_a_min")
    @PropertyName("currentL3AMin")
    private Double currentL3AMin;
    
    @JsonProperty("current_l3_a_max")
    @PropertyName("currentL3AMax")
    private Double currentL3AMax;
    
    @JsonProperty("power_kw_min")
    @PropertyName("powerKwMin")
    private Double powerKwMin;
    
    @JsonProperty("power_kw_max")
    @PropertyName("powerKwMax")
    private Double powerKwMax;
    
    @JsonProperty("power_factor_min")
    @PropertyName("powerFactorMin")
    private Double powerFactorMin;
    
    @JsonProperty("power_factor_max")
    @PropertyName("powerFactorMax")
    private Double powerFactorMax;
    
    @JsonProperty("room_temp_c_min")
    @PropertyName("roomTempCMin")
    private Double roomTempCMin;
    
    @JsonProperty("room_temp_c_max")
    @PropertyName("roomTempCMax")
    private Double roomTempCMax;
    
    @JsonProperty("evap_inlet_temp_c_min")
    @PropertyName("evapInletTempCMin")
    private Double evapInletTempCMin;
    
    @JsonProperty("evap_inlet_temp_c_max")
    @PropertyName("evapInletTempCMax")
    private Double evapInletTempCMax;
    
    @JsonProperty("evap_outlet_temp_c_min")
    @PropertyName("evapOutletTempCMin")
    private Double evapOutletTempCMin;
    
    @JsonProperty("evap_outlet_temp_c_max")
    @PropertyName("evapOutletTempCMax")
    private Double evapOutletTempCMax;
    
    @JsonProperty("room_humidity_percent_min")
    @PropertyName("roomHumidityPercentMin")
    private Double roomHumidityPercentMin;
    
    @JsonProperty("room_humidity_percent_max")
    @PropertyName("roomHumidityPercentMax")
    private Double roomHumidityPercentMax;
    
    @JsonProperty("pm25_ug_m3_min")
    @PropertyName("pm25UgM3Min")
    private Double pm25UgM3Min;
    
    @JsonProperty("pm25_ug_m3_max")
    @PropertyName("pm25UgM3Max")
    private Double pm25UgM3Max;
    
    @JsonProperty("co2_ppm_min")
    @PropertyName("co2PpmMin")
    private Integer co2PpmMin;

    @JsonProperty("co2_ppm_max")
    @PropertyName("co2PpmMax")
    private Integer co2PpmMax;

    @JsonProperty("errorCode_min")
    @PropertyName("errorCodeMin")
    private String errorCodeMin;

    @JsonProperty("errorCode_max")
    @PropertyName("errorCodeMax")
    private String errorCodeMax;

    @JsonProperty("wifiStatus_min")
    @PropertyName("wifiStatusMin")
    private String wifiStatusMin;

    @JsonProperty("wifiStatus_max")
    @PropertyName("wifiStatusMax")
    private String wifiStatusMax;

    // Constructors
    public IndoorUnitStd() {}
    
    public IndoorUnitStd(String item) {
        this.item = item;
    }

    // Getters and Setters
    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getItem() {
        return item;
    }

    public void setItem(String item) {
        this.item = item;
    }

    public Double getVoltageL1VMin() {
        return voltageL1VMin;
    }

    public void setVoltageL1VMin(Double voltageL1VMin) {
        this.voltageL1VMin = voltageL1VMin;
    }

    public Double getVoltageL1VMax() {
        return voltageL1VMax;
    }

    public void setVoltageL1VMax(Double voltageL1VMax) {
        this.voltageL1VMax = voltageL1VMax;
    }

    public Double getVoltageL2VMin() {
        return voltageL2VMin;
    }

    public void setVoltageL2VMin(Double voltageL2VMin) {
        this.voltageL2VMin = voltageL2VMin;
    }

    public Double getVoltageL2VMax() {
        return voltageL2VMax;
    }

    public void setVoltageL2VMax(Double voltageL2VMax) {
        this.voltageL2VMax = voltageL2VMax;
    }

    public Double getVoltageL3VMin() {
        return voltageL3VMin;
    }

    public void setVoltageL3VMin(Double voltageL3VMin) {
        this.voltageL3VMin = voltageL3VMin;
    }

    public Double getVoltageL3VMax() {
        return voltageL3VMax;
    }

    public void setVoltageL3VMax(Double voltageL3VMax) {
        this.voltageL3VMax = voltageL3VMax;
    }

    public Double getCurrentL1AMin() {
        return currentL1AMin;
    }

    public void setCurrentL1AMin(Double currentL1AMin) {
        this.currentL1AMin = currentL1AMin;
    }

    public Double getCurrentL1AMax() {
        return currentL1AMax;
    }

    public void setCurrentL1AMax(Double currentL1AMax) {
        this.currentL1AMax = currentL1AMax;
    }

    public Double getCurrentL2AMin() {
        return currentL2AMin;
    }

    public void setCurrentL2AMin(Double currentL2AMin) {
        this.currentL2AMin = currentL2AMin;
    }

    public Double getCurrentL2AMax() {
        return currentL2AMax;
    }

    public void setCurrentL2AMax(Double currentL2AMax) {
        this.currentL2AMax = currentL2AMax;
    }

    public Double getCurrentL3AMin() {
        return currentL3AMin;
    }

    public void setCurrentL3AMin(Double currentL3AMin) {
        this.currentL3AMin = currentL3AMin;
    }

    public Double getCurrentL3AMax() {
        return currentL3AMax;
    }

    public void setCurrentL3AMax(Double currentL3AMax) {
        this.currentL3AMax = currentL3AMax;
    }

    public Double getPowerKwMin() {
        return powerKwMin;
    }

    public void setPowerKwMin(Double powerKwMin) {
        this.powerKwMin = powerKwMin;
    }

    public Double getPowerKwMax() {
        return powerKwMax;
    }

    public void setPowerKwMax(Double powerKwMax) {
        this.powerKwMax = powerKwMax;
    }

    public Double getPowerFactorMin() {
        return powerFactorMin;
    }

    public void setPowerFactorMin(Double powerFactorMin) {
        this.powerFactorMin = powerFactorMin;
    }

    public Double getPowerFactorMax() {
        return powerFactorMax;
    }

    public void setPowerFactorMax(Double powerFactorMax) {
        this.powerFactorMax = powerFactorMax;
    }

    public Double getRoomTempCMin() {
        return roomTempCMin;
    }

    public void setRoomTempCMin(Double roomTempCMin) {
        this.roomTempCMin = roomTempCMin;
    }

    public Double getRoomTempCMax() {
        return roomTempCMax;
    }

    public void setRoomTempCMax(Double roomTempCMax) {
        this.roomTempCMax = roomTempCMax;
    }

    public Double getEvapInletTempCMin() {
        return evapInletTempCMin;
    }

    public void setEvapInletTempCMin(Double evapInletTempCMin) {
        this.evapInletTempCMin = evapInletTempCMin;
    }

    public Double getEvapInletTempCMax() {
        return evapInletTempCMax;
    }

    public void setEvapInletTempCMax(Double evapInletTempCMax) {
        this.evapInletTempCMax = evapInletTempCMax;
    }

    public Double getEvapOutletTempCMin() {
        return evapOutletTempCMin;
    }

    public void setEvapOutletTempCMin(Double evapOutletTempCMin) {
        this.evapOutletTempCMin = evapOutletTempCMin;
    }

    public Double getEvapOutletTempCMax() {
        return evapOutletTempCMax;
    }

    public void setEvapOutletTempCMax(Double evapOutletTempCMax) {
        this.evapOutletTempCMax = evapOutletTempCMax;
    }

    public Double getRoomHumidityPercentMin() {
        return roomHumidityPercentMin;
    }

    public void setRoomHumidityPercentMin(Double roomHumidityPercentMin) {
        this.roomHumidityPercentMin = roomHumidityPercentMin;
    }

    public Double getRoomHumidityPercentMax() {
        return roomHumidityPercentMax;
    }

    public void setRoomHumidityPercentMax(Double roomHumidityPercentMax) {
        this.roomHumidityPercentMax = roomHumidityPercentMax;
    }

    public Double getPm25UgM3Min() {
        return pm25UgM3Min;
    }

    public void setPm25UgM3Min(Double pm25UgM3Min) {
        this.pm25UgM3Min = pm25UgM3Min;
    }

    public Double getPm25UgM3Max() {
        return pm25UgM3Max;
    }

    public void setPm25UgM3Max(Double pm25UgM3Max) {
        this.pm25UgM3Max = pm25UgM3Max;
    }

    public Integer getCo2PpmMin() {
        return co2PpmMin;
    }

    public void setCo2PpmMin(Integer co2PpmMin) {
        this.co2PpmMin = co2PpmMin;
    }

    public Integer getCo2PpmMax() {
        return co2PpmMax;
    }

    public void setCo2PpmMax(Integer co2PpmMax) {
        this.co2PpmMax = co2PpmMax;
    }

    public String getErrorCodeMin() {
        return errorCodeMin;
    }

    public void setErrorCodeMin(String errorCodeMin) {
        this.errorCodeMin = errorCodeMin;
    }

    public String getErrorCodeMax() {
        return errorCodeMax;
    }

    public void setErrorCodeMax(String errorCodeMax) {
        this.errorCodeMax = errorCodeMax;
    }

    public String getWifiStatusMin() {
        return wifiStatusMin;
    }

    public void setWifiStatusMin(String wifiStatusMin) {
        this.wifiStatusMin = wifiStatusMin;
    }

    public String getWifiStatusMax() {
        return wifiStatusMax;
    }

    public void setWifiStatusMax(String wifiStatusMax) {
        this.wifiStatusMax = wifiStatusMax;
    }
}