package com.saijo.smartfactory.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.google.cloud.firestore.annotation.DocumentId;
import com.google.cloud.firestore.annotation.PropertyName;

public class TestResults {
    
    @DocumentId
    private String id;
    
    @JsonProperty("indoor_room_temp_dry_bulb_c")
    @PropertyName("indoorRoomTempDryBulbC")
    private Double indoorRoomTempDryBulbC;
    
    @JsonProperty("indoor_room_temp_wet_bulb_c")
    @PropertyName("indoorRoomTempWetBulbC")
    private Double indoorRoomTempWetBulbC;
    
    @JsonProperty("outdoor_room_temp_dry_bulb_c")
    @PropertyName("outdoorRoomTempDryBulbC")
    private Double outdoorRoomTempDryBulbC;
    
    @JsonProperty("outdoor_room_temp_wet_bulb_c")
    @PropertyName("outdoorRoomTempWetBulbC")
    private Double outdoorRoomTempWetBulbC;
    
    @JsonProperty("total_capacity_btu_h")
    @PropertyName("totalCapacityBtuH")
    private Double totalCapacityBtuH;
    
    @JsonProperty("sensible_heat_capacity_btu_h")
    @PropertyName("sensibleHeatCapacityBtuH")
    private Double sensibleHeatCapacityBtuH;
    
    @JsonProperty("latent_heat_capacity_btu_h")
    @PropertyName("latentHeatCapacityBtuH")
    private Double latentHeatCapacityBtuH;
    
    @JsonProperty("unit_power_input_w")
    @PropertyName("unitPowerInputW")
    private Double unitPowerInputW;
    
    @JsonProperty("unit_supply_voltage_v")
    @PropertyName("unitSupplyVoltageV")
    private Double unitSupplyVoltageV;
    
    @JsonProperty("unit_current_a")
    @PropertyName("unitCurrentA")
    private Double unitCurrentA;
    
    @JsonProperty("unit_power_factor")
    @PropertyName("unitPowerFactor")
    private Double unitPowerFactor;
    
    @JsonProperty("efficiency_eer")
    @PropertyName("efficiencyEer")
    private Double efficiencyEer;
    
    @JsonProperty("evaporator_inlet_temp_c")
    @PropertyName("evaporatorInletTempC")
    private Double evaporatorInletTempC;
    
    @JsonProperty("evaporator_outlet_temp_c")
    @PropertyName("evaporatorOutletTempC")
    private Double evaporatorOutletTempC;
    
    @JsonProperty("compressor_suction_temp_c")
    @PropertyName("compressorSuctionTempC")
    private Double compressorSuctionTempC;
    
    @JsonProperty("compressor_shell_temp_c")
    @PropertyName("compressorShellTempC")
    private Double compressorShellTempC;
    
    @JsonProperty("compressor_discharge_temp_c")
    @PropertyName("compressorDischargeTempC")
    private Double compressorDischargeTempC;
    
    @JsonProperty("condenser_mid_temp_c")
    @PropertyName("condenserMidTempC")
    private Double condenserMidTempC;
    
    @JsonProperty("condenser_outlet_temp_c")
    @PropertyName("condenserOutletTempC")
    private Double condenserOutletTempC;
    
    @JsonProperty("liquid_low_temp_c")
    @PropertyName("liquidLowTempC")
    private Double liquidLowTempC;
    
    @JsonProperty("compressor_suction_pressure_psi")
    @PropertyName("compressorSuctionPressurePsi")
    private Double compressorSuctionPressurePsi;
    
    @JsonProperty("compressor_discharge_pressure_psi")
    @PropertyName("compressorDischargePressurePsi")
    private Double compressorDischargePressurePsi;
    
    @JsonProperty("indoor_air_supply_temp_c")
    @PropertyName("indoorAirSupplyTempC")
    private Double indoorAirSupplyTempC;
    
    @JsonProperty("outdoor_air_supply_temp_c")
    @PropertyName("outdoorAirSupplyTempC")
    private Double outdoorAirSupplyTempC;

    // Constructors
    public TestResults() {}
    
    public TestResults(Double indoorRoomTempDryBulbC, Double outdoorRoomTempDryBulbC) {
        this.indoorRoomTempDryBulbC = indoorRoomTempDryBulbC;
        this.outdoorRoomTempDryBulbC = outdoorRoomTempDryBulbC;
    }

    // Getters and Setters
    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public Double getIndoorRoomTempDryBulbC() {
        return indoorRoomTempDryBulbC;
    }

    public void setIndoorRoomTempDryBulbC(Double indoorRoomTempDryBulbC) {
        this.indoorRoomTempDryBulbC = indoorRoomTempDryBulbC;
    }

    public Double getIndoorRoomTempWetBulbC() {
        return indoorRoomTempWetBulbC;
    }

    public void setIndoorRoomTempWetBulbC(Double indoorRoomTempWetBulbC) {
        this.indoorRoomTempWetBulbC = indoorRoomTempWetBulbC;
    }

    public Double getOutdoorRoomTempDryBulbC() {
        return outdoorRoomTempDryBulbC;
    }

    public void setOutdoorRoomTempDryBulbC(Double outdoorRoomTempDryBulbC) {
        this.outdoorRoomTempDryBulbC = outdoorRoomTempDryBulbC;
    }

    public Double getOutdoorRoomTempWetBulbC() {
        return outdoorRoomTempWetBulbC;
    }

    public void setOutdoorRoomTempWetBulbC(Double outdoorRoomTempWetBulbC) {
        this.outdoorRoomTempWetBulbC = outdoorRoomTempWetBulbC;
    }

    public Double getTotalCapacityBtuH() {
        return totalCapacityBtuH;
    }

    public void setTotalCapacityBtuH(Double totalCapacityBtuH) {
        this.totalCapacityBtuH = totalCapacityBtuH;
    }

    public Double getSensibleHeatCapacityBtuH() {
        return sensibleHeatCapacityBtuH;
    }

    public void setSensibleHeatCapacityBtuH(Double sensibleHeatCapacityBtuH) {
        this.sensibleHeatCapacityBtuH = sensibleHeatCapacityBtuH;
    }

    public Double getLatentHeatCapacityBtuH() {
        return latentHeatCapacityBtuH;
    }

    public void setLatentHeatCapacityBtuH(Double latentHeatCapacityBtuH) {
        this.latentHeatCapacityBtuH = latentHeatCapacityBtuH;
    }

    public Double getUnitPowerInputW() {
        return unitPowerInputW;
    }

    public void setUnitPowerInputW(Double unitPowerInputW) {
        this.unitPowerInputW = unitPowerInputW;
    }

    public Double getUnitSupplyVoltageV() {
        return unitSupplyVoltageV;
    }

    public void setUnitSupplyVoltageV(Double unitSupplyVoltageV) {
        this.unitSupplyVoltageV = unitSupplyVoltageV;
    }

    public Double getUnitCurrentA() {
        return unitCurrentA;
    }

    public void setUnitCurrentA(Double unitCurrentA) {
        this.unitCurrentA = unitCurrentA;
    }

    public Double getUnitPowerFactor() {
        return unitPowerFactor;
    }

    public void setUnitPowerFactor(Double unitPowerFactor) {
        this.unitPowerFactor = unitPowerFactor;
    }

    public Double getEfficiencyEer() {
        return efficiencyEer;
    }

    public void setEfficiencyEer(Double efficiencyEer) {
        this.efficiencyEer = efficiencyEer;
    }

    public Double getEvaporatorInletTempC() {
        return evaporatorInletTempC;
    }

    public void setEvaporatorInletTempC(Double evaporatorInletTempC) {
        this.evaporatorInletTempC = evaporatorInletTempC;
    }

    public Double getEvaporatorOutletTempC() {
        return evaporatorOutletTempC;
    }

    public void setEvaporatorOutletTempC(Double evaporatorOutletTempC) {
        this.evaporatorOutletTempC = evaporatorOutletTempC;
    }

    public Double getCompressorSuctionTempC() {
        return compressorSuctionTempC;
    }

    public void setCompressorSuctionTempC(Double compressorSuctionTempC) {
        this.compressorSuctionTempC = compressorSuctionTempC;
    }

    public Double getCompressorShellTempC() {
        return compressorShellTempC;
    }

    public void setCompressorShellTempC(Double compressorShellTempC) {
        this.compressorShellTempC = compressorShellTempC;
    }

    public Double getCompressorDischargeTempC() {
        return compressorDischargeTempC;
    }

    public void setCompressorDischargeTempC(Double compressorDischargeTempC) {
        this.compressorDischargeTempC = compressorDischargeTempC;
    }

    public Double getCondenserMidTempC() {
        return condenserMidTempC;
    }

    public void setCondenserMidTempC(Double condenserMidTempC) {
        this.condenserMidTempC = condenserMidTempC;
    }

    public Double getCondenserOutletTempC() {
        return condenserOutletTempC;
    }

    public void setCondenserOutletTempC(Double condenserOutletTempC) {
        this.condenserOutletTempC = condenserOutletTempC;
    }

    public Double getLiquidLowTempC() {
        return liquidLowTempC;
    }

    public void setLiquidLowTempC(Double liquidLowTempC) {
        this.liquidLowTempC = liquidLowTempC;
    }

    public Double getCompressorSuctionPressurePsi() {
        return compressorSuctionPressurePsi;
    }

    public void setCompressorSuctionPressurePsi(Double compressorSuctionPressurePsi) {
        this.compressorSuctionPressurePsi = compressorSuctionPressurePsi;
    }

    public Double getCompressorDischargePressurePsi() {
        return compressorDischargePressurePsi;
    }

    public void setCompressorDischargePressurePsi(Double compressorDischargePressurePsi) {
        this.compressorDischargePressurePsi = compressorDischargePressurePsi;
    }

    public Double getIndoorAirSupplyTempC() {
        return indoorAirSupplyTempC;
    }

    public void setIndoorAirSupplyTempC(Double indoorAirSupplyTempC) {
        this.indoorAirSupplyTempC = indoorAirSupplyTempC;
    }

    public Double getOutdoorAirSupplyTempC() {
        return outdoorAirSupplyTempC;
    }

    public void setOutdoorAirSupplyTempC(Double outdoorAirSupplyTempC) {
        this.outdoorAirSupplyTempC = outdoorAirSupplyTempC;
    }
}