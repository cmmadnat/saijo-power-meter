# The delivery pipeline

Builds and deploys run on **Cloud Build**, inside the same Google Cloud project they
deploy to. GitHub is a git remote and nothing more.

That is the whole reason for the design. GitHub Actions worked, and cost nothing, but it
put the delivery pipeline in a place the project does not own: an identity GitHub can
mint tokens against, a workflow file GitHub interprets, and a set of repository variables
GitHub stores. Moving to Cloud Build is not about cost or speed. It is about GitHub being
replaceable.

## What GitHub still holds

Two things, and both are inert on their own:

- **A read-only deploy key.** It can clone this repository. It cannot push, and it cannot
  see any other repository.
- **Two webhooks.** Each is a URL that starts one Cloud Build trigger.

No GitHub App is installed. No service account can be impersonated from GitHub. Nothing
in GitHub can change anything in Google Cloud — the arrows point outward only.

The deliberate consequence: the webhook URLs are credentials. Each embeds an API key and
the webhook secret, so anyone holding one can start a build. That is why the secret is 32
random bytes and the API key is restricted to the Cloud Build API alone, and why
`scripts/print-webhooks.sh` prints a warning above them.

## The shape of a run

A trigger holds its build definition **inline**, in `infra/index.ts`. This is not a
preference. A webhook trigger cannot read a build config out of a private repository —
that requires the Cloud Build GitHub App connection, which is exactly the thing this
setup exists to avoid.

So the inline build is kept thin, and it is the same four steps every time:

| Step | Image | What it does |
| --- | --- | --- |
| `clone` | `cloud-builders/git` | Clones over SSH with the deploy key, checks out the exact commit. |
| `image` | `cloud-builders/docker` | `ci/image.sh` — builds the web image; pushes it only on apply. |
| `pulumi` | `pulumi/pulumi-nodejs` | `ci/pulumi.sh` — previews or applies the stack. |
| `report` | `cloud-sdk:slim` | `ci/report.sh` — summarises the run at the end of the log, then decides the build's verdict. |

Everything after the clone runs a script from `ci/` **in the cloned repository**. That is
what keeps pipeline logic versioned, reviewable and diffable in an ordinary pull request,
while only its skeleton lives inside a Pulumi resource. Changing what a step *does* is a
normal code change; changing the *steps* is an infrastructure change.

Credentials come from the build's service account through the metadata server. There is
no key anywhere, which is the same keyless posture Workload Identity Federation gave —
minus the token exchange, because the build is already inside the project.

Builds run as `pulumi-deployer`, the account GitHub Actions used to impersonate. Reusing
it is deliberate: it already carries exactly the roles a deploy needs, and a second
account with the same grants would be a second thing to audit. It gained two roles for
declaring the pipeline (`cloudbuild.builds.editor`, `serviceusage.apiKeysAdmin`) and one
for running inside it (`logging.logWriter`).

## The build log, and how anything outside gets at it

A Cloud Build run announces itself nowhere. There is no check, no commit status, no
comment — a webhook trigger has no channel back to GitHub, because the GitHub App that
would provide one is the thing this setup exists to avoid. Whatever wants to surface a
build log in GitHub has to come and fetch it.

**That fetching is `.github/workflows/build-logs.yml`'s job.** What the pipeline owes it is two
things: a log worth pulling, and a way to find the right one.

### The webhook URL carries the trigger's location

```
https://cloudbuild.googleapis.com/v1/projects/<project>/locations/global/triggers/<name>:webhook?key=…&secret=…
```

`/locations/global/` is not optional. Omitting it — the shorter
`/projects/../triggers/..:webhook` form — is answered with **403**, which reads like a bad
API key or a bad secret and is neither. Both webhooks failed their GitHub ping that way
once, and the misleading status is the whole reason this is written down.

`scripts/print-webhooks.sh` builds the path from a `LOCATION` that matches the triggers'
`location` in `infra/index.ts`. Changing one means changing the other.

### Finding the build

Every build is tagged with the commit it built and with its mode, so a commit SHA is
enough of a handle:

```bash
gcloud builds list --project <project> --filter "tags=<sha>" --format 'value(id,status)'
gcloud builds log <build-id> --project <project>
```

Builds log to Cloud Logging, not a bucket, so `builds list` and `builds log` are two
different permissions.

### The identity to fetch with, and the workflow that uses it

`.github/workflows/build-logs.yml` is that fetcher. It resolves a build from a commit SHA
(or takes an explicit build id, or finds the most recent, or the most recent *failed* one),
then prints the build record and its full log into its own run log and step summary. A
cloud session starts it and reads the result back through the GitHub API — the same trick
`logs.yml` uses for the running application's logs, and deliberately the same shape.

**A session starts it by commenting, not by dispatching.** `workflow_dispatch` needs
`actions: write`, which a session token does not carry — it answers `403 Resource not
accessible by integration`. So the workflow also triggers on `issue_comment`, on a first
line beginning `/buildlog`, guarded by `author_association` in
`OWNER`/`MEMBER`/`COLLABORATOR`:

```
/buildlog                       the most recent build
/buildlog failed                the most recent build that did not succeed
/buildlog 4f2c1ab               the build for that commit
/buildlog sha=4f2c1ab mode=apply
/buildlog build=abc-123-def     an exact build id
```

Both triggers resolve their parameters in one step, so they cannot drift into meaning
different things, and the comment body reaches that parser through the environment — never
interpolated into a `run:` block, which is the standard way a comment becomes shell. The
guard decides who may start the job, not what they may put in the text.

`issue_comment` always runs the **default branch's** copy of a workflow, so a change to
this file does nothing until it is merged.

It authenticates as `power-meter-log-reader`, the account `logs.yml` already introduced,
which carries `roles/logging.viewer` and `roles/cloudbuild.builds.viewer` and nothing else.
One account rather than two: a third service account with the same shape and a narrower
name would be a third thing to audit for no gain. It is deliberately not the deployer —
the whole value is that a job reading logs cannot deploy a revision, push an image, or
touch the state bucket.

Listing a build and reading its log are two separate permissions, which is why both roles
are there: `cloudbuild.builds.viewer` for the record and its status,
`logging.viewer` for the log itself, since builds log to Cloud Logging rather than a
bucket.

This is the reason the Workload Identity Federation section of `bootstrap.sh` **stays**.
It was going to be deleted along with `infra.yml`; both log workflows authenticate through
it.

### Making the log worth pulling

A raw Cloud Build log opens on whatever failed *last*, which is usually not what failed
*first*, and a Docker build's output can bury a one-line Pulumi error under a thousand
lines of npm chatter. Two pieces address that.

`ci/step.sh` wraps every real step. It tees the step's output to
`/workspace/logs/<name>.log`, records the exit code to `/workspace/status/<name>`, and
always exits clean.

`ci/report.sh` then runs last — and *always* runs, because nothing ahead of it can fail.
It ends the log with a step-by-step verdict and the last 80 lines of whatever failed, so a
pulled log is readable from its last page rather than its first. Then it exits non-zero if
any step failed, which is what makes the build's own red-or-green status honest.

Why the wrapper exists at all: Cloud Build has no `if: always()`. A failing step stops the
build dead, so a summary step placed last would be precisely the step that never runs on
the one occasion it matters.

Two consequences worth knowing:

- **A step that never ran is reported as "did not run"**, never as a pass. Silently
  counting a skipped step as green would be the most misleading thing this could do.
- **A failed clone summarises nothing**, because `ci/report.sh` lives in the repository it
  would have cloned. The build still fails, and the log still shows the clone failing. In
  practice that means a wrong deploy key, which shows up the first time anything runs.

## Being told a build failed

Cloud Build has no "email me on failure" setting. There are two supported routes, and the
choice between them is a real one:

1. **Pub/Sub.** Cloud Build publishes every state change to a topic named `cloud-builds` —
   not created automatically; it starts publishing once the topic exists — carrying
   `buildId` and `status` as message attributes. Precise, structured, and the basis of
   Google's own [cloud-build-notifiers](https://github.com/GoogleCloudPlatform/cloud-build-notifiers)
   for Slack, SMTP, Google Chat and HTTP. The cost is that each notifier is a Cloud Run
   service, and the email one also needs SMTP credentials — a service and a credential to
   run and hold, to send one email.
2. **A Cloud Monitoring log-based alert.** Matches on the build log and emails through a
   notification channel. Less precise, because it reads text rather than a status field,
   but it is declarative, adds no running service, and holds no credential.

This repository takes the second, in `infra/index.ts`. If the pipeline ever needs richer
routing — per-branch, per-trigger, into Slack — the first is the upgrade, and the topic is
a one-line addition.

### What the alert matches, and why it is three clauses

```
resource.type="build"
(textPayload:"PIPELINE_VERDICT=FAILED"
 OR textPayload:"ERROR: build step"
 OR textPayload:"context deadline exceeded")
```

No single clause covers every way a run ends badly:

- `PIPELINE_VERDICT=FAILED` is `ci/report.sh`'s own marker, and catches every step failure
  exactly. It has to exist because `ci/step.sh` swallows step exit codes — so Cloud Build's
  own error line names `report.sh`, not the thing that actually broke.
- `ERROR: build step` catches what `report.sh` cannot: a failed **clone**, which happens
  before `report.sh` is in the workspace at all.
- `context deadline exceeded` catches a build that ran past its timeout, which logs
  neither of the others.

`PIPELINE_VERDICT=FAILED` is a marker, not prose. Rewording it to read more nicely silently
disables the first clause, which is why `ci/report.sh` says so at the line that prints it.

### The two roles it takes, not one

A log-based alert policy also creates a **Logging notification rule** behind the scenes, so
creating one needs `roles/logging.configWriter` on top of the monitoring roles. The
notification channel succeeds on `monitoring.editor` alone, which makes this a confusing
failure to read: the channel appears, the policy does not, and the error names
`logging.notificationRules.create` rather than anything about alerting.

`scripts/setup-cloud-build.sh` grants both.

### Turning it on

The address lives in `infra/Pulumi.dev.yaml` as `saijo-power-meter:alertEmail`, and is
currently `cmmadnat@gmail.com`. The program warns on every preview while it is unset,
because a pipeline that announces a failure nowhere is the gap this section exists to
close.

**Applying the stack is not the last step.** Cloud Monitoring sends a confirmation link to
a new email channel, and the channel stays unverified — created happily, delivering
nothing — until that link is clicked. The first real failure is the wrong moment to
discover this, so check the inbox after the first apply rather than assuming.

A second stack targeting another project inherits this address. That is worth changing
deliberately rather than by copy.

Rate-limited to one notification per five minutes, which is required for a log-based
policy and wanted anyway — a build that fails in three steps logs more than one matching
line, and three emails about one build teaches people to filter the alert.

## The one security boundary that had to be rebuilt

A build checks out a commit and then runs `ci/*.sh` from it, with the deployer's
credentials. So *which commit* is a privilege decision, and GitHub Actions made it for
free: a `pull_request` run from a fork gets no secrets. Cloud Build has no such notion —
a webhook is a webhook.

Two rules replace it, both in the trigger filters in `infra/index.ts`:

- The pull request head must live in this repository, not a fork
  (`_HEAD_REPO == _BASE_REPO`).
- The payload must name this repository (`_BASE_REPO == "<slug>"`).

Those read as substitutions rather than payload paths because **a webhook trigger's filter
sees its substitutions, not the payload.** `body` is undeclared in that CEL environment,
and a filter naming it is rejected at create time with `undeclared reference to 'body'` —
payload bindings are a substitution feature. So anything the filter tests is lifted into a
substitution first, which is why the triggers declare several that no build step consumes.
That, in turn, is why `substitutionOption: ALLOW_LOOSE` is not optional here.

And the clone step uses the *configured* repository slug, never a name read out of the
payload — a payload is attacker-controlled the moment a webhook URL leaks, and that is the
one failure this design has to survive.

## Three things that are worse than the workflow was, and what was done about them

Honest accounting, because each of these was a real feature of `.github/workflows/infra.yml`.

**There is no concurrency group.** The workflow's `concurrency: infra` was repo-wide, not
per-ref, so a pull request preview and a main apply could never overlap on one state
object. Cloud Build has no equivalent primitive. What replaces it is Pulumi's own lock in
the state bucket plus a retry in `ci/pulumi.sh`: a run that arrives while another holds
the lock waits it out, with backoff, instead of dying on it. `queueTtl` is the outer
bound. This is weaker — it is a retry rather than a guarantee — and it is the piece most
likely to need revisiting.

**There is no path filter.** The workflow only ran when `infra/`, `apps/`, `packages/` or
a manifest changed. A webhook trigger cannot filter on changed paths. Every push to main
now runs the pipeline, so a README-only commit costs a build. A wasted build, not a wrong
deploy — the image is content-addressed by commit and Pulumi no-ops on an unchanged
stack.

**Nothing reports back to GitHub, and this is still true.** `pulumi/actions` posted the
preview as a comment, and GitHub posted the check, both for free. A webhook trigger can do
neither, so a pull request whose deploy failed looks entirely clean — no red mark, nothing.
`build-logs.yml` makes the failure *readable on request*, and the alert in *Being told a
build failed* makes it *announce itself* — by email, from Google Cloud, rather than as a
red mark on the pull request. What is still missing is the mark itself: a reviewer looking
only at GitHub sees nothing. Closing that last piece would mean a credential that can write
to GitHub, which is a separate decision.

## Two invariants that cost a failed apply to learn

Both predate the move and survive it unchanged in `ci/pulumi.sh`:

- Stack existence is checked with `pulumi stack ls`, which is read-only. `pulumi stack
  select` on a missing stack takes a lock in the state bucket and abandons it, and the
  `stack init` that follows then trips over a lock its own predecessor left behind.
- The image reference is pinned to the commit SHA, never `:latest`. Cloud Run only starts
  a new revision when the image reference changes, so a floating tag leaves the service on
  its old revision and the deploy silently does nothing. The one floating tag in the
  pipeline is `:cache`, which is a BuildKit layer cache and is never deployed.

## Application checks stayed on GitHub Actions

`.github/workflows/check.yml` — boundaries, typecheck, lint, test — did not move, and the
reasoning is worth keeping. It holds no cloud credentials and touches nothing outside the
runner, so it is not part of what the migration was about. Moving it would mean paying for
build minutes to do what a free runner does, and it would blur the split the two workflows
were separated to preserve: a failing unit test and a failing apply should never look
alike.

If GitHub goes away entirely, this is the piece to port, and it is the easy piece.

## Standing up the pipeline

**`scripts/setup-cloud-build.sh` runs before this branch is merged, not after.** That
ordering is not a preference — merging is what applies the stack, and the apply fails
without the script having run first, in two separate ways:

- The deployer does not yet hold `cloudbuild.builds.editor`, `serviceusage.apiKeysAdmin`
  or `monitoring.editor`, so it cannot create the trigger, the API key or the alert.
- Each trigger's `webhookConfig` names a version of `github-webhook-secret`, and a
  trigger cannot be created against a secret that does not exist.

A `pulumi preview` passes in both cases — it plans, it does not create — so a green
preview on the pull request is **not** evidence the apply will succeed. That is exactly
what the preview on this change looked like.

The script, once per project, in Cloud Shell. It creates only what Pulumi cannot: the
APIs, the deployer's three extra roles, and two Secret Manager secrets — because a secret
*value* cannot live in code, and because the deploy key has to exist before the first
build can clone anything at all. Same boundary `bootstrap.sh` draws.

Then, in order:

1. `PROJECT_ID=saijo-power-meter ./scripts/setup-cloud-build.sh` — **before merging.**
2. Merge. `infra.yml` applies, creating the triggers, the API key and the alert.
3. Add the deploy key to GitHub, with write access **unchecked**, and the two webhooks
   that `scripts/print-webhooks.sh` prints.
4. Click the Cloud Monitoring confirmation email. The channel is created happily and
   delivers nothing until it is verified, and looks healthy either way.
5. Open a pull request touching `infra/` and watch a Cloud Build preview run.

## The cutover

`.github/workflows/infra.yml` is still in the repository, and still applies on main. That
is on purpose and is temporary: the Cloud Build triggers are Pulumi resources, so
something has to apply the stack that creates them, and until a Cloud Build run has gone
green that something is the workflow it replaces.

Once a Cloud Build preview and a Cloud Build apply have both succeeded, delete
`.github/workflows/infra.yml` and the five `GCP_*` repository variables.

The Workload Identity Federation section of `bootstrap.sh` **stays**, which is a change of
plan: it is what both log workflows authenticate through, pointed at the read-only
`power-meter-log-reader` account rather than the deployer.
