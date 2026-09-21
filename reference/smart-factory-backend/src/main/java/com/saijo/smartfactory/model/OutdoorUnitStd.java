package com.saijo.smartfactory.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.google.cloud.firestore.annotation.DocumentId;
import com.google.cloud.firestore.annotation.PropertyName;

public class OutdoorUnitStd {
    
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
    
    @JsonProperty("pressure_1_psi_min")
    @PropertyName("pressure1PsiMin")
    private Double pressure1PsiMin;
    
    @JsonProperty("pressure_1_psi_max")
    @PropertyName("pressure1PsiMax")
    private Double pressure1PsiMax;
    
    @JsonProperty("pressure_2_psi_min")
    @PropertyName("pressure2PsiMin")
    private Double pressure2PsiMin;
    
    @JsonProperty("pressure_2_psi_max")
    @PropertyName("pressure2PsiMax")
    private Double pressure2PsiMax;
    
    @JsonProperty("temp_1_c_min")
    @PropertyName("temp1CMin")
    private Double temp1CMin;
    
    @JsonProperty("temp_1_c_max")
    @PropertyName("temp1CMax")
    private Double temp1CMax;
    
    @JsonProperty("temp_2_c_min")
    @PropertyName("temp2CMin")
    private Double temp2CMin;
    
    @JsonProperty("temp_2_c_max")
    @PropertyName("temp2CMax")
    private Double temp2CMax;
    
    @JsonProperty("temp_3_c_min")
    @PropertyName("temp3CMin")
    private Double temp3CMin;
    
    @JsonProperty("temp_3_c_max")
    @PropertyName("temp3CMax")
    private Double temp3CMax;
    
    @JsonProperty("temp_4_c_min")
    @PropertyName("temp4CMin")
    private Double temp4CMin;
    
    @JsonProperty("temp_4_c_max")
    @PropertyName("temp4CMax")
    private Double temp4CMax;
    
    @JsonProperty("running_percent_min")
    @PropertyName("runningPercentMin")
    private Double runningPercentMin;
    
    @JsonProperty("running_percent_max")
    @PropertyName("runningPercentMax")
    private Double runningPercentMax;
    
    @JsonProperty("compressor_speed_rps_min")
    @PropertyName("compressorSpeedRpsMin")
    private Double compressorSpeedRpsMin;
    
    @JsonProperty("compressor_speed_rps_max")
    @PropertyName("compressorSpeedRpsMax")
    private Double compressorSpeedRpsMax;
    
    @JsonProperty("voltage_dc_v_min")
    @PropertyName("voltageDcVMin")
    private Double voltageDcVMin;
    
    @JsonProperty("voltage_dc_v_max")
    @PropertyName("voltageDcVMax")
    private Double voltageDcVMax;
    
    @JsonProperty("discharge_temp_c_min")
    @PropertyName("dischargeTempCMin")
    private Double dischargeTempCMin;
    
    @JsonProperty("discharge_temp_c_max")
    @PropertyName("dischargeTempCMax")
    private Double dischargeTempCMax;
    
    @JsonProperty("condenser_temp_c_min")
    @PropertyName("condenserTempCMin")
    private Double condenserTempCMin;
    
    @JsonProperty("condenser_temp_c_max")
    @PropertyName("condenserTempCMax")
    private Double condenserTempCMax;
    
    @JsonProperty("suction_temp_c_min")
    @PropertyName("suctionTempCMin")
    private Double suctionTempCMin;
    
    @JsonProperty("suction_temp_c_max")
    @PropertyName("suctionTempCMax")
    private Double suctionTempCMax;
    
    @JsonProperty("ambient_temp_c_min")
    @PropertyName("ambientTempCMin")
    private Double ambientTempCMin;
    
    @JsonProperty("ambient_temp_c_max")
    @PropertyName("ambientTempCMax")
    private Double ambientTempCMax;
    
    @JsonProperty("outdoor_fan_speed_rpm_min")
    @PropertyName("outdoorFanSpeedRpmMin")
    private Double outdoorFanSpeedRpmMin;
    
    @JsonProperty("outdoor_fan_speed_rpm_max")
    @PropertyName("outdoorFanSpeedRpmMax")
    private Double outdoorFanSpeedRpmMax;

    @JsonProperty("errorCode_min")
    @PropertyName("errorCodeMin")
    private String errorCodeMin;

    @JsonProperty("errorCode_max")
    @PropertyName("errorCodeMax")
    private String errorCodeMax;

    @JsonProperty("refrigerantPressure1_min")
    @PropertyName("refrigerantPressure1Min")
    private String refrigerantPressure1Min;

    @JsonProperty("refrigerantPressure1_max")
    @PropertyName("refrigerantPressure1Max")
    private String refrigerantPressure1Max;

    @JsonProperty("refrigerantPressure2_min")
    @PropertyName("refrigerantPressure2Min")
    private String refrigerantPressure2Min;

    @JsonProperty("refrigerantPressure2_max")
    @PropertyName("refrigerantPressure2Max")
    private String refrigerantPressure2Max;

    @JsonProperty("acMode_min")
    @PropertyName("acModeMin")
    private String acModeMin;

    @JsonProperty("acMode_max")
    @PropertyName("acModeMax")
    private String acModeMax;

    @JsonProperty("acPercent_min")
    @PropertyName("acPercentMin")
    private String acPercentMin;

    @JsonProperty("acPercent_max")
    @PropertyName("acPercentMax")
    private String acPercentMax;

    @JsonProperty("compressorRpm_min")
    @PropertyName("compressorRpmMin")
    private String compressorRpmMin;

    @JsonProperty("compressorRpm_max")
    @PropertyName("compressorRpmMax")
    private String compressorRpmMax;

    @JsonProperty("inverterDcVolt_min")
    @PropertyName("inverterDcVoltMin")
    private String inverterDcVoltMin;

    @JsonProperty("inverterDcVolt_max")
    @PropertyName("inverterDcVoltMax")
    private String inverterDcVoltMax;

    @JsonProperty("compressorPipeOutTemp_min")
    @PropertyName("compressorPipeOutTempMin")
    private String compressorPipeOutTempMin;

    @JsonProperty("compressorPipeOutTemp_max")
    @PropertyName("compressorPipeOutTempMax")
    private String compressorPipeOutTempMax;

    @JsonProperty("condenserPipeTemp_min")
    @PropertyName("condenserPipeTempMin")
    private String condenserPipeTempMin;

    @JsonProperty("condenserPipeTemp_max")
    @PropertyName("condenserPipeTempMax")
    private String condenserPipeTempMax;

    @JsonProperty("compressorPipeInTemp_min")
    @PropertyName("compressorPipeInTempMin")
    private String compressorPipeInTempMin;

    @JsonProperty("compressorPipeInTemp_max")
    @PropertyName("compressorPipeInTempMax")
    private String compressorPipeInTempMax;

    @JsonProperty("condenserAirInTemp_min")
    @PropertyName("condenserAirInTempMin")
    private String condenserAirInTempMin;

    @JsonProperty("condenserAirInTemp_max")
    @PropertyName("condenserAirInTempMax")
    private String condenserAirInTempMax;

    @JsonProperty("condenserFanLevel_min")
    @PropertyName("condenserFanLevelMin")
    private String condenserFanLevelMin;

    @JsonProperty("condenserFanLevel_max")
    @PropertyName("condenserFanLevelMax")
    private String condenserFanLevelMax;

    @JsonProperty("condenserFanRpm_min")
    @PropertyName("condenserFanRpmMin")
    private String condenserFanRpmMin;

    @JsonProperty("condenserFanRpm_max")
    @PropertyName("condenserFanRpmMax")
    private String condenserFanRpmMax;

    @JsonProperty("freshAirSupplyTemp_min")
    @PropertyName("freshAirSupplyTempMin")
    private String freshAirSupplyTempMin;

    @JsonProperty("freshAirSupplyTemp_max")
    @PropertyName("freshAirSupplyTempMax")
    private String freshAirSupplyTempMax;

    @JsonProperty("freshAirSupplyHumidity_min")
    @PropertyName("freshAirSupplyHumidityMin")
    private String freshAirSupplyHumidityMin;

    @JsonProperty("freshAirSupplyHumidity_max")
    @PropertyName("freshAirSupplyHumidityMax")
    private String freshAirSupplyHumidityMax;

    @JsonProperty("freshAirFanRpm_min")
    @PropertyName("freshAirFanRpmMin")
    private String freshAirFanRpmMin;

    @JsonProperty("freshAirFanRpm_max")
    @PropertyName("freshAirFanRpmMax")
    private String freshAirFanRpmMax;

    @JsonProperty("freshAirEvapPipeTemp_min")
    @PropertyName("freshAirEvapPipeTempMin")
    private String freshAirEvapPipeTempMin;

    @JsonProperty("freshAirEvapPipeTemp_max")
    @PropertyName("freshAirEvapPipeTempMax")
    private String freshAirEvapPipeTempMax;

    // Constructors
    public OutdoorUnitStd() {}
    
    public OutdoorUnitStd(String item) {
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

    // Include all getters and setters for the properties
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

    // Continue with remaining getters/setters
    public Double getPressure1PsiMin() {
        return pressure1PsiMin;
    }

    public void setPressure1PsiMin(Double pressure1PsiMin) {
        this.pressure1PsiMin = pressure1PsiMin;
    }

    public Double getPressure1PsiMax() {
        return pressure1PsiMax;
    }

    public void setPressure1PsiMax(Double pressure1PsiMax) {
        this.pressure1PsiMax = pressure1PsiMax;
    }

    public Double getPressure2PsiMin() {
        return pressure2PsiMin;
    }

    public void setPressure2PsiMin(Double pressure2PsiMin) {
        this.pressure2PsiMin = pressure2PsiMin;
    }

    public Double getPressure2PsiMax() {
        return pressure2PsiMax;
    }

    public void setPressure2PsiMax(Double pressure2PsiMax) {
        this.pressure2PsiMax = pressure2PsiMax;
    }

    public Double getTemp1CMin() {
        return temp1CMin;
    }

    public void setTemp1CMin(Double temp1CMin) {
        this.temp1CMin = temp1CMin;
    }

    public Double getTemp1CMax() {
        return temp1CMax;
    }

    public void setTemp1CMax(Double temp1CMax) {
        this.temp1CMax = temp1CMax;
    }

    public Double getTemp2CMin() {
        return temp2CMin;
    }

    public void setTemp2CMin(Double temp2CMin) {
        this.temp2CMin = temp2CMin;
    }

    public Double getTemp2CMax() {
        return temp2CMax;
    }

    public void setTemp2CMax(Double temp2CMax) {
        this.temp2CMax = temp2CMax;
    }

    public Double getTemp3CMin() {
        return temp3CMin;
    }

    public void setTemp3CMin(Double temp3CMin) {
        this.temp3CMin = temp3CMin;
    }

    public Double getTemp3CMax() {
        return temp3CMax;
    }

    public void setTemp3CMax(Double temp3CMax) {
        this.temp3CMax = temp3CMax;
    }

    public Double getTemp4CMin() {
        return temp4CMin;
    }

    public void setTemp4CMin(Double temp4CMin) {
        this.temp4CMin = temp4CMin;
    }

    public Double getTemp4CMax() {
        return temp4CMax;
    }

    public void setTemp4CMax(Double temp4CMax) {
        this.temp4CMax = temp4CMax;
    }

    public Double getRunningPercentMin() {
        return runningPercentMin;
    }

    public void setRunningPercentMin(Double runningPercentMin) {
        this.runningPercentMin = runningPercentMin;
    }

    public Double getRunningPercentMax() {
        return runningPercentMax;
    }

    public void setRunningPercentMax(Double runningPercentMax) {
        this.runningPercentMax = runningPercentMax;
    }

    public Double getCompressorSpeedRpsMin() {
        return compressorSpeedRpsMin;
    }

    public void setCompressorSpeedRpsMin(Double compressorSpeedRpsMin) {
        this.compressorSpeedRpsMin = compressorSpeedRpsMin;
    }

    public Double getCompressorSpeedRpsMax() {
        return compressorSpeedRpsMax;
    }

    public void setCompressorSpeedRpsMax(Double compressorSpeedRpsMax) {
        this.compressorSpeedRpsMax = compressorSpeedRpsMax;
    }

    public Double getVoltageDcVMin() {
        return voltageDcVMin;
    }

    public void setVoltageDcVMin(Double voltageDcVMin) {
        this.voltageDcVMin = voltageDcVMin;
    }

    public Double getVoltageDcVMax() {
        return voltageDcVMax;
    }

    public void setVoltageDcVMax(Double voltageDcVMax) {
        this.voltageDcVMax = voltageDcVMax;
    }

    public Double getDischargeTempCMin() {
        return dischargeTempCMin;
    }

    public void setDischargeTempCMin(Double dischargeTempCMin) {
        this.dischargeTempCMin = dischargeTempCMin;
    }

    public Double getDischargeTempCMax() {
        return dischargeTempCMax;
    }

    public void setDischargeTempCMax(Double dischargeTempCMax) {
        this.dischargeTempCMax = dischargeTempCMax;
    }

    public Double getCondenserTempCMin() {
        return condenserTempCMin;
    }

    public void setCondenserTempCMin(Double condenserTempCMin) {
        this.condenserTempCMin = condenserTempCMin;
    }

    public Double getCondenserTempCMax() {
        return condenserTempCMax;
    }

    public void setCondenserTempCMax(Double condenserTempCMax) {
        this.condenserTempCMax = condenserTempCMax;
    }

    public Double getSuctionTempCMin() {
        return suctionTempCMin;
    }

    public void setSuctionTempCMin(Double suctionTempCMin) {
        this.suctionTempCMin = suctionTempCMin;
    }

    public Double getSuctionTempCMax() {
        return suctionTempCMax;
    }

    public void setSuctionTempCMax(Double suctionTempCMax) {
        this.suctionTempCMax = suctionTempCMax;
    }

    public Double getAmbientTempCMin() {
        return ambientTempCMin;
    }

    public void setAmbientTempCMin(Double ambientTempCMin) {
        this.ambientTempCMin = ambientTempCMin;
    }

    public Double getAmbientTempCMax() {
        return ambientTempCMax;
    }

    public void setAmbientTempCMax(Double ambientTempCMax) {
        this.ambientTempCMax = ambientTempCMax;
    }

    public Double getOutdoorFanSpeedRpmMin() {
        return outdoorFanSpeedRpmMin;
    }

    public void setOutdoorFanSpeedRpmMin(Double outdoorFanSpeedRpmMin) {
        this.outdoorFanSpeedRpmMin = outdoorFanSpeedRpmMin;
    }

    public Double getOutdoorFanSpeedRpmMax() {
        return outdoorFanSpeedRpmMax;
    }

    public void setOutdoorFanSpeedRpmMax(Double outdoorFanSpeedRpmMax) {
        this.outdoorFanSpeedRpmMax = outdoorFanSpeedRpmMax;
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

    public String getRefrigerantPressure1Min() {
        return refrigerantPressure1Min;
    }

    public void setRefrigerantPressure1Min(String refrigerantPressure1Min) {
        this.refrigerantPressure1Min = refrigerantPressure1Min;
    }

    public String getRefrigerantPressure1Max() {
        return refrigerantPressure1Max;
    }

    public void setRefrigerantPressure1Max(String refrigerantPressure1Max) {
        this.refrigerantPressure1Max = refrigerantPressure1Max;
    }

    public String getRefrigerantPressure2Min() {
        return refrigerantPressure2Min;
    }

    public void setRefrigerantPressure2Min(String refrigerantPressure2Min) {
        this.refrigerantPressure2Min = refrigerantPressure2Min;
    }

    public String getRefrigerantPressure2Max() {
        return refrigerantPressure2Max;
    }

    public void setRefrigerantPressure2Max(String refrigerantPressure2Max) {
        this.refrigerantPressure2Max = refrigerantPressure2Max;
    }

    public String getAcModeMin() {
        return acModeMin;
    }

    public void setAcModeMin(String acModeMin) {
        this.acModeMin = acModeMin;
    }

    public String getAcModeMax() {
        return acModeMax;
    }

    public void setAcModeMax(String acModeMax) {
        this.acModeMax = acModeMax;
    }

    public String getAcPercentMin() {
        return acPercentMin;
    }

    public void setAcPercentMin(String acPercentMin) {
        this.acPercentMin = acPercentMin;
    }

    public String getAcPercentMax() {
        return acPercentMax;
    }

    public void setAcPercentMax(String acPercentMax) {
        this.acPercentMax = acPercentMax;
    }

    public String getCompressorRpmMin() {
        return compressorRpmMin;
    }

    public void setCompressorRpmMin(String compressorRpmMin) {
        this.compressorRpmMin = compressorRpmMin;
    }

    public String getCompressorRpmMax() {
        return compressorRpmMax;
    }

    public void setCompressorRpmMax(String compressorRpmMax) {
        this.compressorRpmMax = compressorRpmMax;
    }

    public String getInverterDcVoltMin() {
        return inverterDcVoltMin;
    }

    public void setInverterDcVoltMin(String inverterDcVoltMin) {
        this.inverterDcVoltMin = inverterDcVoltMin;
    }

    public String getInverterDcVoltMax() {
        return inverterDcVoltMax;
    }

    public void setInverterDcVoltMax(String inverterDcVoltMax) {
        this.inverterDcVoltMax = inverterDcVoltMax;
    }

    public String getCompressorPipeOutTempMin() {
        return compressorPipeOutTempMin;
    }

    public void setCompressorPipeOutTempMin(String compressorPipeOutTempMin) {
        this.compressorPipeOutTempMin = compressorPipeOutTempMin;
    }

    public String getCompressorPipeOutTempMax() {
        return compressorPipeOutTempMax;
    }

    public void setCompressorPipeOutTempMax(String compressorPipeOutTempMax) {
        this.compressorPipeOutTempMax = compressorPipeOutTempMax;
    }

    public String getCondenserPipeTempMin() {
        return condenserPipeTempMin;
    }

    public void setCondenserPipeTempMin(String condenserPipeTempMin) {
        this.condenserPipeTempMin = condenserPipeTempMin;
    }

    public String getCondenserPipeTempMax() {
        return condenserPipeTempMax;
    }

    public void setCondenserPipeTempMax(String condenserPipeTempMax) {
        this.condenserPipeTempMax = condenserPipeTempMax;
    }

    public String getCompressorPipeInTempMin() {
        return compressorPipeInTempMin;
    }

    public void setCompressorPipeInTempMin(String compressorPipeInTempMin) {
        this.compressorPipeInTempMin = compressorPipeInTempMin;
    }

    public String getCompressorPipeInTempMax() {
        return compressorPipeInTempMax;
    }

    public void setCompressorPipeInTempMax(String compressorPipeInTempMax) {
        this.compressorPipeInTempMax = compressorPipeInTempMax;
    }

    public String getCondenserAirInTempMin() {
        return condenserAirInTempMin;
    }

    public void setCondenserAirInTempMin(String condenserAirInTempMin) {
        this.condenserAirInTempMin = condenserAirInTempMin;
    }

    public String getCondenserAirInTempMax() {
        return condenserAirInTempMax;
    }

    public void setCondenserAirInTempMax(String condenserAirInTempMax) {
        this.condenserAirInTempMax = condenserAirInTempMax;
    }

    public String getCondenserFanLevelMin() {
        return condenserFanLevelMin;
    }

    public void setCondenserFanLevelMin(String condenserFanLevelMin) {
        this.condenserFanLevelMin = condenserFanLevelMin;
    }

    public String getCondenserFanLevelMax() {
        return condenserFanLevelMax;
    }

    public void setCondenserFanLevelMax(String condenserFanLevelMax) {
        this.condenserFanLevelMax = condenserFanLevelMax;
    }

    public String getCondenserFanRpmMin() {
        return condenserFanRpmMin;
    }

    public void setCondenserFanRpmMin(String condenserFanRpmMin) {
        this.condenserFanRpmMin = condenserFanRpmMin;
    }

    public String getCondenserFanRpmMax() {
        return condenserFanRpmMax;
    }

    public void setCondenserFanRpmMax(String condenserFanRpmMax) {
        this.condenserFanRpmMax = condenserFanRpmMax;
    }

    public String getFreshAirSupplyTempMin() {
        return freshAirSupplyTempMin;
    }

    public void setFreshAirSupplyTempMin(String freshAirSupplyTempMin) {
        this.freshAirSupplyTempMin = freshAirSupplyTempMin;
    }

    public String getFreshAirSupplyTempMax() {
        return freshAirSupplyTempMax;
    }

    public void setFreshAirSupplyTempMax(String freshAirSupplyTempMax) {
        this.freshAirSupplyTempMax = freshAirSupplyTempMax;
    }

    public String getFreshAirSupplyHumidityMin() {
        return freshAirSupplyHumidityMin;
    }

    public void setFreshAirSupplyHumidityMin(String freshAirSupplyHumidityMin) {
        this.freshAirSupplyHumidityMin = freshAirSupplyHumidityMin;
    }

    public String getFreshAirSupplyHumidityMax() {
        return freshAirSupplyHumidityMax;
    }

    public void setFreshAirSupplyHumidityMax(String freshAirSupplyHumidityMax) {
        this.freshAirSupplyHumidityMax = freshAirSupplyHumidityMax;
    }

    public String getFreshAirFanRpmMin() {
        return freshAirFanRpmMin;
    }

    public void setFreshAirFanRpmMin(String freshAirFanRpmMin) {
        this.freshAirFanRpmMin = freshAirFanRpmMin;
    }

    public String getFreshAirFanRpmMax() {
        return freshAirFanRpmMax;
    }

    public void setFreshAirFanRpmMax(String freshAirFanRpmMax) {
        this.freshAirFanRpmMax = freshAirFanRpmMax;
    }

    public String getFreshAirEvapPipeTempMin() {
        return freshAirEvapPipeTempMin;
    }

    public void setFreshAirEvapPipeTempMin(String freshAirEvapPipeTempMin) {
        this.freshAirEvapPipeTempMin = freshAirEvapPipeTempMin;
    }

    public String getFreshAirEvapPipeTempMax() {
        return freshAirEvapPipeTempMax;
    }

    public void setFreshAirEvapPipeTempMax(String freshAirEvapPipeTempMax) {
        this.freshAirEvapPipeTempMax = freshAirEvapPipeTempMax;
    }
}