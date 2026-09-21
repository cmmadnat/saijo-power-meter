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
