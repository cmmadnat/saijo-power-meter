### 3. Tech Stack

#### 3.1. Technology Stack Table

| Category | Technology | Version | Purpose | Rationale |
| :--- | :--- | :--- | :--- | :--- |
| Frontend Language | TypeScript | latest | Language for frontend development | Provides type safety and better developer experience for large applications. |
| Frontend Framework | React | latest | Core framework for the admin UI | Required by NFR3. |
| UI Component Library | Material-UI (MUI) | latest | Provides pre-built UI components | Recommended in the front-end spec for a consistent and high-quality look and feel. |
| State Management | React Context API | latest | For managing global state in React | Simple, built-in solution for state management. Can be replaced with a more robust solution like Redux if needed in the future. |
| Backend Language | Java | 17 | Language for backend development | Quarkus is a Java-based framework. |
| Backend Framework | Quarkus | latest | Core framework for the backend | Required by NFR2. |
| API Style | REST | | For communication between frontend and backend | Standard, well-understood, and implied by the PRD's API endpoint structure. |
| Database | Firestore | | Primary data store | Required by FR2. |
| Cache | None initially | | | Not required by the PRD. Can be added later if performance issues arise. |
| File Storage | Firestore | | For storing any files | Firestore can store small files. Can be migrated to Google Cloud Storage if larger files are needed. |
| Authentication | None initially | | | The PRD states that the admin UI will not have a login system in this version. |
| Frontend Testing | Jest & React Testing Library | latest | For unit and component testing of the frontend | Standard and widely used testing libraries for React applications. |
| Backend Testing | JUnit & REST Assured | latest | For unit and integration testing of the backend | Standard testing libraries for Quarkus applications. |
| E2E Testing | Cypress | latest | For end-to-end testing of the application | Popular and easy-to-use tool for E2E testing. |
| Build Tool | Vite (frontend), Maven (backend) | latest | For building and bundling the application | Vite is a modern and fast build tool for frontend development. Maven is the standard for Quarkus. |
| Bundler | Vite | latest | For bundling the frontend application | Comes with Vite. |
| IaC Tool | Google Cloud CLI scripts | | For infrastructure as code | Simple and effective for a single Google Cloud Run instance. |
| CI/CD | None | | | Deployment will be done manually from the CLI. |
| Monitoring | Google Cloud Monitoring | | For monitoring the application | Required by the operational requirements in the PRD. |
| Logging | Google Cloud Logging | | For logging application events | Required by the operational requirements in the PRD. |
| CSS Framework | MUI's built-in styling (Emotion) | | For styling the application | Comes with MUI and provides a powerful and flexible way to style components. |
