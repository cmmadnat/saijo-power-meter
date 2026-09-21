package com.saijo.smartfactory.model;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Field-by-field comparison results for outdoor unit testing
 * Each field contains "true" (pass) or "false" (fail) as string values
 */
public class OutdoorFieldResults {

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

    @JsonProperty("pressure_1")
    private String pressure1;

    @JsonProperty("pressure_2")
    private String pressure2;

    @JsonProperty("temp_1")
    private String temp1;

    @JsonProperty("temp_2")
    private String temp2;

    @JsonProperty("temp_3")
    private String temp3;

    @JsonProperty("temp_4")
    private String temp4;

    @JsonProperty("running_percent")
    private String runningPercent;

    @JsonProperty("compressor_speed")
    private String compressorSpeed;

    @JsonProperty("voltage_dc")
    private String voltageDc;

    @JsonProperty("discharge_temp")
    private String dischargeTemp;

    @JsonProperty("condenser_temp")
    private String condenserTemp;

    @JsonProperty("suction_temp")
    private String suctionTemp;

    @JsonProperty("ambient_temp")
    private String ambientTemp;

    @JsonProperty("outdoor_fan_speed")
    private String outdoorFanSpeed;

    @JsonProperty("fresh_air_supply_temp")
    private String freshAirSupplyTemp;

    @JsonProperty("fresh_air_supply_humidity")
    private String freshAirSupplyHumidity;

    @JsonProperty("ec_fan_speed")
    private String ecFanSpeed;

    @JsonProperty("fresh_air_evap_inlet_temp")
    private String freshAirEvapInletTemp;

    // Constructors
    public OutdoorFieldResults() {}

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

    public String getPressure1() {
        return pressure1;
    }

    public void setPressure1(String pressure1) {
        this.pressure1 = pressure1;
    }

    public String getPressure2() {
        return pressure2;
    }

    public void setPressure2(String pressure2) {
        this.pressure2 = pressure2;
    }

    public String getTemp1() {
        return temp1;
    }

    public void setTemp1(String temp1) {
        this.temp1 = temp1;
    }

    public String getTemp2() {
        return temp2;
    }

    public void setTemp2(String temp2) {
        this.temp2 = temp2;
    }

    public String getTemp3() {
        return temp3;
    }

    public void setTemp3(String temp3) {
        this.temp3 = temp3;
    }

    public String getTemp4() {
        return temp4;
    }

    public void setTemp4(String temp4) {
        this.temp4 = temp4;
    }

    public String getRunningPercent() {
        return runningPercent;
    }

    public void setRunningPercent(String runningPercent) {
        this.runningPercent = runningPercent;
    }

    public String getCompressorSpeed() {
        return compressorSpeed;
    }

    public void setCompressorSpeed(String compressorSpeed) {
        this.compressorSpeed = compressorSpeed;
    }

    public String getVoltageDc() {
        return voltageDc;
    }

    public void setVoltageDc(String voltageDc) {
        this.voltageDc = voltageDc;
    }

    public String getDischargeTemp() {
        return dischargeTemp;
    }

    public void setDischargeTemp(String dischargeTemp) {
        this.dischargeTemp = dischargeTemp;
    }

    public String getCondenserTemp() {
        return condenserTemp;
    }

    public void setCondenserTemp(String condenserTemp) {
        this.condenserTemp = condenserTemp;
    }

    public String getSuctionTemp() {
        return suctionTemp;
    }

    public void setSuctionTemp(String suctionTemp) {
        this.suctionTemp = suctionTemp;
    }

    public String getAmbientTemp() {
        return ambientTemp;
    }

    public void setAmbientTemp(String ambientTemp) {
        this.ambientTemp = ambientTemp;
    }

    public String getOutdoorFanSpeed() {
        return outdoorFanSpeed;
    }

    public void setOutdoorFanSpeed(String outdoorFanSpeed) {
        this.outdoorFanSpeed = outdoorFanSpeed;
    }

    public String getFreshAirSupplyTemp() {
        return freshAirSupplyTemp;
    }

    public void setFreshAirSupplyTemp(String freshAirSupplyTemp) {
        this.freshAirSupplyTemp = freshAirSupplyTemp;
    }

    public String getFreshAirSupplyHumidity() {
        return freshAirSupplyHumidity;
    }

    public void setFreshAirSupplyHumidity(String freshAirSupplyHumidity) {
        this.freshAirSupplyHumidity = freshAirSupplyHumidity;
    }

    public String getEcFanSpeed() {
        return ecFanSpeed;
    }

    public void setEcFanSpeed(String ecFanSpeed) {
        this.ecFanSpeed = ecFanSpeed;
    }

    public String getFreshAirEvapInletTemp() {
        return freshAirEvapInletTemp;
    }

    public void setFreshAirEvapInletTemp(String freshAirEvapInletTemp) {
        this.freshAirEvapInletTemp = freshAirEvapInletTemp;
    }
}
