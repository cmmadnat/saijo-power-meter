package com.saijo.smartfactory.model.fieldreliability;

import java.util.List;

public class Technician {
    private String id;
    private String name;
    private String email;
    private String phone;
    private List<String> specializations;
    private String availability; // AVAILABLE, BUSY, OFFLINE
    private String location;
    
    public Technician() {}
    
    public Technician(String name, String email, List<String> specializations) {
        this.name = name;
        this.email = email;
        this.specializations = specializations;
        this.availability = "AVAILABLE";
    }
    
    public String getId() {
        return id;
    }
    
    public void setId(String id) {
        this.id = id;
    }
    
    public String getName() {
        return name;
    }
    
    public void setName(String name) {
        this.name = name;
    }
    
    public String getEmail() {
        return email;
    }
    
    public void setEmail(String email) {
        this.email = email;
    }
    
    public String getPhone() {
        return phone;
    }
    
    public void setPhone(String phone) {
        this.phone = phone;
    }
    
    public List<String> getSpecializations() {
        return specializations;
    }
    
    public void setSpecializations(List<String> specializations) {
        this.specializations = specializations;
    }
    
    public String getAvailability() {
        return availability;
    }
    
    public void setAvailability(String availability) {
        this.availability = availability;
    }
    
    public String getLocation() {
        return location;
    }
    
    public void setLocation(String location) {
        this.location = location;
    }
}