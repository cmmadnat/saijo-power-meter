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

// Overridable so the same program can drive a fork without a code change, for
// the same reason the project is not pinned in Pulumi.dev.yaml.
const repoSlug = process.env.GITHUB_REPO ?? "cmmadnat/saijo-power-meter";
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
    // The apply trigger passes no _PR. Without this, an unreferenced
    // substitution fails the build rather than being ignored.
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
        filter: [
            'body.action in ["opened", "synchronize", "reopened"]',
            `body.repository.full_name == "${repoSlug}"`,
            "body.pull_request.head.repo.full_name == body.repository.full_name",
        ].join(" && "),
        substitutions: {
            _SHA: "$(body.pull_request.head.sha)",
            _PR: "$(body.pull_request.number)",
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
        webhookConfig: { secret: secretVersion("github-webhook-secret") },
        filter: [
            'body.ref == "refs/heads/main"',
            `body.repository.full_name == "${repoSlug}"`,
        ].join(" && "),
        substitutions: {
            _SHA: "$(body.after)",
        },
        build: pipelineBuild("apply"),
    },
    { dependsOn: services },
);

// ---------------------------------------------------------------------------
// Reading a build log from outside
// ---------------------------------------------------------------------------
// A webhook trigger's run announces itself nowhere: no check, no status, no
// comment. Whatever wants to show a build log in GitHub has to come and fetch
// it, and fetching needs an identity.
//
// This is that identity, and it is deliberately not the deployer. A log reader
// that can also deploy is a log reader nobody should be handing to a workflow;
// these two roles can read builds and their logs and do nothing else.
const logReaderPool = process.env.WIF_POOL_ID ?? "github";
const projectNumber = pulumi.output(gcp.organizations.getProject({})).number;

const logReader = new gcp.serviceaccount.Account(
    "build-log-reader",
    {
        accountId: "build-log-reader",
        displayName: "Reads Cloud Build logs (no deploy rights)",
    },
    { dependsOn: services },
);

for (const [name, role] of [
    ["builds", "roles/cloudbuild.builds.viewer"],
    // Builds log to Cloud Logging, not a bucket — see buildOptions above — so
    // listing a build and reading its log are two different permissions.
    ["logs", "roles/logging.viewer"],
]) {
    new gcp.projects.IAMMember(`log-reader-${name}`, {
        project: projectId,
        role,
        member: pulumi.interpolate`serviceAccount:${logReader.email}`,
    });
}

// Reuses the Workload Identity Federation pool bootstrap.sh created for GitHub
// Actions. That pool was going to be deleted along with infra.yml; it stays,
// because this is now what it is for — keyless, repository-scoped, and pointed
// at an account that cannot deploy.
new gcp.serviceaccount.IAMMember("log-reader-wif", {
    serviceAccountId: logReader.name,
    role: "roles/iam.workloadIdentityUser",
    member: pulumi.interpolate`principalSet://iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${logReaderPool}/attribute.repository/${repoSlug}`,
});

// Everything a workflow needs to authenticate and find a build. Not secret: a
// WIF provider path and a service account email are useless without the pool's
// attribute condition being satisfied, which only this repository can do.
export const buildLogReader = {
    serviceAccount: logReader.email,
    wifProvider: pulumi.interpolate`projects/${projectNumber}/locations/global/workloadIdentityPools/${logReaderPool}/providers/github-oidc`,
};

export const pipelineTriggers = {
    preview: previewTrigger.name,
    apply: applyTrigger.name,
};

// The full webhook URLs also need the webhook secret's plaintext, which this
// program never sees — it lives in Secret Manager and is created outside. Run
// scripts/print-webhooks.sh to get the two URLs ready to paste into GitHub.
export const pipelineApiKey = pulumi.secret(webhookKey.keyString);
