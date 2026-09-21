### 5. API Specification

#### 5.1. REST API Specification (OpenAPI 3.0)

```yaml
openapi: 3.0.0
info:
  title: Saijo Denki Smart Factory API
  version: "1.0.0"
  description: API for the Saijo Denki Smart Factory backend, covering the Calorie Meter Room, EMC, and Function Test modules.
servers:
  - url: /api/v1
    description: API base path

paths:
  /calorie-meter/suggestion:
    post:
      summary: Get a suggestion for the Calorie Meter Room
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                air_conditioner_details:
                  $ref: '#/components/schemas/AirConditionerDetails'
                test_results:
                  $ref: '#/components/schemas/TestResults'
      responses:
        '200':
          description: Successful response
          content:
            application/json:
              schema:
                type: object
                properties:
                  response_area:
                    type: string
  /emc/suggestion:
    post:
      summary: Get a suggestion for the EMC module
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                emc_details:
                  $ref: '#/components/schemas/EMCDetails'
                emc_test_result:
                  $ref: '#/components/schemas/EMCTestResult'
      responses:
        '200':
          description: Successful response
          content:
            application/json:
              schema:
                type: object
                properties:
                  suggestion:
                    type: string
  /function-test/indoor/model:
    get:
      summary: Get indoor unit model by serial number and item
      parameters:
        - name: serial
          in: query
          required: true
          schema:
            type: string
        - name: item
          in: query
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Successful response
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/IndoorUnitData'
  /function-test/outdoor/model:
    get:
      summary: Get outdoor unit model by serial number and item
      parameters:
        - name: serial
          in: query
          required: true
          schema:
            type: string
        - name: item
          in: query
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Successful response
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/OutdoorUnitData'

components:
  schemas:
    AirConditionerDetails:
      type: object
    TestResults:
      type: object
    EMCDetails:
      type: object
    EMCTestResult:
      type: object
    IndoorUnitData:
      type: object
    OutdoorUnitData:
      type: object
```
