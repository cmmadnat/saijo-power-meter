package com.saijo.smartfactory;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.cloud.FirestoreClient;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.WriteResult;

import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.io.FileInputStream;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ExecutionException;
import java.util.logging.Logger;

@ApplicationScoped
public class FirestoreService {
    
    private static final Logger LOGGER = Logger.getLogger(FirestoreService.class.getName());
    
    @ConfigProperty(name = "firebase.credentials.path")
    Optional<String> credentialsPath;
    
    @ConfigProperty(name = "firebase.project.id", defaultValue = "saijo-smart-factory")
    String projectId;
    
    private Firestore firestore;
    
    @PostConstruct
    public void initialize() {
        try {
            if (FirebaseApp.getApps().isEmpty()) {
                FirebaseOptions.Builder optionsBuilder = FirebaseOptions.builder()
                    .setProjectId(projectId);
                
                if (credentialsPath.isPresent() && !credentialsPath.get().isEmpty()) {
                    FileInputStream serviceAccount = new FileInputStream(credentialsPath.get());
                    GoogleCredentials credentials = GoogleCredentials.fromStream(serviceAccount);
                    optionsBuilder.setCredentials(credentials);
                } else {
                    // Use default credentials (for Cloud Run)
                    optionsBuilder.setCredentials(GoogleCredentials.getApplicationDefault());
                }
                
                FirebaseApp.initializeApp(optionsBuilder.build());
                LOGGER.info("Firebase initialized successfully with project ID: " + projectId);
            }
            
            firestore = FirestoreClient.getFirestore();
            LOGGER.info("Firestore connection initialized successfully");
            
            // Test connection
            testConnection();
            
        } catch (Exception e) {
            LOGGER.severe("Failed to initialize Firestore: " + e.getMessage());
            LOGGER.info("Continuing without Firestore - API structure available for demo");
            // Don't throw exception - allow app to start for demo purposes
        }
    }
    
    public boolean testConnection() {
        try {
            // Write test document
            Map<String, Object> testData = new HashMap<>();
            testData.put("test", true);
            testData.put("timestamp", System.currentTimeMillis());
            
            DocumentReference docRef = firestore.collection("health").document("connection-test");
            WriteResult result = docRef.set(testData).get();
            
            // Read test document
            DocumentSnapshot document = docRef.get().get();
            
            boolean success = document.exists() && document.getBoolean("test");
            
            if (success) {
                LOGGER.info("Firestore connection test successful");
                // Clean up test document
                docRef.delete();
            }
            
            return success;
            
        } catch (InterruptedException | ExecutionException e) {
            LOGGER.warning("Firestore connection test failed: " + e.getMessage());
            return false;
        }
    }
    
    public Firestore getFirestore() {
        return firestore;
    }
}