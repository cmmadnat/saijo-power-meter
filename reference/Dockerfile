# Runtime-only Dockerfile (build happens in Cloud Build steps)
FROM eclipse-temurin:17-jre

WORKDIR /app

# Create non-root user
RUN groupadd --system app && useradd --system --gid app app

# Copy pre-built artifacts from Cloud Build steps (frontend is now included in the jar)
COPY --chown=app:app smart-factory-backend/target/smart-factory-backend-*-runner.jar /app/app.jar

# Firebase credentials will be provided by Cloud Run service account
# No need to copy firebase-service-account.json file for production deployment

# Set environment variables - Firebase credentials will be auto-detected in Cloud Run
ENV QUARKUS_HTTP_HOST=0.0.0.0

# Switch to non-root user
USER app

# Expose port
EXPOSE 8080

# Run the application
CMD ["java", "-Dquarkus.http.host=0.0.0.0", "-jar", "/app/app.jar"]