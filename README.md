# Optima — School Decision Support System

> **Optima** helps Singapore families choose the right secondary school. Enter your home address, define what matters most to you, and get a ranked, explainable shortlist driven by real MOE data, live public-transport commute times, and transparent ROC-weighted scoring.

For a beginner-friendly map of every folder and file, see **[docs/CODEBASE_GUIDE.md](docs/CODEBASE_GUIDE.md)**.

---

## Features

- **Personalised recommendations** — set must-have constraints and rank good-to-haves; get up to 5 schools scored specifically for your priorities
- **ROC-weighted ranking** — a principled weighting method that respects your stated preference order rather than treating all criteria equally
- **Live commute calculation** — door-to-door public transport times via the OneMap routing API, with transfer penalties and 30-day DB caching
- **Must-have hard filters** — commute cap, required CCAs, required programmes, required subjects/languages; schools failing any constraint are excluded before scoring
- **Constraint relaxation** — when no schools match all must-haves, the engine detects the bottleneck constraint and proposes specific, quantified relaxations ("remove Swimming from required CCAs → unlocks 47 schools")
- **Browse & search** — paginated directory of all 133 Singapore secondary schools with name search
- **Persistent search state** — active filters (keyword, quick filter, nearby, or full preferences) are encoded in the URL; navigating to a school profile and clicking "Back to search" returns to the exact filtered view at the same scroll position. Clicking "Clear search" is the only action that resets to the full unfiltered list.
- **Map view** — Leaflet map pinning results or browse schools with popups
- **School profiles** — tabs for Overview, CCAs, Programmes, Subjects, Distinctive Programmes, Commute, and Reviews
- **Community reviews** — authenticated users can leave one review per school (rating + comment)
- **Review moderation** — users can report reviews; admins can approve, reject, delete reviews and ban users
- **Admin panel** — reported reviews queue, all-reviews view, full user list with ban controls
- **Saved preferences** — preferences are persisted to localStorage and reloaded on next visit
- **"Nearby" shortcut** — one-click search for schools within 30 minutes of your home postal code; uses the `GET /schools/nearby` backend endpoint with a Haversine distance fallback when OneMap is unavailable
- **Saved schools** — authenticated users can bookmark schools; bookmarks persist server-side and are accessible from the profile page

---

## Search Behavior

All active search state on `/app/search` is stored in the URL as query parameters:

| State | URL param | Example |
|---|---|---|
| Keyword browse | `q`, `page` | `?q=ang+mo+kio&page=2` |
| Nearby mode | `mode=nearby`, `prefs` | `?mode=nearby&prefs=<b64>` |
| Preferences / quick-filter | `mode=recs`, `prefs` | `?mode=recs&prefs=<b64>` |

`prefs` is a base64-encoded JSON blob containing the full `{ home, mustHaves, goodToHaves }` object. Because the state lives in the URL:

- **Refreshing** the page replays the same recommendation automatically.
- **Clicking a school card** passes the current URL as `location.state.from`; the school profile's "Back to search" link returns to that exact URL, restoring the list and scroll position (scroll is saved to `sessionStorage` before navigation).
- **Browser back / forward** works natively — the URL in history is always the filtered view.
- **"Clear search"** is the only action that removes the `mode` param and resets to the browse default.

---

## How the Recommendation System Works

### User inputs

The user provides two categories of input through a three-step preference wizard:

1. **Home postal code** — used to geocode their address and compute public-transport travel time to each school
2. **Must-haves** — non-negotiable requirements; any school that fails a must-have is excluded entirely before scoring begins
3. **Good-to-haves** — a ranked list of criteria the user cares about, used to score the schools that passed the must-have filter

### Must-haves (hard constraints)

Must-haves use **AND logic**: a school must satisfy *every* must-have to appear in results.

| Must-have | How it is enforced |
|---|---|
| Max commute time | School's computed PT duration must be ≤ limit. Schools with no GPS data are excluded when a commute limit is set. |
| Required CCAs | School must offer *all* listed CCAs |
| Required Programmes | School must offer *all* listed programmes |
| Required Subjects/Languages | School must offer *all* listed subjects |
| Required Distinctive Programmes | School must have *all* listed distinctive programmes |

### Good-to-haves (ranked scoring)

After filtering, remaining schools are scored on the good-to-haves. The user **ranks** which criteria matter most — for example: commute first, then CCAs, then programmes. The ranking order is converted into **ROC weights** so the most important criterion has the highest influence on the final score.

Each criterion receives a score between 0 and 1:

| Criterion | How it is scored |
|---|---|
| Commute | Linear decay from 1.0 (10 min) to 0.0 (at max commute limit), minus 0.05 per transfer, clamped to [0, 1] |
| CCAs | Fraction of desired CCAs found at the school (`\|desired ∩ school\| / \|desired\|`). If no desired CCAs are specified, uses the school's CCA count relative to the most CCA-rich school in the feasible set (richness fallback). |
| Programmes | Same overlap logic as CCAs |
| Subjects/Languages | Same overlap logic |
| Distinctive Programmes | Same overlap logic |

### Final score

```
Final Score = Σ (ROC_weight_i × score_i)
```

Schools are sorted descending by final score. The top 5 are returned with a full per-criterion breakdown and an explanation listing which desired items were matched.

### Worked example

**User preferences:**
- Home postal: 520123 (Bishan area)
- Must-haves: max commute 45 min, requires CCA "Robotics"
- Good-to-haves ranked: 1. Commute  2. CCAs  3. Programmes
- Desired CCAs: Robotics, Badminton
- Desired Programmes: Integrated Programme

**ROC weights for k = 3:** w₁ = 0.611, w₂ = 0.278, w₃ = 0.111

**School A** — 18 min, 0 transfers, offers Robotics + Badminton + IP
- Commute score: `1 − (18−10)/(45−10) − 0 = 0.771`
- CCA score: `2/2 = 1.0`
- Programme score: `1/1 = 1.0`
- **Final: `0.611 × 0.771 + 0.278 × 1.0 + 0.111 × 1.0 = 0.860`**

**School B** — 35 min, 2 transfers, offers Robotics only, no IP
- Commute score: `1 − (35−10)/(45−10) − 0.10 = 0.614`
- CCA score: `1/2 = 0.5`
- Programme score: `0/1 = 0.0`
- **Final: `0.611 × 0.614 + 0.278 × 0.5 + 0.111 × 0.0 = 0.514`**

**Result:** School A (0.86) ranks above School B (0.51) — it is closer, offers both desired CCAs, and has the desired programme.

### When no schools match all must-haves

If the must-have filter produces zero results, the engine enters bottleneck detection:

1. Each constraint is tested **in isolation** to count how many schools it individually passes
2. The most restrictive constraint is identified
3. Up to 3 concrete relaxation suggestions are generated, each with the number of schools it would unlock:
   - Increase max commute by 15 minutes (capped at 120 min)
   - Remove the least-frequent item from the most restrictive set constraint
   - Drop the second most restrictive constraint entirely

The user can apply a suggestion with one click, which immediately re-runs the recommendation.

---

## Recommendation Algorithm Details

### Ranking pipeline

```
Input: user postal code + mustHaves + goodToHaves
  │
  ├─ 1. GEOCODING
  │     Postal code → (lat, lng) via OneMap Search API
  │
  ├─ 2. COMMUTE COMPUTATION (per school)
  │     Check DB cache (7-day TTL)
  │     On miss: call OneMap PT routing API
  │     Result: durationMins, transfers, route legs
  │
  ├─ 3. MUST-HAVE FILTER  [AND logic — fail any → excluded]
  │     • commute computed AND durationMins > maxCommuteMins → exclude
  │     • any required CCA not in school.ccas             → exclude
  │     • any required programme not in school.programmes → exclude
  │     • any required subject not in school.subjects     → exclude
  │     • any required distinctive not in school.distinct → exclude
  │
  ├─ 4. FEASIBILITY CHECK
  │     0 schools remain → detectBottleneck() → NoResultsPayload
  │
  ├─ 5. ROC WEIGHT COMPUTATION
  │     k = number of ranked criteria
  │     w_r = (1/k) × Σ_{j=r}^{k} (1/j),   r = 1..k
  │     Weights always sum to 1.
  │
  ├─ 6. SCORING (per school, per criterion)
  │     commute:    clamp(1 − (t − 10) / (tMax − 10) − 0.05 × transfers, 0, 1)
  │     set-based:  |desired ∩ school| / |desired|
  │                 richness fallback if desired is empty:
  │                 school_count / max_count_in_feasible_set
  │
  ├─ 7. WEIGHTED SUM
  │     totalScore = Σ (weight_i × score_i)
  │
  └─ 8. SORT + RETURN TOP 5
        sorted descending by totalScore
        each result includes: breakdown[], explanation { topCriteria, matched }
```

### ROC weights formula

ROC (Rank Order Centroid) weights convert an ordinal preference ranking into cardinal weights:

```
w_r = (1/k) × Σ_{j=r}^{k} (1/j)
```

For **k = 3**:
| Rank | Formula | Value |
|---|---|---|
| 1 (most important) | (1/3) × (1 + 1/2 + 1/3) | **0.611** |
| 2 | (1/3) × (1/2 + 1/3) | **0.278** |
| 3 | (1/3) × (1/3) | **0.111** |

The weights always sum to exactly 1.

### Commute score formula

```
t_min    = 10 min   (baseline — a 10-min commute scores 1.0)
t_max    = user's maxCommuteMins (default: 60)

base     = 1 − (durationMins − t_min) / (t_max − t_min)
score    = clamp(base − 0.05 × transfers,  0,  1)
```

Each transfer subtracts 0.05. A 10-minute direct commute → 1.0. A commute at or above `t_max` → 0.0.

### Set overlap score formula

```
score = |desired_items ∩ school_items| / |desired_items|
```

When the user selected a criterion (e.g. "CCAs matter") but did not pick specific items, the **richness fallback** applies:

```
score = school_item_count / max_item_count_across_feasible_set
```

This rewards schools with more offerings relative to the other candidates.

### Commute caching

Results are stored in `CommuteCache` keyed by `(originKey, schoolId, mode)` with a **30-day TTL**. This avoids redundant API calls for repeated queries from the same neighbourhood. Singapore transit routes are stable over weeks, so a 30-day window is appropriate. Batch commute lookups (used by `/recommendations` and `/schools/nearby`) use a single `findMany` cache query and cap concurrent OneMap calls at 10 to avoid rate-limiting.

---

## Tech Stack

### Frontend
- [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vitejs.dev/) — build tool and dev server
- [TailwindCSS](https://tailwindcss.com/) — utility-first styling
- [React Router v6](https://reactrouter.com/) — client-side routing
- [TanStack Query v5](https://tanstack.com/query) — server state, caching, and mutation handling
- [React-Leaflet](https://react-leaflet.js.org/) — interactive map view
- [Zod](https://zod.dev/) — form validation (shared with backend)
- [Lucide React](https://lucide.dev/) — icons

### Backend
- [Node.js 20](https://nodejs.org/) + [Express](https://expressjs.com/) + TypeScript
- [Prisma ORM](https://www.prisma.io/) — type-safe DB access and schema management
- [Zod](https://zod.dev/) — request body validation
- [jose](https://github.com/panva/jose) — Supabase JWT verification via the project's remote JWKS endpoint (`SUPABASE_URL/auth/v1/.well-known/jwks.json`)

### Database
- [PostgreSQL 16](https://www.postgresql.org/) (Docker container, port 5433)
- Tables: `UserProfile`, `School`, `SchoolCCA`, `SchoolProgramme`, `SchoolSubject`, `SchoolDistinctiveProgramme`, `CommuteCache`, `Review`, `ReviewReport`, `SavedSchool`

### Authentication
- [Supabase Auth](https://supabase.com/docs/guides/auth) — email/password signup and login
- The API verifies Supabase JWTs using `jose` against the remote JWKS endpoint at `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` — **no static JWT secret is required**
- First admin is claimed via the `/setup` page (self-service, locks after first use); subsequent admins are promoted via the Admin UI or the `POST /admin/users/:id/promote` endpoint

### APIs / External services
- **[OneMap](https://www.onemap.gov.sg/apidocs/)** — Singapore government mapping platform
  - Search API: geocoding postal codes → (lat, lng)
  - PT routing API: door-to-door public transport commute times
- **[data.gov.sg collection 457](https://data.gov.sg/)** — source of all school data (CCAs, programmes, subjects, distinctive programmes, school directory)

### Dev tooling / Infrastructure
- [pnpm workspaces](https://pnpm.io/workspaces) — monorepo package management
- [Docker Compose](https://docs.docker.com/compose/) — orchestrates PostgreSQL, API, and frontend
- [Vitest](https://vitest.dev/) + [Supertest](https://github.com/ladjs/supertest) — 146 tests (94 engine unit tests + 52 HTTP integration tests)
- [tsup](https://tsup.egoist.dev/) — builds the shared package

---

## Monorepo Structure

```
Optima/
├── apps/
│   ├── api/                        # Express backend
│   │   ├── prisma/
│   │   │   └── schema.prisma       # All database models
│   │   ├── scripts/
│   │   │   ├── import-data.ts      # MOE school data importer (data.gov.sg → DB)
│   │   │   └── patch-missing-schools.ts  # Back-fills GPS coordinates for schools missed by the importer
│   │   ├── src/
│   │   │   ├── engine/
│   │   │   │   ├── ranking.ts      # Recommendation algorithm (pure module)
│   │   │   │   └── __tests__/
│   │   │   │       └── ranking.test.ts   # 68 unit tests
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts         # Supabase JWT verification
│   │   │   │   └── requireRole.ts  # Admin-only guard
│   │   │   ├── routes/
│   │   │   │   ├── schools.ts      # GET /schools, /schools/nearby, /schools/:id, reviews
│   │   │   │   ├── recommendations.ts  # POST /recommendations
│   │   │   │   ├── admin.ts        # Admin moderation endpoints
│   │   │   │   ├── reviews.ts      # POST /reviews/:id/report
│   │   │   │   └── __tests__/
│   │   │   │       └── http.test.ts  # 13 HTTP integration tests (supertest)
│   │   │   └── services/
│   │   │       └── commute.ts      # OneMap routing + DB caching
│   │   ├── Dockerfile
│   │   └── .env.example
│   │
│   └── web/                        # React frontend
│       ├── src/
│       │   ├── pages/
│       │   │   ├── Landing.tsx     # Public landing page
│       │   │   ├── Login.tsx       # Email/password sign-in
│       │   │   ├── Register.tsx    # Account creation
│       │   │   ├── Search.tsx      # Search, preferences, results, map
│       │   │   ├── SchoolProfile.tsx  # Per-school detail with tabs
│       │   │   └── Admin.tsx       # Admin moderation panel
│       │   ├── components/         # Reusable UI components
│       │   ├── contexts/
│       │   │   └── AuthContext.tsx # Supabase session provider
│       │   ├── routes/
│       │   │   ├── ProtectedRoute.tsx  # Redirect unauthenticated users
│       │   │   └── AdminRoute.tsx      # Block non-admins, show access-denied page
│       │   ├── hooks/
│       │   │   └── useForm.ts      # Zod-backed form state hook
│       │   └── lib/
│       │       ├── api.ts          # Typed API call functions
│       │       └── supabase.ts     # Supabase client
│       ├── Dockerfile
│       └── .env.example
│
├── packages/
│   └── shared/                     # Shared TypeScript types + Zod schemas
│       └── src/
│           ├── types.ts            # ApiResponse, UserProfile, School*, Review*, etc.
│           └── schemas.ts          # Zod schemas for request validation
│
├── docker-compose.yml              # Postgres + API + web
├── .env.example                    # Root env (VITE_ vars for Docker Compose)
└── pnpm-workspace.yaml
```

---

## Local Setup Instructions

### Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 20+ | [nodejs.org](https://nodejs.org/) |
| pnpm | latest | `npm install -g pnpm` |
| Docker Desktop | latest | [docker.com](https://www.docker.com/products/docker-desktop/) |
| Supabase account | free | [supabase.com](https://supabase.com) |

---

### Step 1 — Clone the repository

```bash
git clone <repo-url>
cd Optima
```

---

### Step 2 — Create a Supabase project

1. Go to [app.supabase.com](https://app.supabase.com) → **New project**
2. Go to **Settings → API**
3. Copy:
   - **Project URL** (e.g. `https://abcdefgh.supabase.co`)
   - **Anon/public key** (starts with `eyJ...`)
   - **JWT Secret** (under "JWT Settings")

---

### Step 3 — Create environment files

**Root `.env`** — read by Docker Compose to pass build-time variables into the frontend:

```bash
cp .env.example .env
```

Fill in:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=http://localhost:4000
```

**API `.env`** — read by the Express backend:

```bash
cp apps/api/.env.example apps/api/.env
```

Fill in:
```env
DATABASE_URL=postgresql://optima:optima@localhost:5433/optima
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_JWT_SECRET=your-jwt-secret
ONEMAP_TOKEN=your-onemap-token
PORT=4000
NODE_ENV=development
```

> **OneMap token:** Register at [onemap.gov.sg/apidocs](https://www.onemap.gov.sg/apidocs/). Without it, commute scores will not be computed, but the app will still work.

---

### Step 4 — Start with Docker Compose

```bash
docker compose up --build
```

This starts three services:

| Service | Port | Description |
|---|---|---|
| `postgres` | 5433 | PostgreSQL 16 database |
| `api` | 4000 | Express backend (auto-runs `prisma db push` on startup) |
| `web` | 3000 | React frontend (served by Nginx) |

**Access the app at http://localhost:3000**

Wait for the log `Server running on port 4000` before testing. To stop:

```bash
docker compose down          # stop containers, keep data
docker compose down -v       # stop containers and delete the database volume
```

---

### Step 5 — Import school data

Run the importer **from the monorepo root on your host machine** (not inside the Docker container):

```bash
# Docker must be running (Step 4) so the database is available on port 5433
pnpm import:data
```

This fetches 5 CSV datasets from data.gov.sg collection 457, merges them by school name, geocodes each school via OneMap, and upserts 133 secondary schools into the database. Takes ~2–3 minutes.

> **Why not `docker compose exec api pnpm import:data`?**
> The API container is a production image — it does not contain the TypeScript source scripts. Run the importer from your host machine where Node.js and pnpm are installed, and the database is reachable at `localhost:5433`.

---

### Step 6 — Create the first admin account (optional)

**Option A — Self-service bootstrap (preferred)**

1. Register an account at http://localhost:3000/register and sign in.
2. Navigate to http://localhost:3000/setup.
3. Click **Claim admin** — this calls `POST /bootstrap-admin`, which promotes your account to `ADMIN` and then permanently disables itself so no one else can claim admin this way.
4. Sign out and sign back in; the Admin link appears in the navbar.

**Option B — Manual SQL promotion** (for adding further admins after the first one exists, or as a fallback)

```bash
docker compose exec postgres psql -U optima -d optima
```

```sql
UPDATE "UserProfile"
SET role = 'ADMIN'
WHERE "supabaseUserId" = 'paste-your-supabase-user-id-here';
\q
```

Alternatively, an existing admin can promote other users directly from the Admin panel → Users tab.

---

### Running in development mode (hot-reload)

```bash
# Terminal 1 — database only
docker compose up postgres

# Terminal 2 — API with watch mode
cd apps/api && pnpm dev

# Terminal 3 — frontend with Vite HMR
cd apps/web && pnpm dev
```

The frontend will be at **http://localhost:5173** (Vite default; Vite will try 5174 if 5173 is already in use — check the terminal output). Make sure `DATABASE_URL` in `apps/api/.env` uses port **5433** (the host-side port that Docker maps to Postgres).

---

### Running tests

```bash
cd apps/api
pnpm test          # run once
pnpm test:watch    # watch mode
```

**146 tests across 2 files:**

| File | Tests | Covers |
|---|---|---|
| `src/engine/__tests__/ranking.test.ts` | 94 | ROC weights, commute scoring, set overlap, richness fallback, must-have filtering (AND logic), full ranking pipeline, bottleneck detection, relaxation suggestion correctness, schema validation |
| `src/routes/__tests__/http.test.ts` | 52 | HTTP integration: `/health`, `/schools`, `/schools/meta`, `/schools/nearby`, `POST /recommendations` (Prisma + OneMap mocked) |

---

## Environment Variables

### Root `.env`

| Variable | Purpose | Required |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL — baked into the frontend build | ✅ |
| `VITE_SUPABASE_ANON_KEY` | Supabase public key — baked into the frontend build | ✅ |
| `VITE_API_URL` | Backend URL as seen by the user's browser | ✅ |

### `apps/api/.env`

| Variable | Purpose | Where to get it | Required |
|---|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | Docker Compose default: `postgresql://optima:optima@localhost:5433/optima` | ✅ |
| `SUPABASE_URL` | Supabase project URL — used to fetch the JWKS public-key endpoint for JWT verification | Supabase → Settings → API → Project URL | ✅ |
| `ONEMAP_TOKEN` | Bearer token for OneMap routing API | [onemap.gov.sg/apidocs](https://www.onemap.gov.sg/apidocs/) | ⚠️ Optional |
| `PORT` | Port the API listens on | — | default `4000` |
| `NODE_ENV` | `development` or `production` | — | Optional |

> **Note — `SUPABASE_JWT_SECRET`:** This variable appears in `apps/api/.env.example` for reference but is **not read by the API at runtime**. The backend verifies JWTs using Supabase's remote JWKS endpoint (derived from `SUPABASE_URL`), not a local secret. You do not need to set `SUPABASE_JWT_SECRET` for the app to work.

---

## Troubleshooting

### Port 5433 already in use

The Compose file maps PostgreSQL to **5433** to avoid conflicting with a local Postgres on the default 5432. To use a different port:

```yaml
# docker-compose.yml
postgres:
  ports:
    - '5434:5432'   # change left side to any free port
```

Then update `DATABASE_URL` in `apps/api/.env` to match.

---

### Prisma OpenSSL / Alpine warning on API startup

You may see: `Prisma failed to detect the libssl/openssl version`. This is a **warning only** — the correct binary is still used and the API will start normally. The Dockerfile installs OpenSSL via `apk add --no-cache openssl` and `schema.prisma` declares `binaryTargets` covering both Alpine x64 and ARM64.

---

### Apple Silicon (M1/M2/M3) — Prisma binary not found

If you see `Error: Query engine binary not found`, force a Prisma generate inside the running container:

```bash
docker compose exec api npx prisma generate
docker compose restart api
```

The `linux-musl-arm64-openssl-3.0.x` binary target in `schema.prisma` covers this case.

---

### "Cannot find module '@optima/shared'" in local dev

The shared package must be compiled before it can be imported. Run:

```bash
pnpm --filter @optima/shared build
```

---

### API returns old validation errors after a schema change

The API imports `@optima/shared` from the compiled `dist/` directory. If you edit `packages/shared/src/schemas.ts` or `types.ts`, you **must rebuild** before the API picks up the change:

```bash
pnpm --filter @optima/shared build
# The tsx watcher (pnpm dev) will automatically reload the API after the build completes.
```

---

### Frontend loads as blank page

`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are baked in at **build time**. After changing them in `.env`, you must rebuild:

```bash
docker compose up --build web
```

---

### Schools not showing after import

1. Verify the import completed: `pnpm import:data` (run from monorepo root, with Docker running)
2. Check the count: connect to Postgres → `SELECT COUNT(*) FROM "School";` — should be ~133
3. If 0, the data.gov.sg API may be temporarily unavailable. Re-run the importer after a few minutes.

---

### API not starting — `prisma db push` fails

The API entrypoint runs `prisma db push` before starting. If it fails:

- The `depends_on.condition: service_healthy` check in `docker-compose.yml` ensures Postgres is ready first
- If the API still fails, wait 10 seconds and run `docker compose restart api`

---

## Future Improvements

- **Commute route breakdown on school profile** — legs (bus numbers, MRT lines, walking) are stored in `CommuteCache.rawJson` and returned by `POST /schools/:id/commute`, but not yet rendered in the school profile UI
- **Improved map UX** — marker clustering for dense results, auto-fit bounds, filter by score tier
- **User profile page** — edit display name and home address, view own review history
- **DSA talent area support** — structured input for Direct School Admission criteria
- **Review pagination** — school profiles currently load all reviews in one request
- **Historical data tracking** — diff school data across imports to surface changes
- **Natural language explanation** — generate a plain-English summary of why a school ranked where it did

---

## Contributors

| Name | Role |
|---|---|
| *(add name)* | *(role)* |
| *(add name)* | *(role)* |
| *(add name)* | *(role)* |

*SC2006 Software Engineering — TCE2 Group 26*

---

## Licence

This project is for academic and educational purposes. School data is sourced from [data.gov.sg](https://data.gov.sg) under the Singapore Open Data Licence. Commute data is sourced from [OneMap](https://www.onemap.gov.sg), provided by the Singapore Land Authority.
