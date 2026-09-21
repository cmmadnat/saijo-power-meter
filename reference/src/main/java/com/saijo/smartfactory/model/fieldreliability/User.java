package com.saijo.smartfactory.model.fieldreliability;

import java.time.LocalDateTime;

public class User {
    private String id;
    private String username;
    private String hashedPassword;
    private UserRole role;
    private LocalDateTime createdAt;
    private LocalDateTime lastLogin;
    
    public enum UserRole {
        ADMIN, TECHNICIAN, ENGINEER, VIEWER
    }
    
    public User() {}
    
    public User(String username, String hashedPassword, UserRole role) {
        this.username = username;
        this.hashedPassword = hashedPassword;
        this.role = role;
        this.createdAt = LocalDateTime.now();
    }
    
    public String getId() {
        return id;
    }
    
    public void setId(String id) {
        this.id = id;
    }
    
    public String getUsername() {
        return username;
    }
    
    public void setUsername(String username) {
        this.username = username;
    }
    
    public String getHashedPassword() {
        return hashedPassword;
    }
    
    public void setHashedPassword(String hashedPassword) {
        this.hashedPassword = hashedPassword;
    }
    
    public UserRole getRole() {
        return role;
    }
    
    public void setRole(UserRole role) {
        this.role = role;
    }
    
    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
    
    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
    
    public LocalDateTime getLastLogin() {
        return lastLogin;
    }
    
    public void setLastLogin(LocalDateTime lastLogin) {
        this.lastLogin = lastLogin;
    }
}