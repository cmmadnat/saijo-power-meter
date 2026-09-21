package com.saijo.smartfactory.model;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class EMCModelsTest {

    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());
    }

    @Test
    void testEmiFilterSerializationDeserialization() throws Exception {
        // Create test data
        EmiFilter original = new EmiFilter(1.5, 0.22, 0.47, 2.2, 4.7);

        // Serialize to JSON
        String json = objectMapper.writeValueAsString(original);
        assertNotNull(json);
        assertTrue(json.contains("l1_uh"));
        assertTrue(json.contains("1.5"));
        assertTrue(json.contains("cx1_uf"));
        assertTrue(json.contains("0.22"));

        // Deserialize from JSON
        EmiFilter deserialized = objectMapper.readValue(json, EmiFilter.class);
        
        // Verify fields
        assertEquals(original.getL1Uh(), deserialized.getL1Uh());
        assertEquals(original.getCx1Uf(), deserialized.getCx1Uf());
        assertEquals(original.getCx2Uf(), deserialized.getCx2Uf());
        assertEquals(original.getCy1Uf(), deserialized.getCy1Uf());
        assertEquals(original.getCy2Uf(), deserialized.getCy2Uf());
    }

    @Test
    void testFerriteCorePositionSerializationDeserialization() throws Exception {
        // Create test data
        FerriteCorePosition original = new FerriteCorePosition("Ferrite core 1", "NiZn ferrite");
        original.setDiameter(13.0);
        original.setThickness(6.35);
        original.setLength(28.7);
        original.setNumberOfTurns(3);

        // Serialize to JSON
        String json = objectMapper.writeValueAsString(original);
        assertNotNull(json);
        assertTrue(json.contains("name"));
        assertTrue(json.contains("Ferrite core 1"));
        assertTrue(json.contains("material"));
        assertTrue(json.contains("NiZn ferrite"));
        assertTrue(json.contains("number_of_turns"));
        assertTrue(json.contains("3"));

        // Deserialize from JSON
        FerriteCorePosition deserialized = objectMapper.readValue(json, FerriteCorePosition.class);
        
        // Verify fields
        assertEquals(original.getName(), deserialized.getName());
        assertEquals(original.getMaterial(), deserialized.getMaterial());
        assertEquals(original.getDiameter(), deserialized.getDiameter());
        assertEquals(original.getThickness(), deserialized.getThickness());
        assertEquals(original.getLength(), deserialized.getLength());
        assertEquals(original.getNumberOfTurns(), deserialized.getNumberOfTurns());
    }

    @Test
    void testEMCDetailsSerializationDeserialization() throws Exception {
        // Create test data
        EmiFilter indoorFilter = new EmiFilter(1.5, 0.22, 0.47, 2.2, 4.7);
        EmiFilter outdoorFilter = new EmiFilter(2.2, 0.33, 0.68, 3.3, 6.8);
        
        FerriteCorePosition core1 = new FerriteCorePosition("Ferrite core 1", "NiZn ferrite");
        core1.setDiameter(13.0);
        core1.setNumberOfTurns(3);
        
        FerriteCorePosition core2 = new FerriteCorePosition("Ferrite core 2", "MnZn ferrite");
        core2.setDiameter(20.0);
        core2.setNumberOfTurns(5);
        
        List<FerriteCorePosition> cores = Arrays.asList(core1, core2);
        
        EMCDetails original = new EMCDetails(indoorFilter, outdoorFilter, cores);

        // Serialize to JSON
        String json = objectMapper.writeValueAsString(original);
        assertNotNull(json);
        assertTrue(json.contains("indoor_emi_filter"));
        assertTrue(json.contains("outdoor_emi_filter"));
        assertTrue(json.contains("ferrite_core_positions"));
        assertTrue(json.contains("Ferrite core 1"));

        // Deserialize from JSON
        EMCDetails deserialized = objectMapper.readValue(json, EMCDetails.class);
        
        // Verify fields
        assertNotNull(deserialized.getIndoorEmiFilter());
        assertNotNull(deserialized.getOutdoorEmiFilter());
        assertNotNull(deserialized.getFerriteCorePositions());
        assertEquals(2, deserialized.getFerriteCorePositions().size());
        
        // Verify nested objects
        assertEquals(original.getIndoorEmiFilter().getL1Uh(), deserialized.getIndoorEmiFilter().getL1Uh());
        assertEquals(original.getOutdoorEmiFilter().getCx1Uf(), deserialized.getOutdoorEmiFilter().getCx1Uf());
        assertEquals("Ferrite core 1", deserialized.getFerriteCorePositions().get(0).getName());
        assertEquals("Ferrite core 2", deserialized.getFerriteCorePositions().get(1).getName());
    }

    @Test
    void testEMCTestResultSerializationDeserialization() throws Exception {
        // Create test data
        EMCTestResult original = new EMCTestResult(
            "EN 55014-1:2006 CONDUCTED EMISSION",
            "Main port",
            "Neutral to Ground",
            "https://example.com/test-result.pdf"
        );

        // Serialize to JSON
        String json = objectMapper.writeValueAsString(original);
        assertNotNull(json);
        assertTrue(json.contains("test_standard"));
        assertTrue(json.contains("EN 55014-1:2006 CONDUCTED EMISSION"));
        assertTrue(json.contains("measuring_point"));
        assertTrue(json.contains("Main port"));
        assertTrue(json.contains("test_result_file"));

        // Deserialize from JSON
        EMCTestResult deserialized = objectMapper.readValue(json, EMCTestResult.class);
        
        // Verify fields
        assertEquals(original.getTestStandard(), deserialized.getTestStandard());
        assertEquals(original.getMeasuringPoint(), deserialized.getMeasuringPoint());
        assertEquals(original.getPhase(), deserialized.getPhase());
        assertEquals(original.getTestResultFile(), deserialized.getTestResultFile());
    }

    @Test
    void testDefaultConstructors() {
        EmiFilter filter = new EmiFilter();
        assertNotNull(filter);
        assertNull(filter.getL1Uh());

        FerriteCorePosition core = new FerriteCorePosition();
        assertNotNull(core);
        assertNull(core.getName());

        EMCDetails details = new EMCDetails();
        assertNotNull(details);
        assertNull(details.getIndoorEmiFilter());

        EMCTestResult result = new EMCTestResult();
        assertNotNull(result);
        assertNull(result.getTestStandard());
    }
}