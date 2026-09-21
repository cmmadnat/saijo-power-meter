# Deployment Setup Guide

## Prerequisites

### 1. Firebase Service Account Setup
To deploy the Saijo Smart Factory application, you need Firebase credentials:

**Step-by-step:**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your `saijo-monitoring` project
3. Click the gear icon ⚙️ → **Project Settings**
4. Go to **Service Accounts** tab
5. Click **Generate new private key**
6. Download the JSON file
7. Rename and place it in the project root:
   ```bash
   mv ~/Downloads/saijo-monitoring-firebase-adminsdk-xxxxx.json ./firebase-service-account.json
   ```

**⚠️ SECURITY IMPORTANT**: The `firebase-service-account.json` file is already added to `.gitignore` and will never be committed to version control.

### 2. Google Cloud CLI Authentication
Ensure you're authenticated with Google Cloud:
```bash
# Login to Google Cloud
gcloud auth login

# Set application default credentials
gcloud auth application-default login

# Verify authentication
gcloud auth list
```

### 3. Enable Required APIs
```bash
# Enable required Google Cloud APIs
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com
```

## Deployment Commands

### Staging Deployment
```bash
./deploy.sh staging
```

### Production Deployment
```bash
./deploy.sh production
```

## What the Deployment Script Does

### ✅ Complete Feature Set:
1. **Prerequisites Validation**
   - Checks gcloud CLI installation and authentication
   - Validates Firebase credentials (optional)
   - Sets up Google Cloud project configuration

2. **Code Quality Checks**
   - Backend: Maven Checkstyle validation
   - Frontend: ESLint code quality checks
   - TODO/FIXME comment detection

3. **Build and Test Pipeline**
   - Backend: Maven clean, test, and package
   - Frontend: npm install, lint, test, and build
   - Integration: Copies frontend build to backend static resources

4. **Containerization**
   - Builds Docker image using Google Cloud Build
   - Handles multi-stage builds for optimization
   - Includes health check configuration

5. **Google Cloud Run Deployment**
   - Deploys to `smart-factory-backend` (production) or `smart-factory-backend-staging`
   - Configures environment variables for Firebase
   - Sets resource limits (512Mi memory, 1 CPU)
   - Enables autoscaling (0-10 instances)

6. **Post-Deployment Validation**
   - Health check endpoint validation with retries
   - Frontend static serving tests
   - Comprehensive deployment summary

## Service Configuration

### Environment Variables
The deployment automatically configures:
- `FIREBASE_PROJECT_ID`: Set to `saijo-monitoring`
- `FIREBASE_CREDENTIALS_PATH`: Path to service account file (if provided)

### Resource Limits
- **Memory**: 512Mi
- **CPU**: 1 vCPU
- **Timeout**: 300 seconds
- **Concurrency**: Default (80 requests per instance)
- **Min Instances**: 0 (cost-optimized)
- **Max Instances**: 10

### Access Configuration
- **Public Access**: Allow unauthenticated requests
- **HTTPS**: Automatically enabled
- **Custom Domain**: Can be configured later

## Service URLs

After deployment, your service will be available at:
- **Staging**: `https://smart-factory-backend-staging-[hash]-uc.a.run.app`
- **Production**: `https://smart-factory-backend-[hash]-uc.a.run.app`

### Key Endpoints:
- **Health Check**: `/api/v1/health`
- **Frontend UI**: `/`
- **API Documentation**: `/q/swagger-ui`

## Monitoring and Logs

### View Logs
```bash
# View latest logs
gcloud run services logs read smart-factory-backend --region=asia-southeast1

# Follow logs in real-time
gcloud run services logs tail smart-factory-backend --region=asia-southeast1
```

### Monitoring
Google Cloud Run provides automatic monitoring for:
- Request rate and latency
- Error rate and status codes
- Memory and CPU usage
- Instance scaling metrics

## Troubleshooting

### Common Issues:

1. **Authentication Errors**
   ```bash
   # Re-authenticate
   gcloud auth login
   gcloud auth application-default login
   ```

2. **Build Failures**
   ```bash
   # Check build logs
   gcloud builds log [BUILD-ID]
   ```

3. **Health Check Failures**
   - Service may take 30-60 seconds to become ready
   - Check Cloud Run logs for startup errors
   - Verify Firestore connectivity

4. **Frontend Not Loading**
   - Ensure frontend build was successful
   - Check that static resources were copied correctly
   - Verify CORS configuration

### Support Commands:
```bash
# Check service status
gcloud run services describe smart-factory-backend --region=asia-southeast1

# Update service configuration
gcloud run services update smart-factory-backend --region=asia-southeast1 [options]

# Delete service (if needed)
gcloud run services delete smart-factory-backend --region=asia-southeast1
```

## Security Best Practices

1. **Credentials**: Never commit Firebase credentials to git
2. **Environment**: Use different projects for staging/production
3. **Access**: Review IAM permissions regularly
4. **Monitoring**: Enable Google Cloud Security Center
5. **Updates**: Keep dependencies and base images updated

---

Ready to deploy! Run `./deploy.sh staging` to get started. 🚀