# Saijo Denki Backend for Power Meter

A comprehensive full-stack application for managing power meter data from testing modules in Saijo Denki's Smart Factory, built with Quarkus (backend) and React (frontend).

## 🎯 Project Overview

This system unifies data collection, storage, and analysis for power meter testing across three modules:
- **Calorie Meter Room**: Test data analysis and AI-powered suggestions
- **EMC (Electromagnetic Compatibility)**: EMC test management with intelligent recommendations  
- **Function Test**: Comprehensive test data and standards management

**Key Goals:**
- Reduce manual data processing time by 50%
- Improve data accuracy and reliability
- Provide unified monitoring and management platform
- Enable data-driven decision making

## 🏗️ Architecture

### High-Level Architecture
- **Backend**: Quarkus (Java 17) with REST APIs
- **Frontend**: React with TypeScript and Tailwind CSS
- **Database**: Google Firestore
- **Deployment**: Single Google Cloud Run instance
- **Region**: asia-southeast1 (Bangkok)

### Project Structure
```
saijo-backend/
├── .bmad-core/              # BMAD agent configuration
├── docs/                    # Complete project documentation
│   ├── epic-*.md            # Development epics
│   ├── stories/             # Detailed user stories
│   ├── prd/                 # Product Requirements Documents
│   ├── architecture/        # Architecture documentation
│   ├── testing/             # Testing guides and procedures
│   └── front-end-spec.md    # UI/UX specifications
├── smart-factory-backend/   # Quarkus backend services
│   ├── src/main/java/       # Java source code
│   ├── src/main/resources/  # Application configuration
│   ├── src/test/java/       # Backend tests
│   └── pom.xml              # Maven configuration
├── frontend/                # React frontend application (Vite)
│   ├── src/                 # React source code
│   ├── public/              # Static assets
│   └── package.json         # NPM configuration
└── Smart factory/           # Specifications and test data
```

## 🚀 Quick Start

### Prerequisites
- Java 17 or later
- Node.js 18 or later
- npm or yarn
- Google Cloud CLI (for deployment)
- Git

### Local Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd saijo-backend
   ```

2. **Backend Setup**
   ```bash
   cd smart-factory-backend
   mvn quarkus:dev
   ```

3. **Frontend Setup**
    ```bash
    cd frontend
    npm install
    npm run dev
    ```

4. **Access the Application**
    - Backend API: http://localhost:8080
    - Health Check: http://localhost:8080/api/v1/health
    - Frontend UI: http://localhost:5173
    - Swagger UI: http://localhost:8080/q/swagger-ui

### Environment Configuration

**Option 1: Firestore Emulator (Recommended for Local Development)**
```bash
# Install Firebase CLI
npm install -g firebase-tools

# Start Firestore emulator
firebase emulators:start --only firestore
```

Create `application-dev.properties` in `src/main/resources/`:
```properties
# Firestore Emulator Configuration (Local Development)
%dev.quarkus.firebase.use-emulator=true
%dev.firebase.project.id=demo-project

# Development Settings
%dev.quarkus.http.port=8080
%dev.quarkus.log.level=DEBUG
```

**Option 2: Real Firebase Project (Optional for Local Development)**
```properties
# Firebase Configuration (Real Project)
firebase.project.id=your-actual-project-id
# No credentials path needed - uses Application Default Credentials

# Development Settings
quarkus.http.port=8080
quarkus.log.level=DEBUG
```

### Google Cloud Project Setup

**For Production Deployment Only:**
1. **Create Google Cloud Project**
   ```bash
   gcloud projects create saijo-smart-factory --name="Saijo Smart Factory"
   gcloud config set project saijo-smart-factory
   ```

2. **Enable Required APIs**
   ```bash
   gcloud services enable firestore.googleapis.com
   gcloud services enable run.googleapis.com
   gcloud services enable cloudbuild.googleapis.com
   ```

3. **Create Firestore Database**
   ```bash
   gcloud firestore databases create --region=asia-southeast1
   ```

4. **Set up Cloud Run Service Account (for production)**
   ```bash
   gcloud iam service-accounts create saijo-backend-service \
     --display-name="Saijo Backend Service Account"
   
   gcloud projects add-iam-policy-binding saijo-smart-factory \
     --member="serviceAccount:saijo-backend-service@saijo-smart-factory.iam.gserviceaccount.com" \
     --role="roles/datastore.user"
   ```

**Note:** Local development uses Firestore emulator by default - no real Google Cloud project needed for development.

## 🧪 Testing

### Running Tests

**Backend Tests:**
```bash
# Unit tests
./mvnw test

# Integration tests with Testcontainers
./mvnw test -Dtest.profile=integration

# With coverage
./mvnw test jacoco:report
```

**Frontend Tests:**
```bash
cd frontend
npm test                    # Interactive mode
npm run test:coverage      # With coverage
```

**E2E Tests:**
```bash
# Start backend and frontend in separate terminals
./mvnw quarkus:dev  # Terminal 1
cd frontend && npm run dev  # Terminal 2

# Start Firestore emulator (Terminal 3)
firebase emulators:start --only firestore

# Run E2E tests (Terminal 4)
cd frontend
npx cypress run  # Headless mode
# OR
npx cypress open  # Interactive mode
```

### Test Structure
- **Backend**: JUnit 5, REST Assured, Testcontainers for Firestore testing
- **Frontend**: Vitest, React Testing Library, MSW for API mocking
- **E2E**: Cypress for full-stack integration testing with Firestore emulator
- **Coverage**: Minimum 80% for critical paths
- **Test Data**: Isolated testing with Firestore emulator (no real database usage)

## 📦 Deployment

### Google Cloud Run Deployment

1. **Using the deployment script (recommended)**
   ```bash
   # Make script executable
   chmod +x deploy.sh
   
   # Deploy to staging
   ./deploy.sh staging
   
   # Deploy to production
   ./deploy.sh production
   ```

2. **Manual deployment (if needed)**
   ```bash
   # Build frontend and backend together
   ./mvnw clean package
   
   # Deploy to Cloud Run
   gcloud run deploy saijo-backend \
     --source . \
     --platform managed \
     --region asia-southeast1 \
     --allow-unauthenticated
   ```

### Simple Deployment Script

The project uses a simple shell script approach for deployment:
- **Script**: `deploy.sh` in project root
- **Process**: Build → Test → Quality Check → Deploy → Health Check
- **Usage**: `./deploy.sh [staging|production]`

## 🔧 Development Guidelines

### Epic-Based Development

Development is organized into 4 main epics:

1. **Epic 1: Foundation & Infrastructure** (Stories 1.1-1.5)
   - Monorepo setup, testing infrastructure, CI/CD pipeline
   - Firestore integration, health checks

2. **Epic 2: Function Test Module** (Stories 2.1-2.4)
   - Data models, CRUD APIs for test standards
   - Test data retrieval and comparison APIs

3. **Epic 3: AI Suggestion APIs** (Stories 3.1-3.3)  
   - Calorie Meter and EMC data models
   - Intelligent suggestion algorithms

4. **Epic 4: Admin UI** (Stories 4.1-4.5)
    - React frontend with TypeScript and Tailwind CSS
    - Full integration with backend APIs

### Code Quality Standards

**Backend (Java):**
- Follow Quarkus conventions and best practices
- Use CDI for dependency injection
- Implement proper error handling with standardized responses
- Include comprehensive JavaDoc for public APIs

**Frontend (TypeScript):**
- Use functional components with hooks
- Implement proper TypeScript types for all props and state
- Follow Tailwind CSS design system guidelines
- Include accessibility attributes (WCAG 2.1 AA compliance)

### API Guidelines

**REST API Standards:**
- Use proper HTTP status codes (200, 201, 400, 404, 500)
- Implement consistent error response format
- Follow REST naming conventions
- Include OpenAPI/Swagger documentation

**Response Format:**
```json
{
  "success": true,
  "data": {...},
  "message": "Operation completed successfully",
  "timestamp": "2025-08-30T10:30:00Z"
}
```

## 📊 Monitoring and Observability

### Health Monitoring
- **Health Check Endpoint**: `/q/health`
- **Metrics**: `/q/metrics`
- **Google Cloud Monitoring**: Automatic integration

### Logging
- **Backend**: Uses Quarkus logging with structured output
- **Frontend**: Console logging in development, structured logging in production
- **Google Cloud Logging**: Centralized log aggregation

### Performance Monitoring
- **Target**: 95% of API responses under 500ms (NFR4)
- **Frontend**: Sub-3s page load, sub-100ms interactions
- **Monitoring**: Google Cloud Monitoring with custom dashboards

## 🔒 Security Considerations

- **Authentication**: Currently not implemented (admin UI without login per PRD)
- **Data Protection**: Firestore security rules for data isolation
- **API Security**: Input validation, XSS protection, CORS configuration
- **Deployment**: HTTPS enforced, security headers configured

## 🤝 Contributing

### Story Development Process

1. **Epic Assignment**: Work within assigned epic boundaries
2. **Story Implementation**: Follow acceptance criteria precisely
3. **Testing**: Include unit, integration, and E2E tests
4. **Documentation**: Update relevant docs with changes
5. **Code Review**: All changes require peer review

### Quality Checklist

- [ ] All acceptance criteria met
- [ ] Tests written and passing (minimum 80% coverage)
- [ ] Code follows established patterns and standards
- [ ] API documentation updated if applicable
- [ ] Error handling implemented properly
- [ ] Performance requirements validated

## 📞 Support and Contact

- **Technical Issues**: Create GitHub issue with detailed description
- **Development Questions**: Consult architecture.md and story documentation
- **Deployment Issues**: Check Google Cloud Run logs and monitoring

---

## 📁 Documentation Index

- **[Product Requirements](docs/prd.md)**: Complete business requirements and goals
- **[Architecture Document](docs/architecture.md)**: Detailed technical architecture
- **[Frontend Specification](docs/front-end-spec.md)**: UI/UX design requirements  
- **[Epic Breakdown](docs/)**: Development phases and story organization
- **[API Schema](docs/api-schema.md)**: Detailed API specifications
- **[Stories Directory](docs/stories/)**: Individual user story implementations

---

*Generated with 🤖 [BMAD™ Core](https://github.com/bmaddy/bmad-core) - AI-powered development workflow*