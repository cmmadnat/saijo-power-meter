package com.saijo.smartfactory.service;

import com.saijo.smartfactory.model.AirConditionerDetails;
import com.saijo.smartfactory.model.TestResults;
import jakarta.enterprise.context.ApplicationScoped;
import org.jboss.logging.Logger;

@ApplicationScoped
public class CalorieMeterService {
    
    private static final Logger LOG = Logger.getLogger(CalorieMeterService.class);
    
    // System prompt for LLM to act as HVAC expert
    private static final String SYSTEM_PROMPT = 
        "You are an expert HVAC engineer with deep knowledge of air conditioning systems, " +
        "thermodynamics, and energy efficiency. Your role is to analyze test data from calorie meter " +
        "room testing and provide specific, actionable suggestions to improve performance.\n\n" +
        
        "When analyzing the data, consider these key areas:\n" +
        "1. Energy efficiency (EER, power consumption vs cooling capacity)\n" +
        "2. Temperature differentials and heat transfer effectiveness\n" +
        "3. Refrigeration cycle performance (pressures, temperatures)\n" +
        "4. Component specifications vs actual performance\n" +
        "5. Environmental conditions impact\n\n" +
        
        "Provide concise, technical recommendations focusing on:\n" +
        "- Performance optimization opportunities\n" +
        "- Potential component adjustments\n" +
        "- Energy efficiency improvements\n" +
        "- Any anomalies or concerns in the test results\n\n" +
        
        "Format your response as a professional engineering assessment with specific, " +
        "implementable recommendations.";
    
    public String generateSuggestion(AirConditionerDetails acDetails, TestResults testResults) {
        LOG.info("Generating calorie meter suggestion for AC model: " + acDetails.getModelName());
        
        try {
            // Format the input data for LLM analysis
            String formattedInput = formatDataForAnalysis(acDetails, testResults);
            
            // For MVP implementation, return a structured analysis based on key metrics
            // In production, this would call an actual LLM API
            return generateMockSuggestion(acDetails, testResults, formattedInput);
            
        } catch (Exception e) {
            LOG.error("Error generating calorie meter suggestion", e);
            return "Unable to generate suggestion at this time. Please ensure all test data is complete and try again.";
        }
    }
    
    private String formatDataForAnalysis(AirConditionerDetails acDetails, TestResults testResults) {
        StringBuilder sb = new StringBuilder();
        
        sb.append("=== AIR CONDITIONER SPECIFICATIONS ===\n");
        sb.append("Model: ").append(acDetails.getModelName()).append("\n");
        sb.append("Serial Number: ").append(acDetails.getSerialNumber()).append("\n");
        sb.append("Type: ").append(acDetails.getAcType()).append("\n");
        sb.append("Cooling Capacity: ").append(acDetails.getCoolingCapacityBtuH()).append(" BTU/h\n");
        sb.append("Rated Efficiency: ").append(acDetails.getEfficiency()).append("\n");
        sb.append("Compressor Type: ").append(acDetails.getCompressorType()).append("\n");
        sb.append("Compressor RPM: ").append(acDetails.getCompressorRpm()).append("\n");
        sb.append("Refrigerant Type: ").append(acDetails.getRefrigerantType()).append("\n");
        sb.append("Refrigerant Volume: ").append(acDetails.getRefrigerantVolumeG()).append(" g\n");
        
        sb.append("\n=== TEST RESULTS ===\n");
        sb.append("Indoor Temp (Dry Bulb): ").append(testResults.getIndoorRoomTempDryBulbC()).append("°C\n");
        sb.append("Indoor Temp (Wet Bulb): ").append(testResults.getIndoorRoomTempWetBulbC()).append("°C\n");
        sb.append("Outdoor Temp (Dry Bulb): ").append(testResults.getOutdoorRoomTempDryBulbC()).append("°C\n");
        sb.append("Outdoor Temp (Wet Bulb): ").append(testResults.getOutdoorRoomTempWetBulbC()).append("°C\n");
        
        sb.append("\n=== CAPACITY & EFFICIENCY ===\n");
        sb.append("Total Capacity: ").append(testResults.getTotalCapacityBtuH()).append(" BTU/h\n");
        sb.append("Sensible Heat Capacity: ").append(testResults.getSensibleHeatCapacityBtuH()).append(" BTU/h\n");
        sb.append("Latent Heat Capacity: ").append(testResults.getLatentHeatCapacityBtuH()).append(" BTU/h\n");
        sb.append("Power Input: ").append(testResults.getUnitPowerInputW()).append(" W\n");
        sb.append("Measured EER: ").append(testResults.getEfficiencyEer()).append("\n");
        
        sb.append("\n=== REFRIGERATION CYCLE ===\n");
        sb.append("Evaporator Inlet: ").append(testResults.getEvaporatorInletTempC()).append("°C\n");
        sb.append("Evaporator Outlet: ").append(testResults.getEvaporatorOutletTempC()).append("°C\n");
        sb.append("Compressor Suction: ").append(testResults.getCompressorSuctionTempC()).append("°C\n");
        sb.append("Compressor Discharge: ").append(testResults.getCompressorDischargeTempC()).append("°C\n");
        sb.append("Suction Pressure: ").append(testResults.getCompressorSuctionPressurePsi()).append(" PSI\n");
        sb.append("Discharge Pressure: ").append(testResults.getCompressorDischargePressurePsi()).append(" PSI\n");
        
        return sb.toString();
    }
    
    private String generateMockSuggestion(AirConditionerDetails acDetails, TestResults testResults, String formattedData) {
        StringBuilder suggestion = new StringBuilder();
        
        suggestion.append("=== HVAC PERFORMANCE ANALYSIS ===\n\n");
        
        // Efficiency Analysis
        if (testResults.getEfficiencyEer() != null && acDetails.getEfficiency() != null) {
            double eerRatio = testResults.getEfficiencyEer() / acDetails.getEfficiency();
            if (eerRatio < 0.9) {
                suggestion.append("⚠️ EFFICIENCY CONCERN: Measured EER (")
                    .append(String.format("%.2f", testResults.getEfficiencyEer()))
                    .append(") is significantly below rated efficiency (")
                    .append(String.format("%.2f", acDetails.getEfficiency()))
                    .append("). Recommendation: Check refrigerant levels, coil cleanliness, and airflow.\n\n");
            } else if (eerRatio >= 0.95) {
                suggestion.append("✅ EFFICIENCY: Performance meets expectations (")
                    .append(String.format("%.1f%%", eerRatio * 100))
                    .append(" of rated efficiency).\n\n");
            }
        }
        
        // Capacity Analysis
        if (testResults.getTotalCapacityBtuH() != null && acDetails.getCoolingCapacityBtuH() != null) {
            double capacityRatio = testResults.getTotalCapacityBtuH() / acDetails.getCoolingCapacityBtuH();
            if (capacityRatio < 0.85) {
                suggestion.append("⚠️ CAPACITY UNDERPERFORMANCE: Actual capacity (")
                    .append(String.format("%.0f", testResults.getTotalCapacityBtuH()))
                    .append(" BTU/h) is below rated capacity (")
                    .append(String.format("%.0f", acDetails.getCoolingCapacityBtuH()))
                    .append(" BTU/h). Investigate system restrictions or refrigerant issues.\n\n");
            }
        }
        
        // Temperature Analysis
        if (testResults.getCompressorSuctionTempC() != null && testResults.getEvaporatorOutletTempC() != null) {
            double superheat = testResults.getCompressorSuctionTempC() - testResults.getEvaporatorOutletTempC();
            if (superheat > 15) {
                suggestion.append("⚠️ HIGH SUPERHEAT: Measured superheat of ")
                    .append(String.format("%.1f°C", superheat))
                    .append(" indicates potential refrigerant undercharge or restriction.\n\n");
            } else if (superheat < 5) {
                suggestion.append("⚠️ LOW SUPERHEAT: Measured superheat of ")
                    .append(String.format("%.1f°C", superheat))
                    .append(" may indicate refrigerant overcharge or expansion valve issues.\n\n");
            }
        }
        
        // Pressure Analysis
        if (testResults.getCompressorSuctionPressurePsi() != null && testResults.getCompressorDischargePressurePsi() != null) {
            double compressionRatio = testResults.getCompressorDischargePressurePsi() / testResults.getCompressorSuctionPressurePsi();
            if (compressionRatio > 4.5) {
                suggestion.append("⚠️ HIGH COMPRESSION RATIO: Ratio of ")
                    .append(String.format("%.2f", compressionRatio))
                    .append(" suggests high condensing temperature or low evaporating temperature. Check condenser airflow and ambient conditions.\n\n");
            }
        }
        
        // General Recommendations
        suggestion.append("=== GENERAL RECOMMENDATIONS ===\n");
        suggestion.append("• Verify refrigerant charge using manufacturer specifications\n");
        suggestion.append("• Inspect and clean evaporator and condenser coils\n");
        suggestion.append("• Check airflow rates and verify ductwork integrity\n");
        suggestion.append("• Validate expansion valve operation and adjustment\n");
        suggestion.append("• Monitor system performance under varying load conditions\n");
        
        return suggestion.toString();
    }
}