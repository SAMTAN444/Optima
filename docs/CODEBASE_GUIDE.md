# Optima — Codebase Guide

A beginner-friendly map of the repository: what every folder and file does, how the pieces connect, and where to look when you need to change something.

---

## 1. High-Level Overview

**Optima** is a school decision-support web app for Singapore families choosing a secondary school. Users enter their home postal code, define non-negotiable requirements (must-haves) and ranked preferences (good-to-haves), and receive a scored, explainable shortlist of up to five schools drawn from 133 real MOE schools.

The repo is a **pnpm monorepo** with three packages:

| Package | Role |
|---------|------|
| `apps/api` | Express REST API — handles auth, data queries, commute computation, and the ranking engine |
| `apps/web` | Vite + React SPA — all user-facing screens |
| `packages/shared` | TypeScript types and Zod schemas shared by both apps |

**Request flow (simplified):**

```
Browser (apps/web)
  └─ fetch() with Supabase JWT
       └─ Express (apps/api)
            ├─ auth middleware: verifies JWT via Supabase JWKS
            ├─ route handler: queries Prisma/PostgreSQL
            ├─ ranking engine: scores schools (apps/api/src/engine/ranking.ts)
            └─ commute service: calls OneMap API (apps/api/src/services/commute.ts)
```

---

## 2. Repository Structure

```
Optima/
├── apps/
│   ├── api/                          # Express backend
│   │   ├── prisma/
│   │   │   └── schema.prisma         # All database models
│   │   ├── scripts/
│   │   │   ├── import-data.ts        # MOE data importer
│   │   │   └── patch-missing-schools.ts
│   │   ├── src/
│   │   │   ├── index.ts              # Server entry point
│   │   │   ├── app.ts                # Express setup + route registration
│   │   │   ├── engine/
│   │   │   │   ├── ranking.ts        # Recommendation algorithm
│   │   │   │   └── __tests__/
│   │   │   │       └── ranking.test.ts
│   │   │   ├── lib/
│   │   │   │   ├── prisma.ts         # Prisma client singleton
│   │   │   │   └── onemapClient.ts   # OneMap API wrapper
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts           # JWT verification + ban check
│   │   │   │   ├── requireRole.ts    # Auth / admin guards
│   │   │   │   └── validate.ts       # Zod request validation
│   │   │   ├── routes/
│   │   │   │   ├── health.ts
│   │   │   │   ├── me.ts
│   │   │   │   ├── schools.ts
│   │   │   │   ├── recommendations.ts
│   │   │   │   ├── reviews.ts
│   │   │   │   ├── admin.ts
│   │   │   │   ├── onemap.ts
│   │   │   │   ├── bootstrap.ts
│   │   │   │   └── __tests__/
│   │   │   │       └── http.test.ts
│   │   │   └── services/
│   │   │       └── commute.ts        # OneMap routing + Haversine fallback
│   │   ├── .env.example
│   │   ├── Dockerfile
│   │   ├── tsconfig.json
│   │   └── vitest.config.ts
│   │
│   └── web/                          # React frontend
│       ├── public/
│       │   ├── favicon.png
│       │   ├── Person.png
│       │   ├── data_image.png
│       │   └── recommendation.png
│       ├── src/
│       │   ├── main.tsx              # React entry point
│       │   ├── App.tsx               # Router setup
│       │   ├── index.css             # Global CSS
│       │   ├── contexts/
│       │   │   └── AuthContext.tsx   # Supabase session provider
│       │   ├── pages/
│       │   │   ├── Landing.tsx
│       │   │   ├── Login.tsx
│       │   │   ├── Register.tsx
│       │   │   ├── ForgotPassword.tsx
│       │   │   ├── ResetPassword.tsx
│       │   │   ├── Setup.tsx
│       │   │   ├── Search.tsx
│       │   │   ├── SchoolProfile.tsx
│       │   │   ├── SavedSchools.tsx
│       │   │   └── Admin.tsx
│       │   ├── components/
│       │   │   ├── Navbar.tsx
│       │   │   ├── Button.tsx
│       │   │   ├── Badge.tsx
│       │   │   ├── Card.tsx
│       │   │   ├── Modal.tsx
│       │   │   ├── Input.tsx
│       │   │   ├── Tabs.tsx
│       │   │   ├── MultiSelect.tsx
│       │   │   ├── RankList.tsx
│       │   │   └── LoadingSkeleton.tsx
│       │   ├── hooks/
│       │   │   ├── useForm.ts
│       │   │   └── useInView.ts
│       │   ├── routes/
│       │   │   ├── ProtectedRoute.tsx
│       │   │   ├── AdminRoute.tsx
│       │   │   ├── PublicOnlyRoute.tsx
│       │   │   └── HomeRedirect.tsx
│       │   └── lib/
│       │       ├── api.ts            # Typed fetch wrappers
│       │       ├── queryClient.ts    # TanStack Query client
│       │       └── supabase.ts       # Supabase client
│       ├── .env.example
│       ├── Dockerfile
│       ├── nginx.conf
│       ├── tailwind.config.js
│       └── vite.config.ts
│
├── packages/
│   └── shared/
│       └── src/
│           ├── index.ts              # Re-exports everything
│           ├── types.ts              # Shared TypeScript interfaces
│           └── schemas.ts            # Zod validation schemas
│
├── docs/
│   ├── ALGORITHM.md                  # Ranking algorithm deep-dive
│   └── CODEBASE_GUIDE.md            # This file
│
├── docker-compose.yml
├── .env.example
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── README.md
```

---

## 3. What Lives Where

### `apps/api` — Express Backend

The API server. It owns:
- **Database access** — all Prisma queries go through here; the frontend never touches the DB directly.
- **Authentication enforcement** — every protected endpoint verifies the Supabase JWT before proceeding.
- **Recommendation engine** — the `engine/` folder is a pure TypeScript module that takes school data + user preferences and returns a ranked list.
- **Commute calculation** — `services/commute.ts` calls the Singapore OneMap API and caches results.
- **Admin operations** — moderation endpoints (approve/reject reviews, ban users) live here.

### `apps/web` — React Frontend

The single-page application. It owns:
- **All UI** — pages, components, forms, the Leaflet map view.
- **Auth state** — `AuthContext.tsx` wraps the Supabase client and exposes the current session.
- **API calls** — `lib/api.ts` contains typed `fetch()` wrappers; TanStack Query handles caching and loading states.
- **Preference persistence** — user search preferences are stored in `localStorage` and encoded into URL query params.

### `packages/shared` — Shared Types & Schemas

A small package compiled with `tsup` and imported by both `apps/api` and `apps/web`. It contains:
- **`types.ts`** — TypeScript interfaces for everything that crosses the API boundary (`UserProfile`, `SchoolDetail`, `RecommendationResult`, etc.).
- **`schemas.ts`** — Zod schemas used for request validation on the API and form validation on the frontend. Kept in sync by design.

### `docs/`

Documentation only. No application code. See `ALGORITHM.md` for a detailed write-up of the ROC-weight ranking algorithm with worked examples.

### `apps/api/scripts/`

One-off data scripts run outside the normal server process:
- **`import-data.ts`** — downloads 5 CSV datasets from data.gov.sg (collection 457), merges them by school name, geocodes each school via OneMap, and upserts 133 secondary schools into the database. Run once after first `docker compose up`.
- **`patch-missing-schools.ts`** — back-fills GPS coordinates for mixed-level schools that were excluded on the first import pass.

---

## 4. File-by-File Explanation

### Root Configuration

| File | What it does |
|------|-------------|
| `package.json` | Root workspace scripts: `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm import:data`, `pnpm db:*` — all delegate to the relevant workspace package. |
| `pnpm-workspace.yaml` | Declares `apps/*` and `packages/*` as pnpm workspace members. |
| `tsconfig.base.json` | Base TypeScript config extended by each app's own `tsconfig.json`. |
| `docker-compose.yml` | Defines three services: `postgres` (port 5433), `api` (port 4000), `web`/nginx (port 3000). The API service runs `prisma db push` automatically on startup. |
| `.env.example` | Root environment template. Variables here (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`) are baked into the frontend build by Docker Compose. |

---

### `apps/api/prisma/schema.prisma`

The single source of truth for the database. Defines these models:

| Model | Purpose |
|-------|---------|
| `UserProfile` | Linked to Supabase auth via `supabaseUserId`. Stores home location, role (`STUDENT_PARENT` / `ADMIN`), and `banned` flag. Auto-created on first authenticated API call. |
| `School` | Core school record: name, address, postal code, GPS coords, section. |
| `SchoolCCA` | One row per CCA per school. `ccaName` = broad category (e.g. `PHYSICAL SPORTS`); `ccaGroup` = specific name (e.g. `BASKETBALL`). **Filtering and ranking use `ccaGroup`.** |
| `SchoolProgramme` | One row per programme per school (e.g. `Integrated Programme`). |
| `SchoolSubject` | One row per subject/language per school. |
| `SchoolDistinctiveProgramme` | One row per distinctive programme per school. Has `domain` and `title` fields. |
| `CommuteCache` | Cached OneMap routing results, keyed by `(originKey, schoolId, mode)` with a 30-day TTL. |
| `Review` | User review of a school: `rating` (1–5), `comment`, `status` (`APPROVED` / `REJECTED` / `PENDING`). New reviews default to `APPROVED`. |
| `ReviewReport` | A user's report of a review, with a `reason`. Unique per `(reviewId, reporterUserId)`. |
| `SavedSchool` | Bookmarked school per user. Unique per `(userId, schoolId)`. |

After any schema change, regenerate the Prisma client:

```bash
cd apps/api && npx prisma generate
```

---

### `apps/api/src/index.ts`

Server entry point. Imports `createApp()` from `app.ts`, connects to the database, and calls `app.listen(PORT)`. Sets `PORT` from the environment (default `4000`).

### `apps/api/src/app.ts`

Creates the Express app, applies global middleware (`helmet`, `cors`, `express.json`), and registers all route modules under their base paths (`/health`, `/me`, `/schools`, `/recommendations`, `/reviews`, `/admin`, `/onemap`, `/bootstrap-admin`).

---

### Middleware (`apps/api/src/middleware/`)

| File | What it does | Used by |
|------|-------------|---------|
| `auth.ts` | `authenticate(req, res, next)` — extracts the Bearer token, verifies it against Supabase's JWKS endpoint (`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`), upserts a `UserProfile`, and blocks banned users with `403 BANNED`. Also exports `optionalAuth` (same but does not reject missing tokens). | All protected routes |
| `requireRole.ts` | `requireAuth()` — rejects if no user on request. `requireAdmin()` — rejects unless `role === 'ADMIN'`. | Protected and admin routes |
| `validate.ts` | `validateBody(schema)` / `validateQuery(schema)` — validates request payload against a Zod schema and stores the result in `req.body` / `req.validatedQuery`. Returns 400 on failure. | Every route that accepts input |

**Key env var:** `SUPABASE_URL` (used to derive the JWKS URL in `auth.ts`).

---

### Routes (`apps/api/src/routes/`)

#### `health.ts`
`GET /health` → `{ ok: true, data: { status: 'healthy', timestamp } }`. No auth. Used by Docker's healthcheck.

#### `me.ts`
Manages the current user's own profile.

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /me` | Required | Returns `UserProfile` |
| `PATCH /me` | Required | Updates home location, display name |
| `GET /me/saved-schools` | Required | Returns saved schools list |

#### `schools.ts`
The biggest route file. Handles school listing, search, commute, reviews, and saves.

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /schools` | Optional | Paginated list of secondary schools. Query params: `q` (name search), `programme[]`, `cca[]`, `subject[]`, `page`, `pageSize`. |
| `GET /schools/meta` | None | Returns all distinct CCAs (flat + grouped by category), programmes, subjects. Used to populate filter dropdowns. |
| `GET /schools/nearby` | None | Schools within `maxMins` commute from `postal` / `lat+lng`, sorted by travel time. |
| `POST /schools/:id/commute` | None | Computes commute from a given postal code to one school. Returns estimated if OneMap unavailable. |
| `GET /schools/:id` | Optional | Full school profile (CCAs, programmes, subjects, distinctive, reviews, avg rating, `savedByMe` flag). |
| `GET /schools/:id/reviews` | None | Approved reviews only. |
| `POST /schools/:id/reviews` | Required | Create a review. Returns 409 if user already reviewed this school. |
| `POST /schools/:id/save` | Required | Bookmark school. |
| `DELETE /schools/:id/save` | Required | Remove bookmark. |

> **CCA naming quirk:** `SchoolCCA.ccaName` is the *broad category* (`PHYSICAL SPORTS`); `SchoolCCA.ccaGroup` is the *specific CCA* (`BASKETBALL`). All filtering, quick-filters, and the ranking engine match on `ccaGroup`. The display groups items by `ccaName` as a section header.

#### `recommendations.ts`
`POST /recommendations` — the main endpoint. Auth is optional (results are the same; user location can come from the request body).

Accepts a `RecommendationRequest` (validated by Zod), fetches all secondary schools from the DB with their CCAs/programmes/subjects/distinctive, batch-computes commute times via `commute.ts`, then delegates to `engine/ranking.ts`. Returns either a ranked list or a no-results payload with bottleneck analysis and relaxation suggestions.

**Key response fields:** `candidateCount` (schools passing must-have filter), `results[]` (top 5), `noResults`, `bottleneck`, `suggestions`.

#### `reviews.ts`
`POST /reviews/:id/report` — report an existing review. Auth required. Prevents self-reports and duplicate reports. Checks if reporter is banned.

#### `admin.ts`
All endpoints require auth + admin role.

| Endpoint | Purpose |
|----------|---------|
| `GET /admin/reviews` | All reviews regardless of status |
| `GET /admin/reports` | Reviews with ≥1 unresolved report |
| `POST /admin/reviews/:id/approve` | Set status → `APPROVED` |
| `POST /admin/reviews/:id/reject` | Set status → `REJECTED` |
| `POST /admin/reviews/:id/ignore-reports` | Delete all reports, keep review `APPROVED` |
| `DELETE /admin/reviews/:id` | Delete review and its reports |
| `GET /admin/users` | All users with review count |
| `POST /admin/users/:id/ban` | Ban user, delete their reviews and reports |
| `POST /admin/users/:id/unban` | Unban user |
| `POST /admin/users/:id/promote` | Set role → `ADMIN` |
| `POST /admin/users/:id/demote` | Set role → `STUDENT_PARENT` |

#### `onemap.ts`
`GET /onemap/ping` — health check for the OneMap integration. Returns 503 if `ONEMAP_TOKEN` is not configured, 200 if reachable, 502 if unreachable.

#### `bootstrap.ts`
`POST /bootstrap-admin` — promotes the calling user to `ADMIN` if and only if no admins currently exist. Returns 403 if an admin already exists. This endpoint is how the very first admin is created (via the `/setup` page in the frontend).

---

### Engine (`apps/api/src/engine/ranking.ts`)

A pure module with no side effects — it takes data, returns results, and never touches the database or network directly. This makes it easy to test.

**Key exported functions:**

| Function | What it does |
|----------|-------------|
| `rankSchools(schools, mustHaves, goodToHaves)` | Main entry point. Returns `{ results, noResults, bottleneck, suggestions, candidateCount }`. |
| `passesMustHaves(school, mustHaves)` | AND-logic filter. Returns false if the school fails any single constraint. |
| `computeRocWeights(criteria)` | Converts an ordered list of criterion names into ROC weights that sum to 1. |
| `scoreSchool(school, goodToHaves, weights, allSchools)` | Scores a school across all ranked criteria. Returns total score + per-criterion breakdown. |
| `detectBottleneck(schools, mustHaves)` | Called when 0 schools pass must-haves. Identifies the most restrictive constraint and returns up to 3 concrete relaxation suggestions. |

**Algorithm summary:**
1. Filter schools with `passesMustHaves` (AND logic across all constraints).
2. If 0 pass → `detectBottleneck`.
3. Compute ROC weights: `w_r = (1/k) × Σ_{j=r..k} (1/j)`.
4. Score each school per criterion (commute: linear decay; set criteria: overlap ratio; richness fallback if no desired items).
5. Weighted sum → sort → return top 5.

See `docs/ALGORITHM.md` for the full formula derivation and worked examples.

---

### Services (`apps/api/src/services/commute.ts`)

Handles everything related to travel-time computation.

| Function | What it does |
|----------|-------------|
| `geocodePostal(postal)` | Calls OneMap Search API → `{ lat, lng }` |
| `estimateCommute(origin, dest)` | Haversine fallback: 4 min/km + 5 min base, 1 transfer if >3 km. Used when OneMap is unavailable. Marked `estimated: true` in the response. |
| `getCommute(originKey, origin, schoolId, dest, userId?)` | Fetches from `CommuteCache` or calls OneMap PT routing API. Caches result for 30 days. |
| `getCommutesBatch(originKey, origin, schools, options)` | Bulk version of `getCommute`. Reads cache in one `findMany`, then calls OneMap only for misses. Caps concurrent API calls at 10 via `mapConcurrent`. |

**Key env var:** `ONEMAP_TOKEN` (Bearer token for the OneMap API). Without it, all commutes fall back to Haversine estimates.

---

### Library (`apps/api/src/lib/`)

| File | What it does |
|------|-------------|
| `prisma.ts` | Exports a single shared `PrismaClient` instance. Import this everywhere; never create a new `PrismaClient` directly. |
| `onemapClient.ts` | Low-level wrapper around the OneMap HTTP API: geocoding and PT routing. Reads `ONEMAP_TOKEN` from the environment. |

---

### `apps/api/scripts/`

| Script | Command | What it does |
|--------|---------|-------------|
| `import-data.ts` | `pnpm import:data` | Downloads 5 CSV files from data.gov.sg collection 457 (general, programme, subject, cca, distinctive). Merges by normalized school name. Filters to `SECONDARY` section. Geocodes missing GPS coords via OneMap. Upserts 133 schools into the DB. |
| `patch-missing-schools.ts` | `pnpm patch:schools` | Re-processes the downloaded CSVs to back-fill schools that were skipped on the first import (usually mixed-level schools). Uses the cached CSV files in `apps/api/tmp/`. |

---

### Frontend Pages (`apps/web/src/pages/`)

| File | Route | Auth | What it does |
|------|-------|------|-------------|
| `Landing.tsx` | `/` | No | Public hero page with feature overview and how-to guide. Links to `/login` and `/register`. |
| `Login.tsx` | `/login` | No (public-only) | Email/password sign-in form. Uses `AuthContext.signIn`. Redirects to `/app/search` on success. |
| `Register.tsx` | `/register` | No (public-only) | Account creation form. Uses `AuthContext.signUp`. |
| `ForgotPassword.tsx` | `/forgot-password` | No | Sends Supabase password-reset email. |
| `ResetPassword.tsx` | `/reset-password` | No | Confirms new password after clicking the reset link. |
| `Setup.tsx` | `/setup` | Required | One-time admin bootstrap: calls `POST /bootstrap-admin`. Also lets users verify their home address. |
| `Search.tsx` | `/app/search` | Required | The main application screen. Contains the preference wizard modal (three steps: home location, must-haves, good-to-haves), a Leaflet map (top, 420px), and a results list. Also supports browse mode (15 schools/page with Prev/Next), keyword search, and quick-filters. All state is encoded in the URL as `mode=recs&prefs=<base64>`. Preferences persist to `localStorage`. |
| `SchoolProfile.tsx` | `/app/schools/:id` | Required | School detail page with tabs: Overview, CCAs, Programmes, Subjects, Distinctive Programmes, Commute, Reviews. Users can write reviews and save/unsave the school. "Back to search" returns to the exact previous search URL. |
| `SavedSchools.tsx` | `/app/saved` | Required | Lists the current user's saved schools, fetched from `GET /me/saved-schools`. |
| `Admin.tsx` | `/app/admin` | Admin | Two-tab admin panel: "Reported" (reviews with reports) and "All Reviews". Each card shows approve/reject/delete controls and a ban button for the reviewer. |

---

### Frontend Components (`apps/web/src/components/`)

All components are reusable and presentational (no direct API calls).

| File | Purpose |
|------|---------|
| `Button.tsx` | Variants: `primary` (navy background), `secondary` (gray border), `danger` (red), `ghost` (transparent). Sizes: `sm`, `md`, `lg`. |
| `Badge.tsx` | Inline label chip. Variants: `blue`, `navy`, `yellow`, `green`, `red`, `gray`. |
| `Card.tsx` | Container with shadow and border. Used for school result cards and profile sections. |
| `Modal.tsx` | Dialog overlay with a close button. Used for the preference wizard and confirmation dialogs. |
| `Input.tsx` | Text input with a label and optional error message below. |
| `Tabs.tsx` | Horizontal tab bar. Controlled component: `tabs`, `active`, `onChange`. |
| `MultiSelect.tsx` | Multi-choice dropdown. Used in the preference wizard for selecting CCAs, programmes, and subjects. |
| `RankList.tsx` | Renders ranked school results with score breakdown bars and an explanation section. |
| `Navbar.tsx` | Top navigation bar (72px). Shows logo, page links, and auth status (user name + sign-out button). Shows "Admin" link if the user has admin role. |
| `LoadingSkeleton.tsx` | Animated placeholder shown while data is loading. |

---

### Frontend Hooks (`apps/web/src/hooks/`)

| File | What it does |
|------|-------------|
| `useForm.ts` | Generic form state manager. Accepts initial values and a Zod schema. Returns `values`, `errors`, `handleChange`, `setValue`, `validate`, `reset`. Used on Login, Register, and the preference modal. |
| `useInView.ts` | Thin wrapper around `IntersectionObserver`. Returns a `ref` and a boolean `inView`. Used for scroll-triggered effects. |

---

### Frontend Lib (`apps/web/src/lib/`)

| File | What it does |
|------|-------------|
| `api.ts` | All typed fetch wrappers (`getSchools`, `getSchoolById`, `postRecommendations`, `getMe`, `patchMe`, `postReview`, etc.). Automatically attaches the Supabase JWT as `Authorization: Bearer <token>`. Always reads `VITE_API_URL` for the base URL. |
| `queryClient.ts` | Creates and exports the TanStack Query `QueryClient`. Configures default retry and stale-time settings. |
| `supabase.ts` | Creates the Supabase client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Imported by `AuthContext` and `api.ts`. |

---

### Frontend Auth (`apps/web/src/contexts/AuthContext.tsx`)

Wraps the Supabase client and subscribes to `onAuthStateChange`. Provides via React context:
- `user` — Supabase `User` object (or `null`)
- `loading` — true while the session is being resolved on first load
- `signIn(email, password)`, `signUp(email, password, displayName)`, `signOut()`, `resetPassword(email)`

### Frontend Routes (`apps/web/src/routes/`)

| File | What it does |
|------|-------------|
| `ProtectedRoute.tsx` | Redirects unauthenticated users to `/login`. |
| `AdminRoute.tsx` | Redirects non-admins away. Shows an "Access Denied" message if the user is logged in but not admin. |
| `PublicOnlyRoute.tsx` | Redirects already-authenticated users away from login/register pages to `/app/search`. |
| `HomeRedirect.tsx` | Root redirect: sends authenticated users to `/app/search`, unauthenticated users to `/` (Landing). |

---

### `packages/shared/src/`

| File | What it exports |
|------|----------------|
| `types.ts` | `UserProfile`, `SchoolSummary`, `SchoolDetail`, `Review`, `ReviewWithReports`, `CommuteInfo`, `CommuteLeg`, `RecommendationResult`, `ScoreBreakdown`, `MustHaves`, `GoodToHaves`, `RelaxSuggestion`, `ApiResponse<T>`, and more. |
| `schemas.ts` | Zod schemas for every request body and query. Key ones: `RecommendationRequestSchema` (validates the full preferences object, enforces the at-most-4-must-haves rule), `CreateReviewSchema`, `UpdateProfileSchema`, `SchoolsQuerySchema`. |
| `index.ts` | Re-exports everything from `types.ts` and `schemas.ts`. Both apps import from `@optima/shared`. |

**Important:** The shared package must be built before either app can import it. Run `pnpm --filter @optima/shared build` if you see `Cannot find module '@optima/shared'`.

---

## 5. Cross-Cutting Topics

### Auth Flow

1. **Sign-in** — `Login.tsx` calls `AuthContext.signIn` → Supabase issues a JWT stored in `localStorage`.
2. **API calls** — `lib/api.ts` reads the JWT from the Supabase client and attaches it as `Authorization: Bearer <token>` on every fetch.
3. **JWT verification** — `middleware/auth.ts` calls Supabase's JWKS endpoint (`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`) to verify the token signature. No static secret is needed.
4. **Profile upsert** — On successful verification, `auth.ts` upserts a `UserProfile` row (keyed by `supabaseUserId`) so the API always has a local user record.
5. **Ban check** — `auth.ts` checks `UserProfile.banned`; banned users receive `403 BANNED` on every protected route.
6. **Role enforcement** — `middleware/requireRole.ts` provides `requireAuth()` and `requireAdmin()` guards applied to specific routes.
7. **Admin bootstrap** — `POST /bootstrap-admin` (guarded in `routes/bootstrap.ts`) promotes the first user to `ADMIN`. Subsequent promotions go through `POST /admin/users/:id/promote`.

### Data Layer

- **Schema:** `apps/api/prisma/schema.prisma` — single source of truth.
- **Client:** `apps/api/src/lib/prisma.ts` — singleton `PrismaClient`. Import this in every route/service; never instantiate a new one.
- **DB access:** All routes query Prisma directly. No ORM abstraction layer beyond Prisma itself.
- **Import:** `apps/api/scripts/import-data.ts` fetches from data.gov.sg and upserts via `prisma.school.upsert`. Run once per environment.
- **Schema changes:** After editing `schema.prisma`, run `npx prisma generate` (regenerates the TS client) and either `npx prisma db push` (dev) or `npx prisma migrate dev` (migration).

### Recommendations Engine

- **Lives in:** `apps/api/src/engine/ranking.ts`
- **Triggered by:** `POST /recommendations` → `apps/api/src/routes/recommendations.ts`
- **Key functions:** `rankSchools` (main), `passesMustHaves`, `computeRocWeights`, `scoreSchool`, `detectBottleneck`
- **Pure module:** No Prisma or HTTP calls inside `ranking.ts`. Data is fetched by the route handler, then passed in.
- **Tests:** `apps/api/src/engine/__tests__/ranking.test.ts` — 68 unit tests covering every formula branch.

### Admin Moderation

- **API endpoints:** `apps/api/src/routes/admin.ts` — all require `requireAdmin()`.
- **Frontend UI:** `apps/web/src/pages/Admin.tsx` — two-tab panel (Reported | All Reviews) with per-card action buttons.
- **Access control:** `apps/web/src/routes/AdminRoute.tsx` prevents non-admins from reaching the admin page.

### Testing

- **Framework:** Vitest + Supertest (API only; no frontend tests currently).
- **Test files:**
  - `apps/api/src/engine/__tests__/ranking.test.ts` — 68 unit tests (pure functions, no mocking needed).
  - `apps/api/src/routes/__tests__/http.test.ts` — 13 HTTP integration tests (Prisma and OneMap are mocked).
- **Run tests:**
  ```bash
  cd apps/api
  pnpm test          # run once
  pnpm test:watch    # watch mode
  ```
- **Total:** 81 tests, all passing.

---

## 6. How to Navigate as a Contributor

| Goal | Start here |
|------|-----------|
| Change the landing page or marketing copy | `apps/web/src/pages/Landing.tsx` |
| Change the search/preferences UI | `apps/web/src/pages/Search.tsx` |
| Change the school profile page | `apps/web/src/pages/SchoolProfile.tsx` |
| Change the admin panel | `apps/web/src/pages/Admin.tsx` |
| Add or change an API endpoint | `apps/api/src/routes/<relevant>.ts`, then register in `apps/api/src/app.ts` if it's a new file |
| Change the recommendation algorithm | `apps/api/src/engine/ranking.ts` (and update tests in `__tests__/ranking.test.ts`) |
| Change commute calculation | `apps/api/src/services/commute.ts` and `apps/api/src/lib/onemapClient.ts` |
| Change or add a DB model | `apps/api/prisma/schema.prisma` → `npx prisma generate` → update relevant routes |
| Change the data importer | `apps/api/scripts/import-data.ts` |
| Add a new shared type | `packages/shared/src/types.ts` → `pnpm --filter @optima/shared build` |
| Add or change a Zod validation schema | `packages/shared/src/schemas.ts` → rebuild shared |
| Add a new reusable UI component | `apps/web/src/components/` |
| Add a new page/route | `apps/web/src/pages/` + add a `<Route>` in `apps/web/src/App.tsx` |
| Change auth behaviour (JWT, ban check) | `apps/api/src/middleware/auth.ts` |

---

## 7. Most Important Files to Read First

If you're new to the codebase, read these ten files in order:

1. `apps/api/prisma/schema.prisma` — understand the data model before anything else.
2. `packages/shared/src/types.ts` — see what shapes cross the API boundary.
3. `packages/shared/src/schemas.ts` — understand what the API accepts and validates.
4. `apps/api/src/app.ts` — see how the API is assembled and which routes exist.
5. `apps/api/src/middleware/auth.ts` — understand how every request is authenticated.
6. `apps/api/src/routes/schools.ts` — the most-used route file; covers listing, search, reviews, saves.
7. `apps/api/src/routes/recommendations.ts` — how user preferences become a ranked list.
8. `apps/api/src/engine/ranking.ts` — the heart of the product.
9. `apps/web/src/App.tsx` — all frontend routes in one place.
10. `apps/web/src/pages/Search.tsx` — the most complex frontend page; integrates the map, modal, results, browse, and URL state.

---

## 8. Common Pitfalls

### Environment Variables

| Symptom | Cause | Fix |
|---------|-------|-----|
| Frontend shows blank page | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` missing or stale | These are baked in at **build time**. After changing `.env`, run `docker compose up --build web`. |
| API returns 401 on every request | `SUPABASE_URL` missing or wrong in `apps/api/.env` | The API derives the JWKS URL from `SUPABASE_URL`. Check `apps/api/.env`. |
| All commutes show as estimated | `ONEMAP_TOKEN` not set | Register at onemap.gov.sg and set `ONEMAP_TOKEN` in `apps/api/.env`. The app degrades gracefully but commute scores will be approximate. |
| `Cannot find module '@optima/shared'` | Shared package not built | Run `pnpm --filter @optima/shared build`. |

### Docker & Database

| Symptom | Cause | Fix |
|---------|-------|-----|
| Port 5433 already in use | Local Postgres on 5432 mapped to 5433 | Change the left side of the port mapping in `docker-compose.yml` and update `DATABASE_URL`. |
| `School` table empty after startup | Data not imported | Run `docker compose exec api pnpm import:data`. |
| API exits immediately | `prisma db push` failed on startup | Wait 10s, then `docker compose restart api`. |
| Prisma binary not found (Apple Silicon) | Missing ARM binary | Run `docker compose exec api npx prisma generate` then restart the API. |

### pnpm Workspace

- **Always run commands from the repo root** using `pnpm --filter @optima/api <cmd>` or the root workspace scripts. Running `npm install` inside a sub-package will break the lockfile.
- **Shared package changes** are not picked up automatically. You must run `pnpm --filter @optima/shared build` for the API (and Vite dev server, if it's running) to see the updated types/schemas.

### CCA Data Naming

`SchoolCCA` has two fields that are counterintuitively named:
- `ccaName` = the **broad category** (e.g. `PHYSICAL SPORTS`, `CLUBS AND SOCIETIES`)
- `ccaGroup` = the **specific CCA name** (e.g. `BASKETBALL`, `CHOIR`, `NCC`)

All filtering (`GET /schools?cca=...`), quick-filters, and the ranking engine match on **`ccaGroup`**. If you accidentally filter on `ccaName`, you will get 0 results for any specific CCA query.

### Prisma Client Staleness

After editing `schema.prisma`, always run:
```bash
cd apps/api && npx prisma generate
```
Otherwise the TypeScript types will be out of sync and you'll get runtime errors or incorrect autocompletion.

### Admin Bootstrap

`POST /bootstrap-admin` permanently disables itself after the first admin is created. If you need to add more admins later, use `POST /admin/users/:id/promote` (from within the Admin UI) or the SQL fallback:
```sql
UPDATE "UserProfile" SET role = 'ADMIN' WHERE "supabaseUserId" = '...';
```
