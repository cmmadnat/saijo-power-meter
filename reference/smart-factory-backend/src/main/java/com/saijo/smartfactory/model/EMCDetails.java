package com.saijo.smartfactory.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.google.cloud.firestore.annotation.DocumentId;
import com.google.cloud.firestore.annotation.PropertyName;

import java.util.List;

public class EMCDetails {
    
    @DocumentId
    private String id;
    
    @JsonProperty("indoor_emi_filter")
    @PropertyName("indoorEmiFilter")
    private EmiFilter indoorEmiFilter;
    
    @JsonProperty("outdoor_emi_filter")
    @PropertyName("outdoorEmiFilter")
    private EmiFilter outdoorEmiFilter;
    
    @JsonProperty("ferrite_core_positions")
    @PropertyName("ferriteCorePositions")
    private List<FerriteCorePosition> ferriteCorePositions;

    // Constructors
    public EMCDetails() {}
    
    public EMCDetails(EmiFilter indoorEmiFilter, EmiFilter outdoorEmiFilter, List<FerriteCorePosition> ferriteCorePositions) {
        this.indoorEmiFilter = indoorEmiFilter;
        this.outdoorEmiFilter = outdoorEmiFilter;
        this.ferriteCorePositions = ferriteCorePositions;
    }

    // Getters and Setters
    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public EmiFilter getIndoorEmiFilter() {
        return indoorEmiFilter;
    }

    public void setIndoorEmiFilter(EmiFilter indoorEmiFilter) {
        this.indoorEmiFilter = indoorEmiFilter;
    }

    public EmiFilter getOutdoorEmiFilter() {
        return outdoorEmiFilter;
    }

    public void setOutdoorEmiFilter(EmiFilter outdoorEmiFilter) {
        this.outdoorEmiFilter = outdoorEmiFilter;
    }

    public List<FerriteCorePosition> getFerriteCorePositions() {
        return ferriteCorePositions;
    }

    public void setFerriteCorePositions(List<FerriteCorePosition> ferriteCorePositions) {
        this.ferriteCorePositions = ferriteCorePositions;
    }
}