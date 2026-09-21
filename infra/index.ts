import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

const region = new pulumi.Config("gcp").require("region");

// Everything below is created and owned by Pulumi. The only resources that live
// outside this program are the ones bootstrap.sh makes, because they have to
// exist before Pulumi can run at all: the state bucket, its KMS key, the
// deployer service account, and the Workload Identity Federation provider.

// App-level API enablement. The bootstrap enables only what it needs itself.
const services = [
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "iam.googleapis.com", // creating the service the app runs as
    // On by default in every project, declared anyway: the logs workflow is
    // useless without it, and a project where someone turned it off should fail
    // here rather than in a job that reads zero entries and looks healthy.
    "logging.googleapis.com",
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
        "WEB_IMAGE is not set. CI builds and pushes the web image, then passes " +
            "its commit-pinned reference here. See .github/workflows/infra.yml.",
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
export const logReaderServiceAccount = logReader.email;
export const webServiceName = web.name;
