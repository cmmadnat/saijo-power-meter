# Epic 1: Project Foundation & Core Backend Setup

**Goal**: The goal of this epic is to set up the foundational infrastructure for the project. This includes creating the monorepo, setting up the CI/CD pipeline for automated builds and deployments to Google Cloud Run, and creating the core backend services for connecting to the Firestore database. This epic will also deliver a simple health-check endpoint to verify that the application is running correctly.

## Story 1.1: Monorepo Setup

*   **As a** developer,
*   **I want** to have a monorepo containing both the backend and frontend projects,
*   **so that** I can easily manage the code and dependencies for the entire application in one place.

**Acceptance Criteria:**

1.  A Git repository is created with a monorepo structure.
2.  The Quarkus backend project is located in the `smart-factory-backend` directory.
3.  The React frontend project is located in the `admin-ui` directory.
4.  A README file is created with instructions on how to build and run both the backend and frontend projects.

## Story 1.2: CI/CD Pipeline Setup

*   **As a** developer,
*   **I want** to have a CI/CD pipeline that automatically builds, tests, and deploys the application to Google Cloud Run,
*   **so that** I can quickly and reliably release new versions of the application.

**Acceptance Criteria:**

1.  A CI/CD pipeline is set up using a tool like GitHub Actions or Google Cloud Build.
2.  The pipeline is triggered on every push to the main branch.
3.  The pipeline builds both the backend and frontend projects.
4.  The pipeline runs the unit tests for both projects.
5.  If the build and tests are successful, the pipeline deploys the application to Google Cloud Run.

## Story 1.3: Firestore Integration

*   **As a** developer,
*   **I want** to connect the Quarkus application to the Firestore database,
*   **so that** the application can read and write data to the database.

**Acceptance Criteria:**

1.  The Quarkus application is configured to connect to the correct Firestore instance.
2.  A simple service is created to test the connection by reading and writing a test document to the database.
3.  The credentials for accessing Firestore are securely managed and not hard-coded in the application.

## Story 1.4: Health Check Endpoint

*   **As a** developer,
*   **I want** to have a health check endpoint that returns the status of the application,
*   **so that** I can easily monitor the health of the application.

**Acceptance Criteria:**

1.  A GET endpoint is created at `/api/v1/health`.
2.  The endpoint returns a 200 OK response with a JSON body like `{"status": "UP"}` if the application is running correctly.
3.  The health check endpoint is monitored by the Google Cloud Run service.
