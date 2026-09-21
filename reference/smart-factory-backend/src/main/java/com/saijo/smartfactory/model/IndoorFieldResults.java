package com.saijo.smartfactory.model;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Field-by-field comparison results for indoor unit testing
 * Each field contains "true" (pass) or "false" (fail) as string values
 */
public class IndoorFieldResults {

    @JsonProperty("voltage_l1")
    private String voltageL1;

    @JsonProperty("voltage_l2")
    private String voltageL2;

    @JsonProperty("voltage_l3")
    private String voltageL3;

    @JsonProperty("current_l1")
    private String currentL1;

    @JsonProperty("current_l2")
    private String currentL2;

    @JsonProperty("current_l3")
    private String currentL3;

    @JsonProperty("power_kw")
    private String powerKw;

    @JsonProperty("power_factor")
    private String powerFactor;

    @JsonProperty("room_temp")
    private String roomTemp;

    @JsonProperty("evap_inlet_temp")
    private String evapInletTemp;

    @JsonProperty("evap_outlet_temp")
    private String evapOutletTemp;

    @JsonProperty("room_humidity")
    private String roomHumidity;

    @JsonProperty("pm25")
    private String pm25;

    @JsonProperty("co2")
    private String co2;

    // Constructors
    public IndoorFieldResults() {}

    // Getters and Setters
    public String getVoltageL1() {
        return voltageL1;
    }

    public void setVoltageL1(String voltageL1) {
        this.voltageL1 = voltageL1;
    }

    public String getVoltageL2() {
        return voltageL2;
    }

    public void setVoltageL2(String voltageL2) {
        this.voltageL2 = voltageL2;
    }

    public String getVoltageL3() {
        return voltageL3;
    }

    public void setVoltageL3(String voltageL3) {
        this.voltageL3 = voltageL3;
    }

    public String getCurrentL1() {
        return currentL1;
    }

    public void setCurrentL1(String currentL1) {
        this.currentL1 = currentL1;
    }

    public String getCurrentL2() {
        return currentL2;
    }

    public void setCurrentL2(String currentL2) {
        this.currentL2 = currentL2;
    }

    public String getCurrentL3() {
        return currentL3;
    }

    public void setCurrentL3(String currentL3) {
        this.currentL3 = currentL3;
    }

    public String getPowerKw() {
        return powerKw;
    }

    public void setPowerKw(String powerKw) {
        this.powerKw = powerKw;
    }

    public String getPowerFactor() {
        return powerFactor;
    }

    public void setPowerFactor(String powerFactor) {
        this.powerFactor = powerFactor;
    }

    public String getRoomTemp() {
        return roomTemp;
    }

    public void setRoomTemp(String roomTemp) {
        this.roomTemp = roomTemp;
    }

    public String getEvapInletTemp() {
        return evapInletTemp;
    }

    public void setEvapInletTemp(String evapInletTemp) {
        this.evapInletTemp = evapInletTemp;
    }

    public String getEvapOutletTemp() {
        return evapOutletTemp;
    }

    public void setEvapOutletTemp(String evapOutletTemp) {
        this.evapOutletTemp = evapOutletTemp;
    }

    public String getRoomHumidity() {
        return roomHumidity;
    }

    public void setRoomHumidity(String roomHumidity) {
        this.roomHumidity = roomHumidity;
    }

    public String getPm25() {
        return pm25;
    }

    public void setPm25(String pm25) {
        this.pm25 = pm25;
    }

    public String getCo2() {
        return co2;
    }

    public void setCo2(String co2) {
        this.co2 = co2;
    }
}
