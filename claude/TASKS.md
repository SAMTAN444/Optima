# TASKS.md — Build Order (Claude must follow)

## Phase 0: Repo + Tooling
- pnpm workspace
- base TS configs
- shared package with types + zod schemas
- docker compose (postgres)
- prisma init + migrations

## Phase 1: Data Layer
- prisma models
- import script (data.gov.sg metadata -> download -> parse -> upsert)
- seed admin role (by supabaseUserId env var or manual update endpoint)

## Phase 2: Auth + Middleware
- supabase jwt verify middleware
- user profile auto-create
- rbac middleware

## Phase 3: Core APIs
- schools list + details
- reviews create + list approved
- report review
- admin moderation endpoints

## Phase 4: Recommendation Engine
- must-have filter (AND logic)
- commute compute on-the-fly with caching
- ROC weights
- scoring + explanation object
- no-results bottleneck + relax suggestions
- unit tests for roc + scoring + must-have filter

## Phase 5: Frontend
- implement landing theme
- auth pages + supabase client
- protected routing
- search page (list + map)
- preference modal (must-have + ranking)
- render recommendations + score breakdown
- school profile tabs + reviews + report
- admin page

## Phase 6: Polish
- error states, loading states
- env examples
- README: exact steps to run