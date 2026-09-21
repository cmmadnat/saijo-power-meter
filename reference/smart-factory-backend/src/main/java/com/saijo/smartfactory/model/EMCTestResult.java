package com.saijo.smartfactory.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.google.cloud.firestore.annotation.DocumentId;
import com.google.cloud.firestore.annotation.PropertyName;

public class EMCTestResult {
    
    @DocumentId
    private String id;
    
    @JsonProperty("test_standard")
    @PropertyName("testStandard")
    private String testStandard; // e.g., "EN 55014-1:2006 CONDUCTED EMISSION"
    
    @JsonProperty("measuring_point")
    @PropertyName("measuringPoint")
    private String measuringPoint; // e.g., "Main port"
    
    @JsonProperty("phase")
    @PropertyName("phase")
    private String phase; // e.g., "Neutral to Ground"
    
    @JsonProperty("test_result_file")
    @PropertyName("testResultFile")
    private String testResultFile; // URL to the test result file

    // Constructors
    public EMCTestResult() {}
    
    public EMCTestResult(String testStandard, String measuringPoint, String phase, String testResultFile) {
        this.testStandard = testStandard;
        this.measuringPoint = measuringPoint;
        this.phase = phase;
        this.testResultFile = testResultFile;
    }

    // Getters and Setters
    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getTestStandard() {
        return testStandard;
    }

    public void setTestStandard(String testStandard) {
        this.testStandard = testStandard;
    }

    public String getMeasuringPoint() {
        return measuringPoint;
    }

    public void setMeasuringPoint(String measuringPoint) {
        this.measuringPoint = measuringPoint;
    }

    public String getPhase() {
        return phase;
    }

    public void setPhase(String phase) {
        this.phase = phase;
    }

    public String getTestResultFile() {
        return testResultFile;
    }

    public void setTestResultFile(String testResultFile) {
        this.testResultFile = testResultFile;
    }
}