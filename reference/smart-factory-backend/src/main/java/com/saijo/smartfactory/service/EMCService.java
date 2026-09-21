package com.saijo.smartfactory.service;

import com.saijo.smartfactory.model.EMCDetails;
import com.saijo.smartfactory.model.EMCTestResult;
import com.saijo.smartfactory.model.EmiFilter;
import com.saijo.smartfactory.model.FerriteCorePosition;
import jakarta.enterprise.context.ApplicationScoped;
import org.jboss.logging.Logger;

@ApplicationScoped
public class EMCService {
    
    private static final Logger LOG = Logger.getLogger(EMCService.class);
    
    // System prompt for LLM to act as EMC expert
    private static final String SYSTEM_PROMPT = 
        "You are an expert EMC (Electromagnetic Compliance) engineer with deep knowledge of " +
        "electromagnetic interference (EMI) filtering, conducted emissions, and regulatory compliance. " +
        "Your role is to analyze EMC test data and provide specific, actionable suggestions to improve " +
        "electromagnetic performance and ensure compliance with international standards.\n\n" +
        
        "When analyzing the data, consider these key areas:\n" +
        "1. Conducted emission levels vs regulatory limits (EN 55014-1, FCC Part 15, etc.)\n" +
        "2. EMI filter component values and effectiveness\n" +
        "3. Ferrite core positioning and material selection\n" +
        "4. Common mode vs differential mode suppression\n" +
        "5. Frequency domain analysis and resonance points\n\n" +
        
        "Provide concise, technical recommendations focusing on:\n" +
        "- Filter component optimization (L, Cx, Cy values)\n" +
        "- Ferrite core improvements (material, size, turns)\n" +
        "- PCB layout and grounding suggestions\n" +
        "- Compliance margin analysis\n" +
        "- Cost-effective improvement strategies\n\n" +
        
        "Format your response as a professional EMC engineering assessment with specific, " +
        "implementable recommendations for regulatory compliance.";
    
    public String generateSuggestion(EMCDetails emcDetails, EMCTestResult testResult) {
        LOG.info("Generating EMC suggestion for test: " + testResult.getTestStandard());
        
        try {
            // Format the input data for LLM analysis
            String formattedInput = formatDataForAnalysis(emcDetails, testResult);
            
            // For MVP implementation, return a structured analysis based on EMC principles
            // In production, this would call an actual LLM API
            return generateMockSuggestion(emcDetails, testResult, formattedInput);
            
        } catch (Exception e) {
            LOG.error("Error generating EMC suggestion", e);
            return "Unable to generate EMC suggestion at this time. Please ensure all test data is complete and try again.";
        }
    }
    
    private String formatDataForAnalysis(EMCDetails emcDetails, EMCTestResult testResult) {
        StringBuilder sb = new StringBuilder();
        
        sb.append("=== EMC TEST CONFIGURATION ===\n");
        sb.append("Test Standard: ").append(testResult.getTestStandard()).append("\n");
        sb.append("Measuring Point: ").append(testResult.getMeasuringPoint()).append("\n");
        sb.append("Test Phase: ").append(testResult.getPhase()).append("\n");
        sb.append("Test Result File: ").append(testResult.getTestResultFile()).append("\n");
        
        if (emcDetails.getIndoorEmiFilter() != null) {
            EmiFilter indoorFilter = emcDetails.getIndoorEmiFilter();
            sb.append("\n=== INDOOR UNIT EMI FILTER ===\n");
            sb.append("L1 Inductance: ").append(indoorFilter.getL1Uh()).append(" µH\n");
            sb.append("CX1 Capacitance: ").append(indoorFilter.getCx1Uf()).append(" µF\n");
            sb.append("CX2 Capacitance: ").append(indoorFilter.getCx2Uf()).append(" µF\n");
            sb.append("CY1 Capacitance: ").append(indoorFilter.getCy1Uf()).append(" µF\n");
            sb.append("CY2 Capacitance: ").append(indoorFilter.getCy2Uf()).append(" µF\n");
        }
        
        if (emcDetails.getOutdoorEmiFilter() != null) {
            EmiFilter outdoorFilter = emcDetails.getOutdoorEmiFilter();
            sb.append("\n=== OUTDOOR UNIT EMI FILTER ===\n");
            sb.append("L1 Inductance: ").append(outdoorFilter.getL1Uh()).append(" µH\n");
            sb.append("CX1 Capacitance: ").append(outdoorFilter.getCx1Uf()).append(" µF\n");
            sb.append("CX2 Capacitance: ").append(outdoorFilter.getCx2Uf()).append(" µF\n");
            sb.append("CY1 Capacitance: ").append(outdoorFilter.getCy1Uf()).append(" µF\n");
            sb.append("CY2 Capacitance: ").append(outdoorFilter.getCy2Uf()).append(" µF\n");
        }
        
        if (emcDetails.getFerriteCorePositions() != null && !emcDetails.getFerriteCorePositions().isEmpty()) {
            sb.append("\n=== FERRITE CORE CONFIGURATIONS ===\n");
            for (int i = 0; i < emcDetails.getFerriteCorePositions().size(); i++) {
                FerriteCorePosition core = emcDetails.getFerriteCorePositions().get(i);
                sb.append("Position ").append(i + 1).append(": ").append(core.getName()).append("\n");
                sb.append("  Material: ").append(core.getMaterial()).append("\n");
                sb.append("  Diameter: ").append(core.getDiameter()).append(" mm\n");
                sb.append("  Thickness: ").append(core.getThickness()).append(" mm\n");
                sb.append("  Length: ").append(core.getLength()).append(" mm\n");
                sb.append("  Turns: ").append(core.getNumberOfTurns()).append("\n");
            }
        }
        
        return sb.toString();
    }
    
    private String generateMockSuggestion(EMCDetails emcDetails, EMCTestResult testResult, String formattedData) {
        StringBuilder suggestion = new StringBuilder();
        
        suggestion.append("=== EMC COMPLIANCE ANALYSIS ===\n\n");
        
        // Test Standard Analysis
        if (testResult.getTestStandard() != null && testResult.getTestStandard().contains("EN 55014-1")) {
            suggestion.append("📋 REGULATORY COMPLIANCE: Testing per EN 55014-1:2006 for conducted emissions\n");
            suggestion.append("   Frequency Range: 150 kHz - 30 MHz\n");
            suggestion.append("   Limit Class: B (residential use) - stricter limits apply\n\n");
        }
        
        // EMI Filter Analysis
        if (emcDetails.getIndoorEmiFilter() != null) {
            EmiFilter filter = emcDetails.getIndoorEmiFilter();
            suggestion.append("🔧 INDOOR EMI FILTER ANALYSIS:\n");
            
            // Common Mode Analysis
            if (filter.getCy1Uf() != null && filter.getCy2Uf() != null) {
                double totalCy = filter.getCy1Uf() + filter.getCy2Uf();
                if (totalCy < 4.7) {
                    suggestion.append("⚠️  Common Mode Suppression: Total CY capacitance (")
                        .append(String.format("%.1f", totalCy))
                        .append("µF) may be insufficient for low-frequency EMI suppression.\n")
                        .append("   Recommendation: Consider increasing CY values to 2.2µF each for improved performance.\n");
                } else {
                    suggestion.append("✅ Common Mode Suppression: CY capacitance values adequate (")
                        .append(String.format("%.1f", totalCy)).append("µF total).\n");
                }
            }
            
            // Differential Mode Analysis
            if (filter.getCx1Uf() != null && filter.getCx2Uf() != null) {
                double totalCx = filter.getCx1Uf() + filter.getCx2Uf();
                if (totalCx > 1.0) {
                    suggestion.append("⚠️  Differential Mode Suppression: High CX capacitance (")
                        .append(String.format("%.2f", totalCx))
                        .append("µF) may cause excessive leakage current.\n")
                        .append("   Recommendation: Verify compliance with IEC 60335-1 leakage current limits.\n");
                }
            }
            
            // Inductance Analysis
            if (filter.getL1Uh() != null) {
                if (filter.getL1Uh() < 1.0) {
                    suggestion.append("⚠️  Inductive Filtering: Low inductance value (")
                        .append(String.format("%.1f", filter.getL1Uh()))
                        .append("µH) may provide insufficient high-frequency attenuation.\n")
                        .append("   Recommendation: Consider 2.2µH or higher for better EMI suppression.\n");
                }
            }
            suggestion.append("\n");
        }
        
        // Ferrite Core Analysis
        if (emcDetails.getFerriteCorePositions() != null && !emcDetails.getFerriteCorePositions().isEmpty()) {
            suggestion.append("🧲 FERRITE CORE OPTIMIZATION:\n");
            for (FerriteCorePosition core : emcDetails.getFerriteCorePositions()) {
                if (core.getMaterial() != null) {
                    if (core.getMaterial().contains("NiZn")) {
                        suggestion.append("✅ ").append(core.getName()).append(": NiZn ferrite suitable for high-frequency suppression (>1MHz).\n");
                    } else if (core.getMaterial().contains("MnZn")) {
                        suggestion.append("📋 ").append(core.getName()).append(": MnZn ferrite effective for low-frequency range (<1MHz).\n");
                        suggestion.append("   Note: Verify core doesn't saturate at operating power levels.\n");
                    }
                }
                
                if (core.getNumberOfTurns() != null) {
                    if (core.getNumberOfTurns() < 3) {
                        suggestion.append("⚠️  ").append(core.getName()).append(": Low turn count (")
                            .append(core.getNumberOfTurns())
                            .append(") may limit suppression effectiveness.\n")
                            .append("   Recommendation: 3-5 turns typically optimal for EMI suppression.\n");
                    } else if (core.getNumberOfTurns() > 6) {
                        suggestion.append("⚠️  ").append(core.getName()).append(": High turn count (")
                            .append(core.getNumberOfTurns())
                            .append(") may cause parasitic resonance.\n")
                            .append("   Recommendation: Monitor for resonant peaks in emission spectrum.\n");
                    }
                }
            }
            suggestion.append("\n");
        }
        
        // Test Configuration Analysis
        if (testResult.getPhase() != null) {
            suggestion.append("📊 TEST CONFIGURATION ANALYSIS:\n");
            if (testResult.getPhase().contains("Neutral to Ground")) {
                suggestion.append("• Phase Configuration: Neutral-to-Ground measurement captures common-mode emissions\n");
                suggestion.append("• Focus Area: CY capacitor effectiveness and chassis grounding\n");
            } else if (testResult.getPhase().contains("Line to Neutral")) {
                suggestion.append("• Phase Configuration: Line-to-Neutral measurement captures differential-mode emissions\n");
                suggestion.append("• Focus Area: CX capacitor and series inductance effectiveness\n");
            }
            suggestion.append("\n");
        }
        
        // General EMC Recommendations
        suggestion.append("=== GENERAL EMC RECOMMENDATIONS ===\n");
        suggestion.append("• Verify all filter components are rated for operating voltage and temperature\n");
        suggestion.append("• Ensure proper PCB layout with continuous ground plane under EMI filter\n");
        suggestion.append("• Keep high-current switching traces away from sensitive analog circuits\n");
        suggestion.append("• Consider additional shielding for frequencies above 1 GHz if required\n");
        suggestion.append("• Validate compliance across full operating voltage and temperature range\n");
        suggestion.append("• Document filter component tolerances and aging effects on performance\n");
        
        return suggestion.toString();
    }
}