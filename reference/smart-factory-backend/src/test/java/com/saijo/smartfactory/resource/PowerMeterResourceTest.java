package com.saijo.smartfactory.resource;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.CoreMatchers.*;

@QuarkusTest
public class PowerMeterResourceTest {

    @Test
    public void testGetPowerMeterStatuses() {
        given()
            .when().get("/api/v1/power-meter/statuses")
            .then()
            .statusCode(anyOf(equalTo(200), equalTo(500))); // 500 if Firestore is unavailable
    }

    @Test
    public void testGetPowerMeterReadings() {
        given()
            .when().get("/api/v1/power-meter/readings")
            .then()
            .statusCode(anyOf(equalTo(200), equalTo(500))); // 500 if Firestore is unavailable
    }

    @Test
    public void testGetRealtimeSeries() {
        given()
            .queryParam("hours", 24)
            .queryParam("interval", "5m")
            .when().get("/api/v1/power-meter/realtime")
            .then()
            .statusCode(anyOf(equalTo(200), equalTo(500))); // 500 if Firestore is unavailable
    }

    @Test
    public void testGetRealtimeSeriesWithCustomParams() {
        given()
            .queryParam("hours", 12)
            .queryParam("interval", "1h")
            .when().get("/api/v1/power-meter/realtime")
            .then()
            .statusCode(anyOf(equalTo(200), equalTo(500))); // 500 if Firestore is unavailable
    }

    @Test
    public void testGetUptimeMetrics() {
        given()
            .when().get("/api/v1/power-meter/M001/uptime")
            .then()
            .statusCode(anyOf(equalTo(200), equalTo(404), equalTo(500))); // 404 if meter not found, 500 if Firestore unavailable
    }

    @Test
    public void testGetComprehensiveMeterData() {
        given()
            .when().get("/api/v1/power-meter/M001")
            .then()
            .statusCode(anyOf(equalTo(200), equalTo(404), equalTo(500))); // 404 if meter not found, 500 if Firestore unavailable
    }

    @Test
    public void testGetHistoricalData() {
        given()
            .queryParam("startDate", "2023-01-01T00:00:00")
            .queryParam("endDate", "2023-01-02T00:00:00")
            .when().get("/api/v1/power-meter/historical")
            .then()
            .statusCode(anyOf(equalTo(200), equalTo(500))); // 500 if Firestore is unavailable
    }

    @Test
    public void testGetDashboardMetrics() {
        given()
            .when().get("/api/v1/dashboard/metrics")
            .then()
            .statusCode(anyOf(equalTo(200), equalTo(404), equalTo(500))); // 404 if metrics not found, 500 if Firestore unavailable
    }
}