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
| `report` | `cloud-sdk:slim` | `ci/report.sh` — posts the outcome to GitHub, then decides the build's verdict. |

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

## Seeing a failure

A Cloud Build failure is, by default, visible in exactly one place: the Google Cloud
console. That is a worse place than it sounds. A reviewer on a pull request does not go
there, and a Claude cloud session **cannot** go there — it holds no Google Cloud
credentials, on purpose, and that is not going to change. GitHub Actions solved this
incidentally, by being inside GitHub.

So the pipeline reports back out, and GitHub is the channel, because GitHub is what both
a reviewer and a cloud session can already read:

- **A commit status** on the built commit — red or green, with a link to the build. This
  is what replaces the check Actions posted for free.
- **A comment** carrying the actual content: a step-by-step table, and then either the
  Pulumi preview (on a successful preview run) or the **last 12,000 characters of
  whatever failed**. The tail, not the head — a stack trace's useful end is the last
  thing printed, and truncating from the front is how a real error gets replaced by
  npm's install chatter.

On a preview run the comment goes on the pull request. On an apply run there is no pull
request number to hand, so `ci/report.sh` looks up the one the commit came from; a direct
push to `main` with no pull request falls back to a commit comment. Either way it lands
somewhere `mcp__github__*` can read it, which is the whole point: *"CI is red, look at it"*
stays a thing that can actually be acted on.

### Why every step runs under a wrapper

Cloud Build has no `if: always()`. A failing step stops the build dead, so a reporting
step placed last would be precisely the step that never runs on the one occasion it
matters.

`ci/step.sh` is the way around it. Every real step runs under it; it tees the step's
output to `/workspace/logs/<name>.log`, records the exit code to
`/workspace/status/<name>`, and always exits clean. `ci/report.sh` then reads those files,
posts the report, and **exits non-zero itself if any step failed** — so a red build still
reads as red in the console, and a step that never ran is reported as "did not run" rather
than quietly counted as a pass.

Two consequences worth knowing:

- **A failed clone reports nothing.** `ci/report.sh` lives in the repository it would have
  cloned. In practice a clone failure means the deploy key is wrong, which is a setup
  problem visible the first time anything runs — not a regression that appears months
  later. If that ever stops being acceptable, the answer is a Pub/Sub subscription on the
  `cloud-builds` topic and a small notifier outside the build.
- **Reporting is best-effort; the verdict is not.** A GitHub outage means no comment, and
  the build still fails correctly. The exit code comes from the recorded step statuses
  alone, never from whether the post succeeded.

### The token, and what it costs

Posting needs a GitHub credential, and that is the one place this design puts something
back in GitHub's direction. It is outbound — held in Secret Manager, used from inside
Google Cloud — and it is fine-grained: this repository only, `Pull requests: read and
write` and `Commit statuses: read and write`. No contents write, so it cannot push.

It is **optional**. With the sentinel `none` stored, `ci/report.sh` prints the whole
report into the build log, says loudly that it posted nothing, and exits clean. Nothing
fails for want of a token — you simply go blind, which is the trade to make consciously
rather than by accident.

## The one security boundary that had to be rebuilt

A build checks out a commit and then runs `ci/*.sh` from it, with the deployer's
credentials. So *which commit* is a privilege decision, and GitHub Actions made it for
free: a `pull_request` run from a fork gets no secrets. Cloud Build has no such notion —
a webhook is a webhook.

Two rules replace it, both in the trigger filters in `infra/index.ts`:

- The pull request head must live in this repository, not a fork
  (`body.pull_request.head.repo.full_name == body.repository.full_name`).
- The payload must name this repository (`body.repository.full_name == "<slug>"`).

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

**Reporting is hand-rolled.** `pulumi/actions` posted the preview for free, and GitHub
posted the check. `ci/report.sh` does both, with a stored token. See *Seeing a failure*
above — it is the part of this migration that took the most care, because losing it means
losing the ability to look at a broken deploy at all.

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

`scripts/setup-cloud-build.sh`, once per project, in Cloud Shell. It creates only what
Pulumi cannot: the APIs, the deployer's two extra roles, and three Secret Manager secrets
— because a secret *value* cannot live in code, and because the deploy key has to exist
before the first build can clone anything at all. Same boundary `bootstrap.sh` draws.

Then: apply the stack, add the deploy key and the two webhooks to GitHub, and open a pull
request to watch a preview run. `scripts/print-webhooks.sh` prints the URLs.

## The cutover

`.github/workflows/infra.yml` is still in the repository, and still applies on main. That
is on purpose and is temporary: the Cloud Build triggers are Pulumi resources, so
something has to apply the stack that creates them, and until a Cloud Build run has gone
green that something is the workflow it replaces.

Once a Cloud Build preview and a Cloud Build apply have both succeeded, delete
`.github/workflows/infra.yml`, delete the five `GCP_*` repository variables, and remove
the Workload Identity Federation section from `bootstrap.sh`. Nothing else uses any of it.
