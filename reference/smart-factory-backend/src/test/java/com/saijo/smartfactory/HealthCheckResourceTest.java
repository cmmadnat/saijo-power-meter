package com.saijo.smartfactory;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.CoreMatchers.is;

@QuarkusTest
public class HealthCheckResourceTest {

    @Test
    public void testHealthEndpoint() {
        given()
            .when().get("/api/v1/health")
            .then()
                .statusCode(200)
                .body("status", is("UP"));
    }
}