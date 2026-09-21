### 6. Components

#### 6.1. Component List

**Frontend Components**

* **Dashboard**
* **CalorieMeterModule**
* **EMCModule**
* **FunctionTestModule**
* **ApiService**

**Backend Components**

* **CalorieMeterResource**
* **EMCResource**
* **FunctionTestResource**
* **CalorieMeterService**
* **EMCService**
* **FunctionTestService**
* **FirestoreRepository**

#### 6.2. Component Diagram

```mermaid
graph TD
    subgraph "Frontend (React)"
        UI_Dashboard[Dashboard]
        UI_Calorie[CalorieMeterModule]
        UI_EMC[EMCModule]
        UI_Function[FunctionTestModule]
        FE_ApiService[ApiService]
    end

    subgraph "Backend (Quarkus)"
        BE_CalorieResource[CalorieMeterResource]
        BE_EMCResource[EMCResource]
        BE_FunctionResource[FunctionTestResource]
        BE_CalorieService[CalorieMeterService]
        BE_EMCService[EMCService]
        BE_FunctionService[FunctionTestService]
        BE_FirestoreRepo[FirestoreRepository]
    end

    subgraph "Database"
        DB[Firestore]
    end

    UI_Dashboard --> FE_ApiService
    UI_Calorie --> FE_ApiService
    UI_EMC --> FE_ApiService
    UI_Function --> FE_ApiService

    FE_ApiService -- HTTP API --> BE_CalorieResource
    FE_ApiService -- HTTP API --> BE_EMCResource
    FE_ApiService -- HTTP API --> BE_FunctionResource

    BE_CalorieResource --> BE_CalorieService
    BE_EMCResource --> BE_EMCService
    BE_FunctionResource --> BE_FunctionService

    BE_CalorieService --> BE_FirestoreRepo
    BE_EMCService --> BE_FirestoreRepo
    BE_FunctionService --> BE_FirestoreRepo

    BE_FirestoreRepo --> DB
```
