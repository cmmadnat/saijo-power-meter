# Cloud Shell runbook

Every command here is one a **human** runs in Google Cloud Shell, because a Claude session holds
no Google Cloud credentials by design (CLAUDE.md, *How infrastructure changes reach the cloud*).
Cloud Shell is already authenticated as you, needs no local machine, and is where anything that
must touch the real project happens.

The rule that shapes this page: **nothing here applies infrastructure.** Infrastructure reaches
the cloud by merging to `main`, which runs the Cloud Build apply. What is left for a human is the
handful of things Pulumi cannot do for itself — granting the deployer a role it does not yet have,
making and destroying a scratch resource for a test, and reading something back.

## Setup

```bash
git clone -b main https://github.com/cmmadnat/saijo-power-meter.git
cd saijo-power-meter && npm ci
export GOOGLE_PROJECT=saijo-power-meter
node --version          # must be >= 22.6 for --experimental-strip-types; nvm install 22 if not
```

---

## Outstanding: step 9's checks, once the observe ingester is applied

Step 9 runs the ingester in **observe mode** — the customer's broker, `WAREHOUSE=none`, client id
`power-meter-observer` — on **Compute Engine's free e2-micro in `us-central1-a`**, not on Cloud
Run, which would bill ~$45–70 a month for the same always-on vCPU. Nothing about it can be
checked from a Claude session, which holds no credentials and cannot reach the broker.

**Before the merge**, the deployer needs three compute roles it did not hold. Granted on
2026-09-23; `bootstrap.sh` carries them for a new project.

```bash
for role in roles/compute.instanceAdmin.v1 roles/compute.networkAdmin roles/compute.securityAdmin; do
  gcloud projects add-iam-policy-binding saijo-power-meter \
    --member "serviceAccount:pulumi-deployer@saijo-power-meter.iam.gserviceaccount.com" \
    --role "$role" --condition None
done
```

The merge creates the three broker secrets' first versions from `reference doc/mqtt`, a network,
one IAP-only SSH rule, and the VM. The VM is private — no port but 22, and that only from IAP — so
every check goes through the tunnel. The first `gcloud compute ssh` creates an OS Login key.
Docker needs `sudo`: the OS Login user is not in the `docker` group. `curl` does not.

```bash
vm() { gcloud compute ssh power-meter-ingester --zone us-central1-a --project saijo-power-meter \
         --tunnel-through-iap --command "$1"; }

# 0. It booted: the container is up, and its log says observe mode.
vm 'sudo docker ps --format "{{.Names}} {{.Status}} {{.Image}}"; sudo docker logs --tail 20 ingester'

# 1. Every station's commissioned slots, and nothing else: expect 5 5 8 7 7 6 7 6 4, recording false,
#    and the interval the feed actually publishes at (the test publisher: ~60000).
vm 'curl -s localhost:8080/latest' | jq -r \
  '"recording=\(.recording) interval=\(.publishIntervalMs)",
   ([.readings[].meterId[1:3]] | group_by(.) | map(length) | join(" "))'
vm 'curl -s localhost:8080/stats' | jq '{recording, messages, readings, flushes, latestFlushes, rowsWritten}'

# 2. Writes nothing. Note the values, leave it running an hour, read them again: all unchanged.
bq query --nouse_legacy_sql --project_id saijo-power-meter \
  'SELECT (SELECT MAX(ingested_at) FROM power_meter.readings) AS raw,
          (SELECT COUNT(*) FROM power_meter.readings_1m) AS rollup_rows'
gcloud firestore documents describe ingester/latest --project saijo-power-meter \
  --format 'value(updateTime)' 2>&1 | tail -1     # NOT_FOUND is also a pass

# 3. A restart begins empty and fills within one publish.
vm 'sudo docker restart ingester'
for i in $(seq 1 15); do vm 'curl -s localhost:8080/latest' | jq '.readings | length'; sleep 5; done

# 4. A connection on the go-live id is not evicted by the observer, and does not evict it.
#    Read-only, clean session, writes nothing. Expect nine messages and no "DISCONNECT, reason code 142".
npm run capture -w @power-meter/ingester -- --messages 9 --client-id power-meter-ingester
vm 'sudo docker logs --tail 5 ingester'                 # and no "shutting down" here either
```

`bq ls -j` is *not* the check for 2: the Storage Write API creates no jobs, so an ingester that was
writing would leave job history empty too. `ingested_at` and the rollup's row count move when
anything appends. `--client-id power-meter-ingester` is safe only **before go-live** — once the
writing ingester runs on that id, the same command evicts it.

`/logs` reads the Cloud Run service's logs and does not see the VM. Its container output is in
Cloud Logging under `resource.type="gce_instance"`, or `vm 'sudo docker logs ingester'`.

**If check 0 shows no container**, the startup script failed; its output is in the serial console:
`gcloud compute instances get-serial-port-output power-meter-ingester --zone us-central1-a
--project saijo-power-meter | grep startup-script`.

**What it costs**, per the free tier: the e2-micro, its 10 GB standard disk and the first 1 GB a
month of egress from North America are free. The in-use external IPv4 address may be billed at
about $3.65 a month — check the first invoice. The free e2-micro is one per billing account, so
another e2-micro anywhere on that account uses it up.

---

## Step 8c's apply — done

As of 2026-09-23 the project is fully applied: step 8c's migration `0002` is in, the `(default)`
Firestore database exists, and the deployer holds `roles/datastore.owner`.

It did not the first time. The step 8c apply failed with
`Error creating Database: googleapi: Error 403: The caller does not have permission`, because
creating a Firestore database takes `datastore.databases.create` and only `roles/datastore.owner`
carries it. The fix, kept here because the next new resource kind may need the same shape of thing:

```bash
gcloud projects add-iam-policy-binding saijo-power-meter \
  --member "serviceAccount:pulumi-deployer@saijo-power-meter.iam.gserviceaccount.com" \
  --role roles/datastore.owner \
  --condition None
```

`bootstrap.sh` carries that role now, so a second project gets it without this step, and the script
is idempotent if you would rather re-run the whole list.

**Getting an apply to re-run is a merge to `main`**, which fires the apply trigger. Re-running the
failed build from the Cloud Build console works too and changes nothing else.

Running `pulumi up` by hand is deliberately *not* the answer. It takes a lock in the shared state
bucket that a concurrent build cannot see around, and the program reads `WEB_IMAGE` from the
environment, so a hand-run either has to be given the exact commit-pinned image the pipeline last
pushed or it rolls the web service backwards.

To read the project's current state back:

```bash
gcloud firestore databases list --project saijo-power-meter
gcloud projects get-iam-policy saijo-power-meter \
  --flatten="bindings[].members" \
  --filter="bindings.members:power-meter-ingester@saijo-power-meter.iam.gserviceaccount.com" \
  --format="table(bindings.role)"
```

Expect a `(default)` database in `asia-southeast1`, `roles/datastore.user` present, and
`roles/bigquery.jobUser` **absent**.

---

## The warehouse

`migrate` and `settings` are safe to run against the real dataset. `load`, `verify` and especially
`reset` are not casual: `load` writes synthetic readings that no column distinguishes from real
ones.

```bash
npm run warehouse -w @power-meter/infrastructure -- migrate           # apply pending migrations
npm run warehouse -w @power-meter/infrastructure -- settings          # read partition expiry back
npm run warehouse -w @power-meter/infrastructure -- cost --runs 20    # what live mode's reads bill
```

**Before the first real reading is ever written**, the fixture rows have to go:

```bash
npm run warehouse -w @power-meter/infrastructure -- reset --yes
npm run warehouse -w @power-meter/infrastructure -- migrate
```

That drops every table this code owns, the ledger with them, and the retired `latest` if the
dataset still has it. After go-live it destroys history that exists nowhere else.

## Scratch resources, for testing the write path

Both of these are throwaways. Make them, use them, delete them in the same sitting — a scratch
resource that outlives its test is one nobody remembers the purpose of.

```bash
# A scratch dataset, then the write path through it at more than the old daily cap.
bq --location=asia-southeast1 --project_id=saijo-power-meter mk -d scratch_8c
npm run warehouse -w @power-meter/infrastructure -- migrate --dataset scratch_8c
npm run warehouse -w @power-meter/infrastructure -- soak --dataset scratch_8c --cycles 1600 --interval 200

# A scratch Firestore database, then the restart-state document round trip.
gcloud firestore databases create --database=power-meter-scratch \
  --location=asia-southeast1 --type=firestore-native --project saijo-power-meter
npm run hotstate -w @power-meter/ingester -- --database power-meter-scratch

# Teardown.
bq rm -r -f -d saijo-power-meter:scratch_8c
gcloud firestore databases delete --database=power-meter-scratch --project saijo-power-meter
```

`soak` refuses `power_meter` by name and `hotstate` requires `--database` with no default, for the
same reason: a tool that writes to the real store by default eventually writes to it by accident.
A named Firestore database gets no free quota, so the scratch one is billed — at one document, a
fraction of a cent.

Expect from `soak`: `1600 append(s) per table, 176000 rows, 0 failure(s)`. A load job would have
been refused at 1 500, which is the whole point of the run. From `hotstate`: `OK: all 55
commissioned meters survived the round trip`.

## The MQTT capture

`tools/capture.ts` is the only thing that points at the customer's broker, and it writes nothing
anywhere. **A Claude session cannot run it** — the egress policy blocks that host on every port —
so it runs here, or on a laptop on the factory network.

```bash
npm run capture -w @power-meter/ingester -- --messages 9 --out capture.jsonl
```

It reads the address and credentials from `reference doc/mqtt`, connects with a random client id
(never the ingester's, which would evict a running one) and a clean session at QoS 0.

## Reading logs without Cloud Shell

These two need no shell at all — they are comments on GitHub issue #12, and a workflow with a
read-only identity does the reading:

```
/logs                    /logs 6h ERROR            /logs freshness=2d -- textPayload:"ECONNREFUSED"
/buildlog                /buildlog failed          /buildlog build=<build-id>
```

That is how a session with no credentials reads a failed apply, and it is what diagnosed the 403
described above.

One wrinkle since the triggers started ignoring docs-only pushes: `main`'s head may be a commit no
build ever ran for, so `/buildlog sha=<head>` finds nothing. Use a bare `/buildlog` for the most
recent build, or `/buildlog failed`.
