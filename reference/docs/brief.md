# Project Brief: Saijo Denki Backend for power meter

## Executive Summary

*   **Product concept:** A backend system for the Saijo Denki Smart Factory to monitor and manage power meter data from various testing modules.
*   **Primary problem being solved:** Lack of a centralized system to collect, store, and analyze data from the Calorie Meter Room, EMC, and Function test modules.
*   **Target market:** Internal use by Saijo Denki factory personnel.
*   **Key value proposition:** Provide a unified platform to monitor and manage power meter data, with a user-friendly admin interface for data manipulation.

## Problem Statement

*   **Current state and pain points:** Data from different testing modules is likely stored in separate files (CSVs, Excel sheets), making it difficult to get a holistic view and perform analysis.
*   **Impact of the problem:** Inefficient data management, potential for data loss, and difficulty in tracking and analyzing power consumption across different testing phases.
*   **Why existing solutions fall short:** Existing solutions are likely manual and fragmented, leading to data silos and increased operational overhead.
*   **Urgency and importance of solving this now:** A centralized system is crucial for improving operational efficiency, enabling better data-driven decision-making, and supporting the growth of the Smart Factory.

## Proposed Solution

*   **Core concept and approach:** Develop a backend service using Quarkus that exposes a REST API for the Calorie Meter Room, EMC, and Function test modules. The data will be stored in a Firestore database. A React-based admin page will be created for data management. The application will be deployed on Google Cloud Run.
*   **Key differentiators from existing solutions:** A modern, cloud-native solution that is scalable, maintainable, and provides a single source of truth for power meter data.
*   **Why this solution will succeed where others haven't:** It leverages a modern tech stack (Quarkus, React, GCP) and follows a modular architecture, making it flexible and extensible.
*   **High-level vision for the product:** To create a comprehensive data platform for the Saijo Denki Smart Factory that can be extended to include other monitoring and control functionalities in the future.

## Target Users

*   **Primary User Segment:** Factory operators and technicians who will use the system to monitor the testing modules.
*   **Secondary User Segment:** Engineers and managers who will use the admin page and the collected data for analysis and reporting.

## Goals & Success Metrics

*   **Business Objectives:**
    *   Reduce the time spent on manual data collection and processing by 50%.
    *   Improve data accuracy and reliability.
*   **User Success Metrics:**
    *   High adoption rate of the new system among factory personnel.
    *   Positive feedback on the usability of the admin page.
*   **Key Performance Indicators (KPIs):**
    *   API response time.
    *   Application uptime.
    *   Number of data points collected per day.

## MVP Scope

*   **Core Features (Must Have):**
    *   Backend service (Quarkus) with REST endpoints for Calorie Meter Room, EMC, and Function test modules.
    *   Firestore database integration for data storage.
    *   Deployment to Google Cloud Run.
    *   A basic React admin page with CRUD functionality for the data in Firestore.
*   **Out of Scope for MVP:**
    *   Real-time dashboards and visualizations.
    *   Advanced data analytics and reporting features.
    *   User authentication and authorization for the admin page.

## Post-MVP Vision

*   **Phase 2 Features:**
    *   Implement user authentication and authorization.
    *   Add real-time dashboards and visualizations to the admin page.
*   **Long-term Vision:**
    *   Integrate with other systems in the factory.
    *   Use the collected data for predictive maintenance and process optimization.

## Technical Considerations

*   **Platform Requirements:**
    *   Target Platforms: Google Cloud Run.
*   **Technology Preferences:**
    *   Frontend: React
    *   Backend: Quarkus
    *   Database: Firestore
    *   Hosting/Infrastructure: Google Cloud Platform
*   **Architecture Considerations:**
    *   Service Architecture: Microservices or modular monolith.
    *   Integration Requirements: Integration with the testing modules (details to be defined based on the spec documents).

## Constraints & Assumptions

*   **Constraints:**
    *   The technology stack is fixed (Quarkus, React, GCP).
*   **Key Assumptions:**
    *   The specification documents in the `Smart factory/` directory contain all the necessary information about the API endpoints.
    *   The data from the testing modules can be sent to the backend via HTTP requests.

## Risks & Open Questions

*   **Key Risks:**
    *   The format of the data from the testing modules might be inconsistent.
    *   The requirements for the admin page might be more complex than anticipated.
*   **Open Questions:**
    *   What are the exact data schemas for the Calorie Meter Room, EMC, and Function test modules?
    *   What are the specific requirements for the admin page functionality?

## Next Steps

*   **Immediate Actions:**
    1.  Analyze the specification documents to define the API endpoints and data schemas.
    2.  Set up the development environment for Quarkus and React.
    3.  Create a detailed project plan.
