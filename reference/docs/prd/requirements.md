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
