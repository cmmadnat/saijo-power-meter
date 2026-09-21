package com.saijo.smartfactory.service;

import com.saijo.smartfactory.model.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class EMCServiceTest {

    private EMCService service;

    @BeforeEach
    void setUp() {
        service = new EMCService();
    }

    @Test
    void testGenerateSuggestionWithValidData() {
        // Create test EMC details
        EmiFilter indoorFilter = new EmiFilter(1.5, 0.22, 0.47, 2.2, 4.7);
        EmiFilter outdoorFilter = new EmiFilter(2.2, 0.33, 0.68, 3.3, 6.8);
        
        FerriteCorePosition core1 = new FerriteCorePosition("Ferrite core 1", "NiZn ferrite");
        core1.setDiameter(13.0);
        core1.setThickness(6.35);
        core1.setLength(28.7);
        core1.setNumberOfTurns(3);
        
        List<FerriteCorePosition> cores = Arrays.asList(core1);
        
        EMCDetails emcDetails = new EMCDetails(indoorFilter, outdoorFilter, cores);
        
        // Create test result
        EMCTestResult testResult = new EMCTestResult(
            "EN 55014-1:2006 CONDUCTED EMISSION",
            "Main port",
            "Neutral to Ground",
            "https://example.com/test-result.pdf"
        );

        // Generate suggestion
        String suggestion = service.generateSuggestion(emcDetails, testResult);

        // Verify suggestion is generated
        assertNotNull(suggestion);
        assertFalse(suggestion.trim().isEmpty());
        assertTrue(suggestion.contains("EMC COMPLIANCE ANALYSIS"));
        assertTrue(suggestion.contains("GENERAL EMC RECOMMENDATIONS"));
        assertTrue(suggestion.contains("EN 55014-1:2006"));
    }

    @Test
    void testGenerateSuggestionDetectsLowCommonModeCapacitance() {
        EmiFilter indoorFilter = new EmiFilter(1.5, 0.22, 0.47, 1.0, 1.0); // Low CY values
        EMCDetails emcDetails = new EMCDetails();
        emcDetails.setIndoorEmiFilter(indoorFilter);
        
        EMCTestResult testResult = new EMCTestResult(
            "EN 55014-1:2006 CONDUCTED EMISSION",
            "Main port",
            "Neutral to Ground",
            "https://example.com/test-result.pdf"
        );

        String suggestion = service.generateSuggestion(emcDetails, testResult);

        assertNotNull(suggestion);
        assertTrue(suggestion.contains("Common Mode Suppression"));
        assertTrue(suggestion.contains("may be insufficient"));
        assertTrue(suggestion.contains("increasing CY values"));
    }

    @Test
    void testGenerateSuggestionDetectsHighDifferentialModeCapacitance() {
        EmiFilter indoorFilter = new EmiFilter(1.5, 0.8, 0.8, 2.2, 4.7); // High CX values
        EMCDetails emcDetails = new EMCDetails();
        emcDetails.setIndoorEmiFilter(indoorFilter);
        
        EMCTestResult testResult = new EMCTestResult(
            "EN 55014-1:2006 CONDUCTED EMISSION",
            "Main port",
            "Line to Neutral",
            "https://example.com/test-result.pdf"
        );

        String suggestion = service.generateSuggestion(emcDetails, testResult);

        assertNotNull(suggestion);
        assertTrue(suggestion.contains("Differential Mode Suppression"));
        assertTrue(suggestion.contains("excessive leakage current"));
        assertTrue(suggestion.contains("IEC 60335-1"));
    }

    @Test
    void testGenerateSuggestionDetectsLowInductance() {
        EmiFilter indoorFilter = new EmiFilter(0.5, 0.22, 0.47, 2.2, 4.7); // Low inductance
        EMCDetails emcDetails = new EMCDetails();
        emcDetails.setIndoorEmiFilter(indoorFilter);
        
        EMCTestResult testResult = new EMCTestResult(
            "EN 55014-1:2006 CONDUCTED EMISSION",
            "Main port",
            "Neutral to Ground",
            "https://example.com/test-result.pdf"
        );

        String suggestion = service.generateSuggestion(emcDetails, testResult);

        assertNotNull(suggestion);
        assertTrue(suggestion.contains("Inductive Filtering"));
        assertTrue(suggestion.contains("insufficient high-frequency attenuation"));
        assertTrue(suggestion.contains("2.2µH or higher"));
    }

    @Test
    void testGenerateSuggestionAnalyzesFerriteCoreTypes() {
        FerriteCorePosition nizn = new FerriteCorePosition("Ferrite core 1", "NiZn ferrite");
        FerriteCorePosition mnzn = new FerriteCorePosition("Ferrite core 2", "MnZn ferrite");
        
        List<FerriteCorePosition> cores = Arrays.asList(nizn, mnzn);
        
        EMCDetails emcDetails = new EMCDetails();
        emcDetails.setFerriteCorePositions(cores);
        
        EMCTestResult testResult = new EMCTestResult(
            "EN 55014-1:2006 CONDUCTED EMISSION",
            "Main port",
            "Neutral to Ground",
            "https://example.com/test-result.pdf"
        );

        String suggestion = service.generateSuggestion(emcDetails, testResult);

        assertNotNull(suggestion);
        assertTrue(suggestion.contains("FERRITE CORE OPTIMIZATION"));
        assertTrue(suggestion.contains("NiZn ferrite suitable for high-frequency"));
        assertTrue(suggestion.contains("MnZn ferrite effective for low-frequency"));
    }

    @Test
    void testGenerateSuggestionDetectsLowTurnCount() {
        FerriteCorePosition core = new FerriteCorePosition("Ferrite core 1", "NiZn ferrite");
        core.setNumberOfTurns(2); // Low turn count
        
        List<FerriteCorePosition> cores = Arrays.asList(core);
        
        EMCDetails emcDetails = new EMCDetails();
        emcDetails.setFerriteCorePositions(cores);
        
        EMCTestResult testResult = new EMCTestResult(
            "EN 55014-1:2006 CONDUCTED EMISSION",
            "Main port",
            "Neutral to Ground",
            "https://example.com/test-result.pdf"
        );

        String suggestion = service.generateSuggestion(emcDetails, testResult);

        assertNotNull(suggestion);
        assertTrue(suggestion.contains("Low turn count"));
        assertTrue(suggestion.contains("limit suppression effectiveness"));
        assertTrue(suggestion.contains("3-5 turns typically optimal"));
    }

    @Test
    void testGenerateSuggestionDetectsHighTurnCount() {
        FerriteCorePosition core = new FerriteCorePosition("Ferrite core 1", "NiZn ferrite");
        core.setNumberOfTurns(8); // High turn count
        
        List<FerriteCorePosition> cores = Arrays.asList(core);
        
        EMCDetails emcDetails = new EMCDetails();
        emcDetails.setFerriteCorePositions(cores);
        
        EMCTestResult testResult = new EMCTestResult(
            "EN 55014-1:2006 CONDUCTED EMISSION",
            "Main port",
            "Neutral to Ground",
            "https://example.com/test-result.pdf"
        );

        String suggestion = service.generateSuggestion(emcDetails, testResult);

        assertNotNull(suggestion);
        assertTrue(suggestion.contains("High turn count"));
        assertTrue(suggestion.contains("parasitic resonance"));
        assertTrue(suggestion.contains("resonant peaks"));
    }

    @Test
    void testGenerateSuggestionAnalyzesTestConfiguration() {
        EMCDetails emcDetails = new EMCDetails();
        
        // Test Neutral to Ground configuration
        EMCTestResult neutralGroundTest = new EMCTestResult(
            "EN 55014-1:2006 CONDUCTED EMISSION",
            "Main port",
            "Neutral to Ground",
            "https://example.com/test-result.pdf"
        );

        String suggestion1 = service.generateSuggestion(emcDetails, neutralGroundTest);
        assertTrue(suggestion1.contains("common-mode emissions"));
        assertTrue(suggestion1.contains("CY capacitor effectiveness"));

        // Test Line to Neutral configuration
        EMCTestResult lineNeutralTest = new EMCTestResult(
            "EN 55014-1:2006 CONDUCTED EMISSION",
            "Main port",
            "Line to Neutral",
            "https://example.com/test-result.pdf"
        );

        String suggestion2 = service.generateSuggestion(emcDetails, lineNeutralTest);
        assertTrue(suggestion2.contains("differential-mode emissions"));
        assertTrue(suggestion2.contains("CX capacitor"));
    }

    @Test
    void testGenerateSuggestionWithMinimalData() {
        EMCDetails emcDetails = new EMCDetails();
        EMCTestResult testResult = new EMCTestResult();
        testResult.setTestStandard("Basic EMC Test");

        String suggestion = service.generateSuggestion(emcDetails, testResult);

        assertNotNull(suggestion);
        assertFalse(suggestion.trim().isEmpty());
        assertTrue(suggestion.contains("GENERAL EMC RECOMMENDATIONS"));
    }

    @Test
    void testGenerateSuggestionHandlesException() {
        // Test with empty objects to ensure graceful handling
        EMCDetails emcDetails = new EMCDetails();
        EMCTestResult testResult = new EMCTestResult();

        String suggestion = service.generateSuggestion(emcDetails, testResult);

        assertNotNull(suggestion);
        assertFalse(suggestion.trim().isEmpty());
        assertTrue(suggestion.contains("EMC COMPLIANCE ANALYSIS"));
    }
}