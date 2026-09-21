<!-- Powered by BMAD™ Core -->
# 21. Rollback and Recovery Strategy

## 1. Guiding Principles

- **Speed over Diagnosis:** The immediate priority during a production failure is to restore service, not to debug the issue in real-time.
- **Immutable Deployments:** Each deployment creates an immutable, versioned revision in Google Cloud Run. We do not patch live services; we deploy a new, corrected version or roll back to a previous stable one.
- **Proactive Mitigation:** The best recovery is avoiding the need for one. Feature flags should be used for significant changes to allow for instant disabling without a full rollback.

## 2. Rollback Triggers

A rollback should be initiated if automated monitoring or manual checks reveal any of the following within 15 minutes of a new deployment:

- **Health Check Failures:** The `/api/v1/health` endpoint fails consistently.
- **Increased 5xx Error Rate:** A sustained spike (e.g., >5% of requests) in server-side errors (500, 502, 503, 504) as reported by Google Cloud Monitoring.
- **Critical Functionality Failure:** A core user journey is confirmed to be broken (e.g., data submission, standards management).
- **Performance Degradation:** A significant increase (>50%) in API latency for key endpoints.

## 3. Google Cloud Run Rollback Procedure

Google Cloud Run retains previous revisions, making rollbacks a matter of redirecting traffic.

**Step 1: Identify the Stable Revision**

List the recent revisions for the service to find the last known good version.

```bash
# Replace {SERVICE_NAME} and {REGION} with appropriate values
gcloud run revisions list --service={SERVICE_NAME} --region={REGION} --format="table(revisionName,creationTime,traffic_split)"
```

**Step 2: Immediately Shift 100% of Traffic to the Stable Revision**

This is the fastest way to restore service.

```bash
# Replace {SERVICE_NAME}, {STABLE_REVISION_NAME}, and {REGION}
gcloud run services update-traffic {SERVICE_NAME} --to-revisions={STABLE_REVISION_NAME}=100 --region={REGION}
```
This command instantly diverts all users to the previous stable version. The faulty revision receives no traffic but is kept for later analysis.

**Step 3: Tag the Stable Revision (Optional but Recommended)**

To make future rollbacks easier, you can tag a revision as `stable`.

```bash
gcloud run revisions update {STABLE_REVISION_NAME} --add-tag=stable --region={REGION}
```

## 4. Post-Rollback Process

1.  **Create Post-Mortem:** A new incident report must be created to document the failure and the recovery process.
2.  **Analyze Failed Revision:** The faulty revision should be investigated in a non-production environment to identify the root cause.
3.  **Block Promotion:** The commit that caused the faulty deployment must be reverted or fixed before any new deployments can proceed.

## 5. Proactive Mitigation: Feature Flags

For high-risk changes, a full rollback should be the last resort. Instead, changes should be wrapped in feature flags.

- **Mechanism:** Use a configuration-based feature flag system (e.g., Firestore-based configuration that the application reads at startup).
- **Benefit:** If a new feature causes issues, it can be disabled instantly by changing a configuration value and restarting the service, without needing a full deployment rollback. This is much faster and less disruptive.
