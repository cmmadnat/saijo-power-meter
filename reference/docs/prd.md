# Goals and Background Context

## Goals

*   Reduce the time spent on manual data collection and processing by 50%.
*   Improve data accuracy and reliability.
*   Provide a unified platform to monitor and manage power meter data.
*   Create a user-friendly admin interface for data manipulation.
*   Achieve a high adoption rate of the new system among factory personnel.
*   Receive positive feedback on the usability of the admin page.

## Background Context

The Saijo Denki Smart Factory currently lacks a centralized system for managing power meter data from its various testing modules, including the Calorie Meter Room, EMC, and Function test modules. Data is stored in disparate files, leading to inefficiencies, potential data loss, and difficulties in analysis. This project aims to solve this problem by developing a backend system that will unify data collection, storage, and analysis. The system will provide a single source of truth for power meter data and will include a user-friendly admin interface for data management, ultimately improving operational efficiency and enabling better data-driven decision-making.

## Change Log

| Date | Version | Description | Author |
| :--- | :--- | :--- | :--- |
|      |        |             |        |

# Requirements

## Functional

1.  **FR1**: The system must provide API endpoints for frontend consumption to receive data from the Calorie Meter Room, EMC, and Function test modules.
2.  **FR2**: The system must store the data from the testing modules in a Firestore database.
3.  **FR3**: The system must provide a simple admin UI for investigation purposes, allowing users to view and manage the data in the Firestore database.
4.  **FR4**: The admin UI must allow users to perform CRUD (Create, Read, Update, Delete) operations on the data.
5.  **FR5**: The system must provide an API to get suggestions for the Calorie Meter Room based on the test results.
6.  **FR6**: The system must provide an API to get suggestions for the EMC module based on the test results.
7.  **FR7**: The system must provide a comprehensive set of APIs for the Function Test module to manage test data and standards.
8.  **FR8**: The system must expose a Swagger/OpenAPI endpoint for easy API testing and documentation.

## Non-Functional

1.  **NFR1**: The entire application (backend and admin UI) must be deployed together in a single Google Cloud Run instance.
2.  **NFR2**: The backend must be developed using Quarkus.
3.  **NFR3**: The admin UI must be developed using React.
4.  **NFR4**: The API response time should be under 500ms for 95% of the requests.
5.  **NFR5**: The system should be scalable to handle data from a growing number of testing modules in the future.
6.  **NFR6**: The system should be maintainable and the code should be well-documented.

# Cross-Functional Requirements

## Data Requirements
*   **Data Retention:** All test data will be stored indefinitely. There is no requirement for data archival or deletion at this stage. This can be revisited in the future if storage costs become a concern.
*   **Schema Management:** Any changes to the data schemas must be backward-compatible. A versioning system will be used for the API to manage schema changes over time. All schema changes must be documented in the `api-schema.md` file.

## Operational Requirements
*   **Monitoring:** The application's health will be monitored using the health check endpoint. Key metrics such as API response time, error rate, and resource utilization will be monitored using Google Cloud's monitoring tools.
*   **Alerting:** Alerts will be set up to notify the development team of any critical issues, such as application downtime, high error rates, or resource exhaustion.
*   **Logging:** The application will produce structured logs in JSON format. All log entries will include a timestamp, log level, and a descriptive message. Logs will be sent to Google Cloud Logging for analysis and troubleshooting.

# Epic List

*   **Epic 1: Project Foundation & Core Backend Setup**: Establish the project structure, CI/CD pipeline, and core backend services for data ingestion and storage.
*   **Epic 2: Function Test Module Implementation**: Implement the API endpoints and data management functionalities for the Function Test module.
*   **Epic 3: Calorie Meter Room & EMC Module Implementation**: Implement the API endpoints and data management functionalities for the Calorie Meter Room and EMC modules.
*   **Epic 4: Admin UI Implementation**: Develop the React-based admin UI with all the required views and functionalities.

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

# Epic 2: Function Test Module Implementation

**Goal**: The goal of this epic is to implement the backend functionalities for the Function Test module. This includes creating the API endpoints for managing test data and standards, as well as the services for interacting with the Firestore database.

## Story 2.1: Data Models for Function Test

*   **As a** developer,
*   **I want** to create the Java data models for the indoor and outdoor unit data,
*   **so that** I can easily work with the data in the backend application.

**Acceptance Criteria:**

1.  A `IndoorUnitData` Java class is created that matches the schema defined in `docs/api-schema.md`.
2.  A `OutdoorUnitData` Java class is created that matches the schema defined in `docs/api-schema.md`.
3.  The data models include appropriate annotations for JSON serialization/deserialization and for Firestore integration.

## Story 2.2: API for managing Test Standards

*   **As a** developer,
*   **I want** to implement the API endpoints for managing the test standards for indoor and outdoor units,
*   **so that** the admin UI can be used to define and update the test standards.

**Acceptance Criteria:**

1.  The following endpoints are implemented for indoor unit standards:
    *   `POST /api/v1/function-test/indoor/std`
    *   `GET /api/v1/function-test/indoor/std`
    *   `PUT /api/v1/function-test/indoor/std`
2.  The following endpoints are implemented for outdoor unit standards:
    *   `POST /api/v1/function-test/outdoor/std`
    *   `GET /api/v1/function-test/outdoor/std`
    *   `PUT /api/v1/function-test/outdoor/std`
3.  The endpoints correctly handle the request and response formats as defined in `docs/api-schema.md`.
4.  The data is correctly stored and retrieved from the Firestore database.

## Story 2.3: API for retrieving Test Data

*   **As a** developer,
*   **I want** to implement the API endpoints for retrieving test data for indoor and outdoor units,
*   **so that** the admin UI can display the test data to the user.

**Acceptance Criteria:**

1.  The following endpoints are implemented for retrieving test data:
    *   `GET /api/v1/function-test/indoor/model`
    *   `GET /api/v1/function-test/outdoor/model`
    *   `GET /api/v1/function-test/indoor/all`
    *   `GET /api/v1/function-test/outdoor/all`
    *   `GET /api/v1/function-test/indoor/by-serial`
    *   `GET /api/v1/function-test/outdoor/by-serial`
    *   `GET /api/v1/function-test/indoor/by-date-range`
    *   `GET /api/v1/function-test/outdoor/by-date-range`
2.  The endpoints correctly handle the request and response formats as defined in `docs/api-schema.md`.
3.  The data is correctly retrieved from the Firestore database.

## Story 2.4: API for retrieving Test Results and Standards

*   **As a** developer,
*   **I want** to implement the API endpoints for retrieving both the test results and the corresponding standards,
*   **so that** the admin UI can display them together for comparison.

**Acceptance Criteria:**

1.  The following endpoints are implemented:
    *   `GET /api/v1/function-test/indoor/result-and-std`
    *   `GET /api/v1/function-test/outdoor/result-and-std`
2.  The endpoints correctly handle the request and response formats as defined in `docs/api-schema.md`.
3.  The data is correctly retrieved from the Firestore database.

# Epic 3: Calorie Meter Room & EMC Module Implementation

**Goal**: The goal of this epic is to implement the backend functionalities for the Calorie Meter Room and EMC modules. This includes creating the API endpoints for getting suggestions and the services for interacting with the Firestore database.

## Story 3.1: Data Models for Calorie Meter Room and EMC

*   **As a** developer,
*   **I want** to create the Java data models for the Calorie Meter Room and EMC modules,
*   **so that** I can easily work with the data in the backend application.

**Acceptance Criteria:**

1.  A `AirConditionerDetails` Java class is created that matches the schema defined in `docs/api-schema.md`.
2.  A `TestResults` Java class is created that matches the schema defined in `docs/api-schema.md`.
3.  An `EMCDetails` Java class is created that matches the schema defined in `docs/api-schema.md`.
4.  An `EMCTestResult` Java class is created that matches the schema defined in `docs/api-schema.md`.
5.  The data models include appropriate annotations for JSON serialization/deserialization and for Firestore integration.

## Story 3.2: API for Calorie Meter Room Suggestions

*   **As a** developer,
*   **I want** to implement the `getSuggestion` API endpoint for the Calorie Meter Room,
*   **so that** the system can provide suggestions based on the test results.

**Acceptance Criteria:**

1.  The endpoint `POST /api/v1/calorie-meter/suggestion` is implemented.
2.  The endpoint correctly handles the request and response formats as defined in `docs/api-schema.md`.
3.  The suggestion logic is implemented (the details of the suggestion logic will need to be defined).
4.  The data is correctly stored and retrieved from the Firestore database.

## Story 3.3: API for EMC Suggestions

*   **As a** developer,
*   **I want** to implement the `getSuggestion` API endpoint for the EMC module,
*   **so that** the system can provide suggestions based on the EMC test results.

**Acceptance Criteria:**

1.  The endpoint `POST /api/v1/emc/suggestion` is implemented.
2.  The endpoint correctly handles the request and response formats as defined in `docs/api-schema.md`.
3.  The suggestion logic is implemented (the details of the suggestion logic will need to be defined).
4.  The data is correctly stored and retrieved from the Firestore database.

# Epic 4: Admin UI Implementation

**Goal**: The goal of this epic is to develop the React-based admin UI. This includes creating the necessary components for displaying and managing the data for all three modules, as well as setting up the navigation and layout of the application.

## Story 4.1: Basic UI Setup and Navigation

*   **As a** user,
*   **I want** to have a basic UI with a clear navigation structure,
*   **so that** I can easily navigate between the different modules.

**Acceptance Criteria:**

1.  A basic layout is created with a header, sidebar navigation, and content area.
2.  The sidebar navigation contains links to the three modules: Calorie Meter Room, EMC, and Function Test.
3.  The routing is set up to display the correct view when a navigation link is clicked.
4.  The UI is responsive and works well on desktop browsers.

## Story 4.2: Function Test Module UI

*   **As a** user,
*   **I want** to have a UI for the Function Test module,
*   **so that** I can view and manage the test data and standards.

**Acceptance Criteria:**

1.  A view is created to display the function test data for indoor and outdoor units in a table.
2.  The view includes filtering and sorting options for the data.
3.  Forms are created to add, edit, and delete test standards.
4.  The UI correctly interacts with the backend API to fetch and update the data.

## Story 4.3: Calorie Meter Room Module UI

*   **As a** user,
*   **I want** to have a UI for the Calorie Meter Room module,
*   **so that** I can view the test results and suggestions.

**Acceptance Criteria:**

1.  A view is created to display the Calorie Meter Room test results.
2.  The view includes a form to input the data required for getting suggestions.
3.  The suggestions returned by the API are displayed to the user.
4.  The UI correctly interacts with the backend API.

## Story 4.4: EMC Module UI

*   **As a** user,
*   **I want** to have a UI for the EMC module,
*   **so that** I can view the test results and suggestions.

**Acceptance Criteria:**

1.  A view is created to display the EMC test results.
2.  The view includes a form to input the data required for getting suggestions.
3.  The suggestions returned by the API are displayed to the user.
4.  The UI correctly interacts with the backend API.

<!-- Powered by BMAD™ Core -->

# Epic: Add Missing Standard Fields - Brownfield Enhancement

## Epic Goal

This epic will update the `IndoorUnitStd` and `OutdoorUnitStd` models, services, and resources to include all fields specified in the "Function test-Add standard.pdf" document. This will ensure that the backend implementation is fully compliant with the product specifications.

## Epic Description

**Existing System Context:**

*   **Current relevant functionality:** The system currently has basic CRUD operations for `IndoorUnitStd` and `OutdoorUnitStd`. However, the data models are incomplete.
*   **Technology stack:** Java, Jakarta EE, Weld, RESTEasy, Firestore.
*   **Integration points:** The `FunctionTestResource` exposes the standards management API. The `FunctionTestService` handles the business logic and interaction with Firestore.

**Enhancement Details:**

*   **What's being added/changed:**
    *   Add missing fields to the `IndoorUnitStd` and `OutdoorUnitStd` Java models.
    *   Update the `FunctionTestService` to handle the new fields.
    *   Update the `FunctionTestResource` to expose the new fields in the API.
    *   Update or create new tests to validate the new functionality.
*   **How it integrates:** The changes will be integrated into the existing `smart-factory-backend` service. The existing API endpoints will be updated to accept and return the new fields.
*   **Success criteria:**
    *   The `IndoorUnitStd` and `OutdoorUnitStd` models include all fields from the PDF.
    *   The API endpoints for adding and updating standards accept all new fields.
    *   The API endpoints for getting standards return all new fields.
    *   All new fields are correctly persisted to and retrieved from Firestore.
    *   All existing and new tests pass.

## Stories

1.  **Story 1: Update IndoorUnitStd Model and API**
    *   Add `errorCode` and `wifiStatus` fields to the `IndoorUnitStd` model.
    *   Update the `FunctionTestService` and `FunctionTestResource` to support the new fields.
    *   Update tests for `IndoorUnitStd`.
2.  **Story 2: Update OutdoorUnitStd Model and API - Part 1**
    *   Add `errorCode`, `refrigerantPressure1`, `refrigerantPressure2`, `acMode`, and `acPercent` fields to the `OutdoorUnitStd` model.
    *   Update the `FunctionTestService` and `FunctionTestResource` to support the new fields.
    *   Update tests for `OutdoorUnitStd`.
3.  **Story 3: Update OutdoorUnitStd Model and API - Part 2**
    *   Add the remaining missing fields to the `OutdoorUnitStd` model (`compressorRpm`, `inverterDcVolt`, etc.).
    *   Update the `FunctionTestService` and `FunctionTestResource` to support the new fields.
    *   Update tests for `OutdoorUnitStd`.
4.  **Story 4: Implement Detailed Test Result Response**
    *   Create a new response model that includes `status`, `result`, `resultTest`, `test`, and `std` fields.
    *   Update the `getIndoorResultAndStandard` and `getOutdoorResultAndStandard` methods in `FunctionTestService` to perform the comparison and build the new response.
    *   Update the corresponding endpoints in `FunctionTestResource` to return the new response model.
    *   Update tests for the result and standard endpoints.

## Compatibility Requirements

*   [X] Existing APIs remain unchanged in terms of endpoints, but will have new fields in the request and response payloads.
*   [X] Database schema changes are backward compatible (new fields will be added to existing documents).
*   [X] UI changes follow existing patterns (not applicable for this backend epic).
*   [X] Performance impact is minimal.

## Risk Mitigation

*   **Primary Risk:** The primary risk is introducing a regression in the existing standards management functionality.
*   **Mitigation:** The risk will be mitigated by comprehensive testing, including unit and integration tests. The changes will be implemented in a phased approach (one story at a time).
*   **Rollback Plan:** If a critical issue is found, the changes can be rolled back by reverting the corresponding commits.

## Definition of Done

*   [ ] All stories completed with acceptance criteria met.
*   [ ] Existing functionality verified through testing.
*   [ ] Integration points working correctly.
*   [ ] Documentation updated appropriately.
*   [ ] No regression in existing features.

---

**Story Manager Handoff:**

"Please develop detailed user stories for this brownfield epic. Key considerations:

*   This is an enhancement to an existing system running Java, Jakarta EE, and Firestore.
*   Integration points: `FunctionTestResource`, `FunctionTestService`.
*   Existing patterns to follow: The existing implementation of CRUD operations for standards.
*   Critical compatibility requirements: The API endpoints should remain the same, but the payloads will be updated.
*   Each story must include verification that existing functionality remains intact.

The epic should maintain system integrity while delivering a fully compliant implementation of the standards management feature."

---