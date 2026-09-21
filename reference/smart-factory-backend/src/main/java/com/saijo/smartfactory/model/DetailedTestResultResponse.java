package com.saijo.smartfactory.model;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Detailed test result response containing field-by-field comparison results
 * @param <T> Test data type (IndoorUnitData or OutdoorUnitData)
 * @param <S> Standard type (IndoorUnitStd or OutdoorUnitStd)
 * @param <R> Field results type (IndoorFieldResults or OutdoorFieldResults)
 */
public class DetailedTestResultResponse<T, S, R> {

    @JsonProperty("status")
    private String status;

    @JsonProperty("result")
    private String result;

    @JsonProperty("resultTest")
    private R resultTest;

    @JsonProperty("test")
    private T test;

    @JsonProperty("std")
    private S std;

    // Constructors
    public DetailedTestResultResponse() {}

    public DetailedTestResultResponse(String status, String result, R resultTest, T test, S std) {
        this.status = status;
        this.result = result;
        this.resultTest = resultTest;
        this.test = test;
        this.std = std;
    }

    // Getters and Setters
    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getResult() {
        return result;
    }

    public void setResult(String result) {
        this.result = result;
    }

    public R getResultTest() {
        return resultTest;
    }

    public void setResultTest(R resultTest) {
        this.resultTest = resultTest;
    }

    public T getTest() {
        return test;
    }

    public void setTest(T test) {
        this.test = test;
    }

    public S getStd() {
        return std;
    }

    public void setStd(S std) {
        this.std = std;
    }
}
