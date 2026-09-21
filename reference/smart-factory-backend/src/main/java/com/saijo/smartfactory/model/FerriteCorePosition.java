package com.saijo.smartfactory.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.google.cloud.firestore.annotation.PropertyName;

public class FerriteCorePosition {
    
    @JsonProperty("name")
    @PropertyName("name")
    private String name; // e.g., "Ferrite core 1"
    
    @JsonProperty("material")
    @PropertyName("material")
    private String material;
    
    @JsonProperty("diameter")
    @PropertyName("diameter")
    private Double diameter;
    
    @JsonProperty("thickness")
    @PropertyName("thickness")
    private Double thickness;
    
    @JsonProperty("length")
    @PropertyName("length")
    private Double length;
    
    @JsonProperty("number_of_turns")
    @PropertyName("numberOfTurns")
    private Integer numberOfTurns;

    // Constructors
    public FerriteCorePosition() {}
    
    public FerriteCorePosition(String name, String material) {
        this.name = name;
        this.material = material;
    }

    // Getters and Setters
    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getMaterial() {
        return material;
    }

    public void setMaterial(String material) {
        this.material = material;
    }

    public Double getDiameter() {
        return diameter;
    }

    public void setDiameter(Double diameter) {
        this.diameter = diameter;
    }

    public Double getThickness() {
        return thickness;
    }

    public void setThickness(Double thickness) {
        this.thickness = thickness;
    }

    public Double getLength() {
        return length;
    }

    public void setLength(Double length) {
        this.length = length;
    }

    public Integer getNumberOfTurns() {
        return numberOfTurns;
    }

    public void setNumberOfTurns(Integer numberOfTurns) {
        this.numberOfTurns = numberOfTurns;
    }
}