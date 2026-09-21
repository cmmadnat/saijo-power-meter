# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

This is a **greenfield rewrite**. The only committed content is `reference/`, a snapshot of the
previous implementation of the Saijo Denki power-meter system. There is no application code,
build file, or test suite at the repository root yet.

Treat `reference/` as **read-only source material**: it is where the domain model, API contract,
requirements, and factory data specs live. Do not refactor, "fix", or extend it — build the new
app at the repository root and copy/translate from `reference/` as needed.

## Target architecture (decided, not yet scaffolded)

- **Single Cloud Run service** serving both API and UI (the reference app did the same: React
  build copied into the Quarkus jar, see below). Region `asia-southeast1`, GCP project
  `saijo-monitoring`.
- **Versioned database migrations** checked into the repo and run as a build step *before* the
  Cloud Run deploy — never applied by hand against a deployed database. See
  `reference/docs/architecture/22-22-database-migration-strategy.md` for the intended
  contract (ordered, idempotent, forward-compatible scripts + a table/collection tracking which
  versions ran).
- **Google Cloud storage** for any file/blob payloads (the reference app stuffed everything into
  Firestore, which doc 03 already flagged as a stopgap).
- **UI bootstrap: shadcn/ui + Tailwind with light/dark theming.** Prefer whatever gets there with
  the least ceremony (`npx shadcn@latest init`). `reference/frontend` is already a shadcn app —
  its `components.json` (slate base color, CSS variables, `@/` aliases), `src/index.css` theme
  tokens, `src/hooks/useTheme.tsx`, and the ~50 generated `src/components/ui/*` primitives can be
  lifted directly instead of regenerated.

When the stack is scaffolded, replace this section with real build/test/lint/migrate commands.

## What lives in `reference/`

| Path | What it is |
| --- | --- |
| `Smart factory/` | **Authoritative specs** from the customer: per-module `*.xlsx` field specs, PDFs, and sample CSV exports. The source of truth for field names and units. |
| `docs/architecture/` | Sharded architecture doc (tech stack, data models, API spec, DB schema, migrations, deployment, testing). Numbered files; `index.md` is the map. |
| `docs/prd/`, `docs/stories/`, `docs/qa/` | BMAD-generated PRD, per-story implementation records, and QA gates. Story files record what was actually built and why. |
| `API-Documentation-Mapping.md` | Maps each Excel spec sheet → implemented endpoint → Java source line. Fastest way to find the contract for a given requirement. |
| `smart-factory-backend/` | Quarkus 3.2 / Java backend: `resource/` (JAX-RS endpoints), `service/`, `model/` (Jackson DTOs). |
| `frontend/` | Vite + React 18 + TypeScript + shadcn/ui + TanStack Query + Recharts admin UI. |
| `src/main/java/...` | Stray partial duplicate of `smart-factory-backend`'s `fieldreliability` package. Ignore it; it is dead. |

### Domain modules

Four functional areas, all keyed off air-conditioner test rigs in the Smart Factory:

1. **Function Test** — indoor/outdoor unit test data plus editable *standards* (`*Std` models) that
   measurements are compared against. The largest surface by far.
2. **Calorie Meter Room** — test results + AI suggestion endpoint.
3. **EMC** (electromagnetic compatibility) — test results + suggestion endpoint.
4. **Power Meter / dashboard** — live and historical kW readings, per-meter status and uptime.

A fifth area, `fieldreliability` (auth, maintenance tasks, technicians, predictions), was bolted on
later and is largely mock-data scaffolding — check `docs/field-reliability-integration-epic.md`
before assuming any of it is real.

### API conventions carried over from the reference

- All endpoints under `/api/v1/…`; health at `/api/v1/health`.
- **JSON fields are `snake_case`** (`unit_power_input_w`, `tester_no`, …) and match the Excel specs
  literally. In Java this is done with explicit `@JsonProperty` on every field; the TypeScript
  interfaces in `frontend/src/types/models.ts` mirror them. Keep this naming — the factory-side
  consumers depend on it.
- Write/mutate endpoints return `{"success": true, "id": …}`; the `{success, data, message,
  timestamp}` envelope described in `reference/README.md` was aspirational and never applied
  consistently. Pick one shape for the rewrite and apply it everywhere.
- SPA fallback: `SPAResource` serves `index.html` for any path that isn't `api/`, `q/`, `static/`,
  or dot-containing. Any new single-service setup needs the equivalent.

## Running the reference app (only when you need to observe real behaviour)

Requires Java 17, Maven, and Node 18+. There is no Maven wrapper checked in, so use `mvn`
directly — `reference/README.md` and `start-dev.sh` call `./mvnw`, which does not exist. Nothing
here is part of the new build.

```bash
cd reference/smart-factory-backend && mvn quarkus:dev     # API on :8080, Swagger at /q/swagger-ui
cd reference/frontend && npm install && npm run dev          # UI on :3000, proxies nothing — API_BASE is /api/v1
cd reference && ./start-dev.sh                               # Firestore emulator (:8089) + Quarkus dev
```

Tests:

```bash
cd reference/smart-factory-backend && mvn test                   # JUnit 5 + REST Assured
cd reference/smart-factory-backend && mvn test -Dtest=FunctionTestServiceTest   # single test class
cd reference/frontend && npm test                                  # Vitest
cd reference/frontend && npx vitest run src/components/PowerMeterCard.test.tsx     # single test file
cd reference/frontend && npm run lint
```

Gotcha: Checkstyle is bound to `validate` with `failOnViolation=true`, so any Maven goal fails on
style violations — CI works around it with `-Dcheckstyle.skip=true`. Don't copy that workaround
into the new build; wire up a formatter that actually passes.

## Deployment shape to reproduce

`reference/cloudbuild.yaml` + `reference/Dockerfile` + `reference/deploy.sh` show the pipeline the
new app should replace:

- Cloud Build trigger on pushes to `main` (`trigger-config.yaml`) → build UI → build server →
  `docker build` → push to `gcr.io/saijo-monitoring/…` → `gcloud run deploy smart-factory`
  (`--region asia-southeast1`, `--allow-unauthenticated`, port 8080).
- `Dockerfile` is runtime-only — all building happens in Cloud Build steps, and it runs as a
  non-root `app` user.
- `deploy.sh [staging|production]` is the manual path; it appends `-staging` to the service name
  for non-production. Credentials in Cloud Run come from the attached service account, not a
  key file.
- `firestore.rules` is wide open (`allow read, write: if true`). Whatever datastore the rewrite
  uses, do not carry that posture forward.

## Notes

- `reference/.claude/commands/BMad/` and `reference/.gemini/commands/` contain the BMAD agent/task
  command set. Because they sit under `reference/`, Claude Code does not pick them up as slash
  commands from the repository root.
- `reference/frontend` was partly generated by Lovable (`lovable-tagger` in `vite.config.ts`,
  `docs/stories/5.5.integrate-lovable-project-ui.story.md`), so some components are generated
  output rather than hand-written code.
- Authentication was explicitly out of scope in the reference PRD; the `fieldreliability`
  `AuthResource` is not a real auth system.
