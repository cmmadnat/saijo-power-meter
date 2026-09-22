# Clean architecture in this repository

## The rule

Imports point inward. Nothing else about the layering matters as much as this.

```
        ┌──────────────────────────────────────────────┐
        │ apps/            web · ingester              │  composition
        │   ┌──────────────────────────────────────┐   │
        │   │ packages/infrastructure              │   │  adapters
        │   │   ┌──────────────────────────────┐   │   │
        │   │   │ packages/application         │   │   │  use cases + ports
        │   │   │   ┌──────────────────────┐   │   │   │
        │   │   │   │ packages/domain      │   │   │   │  entities + rules
        │   │   │   └──────────────────────┘   │   │   │
        │   │   └──────────────────────────────┘   │   │
        │   └──────────────────────────────────────┘   │
        └──────────────────────────────────────────────┘
```

| Layer | May import | Holds |
| --- | --- | --- |
| `packages/domain` | nothing | Meters, readings, the rules that are true regardless of how anything is stored or displayed |
| `packages/application` | domain | Use cases, and the **port interfaces** they need |
| `packages/infrastructure` | domain, application | Adapters implementing those ports: BigQuery, MQTT, fixtures |
| `apps/*` | all of the above | Composition and delivery — Next.js, the ingester process |

The inner two layers may not import **any** third-party package. That is the
rule that actually bites, and it is the point: it is what stops a BigQuery row
type or a React hook from creeping into a use case and quietly welding the
logic to its delivery mechanism.

## It is enforced, not aspirational

`npm run boundaries` walks the source and fails on any import that points
outward, any third-party import in the inner layers, and any reach into a
package through a deep path rather than its entry point. It runs first in
`npm run verify` and first in the `check` workflow, before the slower checks.

A package may declare more than one entry point in its `exports`, and a declared
one is not a deep path. `@power-meter/infrastructure/fixtures` is the only such
entry today: the fixture generator lives behind it so that a second check in the
same script can walk the web app's import graph and prove live mode never reaches
it — see `docs/architecture/data-modes.md`.

A layering claim that nothing checks stops being true within a few pull
requests. This one is checked.

## Why it earns its place here

Three reasons specific to this system, not a general preference for layers:

**Two deployables must share the decoder.** The web app scales to zero; the MQTT
ingester is pinned to exactly one always-on instance. They are separate
processes with opposite scaling shapes, and the plan requires them to share the
payload decoder *verbatim* — if they drift, stored history and live readings
disagree and nobody notices until a total looks wrong. A shared inner layer is
the mechanism that makes drift impossible rather than merely discouraged.

**The plan already promised it.** Step 5 builds the History aggregations against
fixtures; step 8 moves them server-side "unchanged". That promise is only
keepable if the aggregations never knew where their readings came from. Ports
make it true by construction instead of by discipline.

**One decision is still unmade.** The scaling divisors for active power and
energy are unresolved (see `../requirements/power-meter-mqtt.md`). Keeping raw
payloads out of the domain confines that question to a single adapter. When the
customer answers, one table of constants changes and nothing above it moves.

## Where things go

- **A rule that would still be true on paper** — a meter is running when active
  power exceeds its standby level; total energy over a window is a subtraction
  with reset handling — is domain.
- **A sequence of steps that answers a screen's question** — "total energy and
  running hours per meter for this department and range" — is a use case in
  application, expressed against ports.
- **Anything that names a technology** — BigQuery, MQTT, HiveMQ, Next, the
  payload format itself — is infrastructure.
- **Anything that wires those together or renders them** is an app.

The payload decoder is infrastructure, not domain, even though it feels
domain-shaped. It exists to translate one specific wire format, and the domain
should not know that format exists.

## Testing follows the layering

Domain and application tests need no test doubles for I/O, because there is no
I/O to double — they are plain function calls. Adapters are tested against the
real thing or a local substitute. That is the payoff: the logic that is easy to
get subtly wrong is also the logic that is cheapest to test.

## What is here now

`packages/domain` holds the meter registry — 72 slots, 55 commissioned,
generated from the customer workbook by `tools/extract-meters.py` — plus the
reading entity and the running-vs-standby rule. `packages/application` holds the
ports the plan already commits to.

`packages/infrastructure` arrived with the first adapter, as intended: the MQTT
payload decoder, the scale-factor table it applies, and the fixture data the
screens are built against. The two fixture classes implement the
`ReadingRepository` and `LatestReadingStore` ports, so the store step replaces
an argument rather than a call site.

Two things about it are worth knowing before touching it:

- **The decoder is the piece both deployables share verbatim.** Changing how a
  field is scaled changes stored history and the live screen together, which is
  the entire reason it lives in one place.
- **`src/mqtt/scaling.ts` is where the unanswered question is parked.** Each
  factor carries its confidence and the evidence behind it, and the two that are
  still guesses have tests asserting the guess — so the day the customer's real
  payload arrives, the change is loud.
