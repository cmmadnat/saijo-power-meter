# Multi-stage Dockerfile for Saijo Smart Factory Backend

# Build stage
FROM maven:3.9.6-eclipse-temurin-17 AS build
WORKDIR /app

# Copy pom.xml and checkstyle config first for better caching
COPY pom.xml .
COPY checkstyle.xml .
RUN mvn dependency:go-offline -B

# Copy source code
COPY src ./src

# Build the application
RUN mvn clean package -DskipTests

# Runtime stage
FROM eclipse-temurin:17-jre

# Install curl for health checks
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Copy the built jar
COPY --from=build /app/target/quarkus-app/ ./

# Copy Firebase service account
COPY firebase-service-account.json ./

# Set ownership
RUN chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:8080/api/v1/health || exit 1

# Run the application
CMD ["java", "-jar", "quarkus-run.jar"]