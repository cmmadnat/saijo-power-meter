package com.saijo.smartfactory.service;

import com.saijo.smartfactory.model.AirConditionerDetails;
import com.saijo.smartfactory.model.TestResults;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class CalorieMeterServiceTest {

    private CalorieMeterService service;

    @BeforeEach
    void setUp() {
        service = new CalorieMeterService();
    }

    @Test
    void testGenerateSuggestionWithValidData() {
        // Create test air conditioner details
        AirConditionerDetails acDetails = new AirConditionerDetails("Test Model AC-2000", "SN123456", "Inverter");
        acDetails.setCoolingCapacityBtuH(12000.0);
        acDetails.setEfficiency(3.5);
        acDetails.setCompressorType("Inverter");
        acDetails.setCompressorRpm(3600);
        acDetails.setRefrigerantType("R-410A");
        acDetails.setRefrigerantVolumeG(1200.0);

        // Create test results
        TestResults testResults = new TestResults(25.0, 35.0);
        testResults.setIndoorRoomTempWetBulbC(18.0);
        testResults.setOutdoorRoomTempWetBulbC(24.0);
        testResults.setTotalCapacityBtuH(11500.0);
        testResults.setSensibleHeatCapacityBtuH(8500.0);
        testResults.setLatentHeatCapacityBtuH(3000.0);
        testResults.setUnitPowerInputW(3500.0);
        testResults.setEfficiencyEer(3.29);
        testResults.setEvaporatorInletTempC(12.0);
        testResults.setEvaporatorOutletTempC(8.0);
        testResults.setCompressorSuctionTempC(15.0);
        testResults.setCompressorDischargeTempC(85.0);
        testResults.setCompressorSuctionPressurePsi(120.0);
        testResults.setCompressorDischargePressurePsi(350.0);

        // Generate suggestion
        String suggestion = service.generateSuggestion(acDetails, testResults);

        // Verify suggestion is generated
        assertNotNull(suggestion);
        assertFalse(suggestion.trim().isEmpty());
        assertTrue(suggestion.contains("HVAC PERFORMANCE ANALYSIS"));
        assertTrue(suggestion.contains("RECOMMENDATIONS"));
    }

    @Test
    void testGenerateSuggestionDetectsEfficiencyIssues() {
        AirConditionerDetails acDetails = new AirConditionerDetails("Test Model", "SN001", "Fix");
        acDetails.setCoolingCapacityBtuH(12000.0);
        acDetails.setEfficiency(3.5);

        TestResults testResults = new TestResults(25.0, 35.0);
        testResults.setTotalCapacityBtuH(12000.0);
        testResults.setEfficiencyEer(2.8); // Significantly below rated efficiency

        String suggestion = service.generateSuggestion(acDetails, testResults);

        assertNotNull(suggestion);
        assertTrue(suggestion.contains("EFFICIENCY CONCERN"));
        assertTrue(suggestion.contains("significantly below rated efficiency"));
    }

    @Test
    void testGenerateSuggestionDetectsCapacityIssues() {
        AirConditionerDetails acDetails = new AirConditionerDetails("Test Model", "SN002", "Fix");
        acDetails.setCoolingCapacityBtuH(12000.0);
        acDetails.setEfficiency(3.5);

        TestResults testResults = new TestResults(25.0, 35.0);
        testResults.setTotalCapacityBtuH(9000.0); // Significantly below rated capacity
        testResults.setEfficiencyEer(3.4);

        String suggestion = service.generateSuggestion(acDetails, testResults);

        assertNotNull(suggestion);
        assertTrue(suggestion.contains("CAPACITY UNDERPERFORMANCE"));
        assertTrue(suggestion.contains("below rated capacity"));
    }

    @Test
    void testGenerateSuggestionDetectsHighSuperheat() {
        AirConditionerDetails acDetails = new AirConditionerDetails("Test Model", "SN003", "Fix");
        acDetails.setEfficiency(3.5);

        TestResults testResults = new TestResults(25.0, 35.0);
        testResults.setEvaporatorOutletTempC(8.0);
        testResults.setCompressorSuctionTempC(25.0); // High superheat (17°C)

        String suggestion = service.generateSuggestion(acDetails, testResults);

        assertNotNull(suggestion);
        assertTrue(suggestion.contains("HIGH SUPERHEAT"));
        assertTrue(suggestion.contains("refrigerant undercharge"));
    }

    @Test
    void testGenerateSuggestionDetectsLowSuperheat() {
        AirConditionerDetails acDetails = new AirConditionerDetails("Test Model", "SN004", "Fix");

        TestResults testResults = new TestResults(25.0, 35.0);
        testResults.setEvaporatorOutletTempC(8.0);
        testResults.setCompressorSuctionTempC(10.0); // Low superheat (2°C)

        String suggestion = service.generateSuggestion(acDetails, testResults);

        assertNotNull(suggestion);
        assertTrue(suggestion.contains("LOW SUPERHEAT"));
        assertTrue(suggestion.contains("refrigerant overcharge"));
    }

    @Test
    void testGenerateSuggestionDetectsHighCompressionRatio() {
        AirConditionerDetails acDetails = new AirConditionerDetails("Test Model", "SN005", "Fix");

        TestResults testResults = new TestResults(25.0, 35.0);
        testResults.setCompressorSuctionPressurePsi(100.0);
        testResults.setCompressorDischargePressurePsi(500.0); // High compression ratio (5.0)

        String suggestion = service.generateSuggestion(acDetails, testResults);

        assertNotNull(suggestion);
        assertTrue(suggestion.contains("HIGH COMPRESSION RATIO"));
        assertTrue(suggestion.contains("condensing temperature"));
    }

    @Test
    void testGenerateSuggestionWithGoodPerformance() {
        AirConditionerDetails acDetails = new AirConditionerDetails("Efficient Model", "SN006", "Inverter");
        acDetails.setCoolingCapacityBtuH(12000.0);
        acDetails.setEfficiency(3.5);

        TestResults testResults = new TestResults(25.0, 35.0);
        testResults.setTotalCapacityBtuH(12200.0);
        testResults.setEfficiencyEer(3.48); // Good efficiency
        testResults.setEvaporatorOutletTempC(8.0);
        testResults.setCompressorSuctionTempC(16.0); // Good superheat (8°C)
        testResults.setCompressorSuctionPressurePsi(120.0);
        testResults.setCompressorDischargePressurePsi(350.0); // Good compression ratio (2.92)

        String suggestion = service.generateSuggestion(acDetails, testResults);

        assertNotNull(suggestion);
        assertTrue(suggestion.contains("Performance meets expectations"));
    }

    @Test
    void testGenerateSuggestionWithNullValues() {
        AirConditionerDetails acDetails = new AirConditionerDetails("Test Model", "SN007", "Fix");
        TestResults testResults = new TestResults();

        String suggestion = service.generateSuggestion(acDetails, testResults);

        assertNotNull(suggestion);
        assertFalse(suggestion.trim().isEmpty());
        assertTrue(suggestion.contains("GENERAL RECOMMENDATIONS"));
    }

    @Test
    void testGenerateSuggestionHandlesExceptions() {
        // Test with empty AC details to trigger exception
        AirConditionerDetails acDetails = new AirConditionerDetails();
        TestResults testResults = new TestResults();
        
        String suggestion = service.generateSuggestion(acDetails, testResults);

        assertNotNull(suggestion);
        // Should still generate a suggestion even with minimal data
        assertTrue(suggestion.contains("GENERAL RECOMMENDATIONS"));
    }
}