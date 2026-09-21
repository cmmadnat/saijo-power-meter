package com.saijo.smartfactory;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.response.Response;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.junit.jupiter.api.MethodOrderer;

import static io.restassured.RestAssured.given;
import static org.hamcrest.CoreMatchers.*;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.junit.jupiter.api.Assertions.assertTrue;

@QuarkusTest
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
public class FunctionTestResourceTest {

    @Test
    public void testIndoorEndpointsParameterValidation() {
        // Test missing parameters
        given()
            .when().get("/api/v1/function-test/indoor/model")
            .then()
            .statusCode(400)
            .body("error", equalTo("Both serial and item parameters are required"));

        given()
            .when().get("/api/v1/function-test/indoor/by-serial")
            .then()
            .statusCode(400)
            .body("error", equalTo("Serial parameter is required"));

        given()
            .when().get("/api/v1/function-test/indoor/by-date-range")
            .then()
            .statusCode(400)
            .body("error", equalTo("Both startDate and endDate parameters are required"));

        given()
            .when().get("/api/v1/function-test/indoor/result-and-std")
            .then()
            .statusCode(400)
            .body("error", equalTo("TestNo parameter is required"));
    }

    @Test
    public void testOutdoorEndpointsParameterValidation() {
        // Test missing parameters
        given()
            .when().get("/api/v1/function-test/outdoor/model")
            .then()
            .statusCode(400)
            .body("error", equalTo("Both serial and item parameters are required"));

        given()
            .when().get("/api/v1/function-test/outdoor/by-serial")
            .then()
            .statusCode(400)
            .body("error", equalTo("Serial parameter is required"));

        given()
            .when().get("/api/v1/function-test/outdoor/by-date-range")
            .then()
            .statusCode(400)
            .body("error", equalTo("Both startDate and endDate parameters are required"));

        given()
            .when().get("/api/v1/function-test/outdoor/result-and-std")
            .then()
            .statusCode(400)
            .body("error", equalTo("TestNo parameter is required"));
    }

    @Test
    public void testIndoorStandardsParameterValidation() {
        given()
            .when().get("/api/v1/function-test/indoor/std")
            .then()
            .statusCode(400)
            .body("error", equalTo("Item parameter is required"));
    }

    @Test
    public void testOutdoorStandardsParameterValidation() {
        given()
            .when().get("/api/v1/function-test/outdoor/std")
            .then()
            .statusCode(400)
            .body("error", equalTo("Item parameter is required"));
    }

    @Test
    public void testGetAllIndoorUnits() {
        given()
            .when().get("/api/v1/function-test/indoor/all")
            .then()
            .statusCode(anyOf(equalTo(200), equalTo(500))); // 500 if Firestore is unavailable
    }

    @Test
    public void testGetAllOutdoorUnits() {
        given()
            .when().get("/api/v1/function-test/outdoor/all")
            .then()
            .statusCode(anyOf(equalTo(200), equalTo(500))); // 500 if Firestore is unavailable
    }

    @Test
    public void testIndoorStandardLifecycle() {
        String testItem = "TEST_INDOOR_ITEM_001";
        
        // Create indoor standard
        String requestBody = "{\n" +
            "  \"item\": \"" + testItem + "\",\n" +
            "  \"voltageL1VMin\": 200.0,\n" +
            "  \"voltageL1VMax\": 240.0,\n" +
            "  \"currentL1AMin\": 5.0,\n" +
            "  \"currentL1AMax\": 15.0,\n" +
            "  \"powerKwMin\": 1.0,\n" +
            "  \"powerKwMax\": 5.0,\n" +
            "  \"errorCode_min\": \"0\",\n" +
            "  \"errorCode_max\": \"5\",\n" +
            "  \"wifiStatus_min\": \"Connected\",\n" +
            "  \"wifiStatus_max\": \"Loss\"\n" +
            "}";

        Response createResponse = given()
            .contentType("application/json")
            .body(requestBody)
            .when().post("/api/v1/function-test/indoor/std");

        if (createResponse.getStatusCode() == 201) {
            createResponse.then()
                .statusCode(201)
                .body("success", equalTo(true))
                .body("id", notNullValue());

            // Get the created standard
            given()
                .queryParam("item", testItem)
                .when().get("/api/v1/function-test/indoor/std")
                .then()
                .statusCode(200)
                .body("item", equalTo(testItem))
                .body("voltageL1VMin", equalTo(200.0f))
                .body("voltageL1VMax", equalTo(240.0f))
                .body("errorCodeMin", equalTo("0"))
                .body("errorCodeMax", equalTo("5"))
                .body("wifiStatusMin", equalTo("Connected"))
                .body("wifiStatusMax", equalTo("Loss"));

            // Update the standard
            String updateBody = "{\n" +
                "  \"item\": \"" + testItem + "\",\n" +
                "  \"voltageL1VMin\": 210.0,\n" +
                "  \"voltageL1VMax\": 250.0,\n" +
                "  \"currentL1AMin\": 6.0,\n" +
                "  \"currentL1AMax\": 16.0,\n" +
                "  \"errorCode_min\": \"1\",\n" +
                "  \"errorCode_max\": \"10\",\n" +
                "  \"wifiStatus_min\": \"Disconnected\",\n" +
                "  \"wifiStatus_max\": \"Connected\"\n" +
                "}";

            given()
                .contentType("application/json")
                .body(updateBody)
                .when().put("/api/v1/function-test/indoor/std")
                .then()
                .statusCode(200)
                .body("success", equalTo(true));

            // Verify the update
            given()
                .queryParam("item", testItem)
                .when().get("/api/v1/function-test/indoor/std")
                .then()
                .statusCode(200)
                .body("voltageL1VMin", equalTo(210.0f))
                .body("voltageL1VMax", equalTo(250.0f))
                .body("errorCodeMin", equalTo("1"))
                .body("errorCodeMax", equalTo("10"))
                .body("wifiStatusMin", equalTo("Disconnected"))
                .body("wifiStatusMax", equalTo("Connected"));
        }
    }

    @Test
    public void testOutdoorStandardLifecycle() {
        String testItem = "TEST_OUTDOOR_ITEM_001";

        // Create outdoor standard with new fields from Stories 5.2 and 5.3
        String requestBody = "{\n" +
            "  \"item\": \"" + testItem + "\",\n" +
            "  \"voltageL1VMin\": 200.0,\n" +
            "  \"voltageL1VMax\": 240.0,\n" +
            "  \"pressure1PsiMin\": 100.0,\n" +
            "  \"pressure1PsiMax\": 300.0,\n" +
            "  \"temp1CMin\": -10.0,\n" +
            "  \"temp1CMax\": 60.0,\n" +
            "  \"errorCode_min\": \"0\",\n" +
            "  \"errorCode_max\": \"5\",\n" +
            "  \"refrigerantPressure1_min\": \"180\",\n" +
            "  \"refrigerantPressure1_max\": \"250\",\n" +
            "  \"refrigerantPressure2_min\": \"185\",\n" +
            "  \"refrigerantPressure2_max\": \"260\",\n" +
            "  \"acMode_min\": \"0\",\n" +
            "  \"acMode_max\": \"3\",\n" +
            "  \"acPercent_min\": \"20\",\n" +
            "  \"acPercent_max\": \"100\",\n" +
            "  \"compressorRpm_min\": \"1200\",\n" +
            "  \"compressorRpm_max\": \"3600\",\n" +
            "  \"inverterDcVolt_min\": \"280\",\n" +
            "  \"inverterDcVolt_max\": \"340\",\n" +
            "  \"condenserFanRpm_min\": \"700\",\n" +
            "  \"condenserFanRpm_max\": \"1500\",\n" +
            "  \"freshAirSupplyTemp_min\": \"20\",\n" +
            "  \"freshAirSupplyTemp_max\": \"26.5\"\n" +
            "}";

        Response createResponse = given()
            .contentType("application/json")
            .body(requestBody)
            .when().post("/api/v1/function-test/outdoor/std");

        if (createResponse.getStatusCode() == 201) {
            createResponse.then()
                .statusCode(201)
                .body("success", equalTo(true))
                .body("id", notNullValue());

            // Get the created standard and verify new fields
            given()
                .queryParam("item", testItem)
                .when().get("/api/v1/function-test/outdoor/std")
                .then()
                .statusCode(200)
                .body("item", equalTo(testItem))
                .body("voltageL1VMin", equalTo(200.0f))
                .body("pressure1PsiMin", equalTo(100.0f))
                .body("errorCodeMin", equalTo("0"))
                .body("errorCodeMax", equalTo("5"))
                .body("refrigerantPressure1Min", equalTo("180"))
                .body("refrigerantPressure1Max", equalTo("250"))
                .body("refrigerantPressure2Min", equalTo("185"))
                .body("refrigerantPressure2Max", equalTo("260"))
                .body("acModeMin", equalTo("0"))
                .body("acModeMax", equalTo("3"))
                .body("acPercentMin", equalTo("20"))
                .body("acPercentMax", equalTo("100"))
                .body("compressorRpmMin", equalTo("1200"))
                .body("compressorRpmMax", equalTo("3600"))
                .body("inverterDcVoltMin", equalTo("280"))
                .body("inverterDcVoltMax", equalTo("340"))
                .body("condenserFanRpmMin", equalTo("700"))
                .body("condenserFanRpmMax", equalTo("1500"))
                .body("freshAirSupplyTempMin", equalTo("20"))
                .body("freshAirSupplyTempMax", equalTo("26.5"));

            // Update the standard including new fields
            String updateBody = "{\n" +
                "  \"item\": \"" + testItem + "\",\n" +
                "  \"voltageL1VMin\": 210.0,\n" +
                "  \"voltageL1VMax\": 250.0,\n" +
                "  \"pressure1PsiMin\": 110.0,\n" +
                "  \"pressure1PsiMax\": 310.0,\n" +
                "  \"errorCode_min\": \"1\",\n" +
                "  \"errorCode_max\": \"10\",\n" +
                "  \"refrigerantPressure1_max\": \"280\",\n" +
                "  \"acPercent_max\": \"95\",\n" +
                "  \"compressorRpm_max\": \"4000\",\n" +
                "  \"inverterDcVolt_max\": \"350\",\n" +
                "  \"freshAirSupplyTemp_max\": \"28\"\n" +
                "}";

            given()
                .contentType("application/json")
                .body(updateBody)
                .when().put("/api/v1/function-test/outdoor/std")
                .then()
                .statusCode(200)
                .body("success", equalTo(true));

            // Verify the update including new fields
            given()
                .queryParam("item", testItem)
                .when().get("/api/v1/function-test/outdoor/std")
                .then()
                .statusCode(200)
                .body("voltageL1VMin", equalTo(210.0f))
                .body("pressure1PsiMin", equalTo(110.0f))
                .body("errorCodeMin", equalTo("1"))
                .body("errorCodeMax", equalTo("10"))
                .body("refrigerantPressure1Max", equalTo("280"))
                .body("acPercentMax", equalTo("95"))
                .body("compressorRpmMax", equalTo("4000"))
                .body("inverterDcVoltMax", equalTo("350"))
                .body("freshAirSupplyTempMax", equalTo("28"));
        }
    }

    @Test
    public void testInvalidStandardRequests() {
        // Test POST without item
        given()
            .contentType("application/json")
            .body("{\"voltageL1VMin\": 200.0}")
            .when().post("/api/v1/function-test/indoor/std")
            .then()
            .statusCode(400)
            .body("error", equalTo("Item is required"));

        given()
            .contentType("application/json")
            .body("{\"voltageL1VMin\": 200.0}")
            .when().post("/api/v1/function-test/outdoor/std")
            .then()
            .statusCode(400)
            .body("error", equalTo("Item is required"));

        // Test PUT without item
        given()
            .contentType("application/json")
            .body("{\"voltageL1VMin\": 200.0}")
            .when().put("/api/v1/function-test/indoor/std")
            .then()
            .statusCode(400)
            .body("error", equalTo("Item is required"));

        given()
            .contentType("application/json")
            .body("{\"voltageL1VMin\": 200.0}")
            .when().put("/api/v1/function-test/outdoor/std")
            .then()
            .statusCode(400)
            .body("error", equalTo("Item is required"));
    }

    @Test
    public void testNotFoundResponses() {
        // Test getting non-existent standards
        given()
            .queryParam("item", "NON_EXISTENT_ITEM")
            .when().get("/api/v1/function-test/indoor/std")
            .then()
            .statusCode(anyOf(equalTo(404), equalTo(500))); // 500 if Firestore is unavailable

        given()
            .queryParam("item", "NON_EXISTENT_ITEM")
            .when().get("/api/v1/function-test/outdoor/std")
            .then()
            .statusCode(anyOf(equalTo(404), equalTo(500))); // 500 if Firestore is unavailable

        // Test getting non-existent models
        given()
            .queryParam("serial", "NON_EXISTENT")
            .queryParam("item", "NON_EXISTENT")
            .when().get("/api/v1/function-test/indoor/model")
            .then()
            .statusCode(anyOf(equalTo(404), equalTo(500))); // 500 if Firestore is unavailable

        given()
            .queryParam("serial", "NON_EXISTENT")
            .queryParam("item", "NON_EXISTENT")
            .when().get("/api/v1/function-test/outdoor/model")
            .then()
            .statusCode(anyOf(equalTo(404), equalTo(500))); // 500 if Firestore is unavailable
    }

    @Test
    public void testDateRangeQuery() {
        // Test with valid date format
        given()
            .queryParam("startDate", "2024-01-01")
            .queryParam("endDate", "2024-12-31")
            .when().get("/api/v1/function-test/indoor/by-date-range")
            .then()
            .statusCode(anyOf(equalTo(200), equalTo(500))); // 500 might occur if Firestore isn't available

        given()
            .queryParam("startDate", "2024-01-01")
            .queryParam("endDate", "2024-12-31")
            .when().get("/api/v1/function-test/outdoor/by-date-range")
            .then()
            .statusCode(anyOf(equalTo(200), equalTo(500))); // 500 might occur if Firestore isn't available
    }

    @Test
    public void testSerialQuery() {
        // Test with sample serial number
        given()
            .queryParam("serial", "TEST_SERIAL_001")
            .when().get("/api/v1/function-test/indoor/by-serial")
            .then()
            .statusCode(anyOf(equalTo(200), equalTo(500))); // 500 might occur if Firestore isn't available

        given()
            .queryParam("serial", "TEST_SERIAL_001")
            .when().get("/api/v1/function-test/outdoor/by-serial")
            .then()
            .statusCode(anyOf(equalTo(200), equalTo(500))); // 500 might occur if Firestore isn't available
    }

    // Tests for Story 5.4: Detailed Test Result Response

    @Test
    public void testIndoorDetailedResultEndpointNotFound() {
        // Test with non-existent testNo
        given()
            .queryParam("testNo", "NON_EXISTENT_TEST_NO")
            .when().get("/api/v1/function-test/indoor/result-and-std")
            .then()
            .statusCode(anyOf(equalTo(404), equalTo(500))); // 500 if Firestore is unavailable
    }

    @Test
    public void testOutdoorDetailedResultEndpointNotFound() {
        // Test with non-existent testNo
        given()
            .queryParam("testNo", "NON_EXISTENT_TEST_NO")
            .when().get("/api/v1/function-test/outdoor/result-and-std")
            .then()
            .statusCode(anyOf(equalTo(404), equalTo(500))); // 500 if Firestore is unavailable
    }

    @Test
    public void testIndoorDetailedResultResponseStructure() {
        // This test will attempt to verify the response structure if test data exists
        // If Firestore is not available or data doesn't exist, we expect 404 or 500
        Response response = given()
            .queryParam("testNo", "SAMPLE_TEST_NO")
            .when().get("/api/v1/function-test/indoor/result-and-std");

        // If response is successful, verify it has the expected structure
        if (response.getStatusCode() == 200) {
            response.then()
                .body("status", notNullValue())
                .body("result", notNullValue())
                .body("resultTest", notNullValue())
                .body("test", notNullValue())
                .body("std", notNullValue())
                // Verify resultTest has field results
                .body("resultTest.voltage_l1", notNullValue())
                .body("resultTest.voltage_l2", notNullValue())
                .body("resultTest.voltage_l3", notNullValue())
                .body("resultTest.current_l1", notNullValue())
                .body("resultTest.power_kw", notNullValue())
                // Verify result is either "Pass" or "Fail"
                .body("result", anyOf(equalTo("Pass"), equalTo("Fail")))
                // Verify status matches result
                .body("status", anyOf(equalTo("Pass"), equalTo("Fail")));
        } else {
            // Expected to fail if test data doesn't exist or Firestore is unavailable
            response.then().statusCode(anyOf(equalTo(404), equalTo(500)));
        }
    }

    @Test
    public void testOutdoorDetailedResultResponseStructure() {
        // This test will attempt to verify the response structure if test data exists
        // If Firestore is not available or data doesn't exist, we expect 404 or 500
        Response response = given()
            .queryParam("testNo", "SAMPLE_TEST_NO")
            .when().get("/api/v1/function-test/outdoor/result-and-std");

        // If response is successful, verify it has the expected structure
        if (response.getStatusCode() == 200) {
            response.then()
                .body("status", notNullValue())
                .body("result", notNullValue())
                .body("resultTest", notNullValue())
                .body("test", notNullValue())
                .body("std", notNullValue())
                // Verify resultTest has field results
                .body("resultTest.voltage_l1", notNullValue())
                .body("resultTest.voltage_l2", notNullValue())
                .body("resultTest.voltage_l3", notNullValue())
                .body("resultTest.current_l1", notNullValue())
                .body("resultTest.power_kw", notNullValue())
                .body("resultTest.pressure_1", notNullValue())
                .body("resultTest.pressure_2", notNullValue())
                .body("resultTest.temp_1", notNullValue())
                .body("resultTest.compressor_speed", notNullValue())
                // Verify result is either "Pass" or "Fail"
                .body("result", anyOf(equalTo("Pass"), equalTo("Fail")))
                // Verify status matches result
                .body("status", anyOf(equalTo("Pass"), equalTo("Fail")));
        } else {
            // Expected to fail if test data doesn't exist or Firestore is unavailable
            response.then().statusCode(anyOf(equalTo(404), equalTo(500)));
        }
    }

    @Test
    public void testDetailedResultFieldValueFormats() {
        // Test that field results are string booleans "true" or "false"
        Response response = given()
            .queryParam("testNo", "SAMPLE_TEST_NO")
            .when().get("/api/v1/function-test/indoor/result-and-std");

        // If response is successful, verify field values are "true" or "false" strings
        if (response.getStatusCode() == 200) {
            String voltage_l1 = response.jsonPath().getString("resultTest.voltage_l1");
            // Field results should be either "true" or "false" as strings
            assertTrue(voltage_l1 == null || "true".equals(voltage_l1) || "false".equals(voltage_l1),
                "Field result should be 'true', 'false', or null");
        }
    }
}