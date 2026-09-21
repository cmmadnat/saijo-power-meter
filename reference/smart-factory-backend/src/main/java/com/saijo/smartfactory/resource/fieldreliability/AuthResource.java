package com.saijo.smartfactory.resource.fieldreliability;

import com.saijo.smartfactory.model.fieldreliability.LoginRequest;
import com.saijo.smartfactory.model.fieldreliability.LoginResponse;
import com.saijo.smartfactory.model.fieldreliability.User;
import com.saijo.smartfactory.service.fieldreliability.AuthService;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

@Path("/api/auth")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class AuthResource {
    
    @Inject
    AuthService authService;
    
    @POST
    @Path("/login")
    public Response login(LoginRequest request) {
        try {
            User user = authService.authenticateUser(request.getUsername(), request.getPassword());
            if (user != null) {
                String token = authService.generateJWTToken(user);
                return Response.ok(LoginResponse.success(token, user.getUsername(), user.getRole())).build();
            } else {
                return Response.status(401)
                    .entity(LoginResponse.error("Invalid username or password"))
                    .build();
            }
        } catch (Exception e) {
            return Response.status(500)
                .entity(LoginResponse.error("Authentication service error"))
                .build();
        }
    }
    
    @POST
    @Path("/logout")
    public Response logout() {
        // In a real implementation, you'd invalidate the token
        return Response.ok().entity("{\"message\": \"Logout successful\"}").build();
    }
    
    @GET
    @Path("/session")
    @Produces(MediaType.APPLICATION_JSON)
    public Response validateSession(@HeaderParam("Authorization") String authHeader) {
        try {
            if (authHeader != null && authHeader.startsWith("Bearer ")) {
                String token = authHeader.substring(7);
                User user = authService.validateToken(token);
                if (user != null) {
                    return Response.ok().entity("{\"valid\": true, \"username\": \"" + 
                        user.getUsername() + "\", \"role\": \"" + user.getRole() + "\"}").build();
                }
            }
            return Response.status(401).entity("{\"valid\": false}").build();
        } catch (Exception e) {
            return Response.status(500).entity("{\"error\": \"Session validation failed\"}").build();
        }
    }
    
    @POST
    @Path("/initialize")
    public Response initializeUsers() {
        try {
            authService.initializeDefaultUsers();
            return Response.ok().entity("{\"message\": \"Default users initialized\"}").build();
        } catch (Exception e) {
            return Response.status(500)
                .entity("{\"error\": \"Failed to initialize users\"}")
                .build();
        }
    }
}