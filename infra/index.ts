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
    // The delivery pipeline itself. Cloud Build replaced GitHub Actions as the
    // thing that builds and applies; apikeys is not optional alongside it,
    // because a webhook trigger's URL is only callable with an API key.
    "cloudbuild.googleapis.com",
    "secretmanager.googleapis.com",
    "apikeys.googleapis.com",
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
// Cloud Build replaced GitHub Actions here, so that GitHub is a git remote and
// nothing else. It holds a read-only deploy key and two webhooks; it holds no
// identity that can change this project, and no app with write access to the
// repository. Everything that builds or deploys runs inside Google Cloud.
//
// What that costs, and what makes the pieces below look the way they do:
//
//   - A webhook trigger is only callable with an API key, so one is declared
//     here and restricted to the Cloud Build API alone.
//   - A webhook trigger cannot read its build config out of a private
//     repository — that needs the GitHub App connection this setup exists to
//     avoid. So the build is inline, and deliberately thin: step one clones the
//     repo, every later step runs a script from `ci/` in that clone. Pipeline
//     logic stays versioned and reviewable; only its skeleton lives here.
//   - A webhook trigger cannot filter on changed paths the way the workflow's
//     `paths:` did. Every push to main runs the pipeline, and a no-op deploy is
//     a wasted build rather than a wrong one.

const projectId = process.env.GOOGLE_PROJECT ?? gcp.config.project;
if (!projectId) {
    throw new Error(
        "GOOGLE_PROJECT is not set and gcp:project is not configured. The " +
            "pipeline passes it in; see ci/pulumi.sh.",
    );
}

// The same `githubRepository` the log reader is scoped to, deliberately not a
// second source of truth: the repository the pipeline builds and the repository
// allowed to read its logs must be one value, or they drift apart silently.
const repoSlug = githubRepository;
const stateBucket = process.env.PULUMI_STATE_BUCKET ?? `${projectId}-pulumi-state`;
const kmsKey = `projects/${projectId}/locations/${region}/keyRings/pulumi/cryptoKeys/state`;

// Builds run as the deployer account GitHub Actions used to impersonate. Reusing
// it is deliberate: it already carries exactly the roles a deploy needs, and a
// second account with the same grants would be a second thing to audit.
const deployerEmail =
    process.env.DEPLOYER_SA ?? `pulumi-deployer@${projectId}.iam.gserviceaccount.com`;

// Created by scripts/setup-cloud-build.sh, not here. A secret's *value* cannot
// live in code, and the deploy key has to exist before the first build can
// clone anything — the same reason the state bucket is bootstrap.sh's job.
const secretVersion = (name: string) =>
    `projects/${projectId}/secrets/${name}/versions/latest`;

// CLOUD_LOGGING_ONLY is required, not a preference: a build running as a
// user-specified service account has no default log bucket to write to, and
// omitting this fails the build before step one with a message about storage
// that does not mention logging at all.
const buildOptions = {
    logging: "CLOUD_LOGGING_ONLY",
    // The filters below read the webhook payload into substitutions that no
    // build step consumes. Without this, an unreferenced substitution fails the
    // build rather than being ignored.
    substitutionOption: "ALLOW_LOOSE",
};

const imageRef =
    `${region}-docker.pkg.dev/${projectId}/app/web:` + "${_SHA}";
// Floating on purpose, and never deployed: this tag is only ever read from and
// written to as a BuildKit layer cache, replacing the workflow's type=gha cache.
const cacheRef = `${region}-docker.pkg.dev/${projectId}/app/web:cache`;

const cloneStep = [
    "set -euo pipefail",
    "mkdir -p /root/.ssh",
    // $$ is how Cloud Build escapes a literal $; a single one would be read as
    // a substitution and the key would arrive empty.
    'printf "%s\\n" "$$DEPLOY_KEY" > /root/.ssh/id_ed25519',
    "chmod 600 /root/.ssh/id_ed25519",
    "ssh-keyscan -t rsa,ecdsa,ed25519 github.com > /root/.ssh/known_hosts 2>/dev/null",
    // The repository is the configured one, never a name out of the webhook
    // payload. A payload is attacker-controlled the moment the URL leaks, and
    // this step runs with the deployer's credentials.
    `git clone --quiet git@github.com:${repoSlug}.git /workspace/src`,
    "cd /workspace/src",
    // Detached: the pull request head is what was reviewed, not the branch tip,
    // which may have moved since the webhook fired.
    "git checkout --detach --quiet ${_SHA}",
    "git --no-pager log -1 --oneline",
].join("\n");

function pipelineBuild(mode: "preview" | "apply"): gcp.types.input.cloudbuild.TriggerBuild {
    const steps: gcp.types.input.cloudbuild.TriggerBuildStep[] = [
        {
            id: "clone",
            name: "gcr.io/cloud-builders/git",
            entrypoint: "bash",
            secretEnvs: ["DEPLOY_KEY"],
            args: ["-c", cloneStep],
        },
        // Both real steps run under ci/step.sh, which captures their output and
        // swallows their exit code. Cloud Build has no `if: always()`, so a
        // failing step would otherwise stop the build before the step that
        // reports the failure — the one occasion reporting matters. ci/report.sh
        // turns a recorded failure back into a failed build.
        {
            id: "image",
            name: "gcr.io/cloud-builders/docker",
            dir: "/workspace/src",
            entrypoint: "bash",
            args: ["ci/step.sh", "image", "ci/image.sh"],
            envs: [`MODE=${mode}`, `IMAGE=${imageRef}`, `CACHE_IMAGE=${cacheRef}`],
        },
        {
            id: "pulumi",
            name: "pulumi/pulumi-nodejs:latest",
            dir: "/workspace/src",
            entrypoint: "bash",
            args: ["ci/step.sh", "pulumi", "ci/pulumi.sh"],
            envs: [
                `MODE=${mode}`,
                `GOOGLE_PROJECT=${projectId}`,
                `GITHUB_REPO=${repoSlug}`,
                `PULUMI_BACKEND_URL=gs://${stateBucket}`,
                `WEB_IMAGE=${imageRef}`,
                `KMS_KEY=${kmsKey}`,
            ],
        },
    ];

    const secrets: gcp.types.input.cloudbuild.TriggerBuildAvailableSecretsSecretManager[] = [
        { versionName: secretVersion("github-deploy-key"), env: "DEPLOY_KEY" },
    ];

    // Always last, and always runs, because nothing ahead of it can fail. It
    // posts nothing anywhere — pulling this log into GitHub is a separate
    // workflow's job. What it does is end the log with a step-by-step verdict
    // and the tail of whatever failed, so that a pulled log is readable from its
    // last page rather than its first, and then exit non-zero if any step
    // failed, which is what makes the build's own status honest.
    steps.push({
        id: "report",
        name: "gcr.io/google.com/cloudsdktool/cloud-sdk:slim",
        dir: "/workspace/src",
        entrypoint: "bash",
        args: ["ci/report.sh"],
        envs: [
            `MODE=${mode}`,
            `GOOGLE_PROJECT=${projectId}`,
            "SHA=${_SHA}",
            "BUILD_ID=$BUILD_ID",
            "EXPECTED_STEPS=image pulumi",
        ],
    });

    return {
        steps,
        // Tagged so a build can be found by the commit it built, which is the
        // only handle an outside caller has: a webhook trigger's run is not
        // announced anywhere, so `gcloud builds list --filter "tags=<sha>"` is
        // how anything downstream locates the log to pull.
        tags: [mode, "${_SHA}"],
        timeout: "2400s",
        // Cloud Build has no equivalent of the workflow's repo-wide concurrency
        // group. Two runs can start at once, and the second one waits on
        // Pulumi's state lock inside ci/pulumi.sh rather than dying on it. This
        // is the outer bound on that wait.
        queueTtl: "3600s",
        options: buildOptions,
        availableSecrets: { secretManagers: secrets },
    };
}

const webhookKey = new gcp.projects.ApiKey(
    "pipeline-webhook",
    {
        name: "cloud-build-webhook",
        displayName: "Cloud Build webhook triggers",
        project: projectId,
        // Restricted to Cloud Build alone. The key travels in a URL held by
        // GitHub, so the blast radius of it leaking is "someone can attempt to
        // call a trigger" — and the webhook secret is what stops that.
        restrictions: {
            apiTargets: [{ service: "cloudbuild.googleapis.com" }],
        },
    },
    { dependsOn: services },
);

const triggerServiceAccount = `projects/${projectId}/serviceAccounts/${deployerEmail}`;

// Writing build logs is the one permission the deployer account did not already
// need, and it needs it because the builds now run as that account.
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
        description: "Pull request: build the image, preview the stack, comment.",
        serviceAccount: triggerServiceAccount,
        webhookConfig: { secret: secretVersion("github-webhook-secret") },
        // A webhook trigger's filter sees its SUBSTITUTIONS, not the payload:
        // `body` is undeclared there and a filter naming it is rejected at
        // create time with "undeclared reference to 'body'". Payload bindings
        // are a substitution feature, so anything the filter tests has to be
        // lifted into one first — which is why three of the four below are read
        // and then never used by a build step.
        //
        // Three clauses, and only the first is about noise. GitHub sends every
        // pull_request action, and these three are the ones that change what
        // would be deployed — without that, labelling a pull request would run
        // a build.
        //
        // The other two are the security boundary. This build runs arbitrary
        // `ci/*.sh` from the commit it checks out, with the deployer's
        // credentials, so it must never check out a commit an outsider chose:
        // the head has to live in this repository, not a fork. GitHub Actions
        // got the equivalent for free by withholding secrets from fork runs.
        substitutions: {
            _SHA: "$(body.pull_request.head.sha)",
            _ACTION: "$(body.action)",
            _BASE_REPO: "$(body.repository.full_name)",
            _HEAD_REPO: "$(body.pull_request.head.repo.full_name)",
        },
        filter: [
            '_ACTION in ["opened", "synchronize", "reopened"]',
            `_BASE_REPO == "${repoSlug}"`,
            "_HEAD_REPO == _BASE_REPO",
        ].join(" && "),
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
        webhookConfig: { secret: secretVersion("github-webhook-secret") },
        // Same rule as the preview trigger: the filter tests substitutions,
        // never `body`.
        substitutions: {
            _SHA: "$(body.after)",
            _REF: "$(body.ref)",
            _BASE_REPO: "$(body.repository.full_name)",
        },
        filter: [
            '_REF == "refs/heads/main"',
            `_BASE_REPO == "${repoSlug}"`,
        ].join(" && "),
        build: pipelineBuild("apply"),
    },
    { dependsOn: services },
);

// ---------------------------------------------------------------------------
// Telling someone the build failed
// ---------------------------------------------------------------------------
// Cloud Build has no "email me on failure" setting — the two supported routes
// are its Pub/Sub `cloud-builds` topic with a notifier service subscribed to it,
// and a Cloud Monitoring alert. This is the second one, because the first means
// running a Cloud Run service and holding SMTP credentials to send one email.
//
// It matters because nothing else says a deploy broke. A webhook trigger posts
// no check and no status, so a pull request whose deploy failed looks entirely
// clean; without this, finding out requires thinking to go and look.
//
// Set the address to turn it on. It is not committed with a default, because
// whose inbox this reaches is not something to inherit by accident:
//
//   infra/Pulumi.dev.yaml:  saijo-power-meter:alertEmail: you@example.com
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

// The full webhook URLs also need the webhook secret's plaintext, which this
// program never sees — it lives in Secret Manager and is created outside. Run
// scripts/print-webhooks.sh to get the two URLs ready to paste into GitHub.
export const pipelineApiKey = pulumi.secret(webhookKey.keyString);
export const logReaderServiceAccount = logReader.email;
export const webServiceName = web.name;
