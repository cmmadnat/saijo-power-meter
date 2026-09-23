# The delivery pipeline

Builds and deploys run on **Cloud Build**, inside the same Google Cloud project they
deploy to, connected to GitHub through the **Cloud Build GitHub App**.

The original goal was stronger than that: GitHub reduced to a git remote holding nothing
but a read-only deploy key and two webhook URLs, with no app installed and no identity that
could change the project. That design was built, and it never produced a single build. What
follows describes what runs now; *The webhook design, and why it was abandoned* at the end
records what was learned, because every one of those findings is true and expensive.

## What GitHub holds

The Cloud Build GitHub App, installed on this repository alone, with write access to commit
statuses. That is a real concession against the original goal and it is the whole cost of
this design.

What it buys, beyond working:

- **Cloud Build fetches the source itself.** The deploy key, the SSH clone step, the
  `ssh-keyscan`, and the detached checkout are all gone.
- **No shared secrets.** The webhook secret and the API key are gone with them — four
  credentials down to none.
- **Build status appears on the pull request as a check.** The webhook design could not do
  this at all, and we worked around it with a dispatchable log reader and an email alert.

## The shape of a run

The trigger holds its build definition inline in `infra/index.ts`, and that definition is
deliberately thin: every step runs a script from `ci/` in the checkout Cloud Build provides.
Pipeline logic stays ordinary reviewed code; only its skeleton is a Pulumi resource.

| Step | Image | What it does |
| --- | --- | --- |
| `image` | `cloud-builders/docker` | `ci/image.sh` — builds the web *and* ingester images; pushes only on apply. |
| `migrate` | `node:22` | `ci/migrate.sh` — applies the warehouse migrations; a dry run on a pull request. |
| `pulumi` | `pulumi/pulumi-nodejs` | `ci/pulumi.sh` — previews or applies the stack. |
| `report` | `cloud-sdk:slim` | `ci/report.sh` — summarises the run, then decides the build's verdict. |

**Two images, one step, one commit.** The web app and the ingester are separate deployables with
opposite shapes — one scales to zero, one is pinned to a single always-on instance — but they share
the payload decoder verbatim, so they are built together from the same commit. Building them apart
would let a deploy put two versions of that decoder in the same system, which is the one drift the
architecture exists to prevent.

**`migrate` runs before `pulumi`, and that order is the point.** CLAUDE.md's rule is that
migrations are applied by an automated step before a new revision is promoted. It arrived with
step 7, because that is where something first depends on the tables existing. Two things about it
are worth knowing:

- On a pull request it is `migrate --dry-run`: it connects, reads the ledger and prints what it
  would apply. That catches a dataset that has drifted from the code. It does **not** ask
  BigQuery's opinion of any new DDL, because it submits none — the same asymmetry this document
  records everywhere else.
- `--skip-if-no-dataset` exists for the first apply on a brand-new project, where the dataset is a
  Pulumi resource that the *next* step creates. The step exits clean with a message rather than
  failing a build that was about to create the thing it was waiting for, and the next build
  migrates.

Credentials come from the build's service account through the metadata server. Builds run as
the existing `pulumi-deployer`: it already carries exactly the roles a deploy needs, and a
second account with the same grants would be a second thing to audit.

`$COMMIT_SHA` is supplied by Cloud Build, so nothing has to bind it out of a payload.

### A script must run under the trigger that is already deployed

**This cost a red `main`, on the step 7 merge.** The trigger's step definitions — which steps
exist, and what environment each one gets — live in `infra/index.ts` and reach Cloud Build only
when Pulumi applies them. Applying them is a step *in this pipeline*. So:

> A `ci/*.sh` that requires something the **currently deployed** trigger does not provide can never
> be applied. The apply that would update the trigger is the run that fails, and it fails the same
> way every time.

Step 7 renamed the image step's `IMAGE`/`CACHE_IMAGE` to `WEB_IMAGE`/`INGESTER_IMAGE` and friends,
and made `ci/image.sh` and `ci/pulumi.sh` demand the new names. The commit changed both sides
together and looked consistent. But the build that ran was the *old* trigger handing the *new*
scripts the old names: both steps died on their `:?` checks about a minute in, and no apply
happened, so the trigger kept its old definition. Deadlock.

The rule that follows, and it is cheap:

- **Read the old names as a fallback when adding new ones**, and keep the fallback afterwards. Two
  lines in `ci/image.sh` are what let a run under the previous trigger succeed and apply the next
  one.
- **Derive rather than require**, where a value can be derived. `ci/pulumi.sh` computes
  `INGESTER_IMAGE` from `WEB_IMAGE` if it is absent; the Pulumi program only insists on it when
  `deployIngester` is true, so a derived value cannot deploy anything by accident.
- A new *step* is safe to add — it simply does not run until the trigger knows about it. A new
  *requirement* in an existing step is not.

The same asymmetry this document records elsewhere is what hides it: nothing validates a trigger's
environment against the scripts it invokes until a build runs, and a `pulumi preview` plans rather
than creates.

### Why every step runs under a wrapper

Cloud Build has no `if: always()`. A failing step stops the build dead, so a reporting step
placed last would be precisely the step that never runs on the one occasion it matters.

`ci/step.sh` tees each step's output to `/workspace/logs/<name>.log`, records the exit code
to `/workspace/status/<name>`, and always exits clean. `ci/report.sh` then reads those,
ends the log with a step verdict and the last 80 lines of whatever failed, and **exits
non-zero itself** if any step failed — so a red build reads as red, and a step that never
ran is reported as "did not run" rather than counted as a pass.

### A docs-only change builds nothing, and that is a setting too

Both triggers carry an `ignoredFiles` list — `docs/**`, the root `*.md` and `*.xlsx`, and both
`reference` directories — so a push touching only those creates no build. The gain is not the five
minutes: the image is tagged with the commit SHA and the apply updates Cloud Run to it, so a docs
merge used to roll a new revision for no change in behaviour, and the revision list stopped reading
as deploy history.

Two things about it are deliberate. It is an **ignore** list rather than `includedFiles`, because
the two fail in opposite directions: an include list fails *closed* on anything unlisted, so adding
a top-level directory silently stops building it and the symptom is an absence nobody notices.
`.github/workflows/check.yml` is the include-list version, and it is why a change to `bootstrap.sh`
— root-level, outside every one of its patterns — gets no `verify` run. And the pattern is `*.md`
rather than `**/*.md`: a README inside `apps/` is traced into an image, so it stays a reason to
build.

**Observed on PR #34**, which touched one documentation file and nothing else. No build ran — and
the check did not simply fail to appear, which is what this page predicted before anyone looked.
Cloud Build posts the filtered event as a check run with conclusion **`neutral`**, zero duration,
whose "details" link points at the **trigger's edit page rather than at a build**. That is how a
skipped trigger reads from GitHub: a check that arrives, says nothing, and cost nothing.

The distinction matters for the trap worth checking before copying this anywhere else. The fear
was that a required check would never arrive and leave such a pull request pending forever; since a
neutral check *does* arrive, that particular hang does not happen. Whether `neutral` **satisfies**
a required check is a different question and is **not** settled here: GitHub's conclusion table
says neutral is treated as success "for dependent checks in GitHub Actions", which is a narrower
claim than branch protection. `infra-preview` is not required on this repository — observable
rather than assumed, since PR #31 was merged three minutes before its preview finished — so the
question has never had to be answered. Anyone making it required should answer it first.

The apply that carried the list (`b8feb07`, build `a92a84ae`) had already shown that Cloud Build
*accepted* the patterns, `reference doc/**` and its space included. Acceptance and effect are two
claims, and this page's own rule is why they were checked separately: "the trigger was created" is
not evidence that it works.

### The fork guard is a setting now

A build runs `ci/*.sh` from the commit it checks out, with the deployer's credentials, so
*which commit* is a privilege decision. The pull request trigger sets
`commentControl: COMMENTS_ENABLED_FOR_EXTERNAL_CONTRIBUTORS_ONLY`: a pull request from
outside this repository does not build until someone with write access comments `/gcbrun`.

The webhook design had to reconstruct this by hand from payload fields, because a webhook is
just a webhook. Here it is one line.

## Reading a build log

Cloud Build now reports to the pull request, so the common case needs nothing. For anything
else — an apply on `main`, or a cloud session with no Google Cloud credentials —
`.github/workflows/build-logs.yml` fetches it.

It is started by a comment, not a dispatch: `workflow_dispatch` needs `actions: write`,
which a session token does not carry.

```
/buildlog          /buildlog failed          /buildlog sha=4f2c1ab mode=apply
```

Builds are found by the substitution Cloud Build sets, not by a tag:

```bash
gcloud builds list --project <p> --filter "substitutions.COMMIT_SHA=<sha>"
gcloud builds log <build-id> --project <p>
```

**The commit is a substitution rather than a tag, and that distinction cost real time.**
Substitutions resolve in `steps` and `images`; `tags` is not one of them. A `$COMMIT_SHA`
tag is stored verbatim, and a tag must match `[\w][\w.-]*` — which `$`, `{` and `}` do not.
The trigger is created without complaint, because a tag is only a string until a build is
made from it.

It authenticates as `power-meter-log-reader`, which holds `roles/logging.viewer` and
`roles/cloudbuild.builds.viewer` and nothing else — deliberately not the deployer, so a job
that reads logs cannot deploy. That account is reachable by Workload Identity Federation
through the pool `bootstrap.sh` creates, which is why that section of `bootstrap.sh` stays.

## Being told a build failed

Cloud Build has no "email me on failure" setting. The two supported routes are its Pub/Sub
`cloud-builds` topic with a notifier service subscribed, and a Cloud Monitoring alert. This
takes the second: declarative, no running service, no credential.

```
resource.type="build"
(textPayload:"PIPELINE_VERDICT=FAILED"
 OR textPayload:"ERROR: build step"
 OR textPayload:"context deadline exceeded")
```

`PIPELINE_VERDICT=FAILED` is `ci/report.sh`'s own marker — a marker, not prose; rewording it
silently disables the clause. The other two catch what `report.sh` cannot: a step that
failed before it ran, and a timeout.

**It takes two roles, not one.** A log-based alert policy also creates a Logging
notification rule, so it needs `roles/logging.configWriter` alongside
`roles/monitoring.editor`. The channel succeeds on the monitoring role alone, which makes
the failure read oddly: the channel appears, the policy does not, and the error names
`logging.notificationRules.create`.

The address is `saijo-power-meter:alertEmail` in `Pulumi.dev.yaml`. **Cloud Monitoring sends
a confirmation link and the channel delivers nothing until it is clicked** — an unverified
channel looks healthy, so check the inbox rather than assuming.

## Two things this is worse at than the GitHub Actions workflow

Honest accounting; both were real features of `infra.yml`.

1. **No concurrency group.** `concurrency: infra` was a *guarantee* that a preview and an
   apply never overlapped on one state object. Cloud Build has no equivalent. What replaces
   it is Pulumi's own state lock plus a retry-with-backoff in `ci/pulumi.sh` — a retry, not
   a guarantee. This is the piece most likely to need revisiting.
2. **No path filter.** The trigger cannot filter on changed paths the way `paths:` did, so
   every push to `main` runs the pipeline. A wasted build, not a wrong deploy.

The third item that used to live here — nothing reporting back to GitHub — is closed by the
App connection.

## Two invariants that cost a failed apply to learn

Both live in `ci/pulumi.sh`:

- Stack existence is checked with `pulumi stack ls`, which is read-only. `pulumi stack
  select` on a missing stack takes a lock in the state bucket and abandons it, and the
  `stack init` that follows then trips over a lock its own predecessor left behind.
- The image reference is pinned to the commit SHA, never `:latest`. Cloud Run only starts a
  new revision when the image reference changes, so a floating tag leaves the service on its
  old revision and the deploy silently does nothing. The one floating tag in the pipeline is
  `:cache`, which is a BuildKit layer cache and is never deployed.

## Application checks stayed on GitHub Actions

`.github/workflows/check.yml` — boundaries, typecheck, lint, test — did not move. It holds
no cloud credentials and touches nothing outside the runner, so it is not part of what this
was about. Moving it would mean paying for build minutes to do what a free runner does, and
would blur the split that keeps a failing unit test from looking like a failing apply.

## The cutover, which is done

`.github/workflows/infra.yml` applied the stack until Cloud Build had proved it could, and is now
deleted — a preview and an apply have both gone green. Three of its five `GCP_*` repository
variables went with it: `GCP_STATE_BUCKET`, `GCP_KMS_KEY` and `GCP_DEPLOYER_SA`. **`GCP_PROJECT_ID`
and `GCP_WIF_PROVIDER` stay**, because `logs.yml` and `build-logs.yml` read them, and so does the
Workload Identity Federation section of `bootstrap.sh`.

One consequence worth stating: the concurrency worry above shrinks with it. The risk was a workflow
and a trigger applying the same stack on the same merge; now only Cloud Build applies, and two of
its runs overlapping is far rarer. The retry in `ci/pulumi.sh` remains the guard, and it is still
weaker than the guarantee `concurrency: infra` gave.

## Standing up the pipeline

`scripts/setup-cloud-build.sh`, once per project. It enables the APIs and grants the
deployer the three roles it needs to *declare* a pipeline rather than merely run one.

Then the step no script can do: **connect the repository** at
`console.cloud.google.com/cloud-build/repositories`, authorising the Cloud Build GitHub App
on this repository only. The triggers cannot be created before that — a trigger naming an
unconnected repository is rejected — so this precedes the apply, not the other way round.

## The webhook design, and why it was abandoned

The first design used webhook triggers so that GitHub would hold only a deploy key and two
URLs. It was abandoned after four separate defects, **every one of which was accepted at
trigger-create time and failed only at invocation**, with errors that named nothing. No
build was ever created.

| Defect | Symptom |
| --- | --- |
| `filter` referenced `body.*` | Rejected at create: `undeclared reference to 'body'`. A webhook trigger's filter sees its *substitutions*, not the payload. |
| Webhook URL omitted `/locations/global/` | `403 The caller does not have permission` — which is also what Google returns for a resource it cannot resolve, so it reads as a credential problem. |
| `tags: ["${_SHA}"]` | Substitutions do not resolve in `tags`. Every build creation rejected with a bare `INVALID_ARGUMENT`. |
| Webhook secret stored with a trailing newline | `openssl rand -hex 32` emits one; the URL carries 64 bytes against Secret Manager's 65. |

All four were fixed and the trigger ended up exactly as intended — and invocation still
returned `INVALID_ARGUMENT` with no detail. The remaining cause was never found.

**The generalisable lesson: Cloud Build validates very little at trigger-create time and a
great deal at invocation.** "The trigger was created" is not evidence that it works, and a
`pulumi preview` is weaker still — it plans rather than creates, so it passes over missing
roles and missing secrets alike.

**That cost a red `main` again on the step 8c merge**, and it is worth reading as the second
instance of one rule rather than as a new problem. The preview printed `+ gcp:firestore/database:
Database (create)` and went green; the apply answered `Error creating Database: googleapi: Error
403: The caller does not have permission`. Creating a Firestore database takes
`datastore.databases.create`, which lives in `roles/datastore.owner`, and the deployer held
thirteen roles of which none was that one. The role is in `bootstrap.sh` now, and on an existing
project it is one `gcloud projects add-iam-policy-binding`.

So: **when a change adds a kind of resource the stack has never created before, check the
deployer's role list in `bootstrap.sh` in the same edit.** A green preview says nothing about
whether the apply is allowed to do it. The cost is one failed apply and a partial one — which is
its own hazard, since the steps before the failure have already run.

If the App connection ever has to go, the webhook path is recoverable from this table plus
the git history — but budget for the unknown fifth defect.
