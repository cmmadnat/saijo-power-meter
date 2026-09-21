import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

const region = new pulumi.Config("gcp").require("region");

// Everything below is created and owned by Pulumi. The only resources that live
// outside this program are the ones bootstrap.sh makes, because they have to
// exist before Pulumi can run at all: the state bucket, its KMS key, the
// deployer service account, and the Workload Identity Federation provider.

// App-level API enablement. The bootstrap enables only what it needs itself.
const services = ["run.googleapis.com", "artifactregistry.googleapis.com"].map(
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
