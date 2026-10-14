# RootCause AI — Manufacturing Root Cause Analysis System

A web application for production, process, quality and maintenance engineers to investigate production failures, find **verified** root causes, run CAPA to effectiveness, and prevent recurrence.

The main product is a structured engineering workflow: a guided intake, category-specific questions, RCA tools, an evidence register, cause verification with human approval, CAPA tracking and reports. An AI assistant is built into that workflow; it is not the main interface. The assistant never invents data and never confirms a cause. A cause becomes **Confirmed** only when documented evidence exists and an authorised reviewer approves it. This rule is enforced in the UI, the service layer and the database.

---

## Contents
1. [Implemented features](#implemented-features)
2. [Quick start (demo mode, no external services)](#quick-start-demo-mode)
3. [Project structure](#project-structure)
4. [Architecture](#architecture)
5. [Database schema and migrations](#database-schema-and-migrations)
6. [Environment variables](#environment-variables)
7. [Supabase configuration](#supabase-configuration)
8. [AI API configuration](#ai-api-configuration)
9. [Testing](#testing)
10. [Deployment](#deployment)
11. [Security model](#security-model)
12. [Backup and recovery](#backup-and-recovery)
13. [Known limitations and remaining tasks](#known-limitations-and-remaining-tasks)

---

## Implemented features

**Production categories (16):** chemical/process, pharmaceutical/biotech (with GMP deviation fields; the app never claims compliance), food & beverage, automotive, battery/cell, electronics/semiconductor, metal fabrication, plastics/polymer, oil & gas, energy/power, water/wastewater, environmental/waste, biochar/biomass/carbon removal, packaging/assembly, general, and custom. Each category template defines:
- process parameters, failure modes, hazards, quality characteristics and process steps
- default KPIs and 6M fishbone hints
- process questions and **conditional follow-up questions**, each showing why it is asked

Administrators can override any category per organization: steps, failure modes, parameters, problem types, hiding built-in questions, and adding custom questions with their own show-if conditions (Settings → Category templates).

**Guided intake wizard (5 steps, draft saved at every step):**
1. Production context: plant, line, process, product, batch, asset, time, shift, owner, severity, priority
2. Problem definition: is / should-be / actual, onset, location, frequency, scope, impact, recurrence, and measurable KPIs (baseline, target, actual)
3. Process information: flow, SOP, materials, settings, maintenance, training, environment, recent changes, and a parameter table with out-of-spec flags
4. Dynamic follow-ups: a condition engine combining problem type, earlier answers and keyword matching. Answers to questions that become hidden are pruned.
5. Risk & impact assessment

**RCA methods (each usable alone or combined):**

| Method | What's implemented |
|---|---|
| 5 Whys | Multi-branch tree editor with any depth. Evidence and an evidence status per answer (supported / assumption / refuted). Each answer is marked direct, intermediate or systemic. Review flags unsupported links, open branches and stops at a direct cause. React Flow diagram; promote a root cause to the cause register. |
| Ishikawa | 6M by default, with editable categories (3–10, custom allowed). Causes and sub-causes carry evidence, source, verification status, priority (1–5), related causes and owner. Interactive SVG fishbone. Template suggestions are clearly marked as suggestions. |
| FMEA / PFMEA | Editable PFMEA table with 1–10 rating criteria; RPN = S×O×D; revised S/O/D and RPN. High-risk flag uses a configurable RPN threshold plus severity escalation. A separate AIAG-VDA-style Action Priority (H/M/L) lookup is included, with an explanation of why RPN ≠ AP. |
| DMAIC | Phase workspace with required deliverables, completion criteria and a status/progress indicator per phase. Includes SIPOC, a countermeasure evaluation matrix (cost, benefit, risk, feasibility, trial result) and gate approval with sign-off. |
| Pareto | Editor, single-axis share + cumulative chart, and vital-few detection. |
| Fault Tree | AND/OR gates and basic or undeveloped events. Optional probabilities give a top-event estimate, with the independence assumption stated. |
| Process mapping, barrier analysis, change analysis, event & causal-factor chart, Is/Is Not, human factors / systemic causes, lessons learned | Structured worksheets |
| Cause-and-effect matrix | Weighted 0/1/3/9 scoring with ranked inputs |
| Bow-tie | Threats → preventive barriers → top event → mitigative barriers → consequences |
| Trend & correlation | Parameters paired by batch or time. Pearson r, R², p-value, least-squares fit and drift test; correlation ≠ causation is stated. |
| SPC | I-MR chart with Western Electric rules. Control limits are shown separately from specification limits. X̄-R is available in the library. |
| Capability | Cp/Cpk/Pp/Ppk are calculated **only** when there are ≥20 points, valid spec limits and a stable process; normality warnings are shown. |
| Good vs. defective comparison | Welch's t-test for every parameter, with assumptions listed |
| CAPA | See below |

Every tool page explains when the tool is useful, what input it needs, how it works and what it produces. There is also a separate Methods guide. Each investigation's overview **recommends** methods based on problem type, severity, risk, data availability and recurrence.

**Evidence and data:**
- Evidence register: kind, source, collector, date, verified flag and file attachments (Supabase Storage, 25 MB, type allow-list)
- Event timeline
- Measurement import from CSV/XLSX with per-row validation and error report, plus a downloadable template
- Manual measurement entry

**Cause register:** separates symptom, possible cause, contributing factor, root cause and systemic cause. Statuses are Hypothesis → Under Investigation → Supported → Confirmed, or Rejected. Each cause records evidence for and against, linked evidence records, confidence with an explanation, a verification test and its result. Business rules:
- Supported requires evidence.
- Rejected requires contrary evidence.
- Confirmed requires evidence **and** an approver role. The approval is recorded and is cleared again if the cause is downgraded.

**AI assistant** (deterministic rule engine, plus optional Claude via a server-side API key):
- summary; facts vs. assumptions; missing-information list
- targeted follow-up questions; recommended methods
- statistical relationships across all parameters (correlations and group comparisons)
- evidence-dependent hypotheses, each with evidence for and against, confidence with explanation, and a verification test
- suggested tests; actions only for supported or confirmed causes
- a written reasoning trail

LLM output is validated with Zod, cannot express a "confirmed" status, and is filtered so it cannot propose actions for unsupported causes. Missing key, invalid key, rate limits, network errors, refusals and invalid output all fall back to the rule engine with a clear message.

**CAPA:**
- Linked cause and classification (containment / corrective / preventive). Corrective and preventive actions must address a supported or confirmed cause.
- Full record per action: owner, department, priority, due date, cost, resources, verification method, acceptance criteria, actual result, effectiveness review date, evidence.
- Status workflow: Open → Assigned → In Progress → Pending Verification → Effective / Ineffective → Closed.
- Closure needs approver sign-off. An ineffective result needs a reason, then automatically creates a follow-up action and reopens the investigation. Overdue actions need a documented reason before further updates.
- Per-investigation register, plus an org-wide kanban board with "mine" and "overdue" filters.

**Risk & impact:**
- Nine 1–5 risk dimensions, with an escalation banner for safety, environment, quality and regulatory risks (with a disclaimer that the app does not replace emergency procedures).
- Metrics: defect %, FPY, scrap, rework and downtime cost, lost production, OEE (A×P×Q), COPQ and estimated savings. Formulas, units and assumptions are shown. Each metric is calculated **only** when its inputs exist and make sense (contradictions are rejected), and estimates are labelled.

**Dashboard:**
- KPI tiles: total, open, overdue, awaiting evidence, confirmed causes, high-risk failure modes, CAPA completion %, effectiveness %, recurring problems.
- Charts: defect Pareto, downtime trend, opened vs. closed, 6M root-cause distribution, status distribution.
- High-risk FMEA list and overdue CAPA list.
- Filters: category, plant, line, product and date.

**Reports:** a 25-section RCA report covering every item in the specification. Users choose which sections and methods appear. Output as an HTML preview (printable), **PDF** (jsPDF), **Excel** (ExcelJS: report sheet plus data sheets) and **CSV** per table (with formula-injection protection).

**Platform:**
- Supabase Auth: sign-up, login, logout, password reset, email confirmation
- Organization onboarding; multi-org membership with an org switcher
- Six roles; audit trail; DB-level RLS; responsive layout
- Search, filtering, sorting and pagination
- Empty states and validation messages

**Demonstration data:** three industries with no hard-coded conclusion:
- **Biochar throughput below 2,000 kg/week:** weekly mass, moisture, sieve rejects, downtime; recent changes; partial 5 Whys, fishbone, PFMEA, Pareto and DMAIC; causes are still hypotheses; missing evidence (particle-size distribution, feed-rate log, validated moisture method) is flagged by the engine.
- **Automotive OP40 repeated downtime:** Pareto of failure codes, one *supported* cause and one open hypothesis.
- **Chemical assay OOS:** a fully worked case with a confirmed and approved root cause, CAPA (one effective), control plan, Is/Is Not and SPC.
- A closed historical case, and a second organization whose data must never be visible to the first.

---

## Quick start (demo mode)

Requirements: Node.js ≥ 20.

```bash
npm install
npm run dev
# open http://localhost:3000 → pick a demo user (each role is available)
```

If Supabase variables are **not** set, the app runs in **demo mode**:
- It uses a file-backed store (`.data/demo-store.json`, seeded automatically) and a demo user picker instead of real authentication.
- The same service layer, authorization checks and organization scoping run as in production.
- Delete `.data/` to reset the demo data.
- Demo mode is **refused in production** (`NODE_ENV=production`) unless `ALLOW_DEMO_MODE=true` is set, so a misconfigured deployment can never run unauthenticated.

---

## Project structure

```
src/
  app/
    (auth)/            login, signup, forgot/reset password, onboarding (create organization)
    (app)/             authenticated application
      dashboard/       engineering dashboard
      investigations/  list, new (category picker + context), [id]/… (overview, intake wizard,
                       evidence, causes, five-whys, ishikawa, fmea, dmaic, tools/[method],
                       assistant, risk, capa, control-plan, report)
      capa/            org-wide CAPA kanban board
      methods/         RCA methods guide
      settings/        organization, users & roles, plants/lines, category templates, audit trail
    api/               demo auth, evidence file download, report/export (pdf/xlsx/csv)
    auth/callback/     Supabase email-link (PKCE) handler
    actions.ts         server actions (auth → service → revalidate)
  components/          UI kit, charts (Recharts), RCA editors (React Flow / SVG), forms, panels
  lib/
    categories/        16 category templates, shared follow-ups, condition engine, override schema
    calc/              stats (t-test, correlation), SPC & capability, FMEA/AP, Pareto, impact metrics
    rca/               method catalogue, method data schemas & analysis (5 Whys review, FTA, DMAIC…)
    ai/                rule-based engine + Claude integration (server-only)
    services/          business rules & authorization (investigations, records, CAPA, admin, dashboard)
    db/                driver interface, Supabase driver (RLS), demo driver, org-scoping wrapper
    auth/              session resolution, role → permission matrix
    report/            report model + PDF/XLSX/CSV renderers
    seed/              demonstration data (used by demo mode and the Supabase seed script)
  middleware.ts        session refresh and route protection
supabase/
  migrations/          schema, triggers, RLS policies, storage bucket & policies
  tests/               Supabase auth/storage stub for testing migrations on plain PostgreSQL
scripts/               test-db.sh, seed-supabase.ts
tests/                 Vitest unit/service/DB-policy tests
e2e/                   Playwright end-to-end tests
```

## Architecture

- **Next.js 15 (App Router, React 19, TypeScript)**. Server components load data; client components handle editing; all writes go through **server actions** that resolve the session on the server, call the service layer, then revalidate.
- **Service layer** (`src/lib/services`): every business rule and authorization check lives here, independent of the database driver.
- **Data access**: the `Driver` interface has two implementations:
  - Supabase, using the signed-in user's JWT so **RLS applies**
  - demo, file-backed

  Both are wrapped in `scopedDb()`, which forces the active organization on every read and write, so a foreign id behaves as not found.
- **Supabase**: Postgres + Auth + Storage. Migrations contain constraints, triggers (numbering, org consistency, approval guards, operator guard, audit) and RLS.
- **UI**: Tailwind CSS with a small in-house component kit, Recharts, React Flow (5 Whys tree, fault tree), custom SVG fishbone, lucide icons.
- **Validation**: Zod on every input (server side), and Zod schemas for every RCA method's data.
- **AI**: `@anthropic-ai/sdk` on the server only. The prompt contains the investigation record, measurement summaries and the deterministic engine's findings. The response uses JSON-schema structured output and is validated again with Zod.
- **Reports**: one renderer-independent report model feeds HTML, PDF (jsPDF + autotable), XLSX (ExcelJS) and CSV.

## Database schema and migrations

`supabase/migrations/20261014000001_core_schema.sql` and `…02_rls_policies.sql`:

| Table | Purpose |
|---|---|
| `organizations` | tenant; JSON settings (RPN threshold, severity escalation, AP toggle, currency); per-org investigation sequence |
| `profiles` | user profile (auto-created from `auth.users`) |
| `memberships` | user ↔ organization with role (`app_role` enum) |
| `plants`, `production_lines` | reference data |
| `category_templates` | per-org overrides of built-in category templates |
| `investigations` | context, status, severity, priority; JSON for problem, process, answers, KPIs, risk; `RCA-YYYY-NNNN` numbering |
| `timeline_events`, `evidence`, `measurements` | event timeline, evidence register (storage path confined to org folder), numeric data |
| `causes` | cause register with type, status, evidence for/against, confidence, verification, approval |
| `rca_analyses` | per-method JSON (5 Whys, fishbone, DMAIC, Pareto, FTA, worksheets…), unique per investigation+method |
| `fmea_items` | PFMEA rows; `rpn` and `revised_rpn` are generated columns |
| `capa_actions` | action register with lifecycle constraints |
| `control_plan_items` | control plan |
| `approvals` | immutable sign-offs (signed as self) |
| `audit_events` | append-only audit trail written by triggers (actor, action, table, record, changed fields) |

Key database rules:
- A confirmed cause needs `evidence_for` and an `approved_by`.
- A rejected cause needs `evidence_against`.
- An ineffective action needs a reason; an effective or closed action needs an actual result; a closed action needs a closure approver.
- A closed investigation needs `closed_at`.
- Child rows must have the same `org_id` as their parent.
- `org_id` cannot be changed after creation.
- A trigger only lets approver roles confirm causes or approve closure.
- Operators can change only progress fields on actions assigned to them.

Indexes cover org/status/date lookups, RPN ranking, CAPA due dates and assignees, and the audit history.

## Environment variables

See `.env.example`.

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL (leave empty for demo mode) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Supabase anon key (safe in the browser: RLS protects data) |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret** | used **only** by `scripts/seed-supabase.ts`; never by the app |
| `ANTHROPIC_API_KEY` | **secret, server** | enables LLM-assisted analysis; optional |
| `ANTHROPIC_MODEL` | server | optional model override (default `claude-opus-5-5`) |
| `NEXT_PUBLIC_SITE_URL` | public | site URL for auth redirects |
| `DEMO_STORE_PATH` | server | demo-mode store location (default `.data/demo-store.json`) |
| `ALLOW_DEMO_MODE` | server | set `true` to permit demo mode under `NODE_ENV=production` (not recommended) |
| `DEMO_PASSWORD` | seed script | password given to seeded demo users |

Never commit `.env*` files; `.gitignore` excludes them.

## Supabase configuration

1. Create a project at supabase.com (or run locally with the Supabase CLI: `npx supabase init`, keeping the existing `supabase/migrations`, then `npx supabase start`).
2. Apply the migrations:
   - `npx supabase link --project-ref <ref>` then `npx supabase db push`, or
   - paste both migration files, in order, into the SQL editor.

   This creates the tables, RLS policies, triggers, the private `evidence` storage bucket and its storage policies.
3. **Authentication → URL configuration**:
   - Site URL: your app URL
   - Redirect URL: `<site>/auth/callback`
   - Keep email confirmation enabled.
4. Copy the URL and anon key into `.env.local`. Restart `npm run dev`.
5. Optional demo data:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… DEMO_PASSWORD='choose-a-strong-one' npm run seed:supabase
   ```
6. First real use: sign up → create your organization (you become Administrator) → ask colleagues to sign up → add them in **Settings → Users & roles**.

## AI API configuration

1. Create an API key in the Anthropic Console.
2. Set `ANTHROPIC_API_KEY` in the **server** environment (`.env.local` locally; your host's secret store in production). It is read only in `src/lib/ai/llm.ts`, which imports `server-only`, so it can never reach the browser bundle.
3. The default model is `claude-opus-5-5`; override with `ANTHROPIC_MODEL`.
4. Requests:
   - use JSON-schema structured output and `effort: "medium"`
   - opt into server-side refusal fallback (`fallbacks: "default"`)
   - time out after 120 s with one retry.

Without a key, or on any API failure, the deterministic engine is used and the UI says so.

## Testing

| Command | What it covers |
|---|---|
| `npm test` | **65 Vitest tests**: statistics vs. reference values, SPC limits & rules, capability refusal rules, FMEA RPN/AP/escalation, Pareto, impact metrics (missing/invalid/contradictory inputs), conditional question logic & pruning, template override validation, role matrix, org isolation & URL tampering, wizard draft/resume, input validation, cause confirmation rules, CAPA workflow (transitions, ineffective → reopen + new cycle, closure approval, overdue reasons, operator limits), CSV/XLSX import errors, audit logging, AI engine (evidence-dependent hypotheses, never confirmed, missing key, unreachable service), report sections/selection, PDF/XLSX/CSV output |
| `npm run test:db` | **10 database policy tests** on real PostgreSQL: applies the migrations (with a stub of Supabase's `auth`/`storage` schemas) and checks RLS cross-org isolation, anonymous denial, role gates, approval triggers, CAPA constraints, operator guard, generated RPN, audit trail append-only and visibility, org_id immutability, storage folder isolation. Needs `TEST_DATABASE_ADMIN_URL` (default `postgres://postgres:postgres@localhost:5432/postgres`). |
| `npm run test:e2e` | **2 Playwright tests** in demo mode: full engineer workflow (category → wizard → conditional questions → evidence → 5 Whys → cause → assistant → report/PDF); viewer read-only and cross-org invisibility. Uses the Playwright-managed Chromium; set `PW_CHROMIUM_PATH` to use a different Chromium binary. |
| `npm run typecheck`, `npm run lint`, `npm run build` | strict TypeScript, ESLint (next/core-web-vitals), production build |

**Results at the time of writing:**
- Vitest: 65/65 passed
- DB policies: 10/10 passed (PostgreSQL 16)
- Playwright: 2/2 passed
- `tsc`, ESLint and `next build`: clean

## Deployment

**Vercel** (recommended):
1. Import the repository.
2. Set the environment variables: Supabase URL and anon key, optionally `ANTHROPIC_API_KEY`, and `NEXT_PUBLIC_SITE_URL`.
3. Deploy, then add `<domain>/auth/callback` to Supabase redirect URLs.

**Any Node host**:
```bash
npm ci && npm run build && npm start   # port 3000
```

Before going live:
- Apply the migrations to production.
- Enable PITR/backups.
- Use a strong auth password policy and email confirmation.
- Never deploy without Supabase variables (demo mode is refused in production).

Security headers (`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`) are set in `next.config.ts`.

## Security model

- **Authentication:** Supabase Auth with cookie sessions (`@supabase/ssr`); middleware refreshes sessions and protects routes.
- **Authorization:** three layers of defence:
  1. the role → permission matrix in the service layer, checked in every mutation
  2. the org-scoping wrapper
  3. Postgres RLS policies, plus security-definer triggers for approval and operator rules
- **Isolation:** a user cannot read or modify another organization's data by changing a URL or request parameter. Covered by service tests, DB tests and e2e tests.
- **Secrets:** the AI key and service-role key are server-only and never imported by browser code.
- **Files:**
  - uploads are checked against an allow-list and a size limit, and the file name is sanitised
  - storage paths are confined to `org_id/investigation_id/` by both a DB constraint and storage policies
  - downloads re-check org ownership.
- **Exports:** CSV cells are protected against spreadsheet formula injection.
- **Audit:** an append-only trail of every create, update and delete, with changed fields and actor.

## Backup and recovery

- Enable Supabase **Point-in-Time Recovery** (Pro plan) or schedule `pg_dump` of the `public` schema plus `auth.users`. Keep at least 30 days of backups, stored outside the project.
- Back up the `evidence` storage bucket separately (e.g. scheduled sync with the Storage API or S3-compatible tooling).
- Recovery drill:
  1. restore into a staging project
  2. apply any newer migrations
  3. verify RLS with `npm run test:db` against a copy
  4. switch DNS / environment variables.
- Migrations are forward-only and idempotent where possible; keep them in version control as the single source of schema truth.

## Known limitations and remaining tasks

- **LLM path not exercised against the live API in this build environment** (no key was available). The no-key, invalid-key and unreachable-service paths are tested. Validate with a real key before relying on it.
- The Supabase driver and auth flows are covered by type-checking and by DB-level RLS tests on PostgreSQL, but end-to-end tests run in demo mode. Add a CI job that runs `supabase start` and the Playwright suite against it.
- The dashboard aggregates in application memory. That is fine for thousands of investigations; for larger volumes move the aggregates to SQL views or RPCs.
- The AIAG-VDA Action Priority table reproduces the published structure. Verify it against your licensed handbook. The 1–10 rating criteria are generic and should be adapted to your organization.
- Statistical tools cover common cases (Welch t-test, Pearson correlation, I-MR / X̄-R, normal-theory capability). There is no DOE analysis, ANOVA, attribute control charts (p/np/c/u) or non-normal capability yet.
- Editing is not real-time collaborative: simultaneous edits to the same analysis follow last-write-wins.
- There is no e-mail notification for overdue actions or assignments yet; overdue status is shown in the UI and on the dashboard.
- Electronic signatures are recorded approvals. They are **not** 21 CFR Part 11-validated e-signatures; regulated users must validate the system themselves.
- Possible next steps: full i18n, an attachment preview viewer, a comment/discussion thread per cause, and APIs for MES/SCADA/LIMS imports.
