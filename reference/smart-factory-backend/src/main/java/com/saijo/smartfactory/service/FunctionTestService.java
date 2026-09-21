package com.saijo.smartfactory.service;

import com.saijo.smartfactory.FirestoreService;
import com.saijo.smartfactory.model.*;
import com.google.cloud.firestore.*;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutionException;
import java.util.logging.Logger;

@ApplicationScoped
public class FunctionTestService {
    
    private static final Logger LOGGER = Logger.getLogger(FunctionTestService.class.getName());
    private static final String INDOOR_COLLECTION = "indoor_unit_data";
    private static final String OUTDOOR_COLLECTION = "outdoor_unit_data";
    private static final String INDOOR_STD_COLLECTION = "indoor_unit_standards";
    private static final String OUTDOOR_STD_COLLECTION = "outdoor_unit_standards";
    
    @Inject
    FirestoreService firestoreService;

    // Indoor Unit Data Methods
    public IndoorUnitData getIndoorUnitModel(String serial, String item) throws ExecutionException, InterruptedException {
        Firestore db = firestoreService.getFirestore();
        
        QuerySnapshot querySnapshot = db.collection(INDOOR_COLLECTION)
            .whereEqualTo("serialNumber", serial)
            .whereEqualTo("item", item)
            .limit(1)
            .get()
            .get();
        
        if (!querySnapshot.isEmpty()) {
            DocumentSnapshot document = querySnapshot.getDocuments().get(0);
            return document.toObject(IndoorUnitData.class);
        }
        
        return null;
    }
    
    public List<IndoorUnitData> getAllIndoorUnits() throws ExecutionException, InterruptedException {
        Firestore db = firestoreService.getFirestore();
        
        QuerySnapshot querySnapshot = db.collection(INDOOR_COLLECTION)
            .orderBy("timestamp", Query.Direction.DESCENDING)
            .get()
            .get();
        
        List<IndoorUnitData> results = new ArrayList<>();
        for (DocumentSnapshot document : querySnapshot.getDocuments()) {
            results.add(document.toObject(IndoorUnitData.class));
        }
        
        return results;
    }
    
    public List<IndoorUnitData> getIndoorUnitsBySerial(String serial) throws ExecutionException, InterruptedException {
        Firestore db = firestoreService.getFirestore();
        
        QuerySnapshot querySnapshot = db.collection(INDOOR_COLLECTION)
            .whereEqualTo("serialNumber", serial)
            .orderBy("timestamp", Query.Direction.DESCENDING)
            .get()
            .get();
        
        List<IndoorUnitData> results = new ArrayList<>();
        for (DocumentSnapshot document : querySnapshot.getDocuments()) {
            results.add(document.toObject(IndoorUnitData.class));
        }
        
        return results;
    }
    
    public List<IndoorUnitData> getIndoorUnitsByDateRange(String startDate, String endDate) throws ExecutionException, InterruptedException {
        Firestore db = firestoreService.getFirestore();
        
        LocalDateTime start = LocalDate.parse(startDate).atStartOfDay();
        LocalDateTime end = LocalDate.parse(endDate).atTime(23, 59, 59);
        
        QuerySnapshot querySnapshot = db.collection(INDOOR_COLLECTION)
            .whereGreaterThanOrEqualTo("timestamp", start)
            .whereLessThanOrEqualTo("timestamp", end)
            .orderBy("timestamp", Query.Direction.DESCENDING)
            .get()
            .get();
        
        List<IndoorUnitData> results = new ArrayList<>();
        for (DocumentSnapshot document : querySnapshot.getDocuments()) {
            results.add(document.toObject(IndoorUnitData.class));
        }
        
        return results;
    }

    // Outdoor Unit Data Methods
    public OutdoorUnitData getOutdoorUnitModel(String serial, String item) throws ExecutionException, InterruptedException {
        Firestore db = firestoreService.getFirestore();
        
        QuerySnapshot querySnapshot = db.collection(OUTDOOR_COLLECTION)
            .whereEqualTo("serialNumber", serial)
            .whereEqualTo("item", item)
            .limit(1)
            .get()
            .get();
        
        if (!querySnapshot.isEmpty()) {
            DocumentSnapshot document = querySnapshot.getDocuments().get(0);
            return document.toObject(OutdoorUnitData.class);
        }
        
        return null;
    }
    
    public List<OutdoorUnitData> getAllOutdoorUnits() throws ExecutionException, InterruptedException {
        Firestore db = firestoreService.getFirestore();
        
        QuerySnapshot querySnapshot = db.collection(OUTDOOR_COLLECTION)
            .orderBy("timestamp", Query.Direction.DESCENDING)
            .get()
            .get();
        
        List<OutdoorUnitData> results = new ArrayList<>();
        for (DocumentSnapshot document : querySnapshot.getDocuments()) {
            results.add(document.toObject(OutdoorUnitData.class));
        }
        
        return results;
    }
    
    public List<OutdoorUnitData> getOutdoorUnitsBySerial(String serial) throws ExecutionException, InterruptedException {
        Firestore db = firestoreService.getFirestore();
        
        QuerySnapshot querySnapshot = db.collection(OUTDOOR_COLLECTION)
            .whereEqualTo("serialNumber", serial)
            .orderBy("timestamp", Query.Direction.DESCENDING)
            .get()
            .get();
        
        List<OutdoorUnitData> results = new ArrayList<>();
        for (DocumentSnapshot document : querySnapshot.getDocuments()) {
            results.add(document.toObject(OutdoorUnitData.class));
        }
        
        return results;
    }
    
    public List<OutdoorUnitData> getOutdoorUnitsByDateRange(String startDate, String endDate) throws ExecutionException, InterruptedException {
        Firestore db = firestoreService.getFirestore();
        
        LocalDateTime start = LocalDate.parse(startDate).atStartOfDay();
        LocalDateTime end = LocalDate.parse(endDate).atTime(23, 59, 59);
        
        QuerySnapshot querySnapshot = db.collection(OUTDOOR_COLLECTION)
            .whereGreaterThanOrEqualTo("timestamp", start)
            .whereLessThanOrEqualTo("timestamp", end)
            .orderBy("timestamp", Query.Direction.DESCENDING)
            .get()
            .get();
        
        List<OutdoorUnitData> results = new ArrayList<>();
        for (DocumentSnapshot document : querySnapshot.getDocuments()) {
            results.add(document.toObject(OutdoorUnitData.class));
        }
        
        return results;
    }

    // Indoor Standards Methods
    public String addIndoorStandard(IndoorUnitStd standard) throws ExecutionException, InterruptedException {
        Firestore db = firestoreService.getFirestore();
        
        DocumentReference docRef = db.collection(INDOOR_STD_COLLECTION).document();
        docRef.set(standard).get();
        
        LOGGER.info("Indoor standard added with ID: " + docRef.getId());
        return docRef.getId();
    }
    
    public IndoorUnitStd getIndoorStandard(String item) throws ExecutionException, InterruptedException {
        Firestore db = firestoreService.getFirestore();
        
        QuerySnapshot querySnapshot = db.collection(INDOOR_STD_COLLECTION)
            .whereEqualTo("item", item)
            .limit(1)
            .get()
            .get();
        
        if (!querySnapshot.isEmpty()) {
            DocumentSnapshot document = querySnapshot.getDocuments().get(0);
            return document.toObject(IndoorUnitStd.class);
        }
        
        return null;
    }
    
    public void updateIndoorStandard(IndoorUnitStd standard) throws ExecutionException, InterruptedException {
        Firestore db = firestoreService.getFirestore();
        
        QuerySnapshot querySnapshot = db.collection(INDOOR_STD_COLLECTION)
            .whereEqualTo("item", standard.getItem())
            .limit(1)
            .get()
            .get();
        
        if (!querySnapshot.isEmpty()) {
            DocumentSnapshot document = querySnapshot.getDocuments().get(0);
            document.getReference().set(standard).get();
            LOGGER.info("Indoor standard updated for item: " + standard.getItem());
        } else {
            throw new RuntimeException("Indoor standard not found for item: " + standard.getItem());
        }
    }

    // Outdoor Standards Methods
    public String addOutdoorStandard(OutdoorUnitStd standard) throws ExecutionException, InterruptedException {
        Firestore db = firestoreService.getFirestore();
        
        DocumentReference docRef = db.collection(OUTDOOR_STD_COLLECTION).document();
        docRef.set(standard).get();
        
        LOGGER.info("Outdoor standard added with ID: " + docRef.getId());
        return docRef.getId();
    }
    
    public OutdoorUnitStd getOutdoorStandard(String item) throws ExecutionException, InterruptedException {
        Firestore db = firestoreService.getFirestore();
        
        QuerySnapshot querySnapshot = db.collection(OUTDOOR_STD_COLLECTION)
            .whereEqualTo("item", item)
            .limit(1)
            .get()
            .get();
        
        if (!querySnapshot.isEmpty()) {
            DocumentSnapshot document = querySnapshot.getDocuments().get(0);
            return document.toObject(OutdoorUnitStd.class);
        }
        
        return null;
    }
    
    public void updateOutdoorStandard(OutdoorUnitStd standard) throws ExecutionException, InterruptedException {
        Firestore db = firestoreService.getFirestore();
        
        QuerySnapshot querySnapshot = db.collection(OUTDOOR_STD_COLLECTION)
            .whereEqualTo("item", standard.getItem())
            .limit(1)
            .get()
            .get();
        
        if (!querySnapshot.isEmpty()) {
            DocumentSnapshot document = querySnapshot.getDocuments().get(0);
            document.getReference().set(standard).get();
            LOGGER.info("Outdoor standard updated for item: " + standard.getItem());
        } else {
            throw new RuntimeException("Outdoor standard not found for item: " + standard.getItem());
        }
    }

    // Result and Standard Methods
    public DetailedTestResultResponse<IndoorUnitData, IndoorUnitStd, IndoorFieldResults> getIndoorResultAndStandard(String testNo) throws ExecutionException, InterruptedException {
        Firestore db = firestoreService.getFirestore();

        // Get result by tester number
        QuerySnapshot resultQuery = db.collection(INDOOR_COLLECTION)
            .whereEqualTo("testerNo", testNo)
            .limit(1)
            .get()
            .get();

        if (resultQuery.isEmpty()) {
            throw new RuntimeException("Indoor test result not found for testNo: " + testNo);
        }

        DocumentSnapshot resultDoc = resultQuery.getDocuments().get(0);
        IndoorUnitData testData = resultDoc.toObject(IndoorUnitData.class);

        // Get standard for the same item
        IndoorUnitStd standard = getIndoorStandard(testData.getItem());

        // Create IndoorFieldResults and perform field-by-field comparison
        IndoorFieldResults fieldResults = new IndoorFieldResults();

        // Compare voltage fields
        fieldResults.setVoltageL1(compareDoubleField(testData.getVoltageL1V(), standard.getVoltageL1VMin(), standard.getVoltageL1VMax()));
        fieldResults.setVoltageL2(compareDoubleField(testData.getVoltageL2V(), standard.getVoltageL2VMin(), standard.getVoltageL2VMax()));
        fieldResults.setVoltageL3(compareDoubleField(testData.getVoltageL3V(), standard.getVoltageL3VMin(), standard.getVoltageL3VMax()));

        // Compare current fields
        fieldResults.setCurrentL1(compareDoubleField(testData.getCurrentL1A(), standard.getCurrentL1AMin(), standard.getCurrentL1AMax()));
        fieldResults.setCurrentL2(compareDoubleField(testData.getCurrentL2A(), standard.getCurrentL2AMin(), standard.getCurrentL2AMax()));
        fieldResults.setCurrentL3(compareDoubleField(testData.getCurrentL3A(), standard.getCurrentL3AMin(), standard.getCurrentL3AMax()));

        // Compare power fields
        fieldResults.setPowerKw(compareDoubleField(testData.getPowerKw(), standard.getPowerKwMin(), standard.getPowerKwMax()));
        fieldResults.setPowerFactor(compareDoubleField(testData.getPowerFactor(), standard.getPowerFactorMin(), standard.getPowerFactorMax()));

        // Compare temperature fields
        fieldResults.setRoomTemp(compareDoubleField(testData.getRoomTempC(), standard.getRoomTempCMin(), standard.getRoomTempCMax()));
        fieldResults.setEvapInletTemp(compareDoubleField(testData.getEvapInletTempC(), standard.getEvapInletTempCMin(), standard.getEvapInletTempCMax()));
        fieldResults.setEvapOutletTemp(compareDoubleField(testData.getEvapOutletTempC(), standard.getEvapOutletTempCMin(), standard.getEvapOutletTempCMax()));

        // Compare environmental fields
        fieldResults.setRoomHumidity(compareDoubleField(testData.getRoomHumidityPercent(), standard.getRoomHumidityPercentMin(), standard.getRoomHumidityPercentMax()));
        fieldResults.setPm25(compareDoubleField(testData.getPm25UgM3(), standard.getPm25UgM3Min(), standard.getPm25UgM3Max()));
        fieldResults.setCo2(compareIntegerField(testData.getCo2Ppm(), standard.getCo2PpmMin(), standard.getCo2PpmMax()));

        // Calculate overall result
        boolean allPassed =
            "true".equals(fieldResults.getVoltageL1()) &&
            "true".equals(fieldResults.getVoltageL2()) &&
            "true".equals(fieldResults.getVoltageL3()) &&
            "true".equals(fieldResults.getCurrentL1()) &&
            "true".equals(fieldResults.getCurrentL2()) &&
            "true".equals(fieldResults.getCurrentL3()) &&
            "true".equals(fieldResults.getPowerKw()) &&
            "true".equals(fieldResults.getPowerFactor()) &&
            "true".equals(fieldResults.getRoomTemp()) &&
            "true".equals(fieldResults.getEvapInletTemp()) &&
            "true".equals(fieldResults.getEvapOutletTemp()) &&
            "true".equals(fieldResults.getRoomHumidity()) &&
            "true".equals(fieldResults.getPm25()) &&
            "true".equals(fieldResults.getCo2());

        String overallResult = allPassed ? "Pass" : "Fail";

        // Build and return DetailedTestResultResponse
        return new DetailedTestResultResponse<>(
            overallResult,  // status mirrors result
            overallResult,  // result
            fieldResults,   // resultTest
            testData,       // test
            standard        // std
        );
    }
    
    public DetailedTestResultResponse<OutdoorUnitData, OutdoorUnitStd, OutdoorFieldResults> getOutdoorResultAndStandard(String testNo) throws ExecutionException, InterruptedException {
        Firestore db = firestoreService.getFirestore();

        // Get result by tester number
        QuerySnapshot resultQuery = db.collection(OUTDOOR_COLLECTION)
            .whereEqualTo("testerNo", testNo)
            .limit(1)
            .get()
            .get();

        if (resultQuery.isEmpty()) {
            throw new RuntimeException("Outdoor test result not found for testNo: " + testNo);
        }

        DocumentSnapshot resultDoc = resultQuery.getDocuments().get(0);
        OutdoorUnitData testData = resultDoc.toObject(OutdoorUnitData.class);

        // Get standard for the same item
        OutdoorUnitStd standard = getOutdoorStandard(testData.getItem());

        // Create OutdoorFieldResults and perform field-by-field comparison
        OutdoorFieldResults fieldResults = new OutdoorFieldResults();

        // Compare voltage fields (Double standards)
        fieldResults.setVoltageL1(compareDoubleField(testData.getVoltageL1V(), standard.getVoltageL1VMin(), standard.getVoltageL1VMax()));
        fieldResults.setVoltageL2(compareDoubleField(testData.getVoltageL2V(), standard.getVoltageL2VMin(), standard.getVoltageL2VMax()));
        fieldResults.setVoltageL3(compareDoubleField(testData.getVoltageL3V(), standard.getVoltageL3VMin(), standard.getVoltageL3VMax()));

        // Compare current fields (Double standards)
        fieldResults.setCurrentL1(compareDoubleField(testData.getCurrentL1A(), standard.getCurrentL1AMin(), standard.getCurrentL1AMax()));
        fieldResults.setCurrentL2(compareDoubleField(testData.getCurrentL2A(), standard.getCurrentL2AMin(), standard.getCurrentL2AMax()));
        fieldResults.setCurrentL3(compareDoubleField(testData.getCurrentL3A(), standard.getCurrentL3AMin(), standard.getCurrentL3AMax()));

        // Compare power fields (Double standards)
        fieldResults.setPowerKw(compareDoubleField(testData.getPowerKw(), standard.getPowerKwMin(), standard.getPowerKwMax()));
        fieldResults.setPowerFactor(compareDoubleField(testData.getPowerFactor(), standard.getPowerFactorMin(), standard.getPowerFactorMax()));

        // Compare pressure fields (Double standards, String standards from story 5.2)
        fieldResults.setPressure1(compareDoubleField(testData.getPressure1Psi(), standard.getPressure1PsiMin(), standard.getPressure1PsiMax()));
        fieldResults.setPressure2(compareDoubleField(testData.getPressure2Psi(), standard.getPressure2PsiMin(), standard.getPressure2PsiMax()));

        // Compare temperature fields (Double standards)
        fieldResults.setTemp1(compareDoubleField(testData.getTemp1C(), standard.getTemp1CMin(), standard.getTemp1CMax()));
        fieldResults.setTemp2(compareDoubleField(testData.getTemp2C(), standard.getTemp2CMin(), standard.getTemp2CMax()));
        fieldResults.setTemp3(compareDoubleField(testData.getTemp3C(), standard.getTemp3CMin(), standard.getTemp3CMax()));
        fieldResults.setTemp4(compareDoubleField(testData.getTemp4C(), standard.getTemp4CMin(), standard.getTemp4CMax()));

        // Compare running and compressor fields (Double standards)
        fieldResults.setRunningPercent(compareDoubleField(testData.getRunningPercent(), standard.getRunningPercentMin(), standard.getRunningPercentMax()));
        fieldResults.setCompressorSpeed(compareDoubleField(testData.getCompressorSpeedRps(), standard.getCompressorSpeedRpsMin(), standard.getCompressorSpeedRpsMax()));

        // Compare voltage DC field (Double standards)
        fieldResults.setVoltageDc(compareDoubleField(testData.getVoltageDcV(), standard.getVoltageDcVMin(), standard.getVoltageDcVMax()));

        // Compare discharge, condenser, suction, ambient temp fields (Double standards)
        fieldResults.setDischargeTemp(compareDoubleField(testData.getDischargeTempC(), standard.getDischargeTempCMin(), standard.getDischargeTempCMax()));
        fieldResults.setCondenserTemp(compareDoubleField(testData.getCondenserTempC(), standard.getCondenserTempCMin(), standard.getCondenserTempCMax()));
        fieldResults.setSuctionTemp(compareDoubleField(testData.getSuctionTempC(), standard.getSuctionTempCMin(), standard.getSuctionTempCMax()));
        fieldResults.setAmbientTemp(compareDoubleField(testData.getAmbientTempC(), standard.getAmbientTempCMin(), standard.getAmbientTempCMax()));

        // Compare fan and fresh air fields (Double standards)
        fieldResults.setOutdoorFanSpeed(compareDoubleField(testData.getOutdoorFanSpeedRpm(), standard.getOutdoorFanSpeedRpmMin(), standard.getOutdoorFanSpeedRpmMax()));
        fieldResults.setFreshAirSupplyTemp(compareDoubleWithStringStd(testData.getFreshAirSupplyTempC(), standard.getFreshAirSupplyTempMin(), standard.getFreshAirSupplyTempMax()));
        fieldResults.setFreshAirSupplyHumidity(compareDoubleWithStringStd(testData.getFreshAirSupplyHumidityPercent(), standard.getFreshAirSupplyHumidityMin(), standard.getFreshAirSupplyHumidityMax()));
        fieldResults.setEcFanSpeed(compareDoubleWithStringStd(testData.getEcFanSpeedHz(), standard.getFreshAirFanRpmMin(), standard.getFreshAirFanRpmMax()));
        fieldResults.setFreshAirEvapInletTemp(compareDoubleWithStringStd(testData.getFreshAirEvapInletTempC(), standard.getFreshAirEvapPipeTempMin(), standard.getFreshAirEvapPipeTempMax()));

        // Calculate overall result
        boolean allPassed =
            "true".equals(fieldResults.getVoltageL1()) &&
            "true".equals(fieldResults.getVoltageL2()) &&
            "true".equals(fieldResults.getVoltageL3()) &&
            "true".equals(fieldResults.getCurrentL1()) &&
            "true".equals(fieldResults.getCurrentL2()) &&
            "true".equals(fieldResults.getCurrentL3()) &&
            "true".equals(fieldResults.getPowerKw()) &&
            "true".equals(fieldResults.getPowerFactor()) &&
            "true".equals(fieldResults.getPressure1()) &&
            "true".equals(fieldResults.getPressure2()) &&
            "true".equals(fieldResults.getTemp1()) &&
            "true".equals(fieldResults.getTemp2()) &&
            "true".equals(fieldResults.getTemp3()) &&
            "true".equals(fieldResults.getTemp4()) &&
            "true".equals(fieldResults.getRunningPercent()) &&
            "true".equals(fieldResults.getCompressorSpeed()) &&
            "true".equals(fieldResults.getVoltageDc()) &&
            "true".equals(fieldResults.getDischargeTemp()) &&
            "true".equals(fieldResults.getCondenserTemp()) &&
            "true".equals(fieldResults.getSuctionTemp()) &&
            "true".equals(fieldResults.getAmbientTemp()) &&
            "true".equals(fieldResults.getOutdoorFanSpeed()) &&
            "true".equals(fieldResults.getFreshAirSupplyTemp()) &&
            "true".equals(fieldResults.getFreshAirSupplyHumidity()) &&
            "true".equals(fieldResults.getEcFanSpeed()) &&
            "true".equals(fieldResults.getFreshAirEvapInletTemp());

        String overallResult = allPassed ? "Pass" : "Fail";

        // Build and return DetailedTestResultResponse
        return new DetailedTestResultResponse<>(
            overallResult,  // status mirrors result
            overallResult,  // result
            fieldResults,   // resultTest
            testData,       // test
            standard        // std
        );
    }
    
    // Helper class for result and standard response
    public static class ResultAndStandardResponse<T, S> {
        private T result;
        private S standard;

        public ResultAndStandardResponse(T result, S standard) {
            this.result = result;
            this.standard = standard;
        }

        public T getResult() {
            return result;
        }

        public void setResult(T result) {
            this.result = result;
        }

        public S getStandard() {
            return standard;
        }

        public void setStandard(S standard) {
            this.standard = standard;
        }
    }

    // Field comparison utility methods

    /**
     * Compares a Double test value against min/max Double standards
     * @param testValue The test value
     * @param minStd Minimum standard value
     * @param maxStd Maximum standard value
     * @return "true" if within range, "false" otherwise
     */
    private String compareDoubleField(Double testValue, Double minStd, Double maxStd) {
        try {
            // Handle null cases
            if (testValue == null || minStd == null || maxStd == null) {
                return "false";
            }

            // Check if value is within range [min, max]
            if (testValue >= minStd && testValue <= maxStd) {
                return "true";
            } else {
                return "false";
            }
        } catch (Exception e) {
            LOGGER.warning("Error comparing Double field: " + e.getMessage());
            return "false";
        }
    }

    /**
     * Compares an Integer test value against min/max Integer standards
     * @param testValue The test value
     * @param minStd Minimum standard value
     * @param maxStd Maximum standard value
     * @return "true" if within range, "false" otherwise
     */
    private String compareIntegerField(Integer testValue, Integer minStd, Integer maxStd) {
        try {
            // Handle null cases
            if (testValue == null || minStd == null || maxStd == null) {
                return "false";
            }

            // Check if value is within range [min, max]
            if (testValue >= minStd && testValue <= maxStd) {
                return "true";
            } else {
                return "false";
            }
        } catch (Exception e) {
            LOGGER.warning("Error comparing Integer field: " + e.getMessage());
            return "false";
        }
    }

    /**
     * Compares a Double test value against min/max String standards (parses to Double)
     * @param testValue The test value
     * @param minStd Minimum standard value as String
     * @param maxStd Maximum standard value as String
     * @return "true" if within range, "false" otherwise
     */
    private String compareDoubleWithStringStd(Double testValue, String minStd, String maxStd) {
        try {
            // Handle null cases
            if (testValue == null || minStd == null || maxStd == null) {
                return "false";
            }

            // Parse string standards to Double
            Double minValue = Double.parseDouble(minStd);
            Double maxValue = Double.parseDouble(maxStd);

            // Check if value is within range [min, max]
            if (testValue >= minValue && testValue <= maxValue) {
                return "true";
            } else {
                return "false";
            }
        } catch (NumberFormatException e) {
            LOGGER.warning("Error parsing String standard to Double: " + e.getMessage());
            return "false";
        } catch (Exception e) {
            LOGGER.warning("Error comparing field with String standard: " + e.getMessage());
            return "false";
        }
    }
}