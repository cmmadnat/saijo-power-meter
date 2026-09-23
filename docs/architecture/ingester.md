# The MQTT ingester

One always-on service that holds the subscription to the nine station topics, decodes every
message with the step-2 decoder, keeps the newest reading per meter in memory and serves it
over HTTP, and writes raw readings and their 1-minute rollup to the warehouse in batches.

Written at step 7 of `docs/power-meter-rebuild-plan.md`. **It is built and verified against a
local broker, and it has never connected to the customer's.** The reason is at the bottom of
this page and it is not a technical one.

Step 9 added a second way to run it — **observe mode**, `WAREHOUSE=none` — which is how it first
meets the customer's broker: no writer at all, so a guessed divisor can reach a screen that says
so and nothing that outlives the process. See *Observe mode* below.

## What is where

| | |
| --- | --- |
| `apps/ingester/src/config.ts` | The environment, read once, and the startup gate. |
| `apps/ingester/src/broker.ts` | The `Broker` port and the MQTT.js adapter: reconnect, persistent session, takeover. |
| `apps/ingester/src/ingester.ts` | Decode, buffer, roll up closed minutes, hold the hot state. |
| `apps/ingester/src/service.ts` | How the service reacts to connect, disconnect and takeover. |
| `apps/ingester/src/http.ts` | `/latest`, `/recent`, `/stats`, `/healthz`, `/readyz`. |
| `packages/infrastructure/src/file-store/` | The ports backed by files. The replay harness only; moved out of this app at step 8 so the web app's live mode can read what the ingester writes. |
| `apps/ingester/tools/replay.ts` | A broker on loopback replaying the fixtures at 60 msg/min. |
| `apps/ingester/tools/reconcile.ts` | Checks a run's rollup against the raw readings behind it. |
| `apps/ingester/tools/capture.ts` | Reads the real broker, prints raw payloads, writes nothing. |
| `apps/ingester/tools/takeover.ts` | Two connections, one id: does HiveMQ send reason code 142? |
| `apps/ingester/tools/broker-config.ts` | Where both of those read the address and credentials. |
| `apps/ingester/tools/hotstate.ts` | Writes the restart-state document to a scratch database and reads it back. |
| `packages/infrastructure/src/warehouse/writer.ts` | The `ReadingWriter` port: BigQuery for rows, Firestore for restart state. |
| `packages/infrastructure/src/warehouse/stream.ts` | The Storage Write API default stream, one connection per table. |
| `packages/infrastructure/src/firestore/latest-store.ts` | The restart state: one document holding all 55 meters. |

The decoder is **not** in this app. `StationDecoder` is imported from
`@power-meter/infrastructure`, the same object the fixtures and the tests use, which is what the
plan means by *shared verbatim*: the web app and the ingester cannot drift about what a payload
means, because there is one implementation and one scale table.

## Exactly one instance, and why that is correctness

Two subscribers on the same nine topics store every reading twice and make every energy total and
every rollup count wrong. Nothing detects it; the numbers simply read high. Three things together
make it impossible rather than unlikely:

1. **`min-instances=1, max-instances=1`** on the Cloud Run service (`infra/index.ts`). That is the
   whole reason this service is not autoscaled, and why its CPU is always allocated: the work
   happens between requests.
2. **A fixed MQTT client id.** A broker that sees a second connection with an id it already has
   *takes the session over* and disconnects the first. That is what makes a deploy clean: the new
   revision attaches, the old one is evicted, and there is no window with two subscriptions.
3. **An evicted instance exits.** This is the part that is easy to leave out and is the reason
   `service.ts` exists as its own file. Without it the evicted instance reconnects, evicts its
   rival back, and the two flap every few seconds — both of them ingesting. MQTT 5 says *why* a
   client was disconnected (reason code `0x8E`, session taken over); the adapter reports that as a
   takeover and the service shuts down for good.

The third one needs MQTT 5. **HiveMQ Cloud sends it — observed, 2026-09-22:** two connections under
one client id, and the first was handed `DISCONNECT, reason code 142`. That is `tools/takeover.ts`,
and it is the half of the guarantee the local harness cannot show. The local replay broker (aedes)
speaks 3.1.1 only, so `MQTT_PROTOCOL_VERSION=4` is how the harness runs — and running two ingesters
against *it* shows exactly the flap described above, which is the failure mode this guard removes.

So the chain is now: the broker sends 142 (seen on the real broker), the adapter reads 142 as a
takeover rather than a drop (`broker.ts`), and the service shuts down instead of reconnecting
(asserted in `service.test.ts`). The only link never exercised end to end is the ingester process
itself against HiveMQ, because it has never been allowed to connect.

## The batch, and the one rule about minutes

Raw readings and their rollup are written **in the same call**, through the Storage Write API's
default stream — two `AppendRows` requests, one per table, issued together and awaited together,
because the API has no way to make them one. They were load jobs until step 8c; see
`docs/architecture/warehouse.md` for the per-table daily cap that changed it.

They are one call because they are one flush of one
buffer. A crash between two separate writes would leave a minute present in `readings` and absent
from `readings_1m`, and no reader is built to notice: the chart would fall back to raw and agree,
and the rollup would under-report that minute forever.

The flush timer is ~45 s and does not divide the minute, which is the subtlety:

> **Only closed minutes are rolled up.** A flush at 12:00:45 holds part of the minute 12:00 and a
> flush at 12:01:30 holds the rest. Rolling up each would write two rows for `(meter, 12:00)` — the
> pair *is* the row's identity — and the chart would simply draw that minute twice as heavily.
> Readings in the minute still running stay behind for the next flush. Their raw rows go out
> immediately either way, because raw has no such identity.

The rollup itself is `rollupReadings()` from `packages/application`, never a SQL `GROUP BY`: the
charts bucket with the same three rules, and a second definition of "a minute" would be free to
drift from the one the screen draws.

## What a failure costs

| | |
| --- | --- |
| The process dies | Up to one flush interval of readings — they were in memory and nowhere else. |
| A flush fails | Nothing. The batch is held and goes out with the next one, rollup rows included. A request BigQuery accepted but did not acknowledge can land twice: the default stream is at-least-once, as load jobs were. |
| The warehouse is down for a long time | The buffer is capped at 20 000 readings (~an hour); past that the oldest are dropped, and counted in `/stats`. |
| The broker drops briefly | Nothing. `clean: false` with QoS 1 means the broker queues while the subscriber is away. |
| The broker is away a long time | Everything past the broker's queue depth. HiveMQ Cloud's free plan holds 1000 messages per client — about **16 minutes** at 60 a minute — and then drops the oldest, silently. |
| SIGTERM (a deploy) | Nothing: the shutdown flushes once more before the process goes. |

The acknowledgement is sent when the message is handed to the decoder, not when the batch is
written, so the crash case above loses a flush rather than replaying it. The alternative —
deferring the ack until the write returns — turns that loss into duplicate raw rows after a
redelivery, and duplicates are the failure this design spends most of its effort avoiding.

## The hot state

The newest reading for each of the 55 commissioned meters, in a map, served at `GET /latest`. It is
55 entries whatever the message rate, which is what makes memory flat over a soak, and it is free
to read — the reason the plan calls the *live* screen the expensive part and the history the cheap
one.

The wire shape — `LatestResponse` and `toLatestDto` — lives in
`packages/infrastructure/src/hot-state/dto.ts`, beside `IngesterLatestReadingStore`, the web app's
client for it. Both deployables import the one definition, the way they share the decoder. The web
app calls it with an ID token minted for this service's URL, because the service is private.

It is mirrored every ~30 s to **one Firestore document**, `ingester/latest`, holding all 55
readings at about 15 KB against the 1 MiB document limit. That document is not the screen's data
source; it is what a restarted ingester rehydrates from, so a deploy does not begin blind. A
failure to read it is logged and the service starts anyway: an empty hot state costs a few seconds
of blank rows, refusing to start costs everything.

**It was a BigQuery table called `latest` until step 8c, and it could not stay one.** 55 rows
rewritten every 30 s is 2 880 table modifications a day, against a standard table's cap of 1 500 —
a limit that cannot be raised and that failed writes count against too. The mirror would have
stopped at about half past twelve every afternoon, and the only symptom anyone would have seen is a
restart rehydrating from the morning. The rest of that arithmetic, and what it meant for `readings`
and `readings_1m`, is in `docs/architecture/warehouse.md`.

Two things about the Firestore side are decisions rather than defaults:

- **One document, not 55.** A document per meter would be 55 writes every 30 s — about 158 000 a
  day, and real money for a value obsolete a second later. One document is 2 880 writes a day,
  inside the free quota of 20 000 and well inside the single-document sustained write limit of one
  per second.
- **The `(default)` database.** Firestore gives free quota to exactly one database per project, and
  that is the one; a named database is billed from its first write. The cost of the alternative is
  about ten cents a month, so this is not really about money — it is that "the restart state is
  free" stays true without anyone having to check. What it costs is that a project which already
  has a default database fails the apply with *already exists*, because Pulumi creates rather than
  adopts; `gcloud firestore databases list` says in advance, and `pulumi import` is the remedy.

The web app never reads this document: in live mode the real-time screen reads the ingester's
memory over HTTP, as it always did. Since step 10 it holds a Firestore role (`datastore.user` since the meter labels), for the
observer's **separate** document and its own `labels/meters` — see *The observer snapshot* below.

## The startup gate

`assertSafeToStart` refuses to run while `unconfirmedScales()` is non-empty — today the divisors
for **active power** and **energy**, neither documented in the customer's workbook. There are two
exemptions, and one argument behind both: what is being protected is the warehouse, not the broker.

- **A broker on loopback with `WAREHOUSE=memory` or `WAREHOUSE=file`** — the replay harness, which
  cannot reach BigQuery. Both halves are required: a loopback broker pointed at the real dataset
  is refused.
- **`WAREHOUSE=none`, any broker** — observe mode. There is no writer object behind it, not
  BigQuery and not the Firestore restart state.

There is no third. The gate also checks client ids, whatever the scales: observe mode refuses
`power-meter-ingester`, and a writer refuses `power-meter-observer`.

This is not caution about a number being slightly off. A wrong divisor writes engineering units
that look like measurements, the raw integers are never stored, and no backfill recovers them.

## Observe mode

Step 9's ingester: the customer's broker, read into memory, served over HTTP, stored nowhere. The
feed it reads is a **test publisher** — the customer's own words — and the real meters are not
publishing yet, so what it shows is the wire format and the fleet's shape, not measurements.

| | |
| --- | --- |
| `WAREHOUSE=none` | `main.ts` hands the ingester `writer: null`. Nothing is buffered, rolled up, flushed or mirrored; the flush timers never start. "Writes nothing" is a property of the object graph rather than of a method that discards. |
| No restart state | Nothing is read back either, so a restart begins empty and fills within one publish. |
| Clean session | `persistentSession: false`. A queue drained after a restart would arrive in one burst stamped with the moment of the burst; an observer has no loss for a queue to prevent. |
| `power-meter-observer` | Its default client id. The writing ingester's id is refused in this mode, so the observer can never evict the writer or be mistaken for it. Still `min = max = 1`, and still exits on a takeover — by the next observer revision. |
| `GET /recent` | The last hour per meter, oldest first, in memory in every mode. `?meters=a,b` and `?minutes=n` narrow it. Capped at an hour and at 3 600 readings per meter. |
| `publishIntervalMs` | The median gap between messages on one topic, on `/latest` and `/stats`. The test feed publishes once a minute, not every ~9 s, and `freshnessForInterval()` in `packages/application` turns that into thresholds by the default's own rule — three missed publishes is stale, twenty is offline — which at 9 s *is* the default. |
| `recording` | `false` on `/latest`, `/stats` and `/readyz`, so a reader can tell an observer from the writer without knowing how it was deployed. |

It was run against the replay broker on 2026-09-23 (`WAREHOUSE=none`, loopback, protocol 4): ready
as `power-meter-observer` with `recording: false`, 55 meters on `/latest`, a measured interval of
9 011 ms against the replay's 9 s, 240 readings on `/recent`, zero flushes, and no `.ingester`
directory created. Against HiveMQ it has not run; the checks for that are in
`docs/runbooks/cloud-shell.md`.

## The observer snapshot (step 10)

Observe mode writes exactly one thing: `observer/latest` in the `(default)` Firestore database,
overwritten every `LATEST_FLUSH_INTERVAL_MS` (30 s), when `OBSERVER_SNAPSHOT=firestore`. It holds
the hot state, the rolling hour as 1-minute rollup rows, and the measured publish interval — about
70 KB for the whole fleet at the spec's rate, as columns per meter rather than objects, against a
1 MiB document limit. The web app's Incoming view reads it, which is how a private VM in another
region reaches a Cloud Run service without a network path between them.

It is written even before the first message, so the view can tell an observer that is up and
hearing nothing (fresh "observer as of", no readings) from one that is gone (a stale one). A failed
write is logged once per outage.

It also carries the feed's **health**: whether the broker connection is up and since when, the
broker's last complaint, messages received since start, and issue counts with the last 20 issues —
time, topic, kind, key, detail. That is what the Incoming view's banner reads.

**A payload that is not JSON used to throw** inside the MQTT message handler — the decoder parses
before it validates, and nothing caught it. It is now caught in `Ingester.accept` and counted as
`malformed-payload`, like any decoder issue; the rest of the feed is unaffected. A replay of the
customer's captured payloads with a garbled message and a missing field in the stream confirmed it:
both counted, both shown, every other message decoded.

The gate draws its edges: `OBSERVER_SNAPSHOT` is refused outside `WAREHOUSE=none`, and refused at
the restart state's path. So "observe mode writes nothing" became "observe mode writes one throwaway
document, never history" — the argument is unchanged, because nothing a guessed divisor produces
outlives an hour, and nothing that is kept can be confused with it. `OBSERVER_SNAPSHOT=file` writes
the same document as `<WAREHOUSE_DIR>/observer__latest.json`, for the replay.

## Capturing a real payload

`tools/capture.ts` is the one thing here that may point at the customer's broker, and it is not
the ingester: it subscribes, prints the raw integers verbatim, optionally appends them to a file,
and writes nothing anywhere else. There is no warehouse behind it for a wrong divisor to corrupt,
which is why it is not an exemption to the gate — it never goes through it.

```bash
npm run capture -w @power-meter/ingester -- --messages 9 --out capture.jsonl
```

It reads the address and the credentials from `reference doc/mqtt`, which the customer supplied on
2026-09-22 — so there is nothing to export and no password on a command line, where it would land
in a shell history. `MQTT_URL`, `MQTT_USERNAME` and `MQTT_PASSWORD` override the file, and
`--creds <path>` points at a different one. The file gives the host without a scheme; the tool
reads that as `mqtts://host:8883`, because a HiveMQ Cloud cluster has no plain 1883 to mean.

Two properties are deliberate. It connects with a **random client id**, never
`power-meter-ingester`: a diagnostic that evicted the running ingester would be worse than no
diagnostic. And it uses a **clean session at QoS 0**, so nothing queues for it on the broker while
it is not listening.

For every meter it prints the raw values, the three-phase `V x I x PF` those imply, and what
`M<n>P` would read at each candidate divisor with the matching one marked. On a *running* meter
that settles active power arithmetically, because V, I and PF are pinned independently. Energy is
not settled that way — a counter has nothing in the payload to cross-check against, so it still
takes one meter's own display reading at a known moment.

**It cannot run from a Claude cloud session, and the reason is now precise.** The egress policy does
not allow that host on any port. A `CONNECT` tunnel is established to 8883, 8884 and 443 alike and
then reset during the TLS handshake, where the same tunnel completes a handshake to `api.github.com`
without trouble; the proxy's own log records `ws_closed_mid_exchange` against the cluster after 39
bytes come back. So this is not an MQTT-port restriction to work around — it is a blocked host, and
the proxy's README is explicit that a policy denial is reported rather than routed around. Run the
capture from a laptop, Cloud Shell or the factory network.

**The credentials are in the repository, in plaintext, and that is now in git history.** They should
be rotated before go-live, and the new values belong in the `mqtt-broker-*` secrets rather than back
in a tracked file — rotation is then a secret version and a restart, not a commit. Deleting the file
does not undo the exposure; only rotating does.

## Running it locally

```bash
npm run replay -w @power-meter/ingester -- --minutes 7 --drop-at 120 --drop-for 40

MQTT_URL=mqtt://127.0.0.1:1883 MQTT_PROTOCOL_VERSION=4 \
WAREHOUSE=file WAREHOUSE_DIR=.ingester \
FLUSH_INTERVAL_MS=20000 PORT=8099 \
npm start -w @power-meter/ingester

curl -s localhost:8099/stats
curl -s localhost:8099/latest | head
npm run reconcile -w @power-meter/ingester -- --dir .ingester
```

`WAREHOUSE=file` writes the rows the warehouse adapter would write, as JSONL, plus `latest.json`
in the shape the restart-state document holds. Since step 8 the web app reads the same directory back: run it
with `DATA_MODE=live INGESTER_URL=http://127.0.0.1:8099 WAREHOUSE=file WAREHOUSE_DIR=.ingester` and
every screen is on the live code path, badged *Local replay*. That is what makes two of the plan's verification items
answerable without a project: *restart and the hot state rehydrates from `latest`*, and *the rollup
reconciles against raw*.

## Deployment

`infra/index.ts` declares the ingester's service account, the three broker secrets
(`mqtt-broker-url`, `mqtt-broker-username`, `mqtt-broker-password`), the warehouse write access,
the secret access and — since step 8c — the Firestore database and `roles/datastore.user` on it.
Those apply now and ingest nothing.

**Creating that database takes a role the deployer did not have.** `datastore.databases.create`
lives in `roles/datastore.owner`; the step 8c apply failed 403 on it while its preview had gone
green, because a preview plans rather than creates. The role is in `bootstrap.sh` now. The
ingester's own grant is `roles/datastore.user`, which deliberately cannot create a database — it
reads and writes one document.

The account lost a role at step 8c: it no longer holds `roles/bigquery.jobUser`. It needed that to
start a load job; a Storage Write API append is a data-plane call covered by `dataEditor` on the
dataset. It cannot run a query at all now, which is the right shape for a process whose whole job
is to append.

The Cloud Run **service** is behind `saijo-power-meter:deployIngester`, and what it runs is
`saijo-power-meter:ingesterMode` — `"observe"` (the default: `WAREHOUSE=none`,
`power-meter-observer`) or `"record"` (`WAREHOUSE=bigquery`, `power-meter-ingester`). `"record"` is
go-live: a revision set that way refuses to start while the divisors are guesses, and a
crash-looping revision fails every apply from then on. The program also refuses
`dataMode: "live"` unless `ingesterMode` is `"record"`, because live mode reads a warehouse an
observer never writes.

**Turning `deployIngester` on also creates the three secrets' first versions**, read at apply time
from `reference doc/mqtt` — values the customer already committed, so putting them in Pulumi state
exposes nothing git has not, and it removes a hand-run step an apply would otherwise depend on:
Cloud Run refuses a revision whose secret has no version. They carry `deletionPolicy: ABANDON`.
Rotation, at go-live, is by hand and never into a file:

```bash
printf '%s' "$VALUE" | gcloud secrets versions add mqtt-broker-password \
  --project saijo-power-meter --data-file=-
```

then delete the `SecretVersion` resources from the program — ABANDON leaves the old versions in
place to be disabled, rather than destroying one the service might still be reading.

**It runs on a VM, not on Cloud Run** — `saijo-power-meter:ingesterHost`, `"vm"` by default.
Cloud Run holding one always-on vCPU bills ~$45–70 a month; Compute Engine's free tier covers one
e2-micro, which an ingester decoding nine messages a minute does not strain. What that changes:

| | |
| --- | --- |
| Region | `us-central1-a`: the free e2-micro exists only in three US regions. Nothing else moved. At go-live, rows cross to the dataset in `asia-southeast1` — a few MB a day. |
| One instance | No instance group, and `deleteBeforeReplace`: the old VM is deleted before the new one boots. The client id and exit-on-takeover still hold. |
| Deploys | The commit-pinned image is in the startup script, which cannot change in place, so a code merge *replaces* the VM — a minute or two without an observer. |
| Secrets | Fetched at boot by the ingester's own image, as its own account, into tmpfs, and passed as `--env-file`. |
| Access | Private. One firewall rule: SSH from IAP's range. `/latest` is read through `gcloud compute ssh --tunnel-through-iap`. The external IP is outbound only; Cloud NAT would cost more than the rest together. |
| Health | `docker --restart always`. There is no readiness gate as Cloud Run had; a boot that fails shows in the serial console. |
| Logs | Cloud Logging under `gce_instance`, not the Cloud Run resource `/logs` reads. |
| The web app | **Has no route to it.** Cloud Run's `run.invoker` has no VM equivalent, so step 10 must give the Incoming source one; the program refuses `dataMode: "live"` on a VM until then. |

`"cloudrun"` keeps the service above, unchanged, for whoever decides the bill is worth the managed
probes.

The deployer's role list was checked for this change, per the rule step 8c's red `main` taught:
`roles/secretmanager.admin` covers adding a version, `roles/run.admin` the service and its invoker
binding, and `roles/iam.serviceAccountUser` acting as the ingester's account. The VM needed three it did
not hold — `compute.instanceAdmin.v1`, `compute.networkAdmin`, `compute.securityAdmin` — granted by
hand before the merge and added to `bootstrap.sh`.

## What has not been run

- **No connection to the customer's broker from this service.** Observe mode is built for it and
  the flag that deploys it is `deployIngester`; the four checks are in the runbook.
- **The image has never been built.** This session has no Docker daemon; `apps/ingester/Dockerfile`
  is built for the first time by the pipeline's `image` step.
- **The Cloud Run service has never existed**, so `min/max-instances`, the probes and the secret
  environment are declared and unapplied.
- **The ingester process has never connected to HiveMQ**, so the takeover chain is proven in two
  pieces rather than end to end: `tools/takeover.ts` saw reason code 142 on the real broker on
  2026-09-22, and the adapter's and service's response to it is asserted against a fake. Re-run
  that probe (two connections, one *random* id — never the ingester's, read-only) if the broker or
  its plan ever changes.
- **Nothing has measured cost per day**, which the plan asks for and which needs the service
  running.
- **Neither of step 8c's two stores has been written to from this process.** The composition in
  `main.ts` — a Storage Write API stream plus a Firestore document behind one `ReadingWriter` — is
  exercised in tests against fakes and by the replay against files, never against a project,
  because the startup gate still refuses `WAREHOUSE=bigquery`. What *can* be checked without
  running the ingester is checked by two tools instead, both against scratch resources:

```bash
# The write path, past the old per-table daily cap. Needs a scratch dataset.
npm run warehouse -w @power-meter/infrastructure -- migrate --dataset <scratch>
npm run warehouse -w @power-meter/infrastructure -- soak --dataset <scratch> --cycles 2000

# The restart state. Needs a scratch Firestore database, which is billed — delete it after.
npm run hotstate -w @power-meter/ingester -- --database <scratch>
```
