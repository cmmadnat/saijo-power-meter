package com.saijo.smartfactory.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.google.cloud.firestore.annotation.DocumentId;
import com.google.cloud.firestore.annotation.PropertyName;

public class AirConditionerDetails {
    
    @DocumentId
    private String id;
    
    @JsonProperty("model_name")
    @PropertyName("modelName")
    private String modelName;
    
    @JsonProperty("serial_number")
    @PropertyName("serialNumber")
    private String serialNumber;
    
    @JsonProperty("ac_type")
    @PropertyName("acType")
    private String acType; // Fix, Inverter
    
    @JsonProperty("cooling_capacity_btu_h")
    @PropertyName("coolingCapacityBtuH")
    private Double coolingCapacityBtuH;
    
    @JsonProperty("efficiency")
    @PropertyName("efficiency")
    private Double efficiency;
    
    @JsonProperty("fin_type")
    @PropertyName("finType")
    private String finType;
    
    @JsonProperty("fin_option")
    @PropertyName("finOption")
    private String finOption;
    
    @JsonProperty("fin_count")
    @PropertyName("finCount")
    private Integer finCount;
    
    @JsonProperty("fin_material")
    @PropertyName("finMaterial")
    private String finMaterial;
    
    @JsonProperty("refrigerant_pipe_material")
    @PropertyName("refrigerantPipeMaterial")
    private String refrigerantPipeMaterial;
    
    @JsonProperty("refrigerant_pipe_size")
    @PropertyName("refrigerantPipeSize")
    private String refrigerantPipeSize;
    
    @JsonProperty("evaporator_rows")
    @PropertyName("evaporatorRows")
    private Integer evaporatorRows;
    
    @JsonProperty("evaporator_cross_section_area")
    @PropertyName("evaporatorCrossSectionArea")
    private Double evaporatorCrossSectionArea;
    
    @JsonProperty("fan_motor_type")
    @PropertyName("fanMotorType")
    private String fanMotorType;
    
    @JsonProperty("fan_rpm")
    @PropertyName("fanRpm")
    private Integer fanRpm;
    
    @JsonProperty("fan_cfm")
    @PropertyName("fanCfm")
    private Integer fanCfm;
    
    @JsonProperty("refrigerant_type")
    @PropertyName("refrigerantType")
    private String refrigerantType;
    
    @JsonProperty("refrigerant_volume_g")
    @PropertyName("refrigerantVolumeG")
    private Double refrigerantVolumeG;
    
    @JsonProperty("captube_inner_diameter_mm")
    @PropertyName("captubeInnerDiameterMm")
    private Double captubeInnerDiameterMm;
    
    @JsonProperty("captube_length_inch")
    @PropertyName("captubeLengthInch")
    private Double captubeLengthInch;
    
    @JsonProperty("exv_size_mm")
    @PropertyName("exvSizeMm")
    private Double exvSizeMm;
    
    @JsonProperty("exv_position")
    @PropertyName("exvPosition")
    private Integer exvPosition;
    
    @JsonProperty("exv_model")
    @PropertyName("exvModel")
    private String exvModel;
    
    @JsonProperty("txv_size_mm")
    @PropertyName("txvSizeMm")
    private Double txvSizeMm;
    
    @JsonProperty("txv_position")
    @PropertyName("txvPosition")
    private Integer txvPosition;
    
    @JsonProperty("compressor_type")
    @PropertyName("compressorType")
    private String compressorType; // Fix / Inverter
    
    @JsonProperty("compressor_rpm")
    @PropertyName("compressorRpm")
    private Integer compressorRpm;
    
    @JsonProperty("compressor_model")
    @PropertyName("compressorModel")
    private String compressorModel;
    
    @JsonProperty("condenser_fin_type")
    @PropertyName("condenserFinType")
    private String condenserFinType;
    
    @JsonProperty("condenser_fin_count")
    @PropertyName("condenserFinCount")
    private Integer condenserFinCount;
    
    @JsonProperty("condenser_fin_material")
    @PropertyName("condenserFinMaterial")
    private String condenserFinMaterial;
    
    @JsonProperty("condenser_refrigerant_pipe_material")
    @PropertyName("condenserRefrigerantPipeMaterial")
    private String condenserRefrigerantPipeMaterial;
    
    @JsonProperty("condenser_refrigerant_pipe_size")
    @PropertyName("condenserRefrigerantPipeSize")
    private String condenserRefrigerantPipeSize;
    
    @JsonProperty("condenser_rows")
    @PropertyName("condenserRows")
    private Integer condenserRows;
    
    @JsonProperty("condenser_cross_section_area")
    @PropertyName("condenserCrossSectionArea")
    private Double condenserCrossSectionArea;

    // Constructors
    public AirConditionerDetails() {}
    
    public AirConditionerDetails(String modelName, String serialNumber, String acType) {
        this.modelName = modelName;
        this.serialNumber = serialNumber;
        this.acType = acType;
    }

    // Getters and Setters
    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getModelName() {
        return modelName;
    }

    public void setModelName(String modelName) {
        this.modelName = modelName;
    }

    public String getSerialNumber() {
        return serialNumber;
    }

    public void setSerialNumber(String serialNumber) {
        this.serialNumber = serialNumber;
    }

    public String getAcType() {
        return acType;
    }

    public void setAcType(String acType) {
        this.acType = acType;
    }

    public Double getCoolingCapacityBtuH() {
        return coolingCapacityBtuH;
    }

    public void setCoolingCapacityBtuH(Double coolingCapacityBtuH) {
        this.coolingCapacityBtuH = coolingCapacityBtuH;
    }

    public Double getEfficiency() {
        return efficiency;
    }

    public void setEfficiency(Double efficiency) {
        this.efficiency = efficiency;
    }

    public String getFinType() {
        return finType;
    }

    public void setFinType(String finType) {
        this.finType = finType;
    }

    public String getFinOption() {
        return finOption;
    }

    public void setFinOption(String finOption) {
        this.finOption = finOption;
    }

    public Integer getFinCount() {
        return finCount;
    }

    public void setFinCount(Integer finCount) {
        this.finCount = finCount;
    }

    public String getFinMaterial() {
        return finMaterial;
    }

    public void setFinMaterial(String finMaterial) {
        this.finMaterial = finMaterial;
    }

    public String getRefrigerantPipeMaterial() {
        return refrigerantPipeMaterial;
    }

    public void setRefrigerantPipeMaterial(String refrigerantPipeMaterial) {
        this.refrigerantPipeMaterial = refrigerantPipeMaterial;
    }

    public String getRefrigerantPipeSize() {
        return refrigerantPipeSize;
    }

    public void setRefrigerantPipeSize(String refrigerantPipeSize) {
        this.refrigerantPipeSize = refrigerantPipeSize;
    }

    public Integer getEvaporatorRows() {
        return evaporatorRows;
    }

    public void setEvaporatorRows(Integer evaporatorRows) {
        this.evaporatorRows = evaporatorRows;
    }

    public Double getEvaporatorCrossSectionArea() {
        return evaporatorCrossSectionArea;
    }

    public void setEvaporatorCrossSectionArea(Double evaporatorCrossSectionArea) {
        this.evaporatorCrossSectionArea = evaporatorCrossSectionArea;
    }

    public String getFanMotorType() {
        return fanMotorType;
    }

    public void setFanMotorType(String fanMotorType) {
        this.fanMotorType = fanMotorType;
    }

    public Integer getFanRpm() {
        return fanRpm;
    }

    public void setFanRpm(Integer fanRpm) {
        this.fanRpm = fanRpm;
    }

    public Integer getFanCfm() {
        return fanCfm;
    }

    public void setFanCfm(Integer fanCfm) {
        this.fanCfm = fanCfm;
    }

    public String getRefrigerantType() {
        return refrigerantType;
    }

    public void setRefrigerantType(String refrigerantType) {
        this.refrigerantType = refrigerantType;
    }

    public Double getRefrigerantVolumeG() {
        return refrigerantVolumeG;
    }

    public void setRefrigerantVolumeG(Double refrigerantVolumeG) {
        this.refrigerantVolumeG = refrigerantVolumeG;
    }

    public Double getCaptubeInnerDiameterMm() {
        return captubeInnerDiameterMm;
    }

    public void setCaptubeInnerDiameterMm(Double captubeInnerDiameterMm) {
        this.captubeInnerDiameterMm = captubeInnerDiameterMm;
    }

    public Double getCaptubeLengthInch() {
        return captubeLengthInch;
    }

    public void setCaptubeLengthInch(Double captubeLengthInch) {
        this.captubeLengthInch = captubeLengthInch;
    }

    public Double getExvSizeMm() {
        return exvSizeMm;
    }

    public void setExvSizeMm(Double exvSizeMm) {
        this.exvSizeMm = exvSizeMm;
    }

    public Integer getExvPosition() {
        return exvPosition;
    }

    public void setExvPosition(Integer exvPosition) {
        this.exvPosition = exvPosition;
    }

    public String getExvModel() {
        return exvModel;
    }

    public void setExvModel(String exvModel) {
        this.exvModel = exvModel;
    }

    public Double getTxvSizeMm() {
        return txvSizeMm;
    }

    public void setTxvSizeMm(Double txvSizeMm) {
        this.txvSizeMm = txvSizeMm;
    }

    public Integer getTxvPosition() {
        return txvPosition;
    }

    public void setTxvPosition(Integer txvPosition) {
        this.txvPosition = txvPosition;
    }

    public String getCompressorType() {
        return compressorType;
    }

    public void setCompressorType(String compressorType) {
        this.compressorType = compressorType;
    }

    public Integer getCompressorRpm() {
        return compressorRpm;
    }

    public void setCompressorRpm(Integer compressorRpm) {
        this.compressorRpm = compressorRpm;
    }

    public String getCompressorModel() {
        return compressorModel;
    }

    public void setCompressorModel(String compressorModel) {
        this.compressorModel = compressorModel;
    }

    public String getCondenserFinType() {
        return condenserFinType;
    }

    public void setCondenserFinType(String condenserFinType) {
        this.condenserFinType = condenserFinType;
    }

    public Integer getCondenserFinCount() {
        return condenserFinCount;
    }

    public void setCondenserFinCount(Integer condenserFinCount) {
        this.condenserFinCount = condenserFinCount;
    }

    public String getCondenserFinMaterial() {
        return condenserFinMaterial;
    }

    public void setCondenserFinMaterial(String condenserFinMaterial) {
        this.condenserFinMaterial = condenserFinMaterial;
    }

    public String getCondenserRefrigerantPipeMaterial() {
        return condenserRefrigerantPipeMaterial;
    }

    public void setCondenserRefrigerantPipeMaterial(String condenserRefrigerantPipeMaterial) {
        this.condenserRefrigerantPipeMaterial = condenserRefrigerantPipeMaterial;
    }

    public String getCondenserRefrigerantPipeSize() {
        return condenserRefrigerantPipeSize;
    }

    public void setCondenserRefrigerantPipeSize(String condenserRefrigerantPipeSize) {
        this.condenserRefrigerantPipeSize = condenserRefrigerantPipeSize;
    }

    public Integer getCondenserRows() {
        return condenserRows;
    }

    public void setCondenserRows(Integer condenserRows) {
        this.condenserRows = condenserRows;
    }

    public Double getCondenserCrossSectionArea() {
        return condenserCrossSectionArea;
    }

    public void setCondenserCrossSectionArea(Double condenserCrossSectionArea) {
        this.condenserCrossSectionArea = condenserCrossSectionArea;
    }
}