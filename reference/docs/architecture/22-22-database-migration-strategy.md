<!-- Powered by BMAD™ Core -->
# 22. Database Migration Strategy

## 1. Guiding Principles

- **Automated & Repeatable:** All schema and data migrations must be executed via automated scripts. Manual changes to the production database are strictly forbidden.
- **Backward Compatibility:** Migrations must be backward-compatible. The application should be able to handle data in both the old and new formats during a transition period, which is critical for zero-downtime deployments.
- **Idempotency:** Migration scripts must be idempotent, meaning they can be run multiple times without changing the result beyond the initial application.
- **Tracked & Versioned:** Every migration script is versioned, and its execution status is tracked in the database.

## 2. Migration Process

We will use a simple, script-based migration approach managed within our existing CI/CD pipeline.

**Step 1: Create a Migration Script**

- Migrations will be stored in a new top-level directory: `/migrations`.
- Scripts will be named with a version and descriptive title, e.g., `migrations/v1_001_add_creation_timestamp_to_standards.js`.
- Each script will be a Node.js script that uses the Firebase Admin SDK.

**Step 2: Track Executed Migrations**

- A dedicated Firestore collection named `_bmad_db_migrations` will be used to track which scripts have been executed.
- Before running a script, the migration runner will check if a document with the script's version ID already exists in this collection. If it does, the script is skipped.
- After a script runs successfully, its version ID is added to the collection.

**Step 3: Integrate into CI/CD**

- A new step will be added to the `cloudbuild.yaml` file.
- This step will run **before** the `gcloud run deploy` step.
- It will execute a runner script (e.g., `run-migrations.js`) that iterates through the `/migrations` directory, checks the `_bmad_db_migrations` collection, and runs any new scripts in order.

### Example `cloudbuild.yaml` modification:

```yaml
steps:
  # ... previous build steps (npm build, mvn package, docker build) ...

  # NEW STEP: Run database migrations
  - name: 'node:18-alpine'
    entrypoint: 'node'
    args: ['run-migrations.js']
    env:
      - 'GOOGLE_APPLICATION_CREDENTIALS=/workspace/firebase-service-account.json' # Ensure credentials are available

  # Deploy to Cloud Run (only after successful migration)
  - name: 'gcr.io/cloud-builders/gcloud'
    args:
      - 'run'
      - 'deploy'
      # ... rest of deployment config
```

## 3. Writing Migration Scripts

- **Schema Changes:** For adding fields, the script should query all documents in a collection and add the new field with a default value.
- **Data Changes:** For transforming data, the script should read documents, apply the transformation, and write them back.
- **Error Handling:** Each script must include robust error handling and logging.

### Example Migration Script (`v1_001_...`):

```javascript
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// ... (Initialization code for Firebase Admin SDK)

async function migrate() {
  const db = getFirestore();
  const standardsRef = db.collection('indoorUnitStandards');
  const snapshot = await standardsRef.where('createdAt', '==', null).get();

  if (snapshot.empty) {
    console.log('No documents to migrate.');
    return;
  }

  const batch = db.batch();
  snapshot.forEach(doc => {
    batch.update(doc.ref, { createdAt: new Date() });
  });

  await batch.commit();
  console.log(`Migrated ${snapshot.size} documents.`);
}

migrate().catch(console.error);
```

## 4. Rollback Strategy for Migrations

- **Schema Changes:** The primary strategy is **forward compatibility**. The application code deployed should be able to handle both the pre-migration and post-migration data structure gracefully. For example, when reading a document, the code should check for the presence of the new field and handle its absence.
- **Data Changes:** For destructive data changes, a **compensating script** should be written. For example, if `v1_002_rename_field_foo_to_bar.js` is created, a corresponding `v1_002_rollback_rename_bar_to_foo.js` should also be created. Rolling back would involve running the compensating script manually in a controlled environment.
