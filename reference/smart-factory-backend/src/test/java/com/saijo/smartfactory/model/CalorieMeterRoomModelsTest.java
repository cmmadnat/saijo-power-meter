package com.saijo.smartfactory.model;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class CalorieMeterRoomModelsTest {

    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());
    }

    @Test
    void testAirConditionerDetailsSerializationDeserialization() throws Exception {
        // Create test data
        AirConditionerDetails original = new AirConditionerDetails("Test Model", "SN123456", "Inverter");
        original.setCoolingCapacityBtuH(12000.0);
        original.setEfficiency(3.5);
        original.setFinType("Corrugated");
        original.setFinCount(120);
        original.setCompressorType("Inverter");
        original.setCompressorRpm(3600);

        // Serialize to JSON
        String json = objectMapper.writeValueAsString(original);
        assertNotNull(json);
        assertTrue(json.contains("model_name"));
        assertTrue(json.contains("Test Model"));
        assertTrue(json.contains("cooling_capacity_btu_h"));
        assertTrue(json.contains("12000"));

        // Deserialize from JSON
        AirConditionerDetails deserialized = objectMapper.readValue(json, AirConditionerDetails.class);
        
        // Verify fields
        assertEquals(original.getModelName(), deserialized.getModelName());
        assertEquals(original.getSerialNumber(), deserialized.getSerialNumber());
        assertEquals(original.getAcType(), deserialized.getAcType());
        assertEquals(original.getCoolingCapacityBtuH(), deserialized.getCoolingCapacityBtuH());
        assertEquals(original.getEfficiency(), deserialized.getEfficiency());
        assertEquals(original.getFinType(), deserialized.getFinType());
        assertEquals(original.getFinCount(), deserialized.getFinCount());
        assertEquals(original.getCompressorType(), deserialized.getCompressorType());
        assertEquals(original.getCompressorRpm(), deserialized.getCompressorRpm());
    }

    @Test
    void testTestResultsSerializationDeserialization() throws Exception {
        // Create test data
        TestResults original = new TestResults(25.0, 35.0);
        original.setIndoorRoomTempWetBulbC(18.0);
        original.setOutdoorRoomTempWetBulbC(24.0);
        original.setTotalCapacityBtuH(12000.0);
        original.setSensibleHeatCapacityBtuH(9000.0);
        original.setLatentHeatCapacityBtuH(3000.0);
        original.setUnitPowerInputW(3500.0);
        original.setEfficiencyEer(3.43);

        // Serialize to JSON
        String json = objectMapper.writeValueAsString(original);
        assertNotNull(json);
        assertTrue(json.contains("indoor_room_temp_dry_bulb_c"));
        assertTrue(json.contains("25.0"));
        assertTrue(json.contains("total_capacity_btu_h"));
        assertTrue(json.contains("12000"));

        // Deserialize from JSON
        TestResults deserialized = objectMapper.readValue(json, TestResults.class);
        
        // Verify fields
        assertEquals(original.getIndoorRoomTempDryBulbC(), deserialized.getIndoorRoomTempDryBulbC());
        assertEquals(original.getOutdoorRoomTempDryBulbC(), deserialized.getOutdoorRoomTempDryBulbC());
        assertEquals(original.getIndoorRoomTempWetBulbC(), deserialized.getIndoorRoomTempWetBulbC());
        assertEquals(original.getOutdoorRoomTempWetBulbC(), deserialized.getOutdoorRoomTempWetBulbC());
        assertEquals(original.getTotalCapacityBtuH(), deserialized.getTotalCapacityBtuH());
        assertEquals(original.getSensibleHeatCapacityBtuH(), deserialized.getSensibleHeatCapacityBtuH());
        assertEquals(original.getLatentHeatCapacityBtuH(), deserialized.getLatentHeatCapacityBtuH());
        assertEquals(original.getUnitPowerInputW(), deserialized.getUnitPowerInputW());
        assertEquals(original.getEfficiencyEer(), deserialized.getEfficiencyEer());
    }

    @Test
    void testAirConditionerDetailsDefaultConstructor() {
        AirConditionerDetails details = new AirConditionerDetails();
        assertNotNull(details);
        assertNull(details.getModelName());
        assertNull(details.getSerialNumber());
        assertNull(details.getAcType());
    }

    @Test
    void testTestResultsDefaultConstructor() {
        TestResults results = new TestResults();
        assertNotNull(results);
        assertNull(results.getIndoorRoomTempDryBulbC());
        assertNull(results.getOutdoorRoomTempDryBulbC());
    }
}