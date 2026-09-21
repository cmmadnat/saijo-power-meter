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
