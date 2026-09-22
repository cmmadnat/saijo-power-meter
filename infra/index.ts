import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

const region = new pulumi.Config("gcp").require("region");

// Everything below is created and owned by Pulumi. The only resources that live
// outside this program are the ones bootstrap.sh and scripts/setup-cloud-build.sh
// make, because they have to exist before Pulumi can run at all, or because they
// are secret values that cannot live in code: the state bucket, its KMS key and
// the deployer service account. The Secret Manager *secrets* are declared here;
// only their values are added out of band, since a secret value in a Pulumi
// program is a secret value in the state bucket and in every diff.

// App-level API enablement. The bootstrap enables only what it needs itself.
const services = [
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "iam.googleapis.com", // creating the service the app runs as
    // The delivery pipeline itself. It holds no secrets of its own any more:
    // the App connection fetches the source, so the deploy key, the webhook
    // secret and the API key are all gone. Secret Manager is back below, for
    // the broker's credentials rather than for the pipeline.
    "cloudbuild.googleapis.com",
    // The warehouse. The dataset is declared below; its tables are not, because
    // they are schema and arrive through the migration runner in
    // packages/infrastructure/src/warehouse.
    "bigquery.googleapis.com",
    // The broker's credentials. The secrets are declared below; their values
    // are added out of band, because a secret value in a Pulumi program is a
    // secret value in the state bucket.
    "secretmanager.googleapis.com",
    // On by default in every project, declared anyway: the logs workflows are
    // useless without it, and a project where someone turned it off should fail
    // here rather than in a job that reads zero entries and looks healthy.
    "logging.googleapis.com",
    // Alerting on a failed build. Declared for the same reason as logging: a
    // project where this is off should fail here, not by silently never
    // sending the one email anybody relies on.
    "monitoring.googleapis.com",
].map(
    (service) =>
        new gcp.projects.Service(service.split(".")[0], {
            service,
            // Leave APIs on when a resource is destroyed: disabling one cascades
            // to every other resource in the project that depends on it.
            disableOnDestroy: false,
        }),
);

// Container images for the Cloud Run service.
const images = new gcp.artifactregistry.Repository(
    "images",
    {
        repositoryId: "app",
        location: region,
        format: "DOCKER",
        description: "Application container images",
    },
    { dependsOn: services },
);

export const imageRepository = pulumi.interpolate`${images.location}-docker.pkg.dev/${images.project}/${images.repositoryId}`;

// The image the Cloud Run service runs, passed in by CI as a digest-free but
// commit-pinned tag. It is an environment variable rather than stack config for
// the same reason GOOGLE_PROJECT is: it changes on every deploy, and writing it
// into Pulumi.dev.yaml would mean a commit per deploy.
//
// It must be pinned to the commit, never :latest. Cloud Run only rolls out a new
// revision when the image reference changes, so a floating tag would leave the
// service on its old revision and the deploy would silently do nothing.
const webImage = process.env.WEB_IMAGE;
if (!webImage) {
    throw new Error(
        "WEB_IMAGE is not set. The pipeline builds and pushes the web image, " +
            "then passes its commit-pinned reference here. See ci/pulumi.sh.",
    );
}

// The identity the service runs as, rather than the project's default compute
// service account, which is over-privileged by default. It holds no roles yet;
// database and secret access get granted here when those steps land.
const webIdentity = new gcp.serviceaccount.Account(
    "web",
    {
        accountId: "power-meter-web",
        displayName: "Power Meter web service",
    },
    { dependsOn: services },
);

// --- The warehouse -----------------------------------------------------------
//
// The dataset is a Google Cloud resource, so it is declared here with
// everything else. Its tables are not: they are schema, and schema is versioned,
// ordered and idempotent migrations applied by a runner — CLAUDE.md's rule, and
// the line this file draws is the same one bootstrap.sh draws for the state
// bucket. The pipeline's `migrate` step applies them — it arrived with step 7,
// where the ingester became the first thing that depends on the tables
// existing; see ci/migrate.sh.
//
// Retention is a table setting (a 14-day partition expiry), not a resource and
// not a cleanup job, so it lives with the DDL rather than here.
const warehouse = new gcp.bigquery.Dataset(
    "warehouse",
    {
        datasetId: "power_meter",
        friendlyName: "Power Meter readings",
        description:
            "Meter readings, the 1-minute rollup and the latest-reading table. Schema is applied by the migration runner in packages/infrastructure/src/warehouse.",
        location: region,
        // Never on a dataset holding the only copy of the history: Pulumi would
        // otherwise drop fourteen days of readings to replace a description.
        deleteContentsOnDestroy: false,
    },
    { dependsOn: services },
);

// Read-only access for the web app. It cannot write, and it cannot see any
// other dataset. Live mode reads the charts, the strip and History through it
// (apps/web/lib/live-adapters.ts); demo mode never constructs a client.
new gcp.bigquery.DatasetIamMember("web-warehouse-reader", {
    datasetId: warehouse.datasetId,
    role: "roles/bigquery.dataViewer",
    member: pulumi.interpolate`serviceAccount:${webIdentity.email}`,
});

// Running a query is a project-level permission, and there is no narrower one:
// jobUser grants the right to start a job and bill it to this project, not the
// right to read anything. What it can read is still only the dataset above.
new gcp.projects.IAMMember("web-warehouse-jobs", {
    project: warehouse.project,
    role: "roles/bigquery.jobUser",
    member: pulumi.interpolate`serviceAccount:${webIdentity.email}`,
});

export const warehouseDataset = warehouse.datasetId;

// --- The MQTT ingester -------------------------------------------------------
//
// One always-on service holding the subscription to the nine station topics.
// Everything about it is shaped by one constraint: **there must be exactly one
// of it.** Two instances means two subscriptions, every reading stored twice
// and every energy total wrong, so `minInstanceCount` and `maxInstanceCount`
// are both 1 and that is correctness rather than tuning. The second half of
// that guarantee is in the application — a fixed MQTT client id, so a broker
// evicts the older session, and an evicted instance that exits instead of
// reconnecting. See apps/ingester/src/broker.ts.
//
// It is not deployed yet, and `deployIngester` is why. The scale factors for
// active power and energy are still guesses (see the plan's "Still open"), the
// service refuses to start against a real broker while they are, and a
// crash-looping revision would fail every apply from here on. So this step
// declares the identity, the secrets and the access the service needs — all of
// which are useful now and none of which ingest anything — and leaves the
// service itself behind a flag that is flipped in the same change that confirms
// the divisors and adds the secret versions.

const deployIngester = new pulumi.Config().getBoolean("deployIngester") ?? false;

// The broker's address and credentials. The *containers* are declared here; the
// values are not, and cannot be: a secret in a Pulumi program is a secret in
// the state bucket and in a diff. Versions are added out of band, once:
//
//   printf '%s' "$PASSWORD" | gcloud secrets versions add mqtt-broker-password \
//     --project saijo-power-meter --data-file=-
//
// The customer's workbook carries these in plaintext on its `MQTT Server` tab.
// They should be rotated before go-live, and the rotation is a new version
// here plus a restart of the service — no deploy.
const brokerSecrets = [
    { secretId: "mqtt-broker-url", env: "MQTT_URL" },
    { secretId: "mqtt-broker-username", env: "MQTT_USERNAME" },
    { secretId: "mqtt-broker-password", env: "MQTT_PASSWORD" },
].map(({ secretId, env }) => ({
    env,
    secretId,
    secret: new gcp.secretmanager.Secret(
        secretId,
        {
            secretId,
            replication: { userManaged: { replicas: [{ location: region }] } },
            labels: { component: "ingester" },
        },
        { dependsOn: services },
    ),
}));

const ingesterIdentity = new gcp.serviceaccount.Account(
    "ingester",
    {
        accountId: "power-meter-ingester",
        displayName: "Power Meter MQTT ingester",
    },
    { dependsOn: services },
);

// Write access to the warehouse, and only to it. dataEditor on the dataset
// rather than a project-level role: the ingester appends to three tables and
// has no business reading, creating or dropping anything else. Migrations are
// not its job either — the pipeline runs those as the deployer.
new gcp.bigquery.DatasetIamMember("ingester-warehouse-writer", {
    datasetId: warehouse.datasetId,
    role: "roles/bigquery.dataEditor",
    member: pulumi.interpolate`serviceAccount:${ingesterIdentity.email}`,
});

// A load job is a job, and starting one is a project-level permission. It
// grants the right to run a job and bill it here, not the right to read
// anything: what this account can touch is still only the dataset above.
new gcp.projects.IAMMember("ingester-warehouse-jobs", {
    project: warehouse.project,
    role: "roles/bigquery.jobUser",
    member: pulumi.interpolate`serviceAccount:${ingesterIdentity.email}`,
});

for (const { secretId, secret } of brokerSecrets) {
    new gcp.secretmanager.SecretIamMember(`ingester-${secretId}`, {
        secretId: secret.id,
        role: "roles/secretmanager.secretAccessor",
        member: pulumi.interpolate`serviceAccount:${ingesterIdentity.email}`,
    });
}

const ingesterImage = process.env.INGESTER_IMAGE;

function deployTheIngester(): gcp.cloudrunv2.Service {
    if (!ingesterImage) {
        throw new Error(
            "INGESTER_IMAGE is not set but deployIngester is true. The pipeline " +
                "builds and pushes the ingester image, then passes its commit-pinned " +
                "reference here; see ci/pulumi.sh.",
        );
    }

    const ingester = new gcp.cloudrunv2.Service(
        "ingester",
        {
            name: "power-meter-ingester",
            location: region,
            deletionProtection: false,
            // Reachable, but not by anyone: no allUsers binding below, so a
            // caller needs an ID token. INGRESS_TRAFFIC_ALL rather than
            // internal-only because the web service's egress does not go
            // through a VPC, and internal-only would make the hot state
            // unreachable from the one thing that reads it.
            ingress: "INGRESS_TRAFFIC_ALL",
            template: {
                serviceAccount: ingesterIdentity.email,
                // Exactly one. See the note above: this is the correctness
                // constraint, not a cost setting.
                scaling: { minInstanceCount: 1, maxInstanceCount: 1 },
                containers: [
                    {
                        image: ingesterImage,
                        ports: { containerPort: 8080 },
                        resources: {
                            limits: { cpu: "1", memory: "512Mi" },
                            // CPU always allocated. The work here happens
                            // between requests — that is the whole point of the
                            // service — and a throttled instance would stop
                            // decoding the moment nobody was looking at the
                            // screen.
                            cpuIdle: false,
                        },
                        envs: [
                            { name: "GOOGLE_PROJECT", value: warehouse.project },
                            { name: "WAREHOUSE_DATASET", value: warehouse.datasetId },
                            { name: "WAREHOUSE_LOCATION", value: region },
                            // Fixed, so the broker evicts the old connection
                            // when a new revision attaches.
                            { name: "MQTT_CLIENT_ID", value: "power-meter-ingester" },
                            // `latest`, so rotating a credential is a new secret
                            // version and a restart rather than a deploy.
                            ...brokerSecrets.map(({ env, secretId }) => ({
                                name: env,
                                valueSource: {
                                    secretKeyRef: { secret: secretId, version: "latest" },
                                },
                            })),
                        ],
                        // Readiness is "connected to the broker and rehydrated",
                        // so a revision that cannot reach the broker never takes
                        // traffic and the deploy fails visibly instead of
                        // silently serving an empty hot state.
                        startupProbe: {
                            httpGet: { path: "/readyz", port: 8080 },
                            initialDelaySeconds: 5,
                            periodSeconds: 5,
                            timeoutSeconds: 3,
                            failureThreshold: 12,
                        },
                        // Liveness is only "the process is up". A broker outage
                        // must not restart the container: that would throw away
                        // the buffer and the hot state on top of the outage.
                        livenessProbe: {
                            httpGet: { path: "/healthz", port: 8080 },
                            periodSeconds: 30,
                            timeoutSeconds: 3,
                            failureThreshold: 3,
                        },
                    },
                ],
            },
        },
        { dependsOn: [images, warehouse, ...services] },
    );

    // The web app, and nothing else. Deliberately not allUsers: this endpoint
    // is the live state of a factory and there is no passcode in front of it
    // until step 9.
    new gcp.cloudrunv2.ServiceIamMember("ingester-web-invoker", {
        name: ingester.name,
        location: ingester.location,
        role: "roles/run.invoker",
        member: pulumi.interpolate`serviceAccount:${webIdentity.email}`,
    });

    return ingester;
}

const ingesterService = deployIngester ? deployTheIngester() : undefined;

// --- The web service ---------------------------------------------------------
//
// Declared after the ingester because live mode needs the ingester's URL, and
// the URL is only known once that service exists.
//
// `dataMode` is the one switch the web app reads (DATA_MODE, apps/web/lib/
// data-mode.ts), and it is "demo" until the same change that flips
// `deployIngester`. Two things make "live" impossible to set early by mistake:
// this program refuses it without the ingester, and the app itself refuses to
// boot in live mode while a scale divisor is a guess — a revision configured
// that way would crash-loop and fail the apply, which is the same reason the
// ingester sits behind its own flag.
const dataMode = new pulumi.Config().get("dataMode") ?? "demo";
if (dataMode !== "demo" && dataMode !== "live") {
    throw new Error(`saijo-power-meter:dataMode must be "demo" or "live", not ${dataMode}.`);
}
if (dataMode === "live" && ingesterService === undefined) {
    throw new Error(
        "saijo-power-meter:dataMode is \"live\" but deployIngester is false. Live mode " +
            "reads the real-time table from the ingester; flip both in the same change.",
    );
}

const webEnvs = [
    { name: "DATA_MODE", value: dataMode },
    // The warehouse the charts, the strip and History read in live mode. Set in
    // either mode: they are addresses, not credentials, and demo ignores them.
    { name: "GOOGLE_PROJECT", value: warehouse.project },
    { name: "WAREHOUSE_DATASET", value: warehouse.datasetId },
    { name: "WAREHOUSE_LOCATION", value: region },
    // The ingester is private; the web service's account holds run.invoker on
    // it and mints an ID token with this URL as the audience.
    ...(ingesterService ? [{ name: "INGESTER_URL", value: ingesterService.uri }] : []),
];

const web = new gcp.cloudrunv2.Service(
    "web",
    {
        name: "power-meter-web",
        location: region,
        deletionProtection: false,
        ingress: "INGRESS_TRAFFIC_ALL",
        template: {
            serviceAccount: webIdentity.email,
            // Scales to zero: the web app is only running while someone is
            // looking at it. The MQTT ingester, when it lands, is the opposite
            // case and has to be pinned to exactly one always-on instance.
            scaling: { minInstanceCount: 0, maxInstanceCount: 4 },
            containers: [
                {
                    image: webImage,
                    // Matches EXPOSE in web/Dockerfile. Cloud Run passes the
                    // same number to the container as PORT, which the Next
                    // standalone server reads.
                    ports: { containerPort: 8080 },
                    resources: {
                        limits: { cpu: "1", memory: "512Mi" },
                        cpuIdle: true,
                    },
                    envs: webEnvs,
                },
            ],
        },
    },
    { dependsOn: [images, ...services, ...(ingesterService ? [ingesterService] : [])] },
);

// Public for now. There is nothing behind it but the shell and placeholder
// screens: no meter data, no secrets. Step 9 puts the whole app behind a shared
// passcode, at which point this stays public at the network edge and the
// application does the gating.
new gcp.cloudrunv2.ServiceIamMember("web-public", {
    name: web.name,
    location: web.location,
    role: "roles/run.invoker",
    member: "allUsers",
});

export const ingesterServiceAccount = ingesterIdentity.email;
export const ingesterDeployed = deployIngester;
export const ingesterUrl = ingesterService?.uri;

// --- Reading the application's logs from CI ----------------------------------
//
// This session holds no Google Cloud credentials and does not get any: CI is the
// only thing with an identity that can reach the project. Reading Cloud Run logs
// therefore goes through .github/workflows/logs.yml, which authenticates as the
// account below over the same Workload Identity Federation provider the deployer
// uses.
//
// It is a second account rather than roles/logging.viewer on the deployer,
// because the point is what the logs job *cannot* do. The deployer carries nine
// admin roles; a job that only ever reads log entries should not be able to
// deploy a revision, push an image, or touch the state bucket.
const wifPoolId = new pulumi.Config().get("wifPoolId") ?? "github";
const githubRepository =
    new pulumi.Config().get("githubRepository") ?? "cmmadnat/saijo-power-meter";

const logReader = new gcp.serviceaccount.Account(
    "log-reader",
    {
        // Deterministic on purpose. .github/workflows/logs.yml derives this
        // address from GCP_PROJECT_ID rather than reading a sixth repository
        // variable, so there is no setup step between applying this and the
        // workflow working. Changing accountId means changing the workflow.
        accountId: "power-meter-log-reader",
        displayName: "Power Meter log reader (GitHub Actions)",
    },
    { dependsOn: services },
);

// Log entries only. Not privateLogViewer: that one adds data-access logs, which
// no question about the application needs and which are the sensitive ones.
new gcp.projects.IAMMember("log-reader-viewer", {
    project: logReader.project,
    role: "roles/logging.viewer",
    member: pulumi.interpolate`serviceAccount:${logReader.email}`,
});

// The same account also reads Cloud Build, because a build log is the other
// thing this session cannot see for itself and the alternative was a third
// service account with the same shape. Listing a build and reading its log are
// two separate permissions — logging.viewer above covers the log, this covers
// the build record and its status.
new gcp.projects.IAMMember("log-reader-builds", {
    project: logReader.project,
    role: "roles/cloudbuild.builds.viewer",
    member: pulumi.interpolate`serviceAccount:${logReader.email}`,
});

// Lets the repository's Actions runs impersonate the account, with no key. The
// principal set is scoped to this one repository — the provider's attribute
// condition (set in bootstrap.sh) already refuses tokens from any other, and
// this binding is the second half of that pairing.
const project = gcp.organizations.getProject({});
new gcp.serviceaccount.IAMMember("log-reader-wif", {
    serviceAccountId: logReader.name,
    role: "roles/iam.workloadIdentityUser",
    member: pulumi.interpolate`principalSet://iam.googleapis.com/projects/${project.then(
        (p) => p.number,
    )}/locations/global/workloadIdentityPools/${wifPoolId}/attribute.repository/${githubRepository}`,
});

export const webUrl = web.uri;
export const webServiceAccount = webIdentity.email;

// ---------------------------------------------------------------------------
// The delivery pipeline
// ---------------------------------------------------------------------------
// Cloud Build, connected to GitHub through the Cloud Build GitHub App.
//
// This started as webhook triggers, so that GitHub would hold nothing but a
// read-only deploy key and two URLs. That design is recorded in
// docs/architecture/delivery-pipeline.md along with why it was abandoned: four
// separate defects, every one of them accepted at trigger-create time and
// failing only at invocation, with errors that named nothing. Not one build was
// ever created.
//
// What the App connection buys, beyond working: Cloud Build fetches the source
// itself, so the deploy key, the SSH clone step, the webhook secret and the API
// key all disappear — four credentials down to none. It also posts build status
// back to the pull request as a check, which closes the reporting gap the
// webhook design could not.
//
// What it costs: a GitHub App installed on the repository, with write access to
// statuses. That is a real concession against "GitHub holds nothing", and it is
// the reason this was the second choice rather than the first.
//
// The App connection is a one-time console handshake and must exist BEFORE
// these triggers can be created; see scripts/setup-cloud-build.sh.

const projectId = process.env.GOOGLE_PROJECT ?? gcp.config.project;
if (!projectId) {
    throw new Error(
        "GOOGLE_PROJECT is not set and gcp:project is not configured. The " +
            "pipeline passes it in; see ci/pulumi.sh.",
    );
}

const [repoOwner, repoName] = githubRepository.split("/");
const stateBucket = process.env.PULUMI_STATE_BUCKET ?? `${projectId}-pulumi-state`;
const kmsKey = `projects/${projectId}/locations/${region}/keyRings/pulumi/cryptoKeys/state`;

// Builds run as the deployer account. Reusing it is deliberate: it already
// carries exactly the roles a deploy needs, and a second account with the same
// grants would be a second thing to audit.
const deployerEmail =
    process.env.DEPLOYER_SA ?? `pulumi-deployer@${projectId}.iam.gserviceaccount.com`;

// CLOUD_LOGGING_ONLY is required, not a preference: a build running as a
// user-specified service account has no default log bucket to write to, and
// omitting this fails the build before step one with a message about storage
// that does not mention logging at all.
const buildOptions = {
    logging: "CLOUD_LOGGING_ONLY",
};

// $COMMIT_SHA is supplied by Cloud Build for a GitHub-connected trigger, so
// nothing here has to bind it out of a payload.
const registry = `${region}-docker.pkg.dev/${projectId}/app`;
const imageRef = `${registry}/web:` + "$COMMIT_SHA";
const ingesterImageRef = `${registry}/ingester:` + "$COMMIT_SHA";
// Floating on purpose, and never deployed: only ever read from and written to
// as BuildKit layer caches.
const cacheRef = `${registry}/web:cache`;
const ingesterCacheRef = `${registry}/ingester:cache`;

function pipelineBuild(mode: "preview" | "apply"): gcp.types.input.cloudbuild.TriggerBuild {
    // No clone step. Cloud Build fetches the source into /workspace itself,
    // which is most of what the App connection is worth: the deploy key, the
    // ssh-keyscan, the detached checkout and the one failure that could not
    // report itself are all gone.
    return {
        steps: [
            {
                id: "image",
                name: "gcr.io/cloud-builders/docker",
                entrypoint: "bash",
                args: ["ci/step.sh", "image", "ci/image.sh"],
                envs: [
                    `MODE=${mode}`,
                    `WEB_IMAGE=${imageRef}`,
                    `WEB_CACHE_IMAGE=${cacheRef}`,
                    `INGESTER_IMAGE=${ingesterImageRef}`,
                    `INGESTER_CACHE_IMAGE=${ingesterCacheRef}`,
                ],
            },
            // Migrations before the revision that depends on them, which is
            // CLAUDE.md's rule and the reason this step exists at all: step 7
            // is where something first reads the warehouse. On a pull request
            // it is a dry run. See ci/migrate.sh for what that does and does
            // not prove.
            {
                id: "migrate",
                name: "node:22",
                entrypoint: "bash",
                args: ["ci/step.sh", "migrate", "ci/migrate.sh"],
                envs: [
                    `MODE=${mode}`,
                    `GOOGLE_PROJECT=${projectId}`,
                    "WAREHOUSE_DATASET=power_meter",
                    `WAREHOUSE_LOCATION=${region}`,
                ],
            },
            {
                id: "pulumi",
                name: "pulumi/pulumi-nodejs:latest",
                entrypoint: "bash",
                args: ["ci/step.sh", "pulumi", "ci/pulumi.sh"],
                envs: [
                    `MODE=${mode}`,
                    `GOOGLE_PROJECT=${projectId}`,
                    `GITHUB_REPO=${githubRepository}`,
                    `PULUMI_BACKEND_URL=gs://${stateBucket}`,
                    `WEB_IMAGE=${imageRef}`,
                    `INGESTER_IMAGE=${ingesterImageRef}`,
                    `KMS_KEY=${kmsKey}`,
                ],
            },
            // Always last, and always runs, because nothing ahead of it can
            // fail — see ci/step.sh. It ends the log with a step-by-step verdict
            // and the tail of whatever failed, then exits non-zero if any step
            // failed, which is what makes the build's own status honest.
            {
                id: "report",
                name: "gcr.io/google.com/cloudsdktool/cloud-sdk:slim",
                entrypoint: "bash",
                args: ["ci/report.sh"],
                envs: [
                    `MODE=${mode}`,
                    `GOOGLE_PROJECT=${projectId}`,
                    "SHA=$COMMIT_SHA",
                    "BUILD_ID=$BUILD_ID",
                    "EXPECTED_STEPS=image migrate pulumi",
                ],
            },
        ],
        // Literals only. Substitutions do not resolve in `tags`; a `$COMMIT_SHA`
        // tag would be stored verbatim and every build creation rejected. The
        // commit is findable through the substitution instead:
        // `gcloud builds list --filter "substitutions.COMMIT_SHA=<sha>"`.
        tags: [mode],
        timeout: "2400s",
        // Cloud Build has no equivalent of the old workflow's repo-wide
        // concurrency group. Two runs can start at once, and the second waits on
        // Pulumi's state lock inside ci/pulumi.sh rather than dying on it. This
        // is the outer bound on that wait.
        queueTtl: "3600s",
        options: buildOptions,
    };
}

const triggerServiceAccount = `projects/${projectId}/serviceAccounts/${deployerEmail}`;

// Writing build logs is the one permission the deployer did not already need,
// and it needs it because the builds run as that account.
new gcp.projects.IAMMember("deployer-log-writer", {
    project: projectId,
    role: "roles/logging.logWriter",
    member: `serviceAccount:${deployerEmail}`,
});

const previewTrigger = new gcp.cloudbuild.Trigger(
    "infra-preview",
    {
        name: "infra-preview",
        location: "global",
        project: projectId,
        description: "Pull request: build the image and preview the stack.",
        serviceAccount: triggerServiceAccount,
        github: {
            owner: repoOwner,
            name: repoName,
            pullRequest: {
                branch: ".*",
                // The fork guard, and the reason it no longer has to be
                // hand-built: a pull request from outside this repository does
                // not build until someone with write access comments /gcbrun.
                // The webhook design had to reconstruct this from the payload,
                // because a webhook is just a webhook; here it is a setting.
                commentControl: "COMMENTS_ENABLED_FOR_EXTERNAL_CONTRIBUTORS_ONLY",
            },
        },
        build: pipelineBuild("preview"),
    },
    { dependsOn: services },
);

const applyTrigger = new gcp.cloudbuild.Trigger(
    "infra-apply",
    {
        name: "infra-apply",
        location: "global",
        project: projectId,
        description: "Push to main: build and push the image, then apply the stack.",
        serviceAccount: triggerServiceAccount,
        github: {
            owner: repoOwner,
            name: repoName,
            push: { branch: "^main$" },
        },
        build: pipelineBuild("apply"),
    },
    { dependsOn: services },
);

const alertEmail = new pulumi.Config().get("alertEmail");

if (!alertEmail) {
    pulumi.log.warn(
        "alertEmail is not configured, so nothing will announce a failed build. " +
            "A Cloud Build webhook trigger posts no status back to GitHub, so a " +
            "broken deploy will be silent. Set saijo-power-meter:alertEmail in " +
            "Pulumi.dev.yaml to fix that.",
    );
} else {
    const channel = new gcp.monitoring.NotificationChannel(
        "build-failure-email",
        {
            displayName: "Power Meter build failures",
            type: "email",
            labels: { email_address: alertEmail },
        },
        { dependsOn: services },
    );

    new gcp.monitoring.AlertPolicy(
        "build-failed",
        {
            displayName: "Cloud Build: a pipeline run failed",
            combiner: "OR",
            notificationChannels: [channel.id],
            conditions: [
                {
                    displayName: "A build logged a failure",
                    // Three clauses, because no single one covers every way a
                    // run can end badly:
                    //   - PIPELINE_VERDICT=FAILED is ci/report.sh's own marker,
                    //     and catches every step failure precisely. It exists
                    //     because the wrapper swallows step exit codes, so Cloud
                    //     Build's own error line is about report.sh rather than
                    //     about what actually broke.
                    //   - "build step" failures catch what report.sh cannot: a
                    //     failed clone, which happens before report.sh exists in
                    //     the workspace at all.
                    //   - the deadline catches a build that ran past its
                    //     timeout, which logs neither of the above.
                    conditionMatchedLog: {
                        filter: [
                            'resource.type="build"',
                            '(textPayload:"PIPELINE_VERDICT=FAILED"',
                            'OR textPayload:"ERROR: build step"',
                            'OR textPayload:"context deadline exceeded")',
                        ].join(" "),
                    },
                },
            ],
            // Creating this needs roles/logging.configWriter as well as the
            // monitoring roles, because a log-based policy also creates a
            // Logging notification rule behind the scenes. The channel above
            // succeeds on monitoring.editor alone, so a missing configWriter
            // fails here and only here.
            //
            // Required for a log-based policy, and wanted anyway: a build that
            // fails in three steps logs more than one matching line, and three
            // emails about one build teaches people to filter the alert.
            alertStrategy: {
                notificationRateLimit: { period: "300s" },
                autoClose: "86400s",
            },
            documentation: {
                mimeType: "text/markdown",
                content: [
                    "A Cloud Build run failed. Nothing reports this back to GitHub —",
                    "a webhook trigger posts no check or status — so this email is the",
                    "only announcement.",
                    "",
                    "To read the log: dispatch `.github/workflows/build-logs.yml` with",
                    "`failed_only: true`, or run",
                    "`gcloud builds list --filter \"status!=SUCCESS\"` followed by",
                    "`gcloud builds log <id>`. The verdict and the failing step's last",
                    "lines are at the very end of the log.",
                ].join("\n"),
            },
        },
        { dependsOn: services },
    );
}

export const pipelineTriggers = {
    preview: previewTrigger.name,
    apply: applyTrigger.name,
};

export const logReaderServiceAccount = logReader.email;
export const webServiceName = web.name;
