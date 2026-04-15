# CLAUDE.md — Optima Final Master Spec

You are a senior full-stack engineer building a complete, runnable, beginner-friendly monorepo for **Optima** — a Singapore **Secondary School Decision Support System**.

This specification is the **single source of truth**. Follow it strictly and resolve conflicts in favor of this file.

The app should be production-structured, but easy to run locally.

---

# 0. Mission

Build an EdTech web app for **Singapore SECONDARY schools only** that helps student/parent users:

1. define **Must-haves**
2. rank **Good-to-haves**
3. compute **public transport commute time** using OneMap
4. filter schools by hard constraints
5. rank feasible schools using **ROC-weighted scoring**
6. explain recommendations clearly
7. browse school details
8. save schools
9. post and read community comments/reviews
10. report inappropriate reviews
11. let admins moderate reported reviews and ban/promote users

---

# 1. Output Rules

## Non-negotiable

1. Generate a **monorepo** with:

   * `/apps/web`
   * `/apps/api`
   * `/packages/shared`
   * `/scripts`

2. Include all key files:

   * root workspace `package.json`
   * app/package `package.json`s
   * `tsconfig` files
   * Dockerfiles
   * `docker-compose.yml`
   * `.env.example` files
   * Prisma schema
   * importer script
   * seed / admin utility if needed
   * tests
   * README

3. Use **TypeScript everywhere**.

4. Use **Zod** for:

   * frontend form validation
   * backend request validation

5. All API responses must follow this envelope:

### Success

```json
{ "ok": true, "data": ... }
```

### Error

```json
{
  "ok": false,
  "error": {
    "code": "STRING_CODE",
    "message": "Human readable message",
    "details": {}
  }
}
```

6. Do **not** leave placeholders like:

* TODO
* implement later
* stub this
* omitted for brevity

7. The code must be runnable locally.

---

# 2. Tech Stack

## Frontend

* Vite
* React
* TypeScript
* Tailwind CSS
* React Router
* TanStack Query
* Zod
* React Leaflet

## Backend

* Node.js
* Express
* TypeScript
* Prisma ORM
* Supabase Auth for authentication
* Postgres database (DB can run in two supported modes: Local Docker Postgres by default; optional Supabase Postgres)
* Zod validation middleware
* OneMap APIs
* Node-only importer

## Dev / Infra

* Docker Compose for:

  * frontend
  * backend
* DB can run in two supported modes:
* Remote Supabase Postgres (recommended for production/demo)
* Local Postgres container via Docker Compose (recommended for onboarding/dev)
Both must be supported and documented in README.
Docker Compose may include Postgres for local mode.
* clear `.env.example` files required
* clear README required

---

# 3. Product Scope

## Only SECONDARY schools

The system must import and operate on **Singapore SECONDARY schools only**.

All school import/filter logic must exclude non-secondary institutions.

---

# 4. Design System

## Visual style

Use a clean GovTech / education-tech style:

* white background
* blue-accented sections
* rounded cards
* subtle shadows
* clear typography
* lots of whitespace
* polished, not flashy
* modern but beginner-friendly

## Brand colors

Use these as the design system:

* Primary blue: `#49CDF9`
* Secondary yellow: `#FFEA92`
* Secondary light blue: `#A7CEFC`
* White: `#FFFFFF`
* Dark: `#212529`

## Typography

* Use **Inter**
* maintain strong hierarchy
* keep things readable
* do **not** shrink the UI
* if in doubt, make key parts slightly more substantial rather than smaller

## Layout rules

* app should be **wider on large screens**
* but **not full-width edge-to-edge**
* content should occupy more of the desktop viewport
* keep it centered and polished
* keep it responsive and mobile-friendly
* do not leave a tiny app floating in a huge empty canvas

## Shared components

Create reusable components such as:

* Button
* Card
* Badge
* Tabs
* Modal
* Input
* MultiSelect
* RankList
* LoadingSkeleton

Use consistent styles across:

* navbar
* buttons
* filters
* list items
* cards
* forms
* admin pages
* school pages
* saved page

---

# 5. Routes

## Public routes

* `/`
* `/login`
* `/register`
* `/admin-login`

## Protected app routes

* `/app/search`
* `/app/saved`
* `/app/schools/:id`
* `/app/admin`

---

# 6. Users and Roles

## Roles

* `STUDENT_PARENT`
* `ADMIN`

## Auth model

* Supabase Auth handles email/password signup/login
* backend verifies Supabase JWT from `Authorization: Bearer <token>`
* backend maps auth user to an application profile
* if profile does not exist, auto-create one with role `STUDENT_PARENT`

## Main admin rule

The system supports admins, but admin access is never public by default.

Normal registration must create only `STUDENT_PARENT`.

Admins can only exist by:

* manual DB role update
* seed/admin utility
* promotion by an existing admin

## Required login behavior

### Normal user via normal login

* allowed
* lands on `/app/search`

### Admin via normal login

* allowed
* lands on `/app/search`
* can still use normal student/parent features

### Admin via admin login

* allowed
* lands on `/app/admin`

### Non-admin via admin login

* blocked
* sees a clear error message like:

  * `User is not an admin`
* must not be allowed into moderation dashboard

## Navbar behavior

### Normal user

Show:

* Search
* Saved

Do **not** show Admin.

### Admin

Show:

* Search
* Saved
* Admin

## Route guard behavior

* normal users must be able to access normal protected routes
* non-admin users must not access admin routes
* admin users must be able to access both admin and normal user routes
* guard logic must wait until auth state and role/profile state are ready before redirecting

---

# 7. User Experience Flows

## Student/Parent user

Can:

* create account
* sign in
* update profile/home location
* save preferences draft
* search schools
* generate recommendations
* save schools
* view school details
* post multiple reviews/comments
* report other users’ comments
* not access admin dashboard

## Admin

Can:

* sign in via admin login
* access moderation dashboard
* review flagged comments
* dismiss report / approve visibility
* remove comment
* ban user
* promote/demote users if admin tools are implemented

---

# 8. Data Source Import

## Mandatory data source

Use **data.gov.sg collection 457**.

Do **not** depend on manually downloaded CSV files.

## Metadata endpoint

`https://api-production.data.gov.sg/v2/public/api/collections/457/metadata`

## Import script

Create:
`scripts/import-data.ts`

## Importer responsibilities

1. fetch metadata from collection 457
2. find the 5 required dataset resources
3. download them programmatically
4. parse them
5. normalize school names deterministically
6. merge by normalized school name
7. filter to **SECONDARY only**
8. geocode schools using OneMap Search API if possible
9. upsert into DB using Prisma
10. include retry + basic rate-limit handling
11. print an import summary

## Required datasets

1. General info
2. CCAs
3. Subjects
4. MOE programmes
5. Distinctive programmes

## Deterministic school name normalization

Use:

* uppercase
* trim
* collapse multiple spaces
* replace punctuation with spaces
* collapse spaces again

Example:
`Anglo-Chinese School (Barker Road)`
→ `ANGLO CHINESE SCHOOL BARKER ROAD`

## Canonical school set

Use general info dataset to identify valid **secondary** school names first.
All auxiliary datasets should only attach to that canonical school set.
Unknown names should be skipped and counted in logs.

---

# 9. Prisma Data Model

Use Prisma models representing the following entities.

## Profile

Fields:

* `id`
* `supabaseUserId` (unique)
* `email`
* `displayName`
* `role` (`STUDENT_PARENT` | `ADMIN`)
* `homeAddress`
* `homePostal`
* `homeLat`
* `homeLng`
* `isBanned` (boolean, default false)
* `createdAt`
* `updatedAt`

## School

Fields:

* `id`
* `name`
* `address`
* `postalCode`
* `telephone`
* `url`
* `educationLevel` = `SECONDARY`
* `lat`
* `lng`
* `programmes` as `text[]`
* `subjects` as `text[]`
* `ccas` as `text[]`
* `distinctiveProgrammes` as `jsonb`

## Preference

Fields:

* `id`
* `userId`
* `hardConstraints` (`jsonb`)
* `rankedPriorities` (`jsonb`)
* `createdAt`
* `updatedAt`

This is used for **Save Draft** behavior.

## SavedSchool

Fields:

* `id`
* `userId`
* `schoolId`
* `createdAt`

Unique:

* `(userId, schoolId)`

## Review

Fields:

* `id`
* `userId`
* `schoolId`
* `rating`
* `commentText`
* `isFlagged` boolean default false
* `flagCount` int default 0
* `status` enum:

  * `VISIBLE`
  * `REMOVED`
* `createdAt`

Important:

* A user can create **multiple comments/reviews** for the same school
* therefore **do not** add a unique `(userId, schoolId)` constraint

## ReviewReport

Fields:

* `id`
* `reviewId`
* `reportedBy`
* `reason`
* `createdAt`

Business rule:

* user cannot report their own review

Optional constraint:

* prevent the same user from repeatedly reporting the same review if appropriate

## ModerationAction

Fields:

* `id`
* `reviewId`
* `adminId`
* `action` enum:

  * `DISMISS`
  * `REMOVE`
* `note`
* `createdAt`

## CommuteCache

Fields:

* `id`
* `originKey`
* `schoolId`
* `mode` = `pt`
* `durationMins`
* `transfers`
* `routeJson`
* `updatedAt`

Use it to reduce repeated OneMap routing calls.

---

# 10. API Response Envelope

## Success

```json
{ "ok": true, "data": ... }
```

## Error

```json
{
  "ok": false,
  "error": {
    "code": "STRING_CODE",
    "message": "Readable message",
    "details": {}
  }
}
```

---

# 11. Required API Endpoints

## Health

### GET `/health`

Returns ok.

---

## Auth / Profile

### GET `/me`

Auth required.
Returns current profile.

### PATCH `/me`

Auth required.

Allowed body:

* `displayName?`
* `homePostal?`
* `homeAddress?`
* `homeLat?`
* `homeLng?`

Returns updated profile.

Behavior:

* if profile missing, create it first
* auto-created profile role defaults to `STUDENT_PARENT`

---

## Schools

### GET `/schools`

Query:

* `q?`
* `programme?` repeatable
* `cca?` repeatable
* `subject?` repeatable
* `page`
* `pageSize`

Returns:

* school list with basic fields
* pagination

### GET `/schools/:id`

Returns:

* school
* arrays/relations
* review aggregates from `VISIBLE` reviews only
* `savedByMe` if auth present

### GET `/schools/:id/reviews`

Returns `VISIBLE` reviews only.

---

## Reviews

### POST `/schools/:id/reviews`

Auth required.

Body:

* `rating` (1..5)
* `comment` string (min 5 chars)

Behavior:

* creates review with `status = VISIBLE`
* review is visible immediately
* no admin pre-approval required

Return created review.

### POST `/reviews/:id/report`

Auth required.

Body:

* `reason` string required

Rules:

* user cannot report own review
* reporting does **not** hide the review immediately
* report creates a `ReviewReport`
* review remains public until admin removes it

Return ok.

---

## Saved Schools

### POST `/schools/:id/save`

Auth required.
Save school for current user.

### DELETE `/schools/:id/save`

Auth required.
Unsave school for current user.

### GET `/saved-schools`

Auth required.

Query:

* `page`
* `pageSize`

Returns:

* current user’s saved schools only
* pagination
* enough school data for left-list + right-map UI

---

## Recommendations

### POST `/recommendations`

Body:

```json
{
  "home": {
    "postal": "optional",
    "address": "optional",
    "lat": 1.23,
    "lng": 103.45
  },
  "mustHaves": {
    "maxCommuteMins": 45,
    "requiredProgrammes": [],
    "requiredSubjectsLanguages": [],
    "requiredCCAs": [],
    "requiredDistinctive": []
  },
  "goodToHaves": {
    "rankedCriteria": ["commute", "programmes", "subjectsLanguages", "ccas", "distinctive"],
    "desiredProgrammes": [],
    "desiredSubjectsLanguages": [],
    "desiredCCAs": [],
    "desiredDistinctive": []
  }
}
```

If results exist, return:

* `noResults: false`
* ranked results
* commute info
* total score
* breakdown
* deterministic explanation object

If no results, return:

* `noResults: true`
* bottleneck
* suggestions
* patch payloads
* estimated unlocked counts

---

## Admin

All require role `ADMIN`.

### GET `/admin/reviews/flagged`

Returns:

* reported reviews
* report reasons
* user info
* enough data for moderation dashboard

### POST `/admin/reviews/:id/dismiss`

Behavior:

* dismiss/clear report(s)
* if appropriate, reset flagged state
* review remains visible publicly

### POST `/admin/reviews/:id/remove`

Behavior:

* set review status to `REMOVED`
* hide review from public school pages

### POST `/admin/users/:id/ban`

Behavior:

* mark user as banned
* banned user cannot log in to app successfully
* banned user cannot access protected routes/API
* choose one clean implementation for their reviews:

  * either hard delete all their reviews
  * or set all their reviews to `REMOVED`
* implement one and document it clearly

### POST `/admin/users/:id/promote`

Promote user to admin.

### POST `/admin/users/:id/demote`

Demote user from admin with basic guardrails.

---

# 12. Review / Moderation Rules

This section is authoritative.

## Review lifecycle

### When user posts review

* review appears immediately
* status = `VISIBLE`

### When another user reports review

* review stays visible
* report is stored
* moderation dashboard shows it as flagged/reported

### Admin actions

#### DISMISS

* clears/dismisses report
* review remains visible

#### REMOVE

* review becomes hidden publicly
* status = `REMOVED`

## Explicit rules

* no admin pre-approval before first visibility
* same user cannot report own review
* one user can create multiple reviews/comments for a school

---

# 13. Ban Rules

When admin bans a user:

* user must not be able to log in successfully anymore
* if they already have a valid token/session, protected API access must reject them
* frontend should handle the banned response cleanly and sign them out if needed

Implement ban checks at:

* login-related application flow
* protected backend middleware
* `/me` and other protected routes as needed

---

# 14. Recommendation Engine

Create pure module:
`apps/api/src/engine/ranking.ts`

## Pipeline

1. must-have feasibility filter
2. scoring by good-to-haves
3. ROC weights
4. final score
5. top 5
6. no-results bottleneck + suggestion path

## School object expected by engine

Each school should have:

* id
* name
* address
* postalCode
* lat
* lng
* programmes
* subjects
* ccas
* distinctive
* commute: `{ durationMins, transfers }`

## Must-haves

Strict AND logic inside each category:

* max commute
* required programmes
* required subjects/languages
* required CCAs
* required distinctive

A school must satisfy all selected must-haves.

## Good-to-haves

Ranked criteria:

* commute
* programmes
* subjectsLanguages
* ccas
* distinctive

Criteria used as must-haves should not also be scored as good-to-haves.

## ROC weights

For ranked criteria, convert ranking to ROC weights.
Weights must sum to 1.

## Scoring

### Set overlap score

If user selected desired items:
`score = |U ∩ S| / |U|`

If none selected:
`score = 0`

### Commute score

Use:

* `t_min = 10`
* `t_max = userMaxTime if present else 60`

Formula:

* linear decay
* transfer penalty
* clamp to 0..1

## Final score

`Total = Σ(weight_i * score_i)`

Return explanation:

* criterion
* score
* weight
* contribution
* top criteria
* matched items

---

# 15. No Results Logic

If must-have filtering returns 0:

* run bottleneck detection
* generate up to 3 relaxation suggestions

Suggestion types:

1. relax commute threshold
2. remove rare must-have item
3. minimally relax the most restrictive constraint

Return:

* bottleneck info
* patch payload
* estimated new count

---

# 16. Frontend Pages

## Landing page `/`

Must include:

* top nav with logo left, login/register right
* hero:

  * “Make confident school decisions”
  * short supporting paragraph
  * CTA(s)
* explanation section
* “100% real data” section
* footer

## Login `/login`

* centered card
* email/password
* normal user login
* after success:

  * normal users → `/app/search`
  * admins via this route → `/app/search`

## Register `/register`

* centered card
* name
* email
* password
* client-side Zod validation
* creates normal `STUDENT_PARENT` account only
* no public admin signup

## Admin Login `/admin-login`

* centered card
* email/password
* only actual admins allowed
* non-admin must see “User is not an admin”
* admins land on `/app/admin`

## Search `/app/search`

Main page with:

* title/subtitle
* search input
* location input
* preferences modal/button
* quick filters
* left: school list
* right: map
* workflow/help section below
* layout should be wider and more desktop-appropriate

## Saved `/app/saved`

Should feel like sibling of search page:

* similar layout
* left: saved schools list
* right: map
* pagination
* empty state if no saved schools

## School Profile `/app/schools/:id`

Tabs:

* Overview
* CCAs
* Programmes
* Subjects
* Commute
* Reviews

Include:

* save school button
* recommendation explanation
* visible reviews
* post review
* report review

## Admin `/app/admin`

Admin-only moderation dashboard:

* flagged reviews list
* report reasons
* actions:

  * dismiss
  * remove
  * ban user
  * promote/demote user if user-management view exists

---

# 17. Save Draft Preferences

Preferences draft should persist per user.

## Required behavior

If a user:

1. fills preferences
2. clicks save draft
3. logs out
4. logs back in

they should still see their own saved draft.

## Storage

Use DB-backed persistence via `preferences` table where practical.
Do not rely purely on transient component state.

---

# 18. Live / Reactive UI Expectations

Where practical:

* after posting review, review list should update
* after reporting review, moderation dashboard should reflect it
* after dismiss/remove moderation action, related lists/counts should update
* after save/unsave school, saved page/search state should update

Use TanStack Query invalidation/refetch or a similarly maintainable approach.

---

# 19. Project Structure

Mandatory:

```text
/apps/web
/apps/api
/packages/shared
/scripts
```

Use a production-structured but understandable layout.

---

# 20. Docker / Local Run

Must support local running with:

## Preferred

```bash
docker compose up --build
```

## Or local dev

```bash
pnpm install
pnpm dev
```

Provide exact steps in README.

Default: Docker Compose runs frontend + backend + local Postgres. 
Optional: Supabase DB mode runs frontend + backend only.

* `.env.example` must clearly explain required Supabase / OneMap keys

docker compose up --build starts frontend + backend + (optional) postgres

or docker compose -f docker-compose.supabase.yml up --build starts frontend + backend only

---

# 21. Tests

Provide:

* at least 5 unit tests for ranking engine
* at least 1 API integration test example

Focus on:

* ROC weights
* must-have filtering
* set overlap scoring
* commute score
* no-results bottleneck behavior

---

# 22. README Requirements

README must include:

* what Optima is
* tech stack
* setup steps
* env setup
* Supabase config steps
* data import steps
* how to run frontend/backend
* how admin role is assigned
* how to test

---

# 23. Relationship to Provided Diagrams

The code should follow the spirit and structure of the provided diagrams **as much as reasonably possible**.

The provided diagrams may be incomplete or imperfect, but use them as architectural guidance for:

* user flows
* system actors
* domain entities
* boundary/control/entity separation
* page/dialog flows

## Important rule

If a diagram conflicts with this master spec or is incomplete:

* follow this master spec for implementation
* but at the end, generate a **Diagram Alignment Summary** listing what should be changed or added in each diagram so the diagrams better match the final implemented system

---

# 24. Diagram Alignment Summary Required at End

After generating the code, include a final section:

## Diagram Alignment Summary

For each provided diagram:

1. what parts were followed directly
2. what parts were incomplete/inaccurate
3. what should be changed or added to align the diagram with the final implementation

Cover:

* Use case diagram
* Entity class diagram
* Boundary/control/entity diagram
* Initial dialog map

Examples of likely updates:

* add Saved Schools page/flow
* change review moderation from pre-approval to post-publication moderation
* allow multiple reviews/comments per user per school
* show admin login behavior more explicitly
* clarify banned user flow
* clarify role-based navbar behavior
* align entity names to actual Prisma models

---

# 25. Implementation Priorities

Follow this build order:

## Phase 0

* repo setup
* pnpm workspace
* tsconfig
* env examples
* Docker config
* shared package

## Phase 1

* Prisma schema
* auth/profile model
* school import pipeline
* admin seeding/role utility if needed

## Phase 2

* Supabase JWT verification middleware
* auto-create profile
* role middleware
* banned-user enforcement

## Phase 3

* schools list/details
* reviews create/list/report
* saved schools
* admin moderation endpoints

## Phase 4

* ranking engine
* commute integration/cache
* no-results suggestions
* tests

## Phase 5

* landing
* auth pages
* protected routes
* search page
* saved page
* school page
* admin page

## Phase 6

* polish
* loading/error states
* query invalidation/live refresh behavior
* README
* diagram alignment summary

---

# 26. Final Instruction

Generate the codebase so it is:

* complete
* consistent
* runnable
* aligned with this spec
* faithful to the provided diagrams where reasonable
* and accompanied by a final Diagram Alignment Summary if the diagrams need updates
