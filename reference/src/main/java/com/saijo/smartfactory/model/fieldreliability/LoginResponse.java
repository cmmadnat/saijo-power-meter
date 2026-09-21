package com.saijo.smartfactory.model.fieldreliability;

public class LoginResponse {
    private String token;
    private String username;
    private User.UserRole role;
    private String message;
    
    public LoginResponse() {}
    
    public LoginResponse(String token, String username, User.UserRole role, String message) {
        this.token = token;
        this.username = username;
        this.role = role;
        this.message = message;
    }
    
    public static LoginResponse success(String token, String username, User.UserRole role) {
        return new LoginResponse(token, username, role, "Login successful");
    }
    
    public static LoginResponse error(String message) {
        return new LoginResponse(null, null, null, message);
    }
    
    public String getToken() {
        return token;
    }
    
    public void setToken(String token) {
        this.token = token;
    }
    
    public String getUsername() {
        return username;
    }
    
    public void setUsername(String username) {
        this.username = username;
    }
    
    public User.UserRole getRole() {
        return role;
    }
    
    public void setRole(User.UserRole role) {
        this.role = role;
    }
    
    public String getMessage() {
        return message;
    }
    
    public void setMessage(String message) {
        this.message = message;
    }
}