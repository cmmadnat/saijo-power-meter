package com.saijo.smartfactory.service.fieldreliability;

import com.saijo.smartfactory.FirestoreService;
import com.saijo.smartfactory.model.fieldreliability.User;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutionException;

@ApplicationScoped
public class AuthService {
    
    @Inject
    FirestoreService firestoreService;
    
    private static final String USERS_COLLECTION = "field_reliability_users";
    
    public User authenticateUser(String username, String password) {
        try {
            String hashedPassword = hashPassword(password);
            Map<String, Object> query = new HashMap<>();
            query.put("username", username);
            query.put("hashedPassword", hashedPassword);
            
            var documents = firestoreService.getFirestore()
                .collection(USERS_COLLECTION)
                .whereEqualTo("username", username)
                .whereEqualTo("hashedPassword", hashedPassword)
                .get()
                .get();
            
            if (!documents.isEmpty()) {
                var doc = documents.getDocuments().get(0);
                User user = doc.toObject(User.class);
                user.setId(doc.getId());
                
                // Update last login
                user.setLastLogin(LocalDateTime.now());
                updateUser(user);
                
                return user;
            }
            return null;
        } catch (InterruptedException | ExecutionException e) {
            throw new RuntimeException("Authentication failed", e);
        }
    }
    
    public User createUser(String username, String password, User.UserRole role) {
        try {
            String hashedPassword = hashPassword(password);
            User user = new User(username, hashedPassword, role);
            
            var docRef = firestoreService.getFirestore()
                .collection(USERS_COLLECTION)
                .add(user)
                .get();
            
            user.setId(docRef.getId());
            return user;
        } catch (InterruptedException | ExecutionException e) {
            throw new RuntimeException("User creation failed", e);
        }
    }
    
    public void initializeDefaultUsers() {
        try {
            // Check if users already exist
            var existingUsers = firestoreService.getFirestore()
                .collection(USERS_COLLECTION)
                .limit(1)
                .get()
                .get();
            
            if (existingUsers.isEmpty()) {
                // Create default users
                createUser("admin", "admin123", User.UserRole.ADMIN);
                createUser("engineer", "eng123", User.UserRole.ENGINEER);
                createUser("technician", "tech123", User.UserRole.TECHNICIAN);
                createUser("viewer", "view123", User.UserRole.VIEWER);
            }
        } catch (InterruptedException | ExecutionException e) {
            throw new RuntimeException("Failed to initialize default users", e);
        }
    }
    
    private void updateUser(User user) {
        try {
            firestoreService.getFirestore()
                .collection(USERS_COLLECTION)
                .document(user.getId())
                .set(user)
                .get();
        } catch (InterruptedException | ExecutionException e) {
            throw new RuntimeException("User update failed", e);
        }
    }
    
    private String hashPassword(String password) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(password.getBytes());
            return Base64.getEncoder().encodeToString(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("Password hashing failed", e);
        }
    }
    
    public String generateJWTToken(User user) {
        // Simple token generation - in production use proper JWT library
        String tokenData = user.getUsername() + ":" + user.getRole() + ":" + System.currentTimeMillis();
        return Base64.getEncoder().encodeToString(tokenData.getBytes());
    }
    
    public User validateToken(String token) {
        try {
            String decoded = new String(Base64.getDecoder().decode(token));
            String[] parts = decoded.split(":");
            if (parts.length == 3) {
                String username = parts[0];
                long timestamp = Long.parseLong(parts[2]);
                
                // Check if token is not older than 8 hours
                if (System.currentTimeMillis() - timestamp < 8 * 60 * 60 * 1000) {
                    return getUserByUsername(username);
                }
            }
            return null;
        } catch (Exception e) {
            return null;
        }
    }
    
    private User getUserByUsername(String username) {
        try {
            var documents = firestoreService.getFirestore()
                .collection(USERS_COLLECTION)
                .whereEqualTo("username", username)
                .get()
                .get();
            
            if (!documents.isEmpty()) {
                var doc = documents.getDocuments().get(0);
                User user = doc.toObject(User.class);
                user.setId(doc.getId());
                return user;
            }
            return null;
        } catch (InterruptedException | ExecutionException e) {
            return null;
        }
    }
}