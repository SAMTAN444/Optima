# Optima — Secondary School Decision Support System

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)

> **Optima** helps Singapore families choose the right secondary school. Enter your home address, define what matters most to you, and get a ranked, explainable shortlist driven by real MOE data, live public-transport commute times, and transparent ROC-weighted scoring.

*SC2006 Software Engineering — NTU TCE2 Group 26*

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Quick Start (Docker)](#quick-start-docker)
- [Full Setup Guide](#full-setup-guide)
- [Development Mode](#development-mode)
- [Running Tests](#running-tests)
- [Project Structure](#project-structure)
- [How the Recommendation Engine Works](#how-the-recommendation-engine-works)
- [Environment Variables](#environment-variables)
- [Troubleshooting](#troubleshooting)
- [Contributors](#contributors)

---

## Features

| Feature | Description |
|---|---|
| **Personalised recommendations** | Set must-have constraints and rank good-to-haves; get up to 5 schools scored for your priorities |
| **ROC-weighted ranking** | Principled weighting respects your preference order rather than treating all criteria equally |
| **Live commute calculation** | Door-to-door public transport times via OneMap, with transfer penalties and 30-day DB caching |
| **Hard filters** | Commute cap, required CCAs, programmes, subjects/languages; schools failing any constraint are excluded before scoring |
| **Constraint relaxation** | When no schools match, the engine detects the bottleneck and proposes specific, quantified relaxations |
| **Browse & search** | Paginated directory of all 133 Singapore secondary schools with name search and quick filters |
| **Map view** | Leaflet map pinning results or browse schools with popups |
| **School profiles** | Tabs for Overview, CCAs, Programmes, Subjects, Distinctive Programmes, Commute, and Reviews |
| **Community reviews** | Authenticated users can leave reviews (rating + comment); admins can moderate |
| **Saved schools** | Authenticated users can bookmark schools; accessible from the profile page |
| **Persistent search state** | Active filters are encoded in the URL — refresh, back/forward, and "share link" all work natively |

---

## Tech Stack

### Frontend
- **React 18** + **TypeScript** — component-based UI
- **Vite** — build tool and dev server with HMR
- **TailwindCSS** — utility-first styling
- **React Router v6** — client-side routing
- **TanStack Query v5** — server state, caching, and mutation handling
- **React-Leaflet** — interactive map view
- **Zod** — form validation (shared with backend)

### Backend
- **Node.js 20** + **Express** + **TypeScript**
- **Prisma ORM** — type-safe database access and schema management
- **Zod** — request body validation
- **jose** — Supabase JWT verification via JWKS endpoint

### Database & Auth
- **PostgreSQL 16** — runs in Docker (port 5433)
- **Supabase Auth** — email/password signup and login

### External APIs
- **[OneMap](https://www.onemap.gov.sg/apidocs/)** — geocoding and door-to-door public transport routing
- **[data.gov.sg collection 457](https://data.gov.sg/)** — MOE school data (CCAs, programmes, subjects, distinctive programmes)

### Dev Tooling
- **pnpm workspaces** — monorepo package management
- **Docker Compose** — orchestrates PostgreSQL, API, and frontend
- **Vitest** + **Supertest** — 146 tests (94 engine unit + 52 HTTP integration)

---

## Quick Start (Docker)

The fastest way to run Optima locally — everything runs in containers.

**Prerequisites:** [Node.js 20+](https://nodejs.org/), [pnpm](https://pnpm.io/), [Docker Desktop](https://www.docker.com/products/docker-desktop/), a free [Supabase](https://supabase.com) project.

### 1. Clone and install

```bash
git clone <repo-url>
cd Optima
pnpm install
```

### 2. Set up Supabase

1. Create a project at [app.supabase.com](https://app.supabase.com) → **New project**
2. Go to **Settings → API** and copy:
   - **Project URL** (e.g. `https://abcdefgh.supabase.co`)
   - **Anon/public key** (starts with `eyJ...`)

### 3. Create environment files

```bash
# Root env (bakes Supabase vars into the frontend build)
cp .env.example .env

# API env
cp apps/api/.env.example apps/api/.env
```

Fill in `.env`:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=http://localhost:4000
```

Fill in `apps/api/.env`:
```env
DATABASE_URL=postgresql://optima:optima@localhost:5433/optima
SUPABASE_URL=https://your-project.supabase.co
ONEMAP_TOKEN=your-onemap-token   # Optional — get free at onemap.gov.sg/apidocs
PORT=4000
NODE_ENV=development
```

### 4. Start containers

```bash
docker compose up --build
```

| Service | Port | Description |
|---|---|---|
| `postgres` | 5433 | PostgreSQL 16 |
| `api` | 4000 | Express backend |
| `web` | 3000 | React frontend |

Wait for `Server running on port 4000`, then open **http://localhost:3000**.

### 5. Import school data

```bash
# Run from the monorepo root (Docker must be up)
pnpm import:data
```

This fetches 5 CSV datasets from data.gov.sg, merges them, geocodes each school via OneMap, and upserts 133 secondary schools into the database. Takes ~2–3 minutes.

**That's it — the app is ready.**

---

## Full Setup Guide

### Creating the first admin account

**Option A — Self-service (recommended)**

1. Register an account at `/register` and sign in.
2. Navigate to `/setup`.
3. Click **Claim admin** — this promotes your account to `ADMIN` and permanently disables the endpoint.

**Option B — Manual SQL**

```bash
docker compose exec postgres psql -U optima -d optima
```

```sql
UPDATE "UserProfile"
SET role = 'ADMIN'
WHERE "supabaseUserId" = 'paste-your-supabase-user-id-here';
\q
```

### Stopping and resetting

```bash
docker compose down          # stop containers, keep data
docker compose down -v       # stop containers and delete the database volume
```

---

## Development Mode

For hot-reload during development:

```bash
# Terminal 1 — database only
docker compose up postgres

# Terminal 2 — API with watch mode
cd apps/api && pnpm dev

# Terminal 3 — frontend with Vite HMR
cd apps/web && pnpm dev
```

Frontend runs at **http://localhost:5173** (Vite default). The API at **http://localhost:4000**.

> Make sure `DATABASE_URL` in `apps/api/.env` uses port **5433** (the Docker host port).

**Rebuilding the shared package** after edits to `packages/shared/src/`:

```bash
pnpm --filter @optima/shared build
```

---

## Running Tests

```bash
cd apps/api
pnpm test          # run once
pnpm test:watch    # watch mode
```

**146 tests across 2 files:**

| File | Tests | Covers |
|---|---|---|
| `src/engine/__tests__/ranking.test.ts` | 94 | ROC weights, commute scoring, set overlap, richness fallback, must-have filtering, full ranking pipeline, bottleneck detection, relaxation suggestions |
| `src/routes/__tests__/http.test.ts` | 52 | HTTP integration: `/health`, `/schools`, `/schools/meta`, `/schools/nearby`, `POST /recommendations` |

---

## Project Structure

```
Optima/
├── apps/
│   ├── api/                        # Express backend
│   │   ├── prisma/
│   │   │   └── schema.prisma       # All database models
│   │   ├── scripts/
│   │   │   ├── import-data.ts      # MOE school data importer
│   │   │   └── patch-missing-schools.ts
│   │   └── src/
│   │       ├── engine/
│   │       │   └── ranking.ts      # Recommendation algorithm (pure module)
│   │       ├── middleware/
│   │       │   ├── auth.ts         # Supabase JWT verification
│   │       │   └── requireRole.ts  # Admin-only guard
│   │       ├── routes/             # Express route handlers
│   │       └── services/
│   │           └── commute.ts      # OneMap routing + DB caching
│   │
│   └── web/                        # React frontend
│       └── src/
│           ├── pages/              # Route-level page components
│           ├── components/         # Reusable UI components
│           ├── contexts/
│           │   └── AuthContext.tsx # Supabase session provider
│           ├── hooks/
│           └── lib/
│               ├── api.ts          # Typed API call functions
│               └── supabase.ts     # Supabase client
│
├── packages/
│   └── shared/                     # Shared TypeScript types + Zod schemas
│
├── docs/                           # Architecture diagrams and guides
├── docker-compose.yml
├── .env.example
└── pnpm-workspace.yaml
```

---

## How the Recommendation Engine Works

The engine is a pure TypeScript module at `apps/api/src/engine/ranking.ts`. It takes the user's home location, must-haves, and ranked good-to-haves, and returns up to 5 ranked schools with full score breakdowns.

### Pipeline

```
Input: postal code + mustHaves + goodToHaves
  │
  ├─ 1. Geocoding          postal code → (lat, lng) via OneMap
  ├─ 2. Commute            check DB cache → OneMap PT routing API (TTL: 30 days)
  ├─ 3. Must-have filter   AND logic — fail any → excluded
  ├─ 4. Feasibility check  0 schools → bottleneck detection → relaxation suggestions
  ├─ 5. ROC weights        convert ranking order to cardinal weights (sum = 1)
  ├─ 6. Scoring            commute: linear decay; sets: overlap fraction
  ├─ 7. Weighted sum       Σ (weight_i × score_i)
  └─ 8. Sort + top 5       with per-criterion breakdown and explanation
```

### ROC Weights

ROC (Rank Order Centroid) weights convert an ordinal ranking into cardinal weights:

```
w_r = (1/k) × Σ_{j=r}^{k} (1/j)
```

For **k = 3** criteria: w₁ = **0.611**, w₂ = **0.278**, w₃ = **0.111** (always sum to 1).

### Scoring

| Criterion | Formula |
|---|---|
| Commute | `clamp(1 − (t − 10) / (tMax − 10) − 0.05 × transfers, 0, 1)` |
| CCAs / Programmes / Subjects | `\|desired ∩ school\| / \|desired\|` (richness fallback if no desired items) |

### No-results Relaxation

When must-haves produce zero results, the engine identifies the most restrictive constraint and generates up to 3 specific suggestions (e.g. "increase commute limit by 15 min → unlocks 23 schools").

For full algorithm details, see [`docs/ALGORITHM.md`](docs/ALGORITHM.md).

---

## Environment Variables

### Root `.env`

| Variable | Purpose | Required |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL — baked into the frontend build | ✅ |
| `VITE_SUPABASE_ANON_KEY` | Supabase public/anon key | ✅ |
| `VITE_API_URL` | Backend URL as seen from the browser | ✅ |

### `apps/api/.env`

| Variable | Purpose | Required |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | ✅ |
| `SUPABASE_URL` | Used to fetch JWKS endpoint for JWT verification | ✅ |
| `ONEMAP_TOKEN` | Bearer token for OneMap routing API | ⚠️ Optional |
| `PORT` | API listen port (default: `4000`) | Optional |
| `NODE_ENV` | `development` or `production` | Optional |

> **`SUPABASE_JWT_SECRET`:** Not required. The API verifies JWTs using Supabase's remote JWKS endpoint derived from `SUPABASE_URL`.

---

## Troubleshooting

<details>
<summary><strong>Port 5433 already in use</strong></summary>

Edit `docker-compose.yml`:
```yaml
postgres:
  ports:
    - '5434:5432'   # change left side to any free port
```
Then update `DATABASE_URL` in `apps/api/.env` to match.
</details>

<details>
<summary><strong>Apple Silicon (M1/M2/M3) — Prisma binary not found</strong></summary>

```bash
docker compose exec api npx prisma generate
docker compose restart api
```
</details>

<details>
<summary><strong>Frontend loads as blank page</strong></summary>

`VITE_` vars are baked in at build time. After changing `.env`:
```bash
docker compose up --build web
```
</details>

<details>
<summary><strong>Schools not showing after import</strong></summary>

1. Re-run `pnpm import:data` from the monorepo root (Docker must be running)
2. Check: `SELECT COUNT(*) FROM "School";` — should be ~133
3. If 0, data.gov.sg may be temporarily unavailable — retry in a few minutes
</details>

<details>
<summary><strong>"Cannot find module '@optima/shared'"</strong></summary>

```bash
pnpm --filter @optima/shared build
```
</details>

<details>
<summary><strong>API not starting — prisma db push fails</strong></summary>

Wait 10 seconds and run:
```bash
docker compose restart api
```
</details>

---

## Licence

This project is for academic and educational purposes. School data is sourced from [data.gov.sg](https://data.gov.sg) under the Singapore Open Data Licence. Commute data is sourced from [OneMap](https://www.onemap.gov.sg), provided by the Singapore Land Authority.
