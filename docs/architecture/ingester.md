# The MQTT ingester

One always-on service that holds the subscription to the nine station topics, decodes every
message with the step-2 decoder, keeps the newest reading per meter in memory and serves it
over HTTP, and writes raw readings and their 1-minute rollup to the warehouse in batches.

Written at step 7 of `docs/power-meter-rebuild-plan.md`. **It is built and verified against a
local broker, and it has never connected to the customer's.** The reason is at the bottom of
this page and it is not a technical one.

## What is where

| | |
| --- | --- |
| `apps/ingester/src/config.ts` | The environment, read once, and the startup gate. |
| `apps/ingester/src/broker.ts` | The `Broker` port and the MQTT.js adapter: reconnect, persistent session, takeover. |
| `apps/ingester/src/ingester.ts` | Decode, buffer, roll up closed minutes, hold the hot state. |
| `apps/ingester/src/service.ts` | How the service reacts to connect, disconnect and takeover. |
| `apps/ingester/src/http.ts` | `/latest`, `/stats`, `/healthz`, `/readyz`. |
| `apps/ingester/src/file-store.ts` | The ports backed by files. The replay harness only. |
| `apps/ingester/tools/replay.ts` | A broker on loopback replaying the fixtures at 60 msg/min. |
| `apps/ingester/tools/reconcile.ts` | Checks a run's rollup against the raw readings behind it. |
| `apps/ingester/tools/capture.ts` | Reads the real broker, prints raw payloads, writes nothing. |
| `apps/ingester/tools/takeover.ts` | Two connections, one id: does HiveMQ send reason code 142? |
| `apps/ingester/tools/broker-config.ts` | Where both of those read the address and credentials. |
| `packages/infrastructure/src/warehouse/writer.ts` | The `ReadingWriter` port, backed by load jobs. |

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

Raw readings and their rollup are written **in the same call**, because they are one flush of one
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
| A flush fails | Nothing. The batch is held and goes out with the next one, rollup rows included. |
| The warehouse is down for a long time | The buffer is capped at 20 000 readings (~an hour); past that the oldest are dropped, and counted in `/stats`. |
| The broker drops briefly | Nothing. `clean: false` with QoS 1 means the broker queues while the subscriber is away. |
| The broker is away a long time | Everything past the broker's queue depth. HiveMQ Cloud's free plan holds 1000 messages per client — about **16 minutes** at 60 a minute — and then drops the oldest, silently. |
| SIGTERM (a deploy) | Nothing: the shutdown flushes once more before the process goes. |

The acknowledgement is sent when the message is handed to the decoder, not when the batch is
written, so the crash case above loses a flush rather than replaying it. The alternative —
deferring the ack until the load job returns — turns that loss into duplicate raw rows after a
redelivery, and duplicates are the failure this design spends most of its effort avoiding.

## The hot state

The newest reading for each of the 55 commissioned meters, in a map, served at `GET /latest`. It is
55 entries whatever the message rate, which is what makes memory flat over a soak, and it is free
to read — the reason the plan calls the *live* screen the expensive part and the history the cheap
one.

It is mirrored to the `latest` table every ~30 s. That table is not the screen's data source; it is
what a restarted ingester rehydrates from, so a deploy does not begin blind. A failure to read it
is logged and the service starts anyway: an empty hot state costs a few seconds of blank rows,
refusing to start costs everything.

## The startup gate

`assertSafeToStart` refuses to run while `unconfirmedScales()` is non-empty — today the divisors
for **active power** and **energy**, neither documented in the customer's workbook. The exemption
is a broker on loopback with `WAREHOUSE=memory` or `WAREHOUSE=file`, which is the replay harness
and cannot reach BigQuery. Both halves are required: a loopback broker pointed at the real dataset
is refused, because what is being protected is the warehouse, not the broker.

This is not caution about a number being slightly off. A wrong divisor writes engineering units
that look like measurements, the raw integers are never stored, and no backfill recovers them.

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
in the shape the `latest` table holds. That is what makes two of the plan's verification items
answerable without a project: *restart and the hot state rehydrates from `latest`*, and *the rollup
reconciles against raw*.

## Deployment, and the flag that is off

`infra/index.ts` declares the ingester's service account, the three broker secrets
(`mqtt-broker-url`, `mqtt-broker-username`, `mqtt-broker-password`), the warehouse write access
and the secret access. Those apply now and ingest nothing.

The Cloud Run **service** is behind `saijo-power-meter:deployIngester`, which is `"false"`. A
deployed revision would refuse to start — that is the gate doing its job — and a crash-looping
revision fails every apply from then on. Flipping it to `"true"` belongs in the same change that
confirms the divisors and adds a version to each secret:

```bash
printf '%s' "$VALUE" | gcloud secrets versions add mqtt-broker-password \
  --project saijo-power-meter --data-file=-
```

The values are in the customer's workbook in plaintext, on its `MQTT Server` tab. They should be
rotated before go-live; a rotation is a new secret version plus a restart, not a deploy.

## What has not been run

- **No connection to the customer's broker.** Gated on the scaling question — see the plan's
  *Still open*.
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
