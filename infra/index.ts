import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

const region = new pulumi.Config("gcp").require("region");

// Everything below is created and owned by Pulumi. The only resources that live
// outside this program are the ones bootstrap.sh and scripts/setup-cloud-build.sh
// make, because they have to exist before Pulumi can run at all, or because they
// are secret values that cannot live in code: the state bucket, its KMS key, the
// deployer service account, and the three Secret Manager secrets the pipeline
// reads.

// App-level API enablement. The bootstrap enables only what it needs itself.
const services = [
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "iam.googleapis.com", // creating the service the app runs as
    // The delivery pipeline itself. Neither secretmanager nor apikeys is here
    // any more: the App connection fetches the source, so there is no deploy
    // key, no webhook secret and no API key left to hold.
    "cloudbuild.googleapis.com",
    // The warehouse. The dataset is declared below; its tables are not, because
    // they are schema and arrive through the migration runner in
    // packages/infrastructure/src/warehouse.
    "bigquery.googleapis.com",
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
                },
            ],
        },
    },
    { dependsOn: [images, ...services] },
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

// --- The warehouse -----------------------------------------------------------
//
// The dataset is a Google Cloud resource, so it is declared here with
// everything else. Its tables are not: they are schema, and schema is versioned,
// ordered and idempotent migrations applied by a runner — CLAUDE.md's rule, and
// the line this file draws is the same one bootstrap.sh draws for the state
// bucket. `npm run warehouse -w @power-meter/infrastructure -- migrate` creates
// them; nothing in the pipeline runs it yet, because nothing reads the tables
// until step 8 and an apply that also migrates is a pipeline change worth
// making on its own.
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

// Read-only access for the web app, granted here because this is the step that
// creates the thing to read. It cannot write, and it cannot see any other
// dataset. Nothing in apps/web queries it yet — step 8 is what wires the three
// fixture adapters over to the warehouse, and this is what makes that a code
// change rather than a code change and an IAM change.
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
const imageRef = `${region}-docker.pkg.dev/${projectId}/app/web:` + "$COMMIT_SHA";
// Floating on purpose, and never deployed: only ever read from and written to
// as a BuildKit layer cache.
const cacheRef = `${region}-docker.pkg.dev/${projectId}/app/web:cache`;

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
                envs: [`MODE=${mode}`, `IMAGE=${imageRef}`, `CACHE_IMAGE=${cacheRef}`],
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
                    "EXPECTED_STEPS=image pulumi",
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
