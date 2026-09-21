package com.saijo.smartfactory.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.google.cloud.firestore.annotation.PropertyName;

public class EmiFilter {
    
    @JsonProperty("l1_uh")
    @PropertyName("l1Uh")
    private Double l1Uh;
    
    @JsonProperty("cx1_uf")
    @PropertyName("cx1Uf")
    private Double cx1Uf;
    
    @JsonProperty("cx2_uf")
    @PropertyName("cx2Uf")
    private Double cx2Uf;
    
    @JsonProperty("cy1_uf")
    @PropertyName("cy1Uf")
    private Double cy1Uf;
    
    @JsonProperty("cy2_uf")
    @PropertyName("cy2Uf")
    private Double cy2Uf;

    // Constructors
    public EmiFilter() {}
    
    public EmiFilter(Double l1Uh, Double cx1Uf, Double cx2Uf, Double cy1Uf, Double cy2Uf) {
        this.l1Uh = l1Uh;
        this.cx1Uf = cx1Uf;
        this.cx2Uf = cx2Uf;
        this.cy1Uf = cy1Uf;
        this.cy2Uf = cy2Uf;
    }

    // Getters and Setters
    public Double getL1Uh() {
        return l1Uh;
    }

    public void setL1Uh(Double l1Uh) {
        this.l1Uh = l1Uh;
    }

    public Double getCx1Uf() {
        return cx1Uf;
    }

    public void setCx1Uf(Double cx1Uf) {
        this.cx1Uf = cx1Uf;
    }

    public Double getCx2Uf() {
        return cx2Uf;
    }

    public void setCx2Uf(Double cx2Uf) {
        this.cx2Uf = cx2Uf;
    }

    public Double getCy1Uf() {
        return cy1Uf;
    }

    public void setCy1Uf(Double cy1Uf) {
        this.cy1Uf = cy1Uf;
    }

    public Double getCy2Uf() {
        return cy2Uf;
    }

    public void setCy2Uf(Double cy2Uf) {
        this.cy2Uf = cy2Uf;
    }
}