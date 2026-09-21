package com.saijo.smartfactory.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.google.cloud.firestore.annotation.DocumentId;
import com.google.cloud.firestore.annotation.PropertyName;

import java.time.LocalDateTime;

public class OutdoorUnitData {
    
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
    
    @JsonProperty("pressure_1_psi")
    @PropertyName("pressure1Psi")
    private Double pressure1Psi;
    
    @JsonProperty("pressure_2_psi")
    @PropertyName("pressure2Psi")
    private Double pressure2Psi;
    
    @JsonProperty("temp_1_c")
    @PropertyName("temp1C")
    private Double temp1C;
    
    @JsonProperty("temp_2_c")
    @PropertyName("temp2C")
    private Double temp2C;
    
    @JsonProperty("temp_3_c")
    @PropertyName("temp3C")
    private Double temp3C;
    
    @JsonProperty("temp_4_c")
    @PropertyName("temp4C")
    private Double temp4C;
    
    @JsonProperty("operation_mode")
    @PropertyName("operationMode")
    private String operationMode;
    
    @JsonProperty("running_percent")
    @PropertyName("runningPercent")
    private Double runningPercent;
    
    @JsonProperty("compressor_speed_rps")
    @PropertyName("compressorSpeedRps")
    private Double compressorSpeedRps;
    
    @JsonProperty("voltage_dc_v")
    @PropertyName("voltageDcV")
    private Double voltageDcV;
    
    @JsonProperty("discharge_temp_c")
    @PropertyName("dischargeTempC")
    private Double dischargeTempC;
    
    @JsonProperty("condenser_temp_c")
    @PropertyName("condenserTempC")
    private Double condenserTempC;
    
    @JsonProperty("suction_temp_c")
    @PropertyName("suctionTempC")
    private Double suctionTempC;
    
    @JsonProperty("ambient_temp_c")
    @PropertyName("ambientTempC")
    private Double ambientTempC;
    
    @JsonProperty("outdoor_fan_speed_rpm")
    @PropertyName("outdoorFanSpeedRpm")
    private Double outdoorFanSpeedRpm;
    
    @JsonProperty("fresh_air_supply_temp_c")
    @PropertyName("freshAirSupplyTempC")
    private Double freshAirSupplyTempC;
    
    @JsonProperty("fresh_air_supply_humidity_percent")
    @PropertyName("freshAirSupplyHumidityPercent")
    private Double freshAirSupplyHumidityPercent;
    
    @JsonProperty("ec_fan_speed_hz")
    @PropertyName("ecFanSpeedHz")
    private Double ecFanSpeedHz;
    
    @JsonProperty("fresh_air_evap_inlet_temp_c")
    @PropertyName("freshAirEvapInletTempC")
    private Double freshAirEvapInletTempC;

    // Constructors
    public OutdoorUnitData() {}
    
    public OutdoorUnitData(String testerNo, String serialNumber, String item, String model) {
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

    public Double getPressure1Psi() {
        return pressure1Psi;
    }

    public void setPressure1Psi(Double pressure1Psi) {
        this.pressure1Psi = pressure1Psi;
    }

    public Double getPressure2Psi() {
        return pressure2Psi;
    }

    public void setPressure2Psi(Double pressure2Psi) {
        this.pressure2Psi = pressure2Psi;
    }

    public Double getTemp1C() {
        return temp1C;
    }

    public void setTemp1C(Double temp1C) {
        this.temp1C = temp1C;
    }

    public Double getTemp2C() {
        return temp2C;
    }

    public void setTemp2C(Double temp2C) {
        this.temp2C = temp2C;
    }

    public Double getTemp3C() {
        return temp3C;
    }

    public void setTemp3C(Double temp3C) {
        this.temp3C = temp3C;
    }

    public Double getTemp4C() {
        return temp4C;
    }

    public void setTemp4C(Double temp4C) {
        this.temp4C = temp4C;
    }

    public String getOperationMode() {
        return operationMode;
    }

    public void setOperationMode(String operationMode) {
        this.operationMode = operationMode;
    }

    public Double getRunningPercent() {
        return runningPercent;
    }

    public void setRunningPercent(Double runningPercent) {
        this.runningPercent = runningPercent;
    }

    public Double getCompressorSpeedRps() {
        return compressorSpeedRps;
    }

    public void setCompressorSpeedRps(Double compressorSpeedRps) {
        this.compressorSpeedRps = compressorSpeedRps;
    }

    public Double getVoltageDcV() {
        return voltageDcV;
    }

    public void setVoltageDcV(Double voltageDcV) {
        this.voltageDcV = voltageDcV;
    }

    public Double getDischargeTempC() {
        return dischargeTempC;
    }

    public void setDischargeTempC(Double dischargeTempC) {
        this.dischargeTempC = dischargeTempC;
    }

    public Double getCondenserTempC() {
        return condenserTempC;
    }

    public void setCondenserTempC(Double condenserTempC) {
        this.condenserTempC = condenserTempC;
    }

    public Double getSuctionTempC() {
        return suctionTempC;
    }

    public void setSuctionTempC(Double suctionTempC) {
        this.suctionTempC = suctionTempC;
    }

    public Double getAmbientTempC() {
        return ambientTempC;
    }

    public void setAmbientTempC(Double ambientTempC) {
        this.ambientTempC = ambientTempC;
    }

    public Double getOutdoorFanSpeedRpm() {
        return outdoorFanSpeedRpm;
    }

    public void setOutdoorFanSpeedRpm(Double outdoorFanSpeedRpm) {
        this.outdoorFanSpeedRpm = outdoorFanSpeedRpm;
    }

    public Double getFreshAirSupplyTempC() {
        return freshAirSupplyTempC;
    }

    public void setFreshAirSupplyTempC(Double freshAirSupplyTempC) {
        this.freshAirSupplyTempC = freshAirSupplyTempC;
    }

    public Double getFreshAirSupplyHumidityPercent() {
        return freshAirSupplyHumidityPercent;
    }

    public void setFreshAirSupplyHumidityPercent(Double freshAirSupplyHumidityPercent) {
        this.freshAirSupplyHumidityPercent = freshAirSupplyHumidityPercent;
    }

    public Double getEcFanSpeedHz() {
        return ecFanSpeedHz;
    }

    public void setEcFanSpeedHz(Double ecFanSpeedHz) {
        this.ecFanSpeedHz = ecFanSpeedHz;
    }

    public Double getFreshAirEvapInletTempC() {
        return freshAirEvapInletTempC;
    }

    public void setFreshAirEvapInletTempC(Double freshAirEvapInletTempC) {
        this.freshAirEvapInletTempC = freshAirEvapInletTempC;
    }
}