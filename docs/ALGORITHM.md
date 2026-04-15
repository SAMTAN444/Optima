# Optima Ranking Algorithm

Source: `apps/api/src/engine/ranking.ts`, `apps/api/src/routes/recommendations.ts`, `packages/shared/src/schemas.ts`

---

## Overview

The system exposes three separate data-access patterns, each with its own endpoint:

| Pattern | Endpoint | Purpose |
|---|---|---|
| Browse / search | `GET /schools` | Directory listing — secondary schools, filters, pagination |
| Nearby schools | `GET /schools/nearby` | Schools reachable within a time budget, sorted by commute |
| Ranked shortlist | `POST /recommendations` | Must-have filtering + optional ROC-weighted scoring |

---

## A. Browse / Search — GET /schools

Returns secondary schools only (always filtered to `section = SECONDARY`).

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `q` | string | — | Name search (case-insensitive partial match) |
| `cca` | string \| string[] | — | Filter by specific CCA name (matches `ccaGroup`, e.g. `"BASKETBALL"`) |
| `programme` | string \| string[] | — | Filter by programme name |
| `subject` | string \| string[] | — | Filter by subject name |
| `ip` | `"ip"` \| `"olevel"` | — | `"ip"` = IP/mixed-level schools only; `"olevel"` = O-Level (non-IP) schools only |
| `page` | number | 1 | 1-indexed page |
| `pageSize` | number | 20 | Results per page (max 500) |

**Important:** CCA filtering uses `ccaGroup` (specific CCA name, e.g. `"BASKETBALL"`), not `ccaName` (broad category, e.g. `"PHYSICAL SPORTS"`).

---

## B. Nearby Schools — GET /schools/nearby

Returns secondary schools reachable within a commute time budget, sorted ascending by travel time.

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `postal` | string | — | 6-digit Singapore postal code (geocoded via OneMap) |
| `lat` + `lng` | number | — | Coordinates (alternative to postal) |
| `maxMins` | number | 30 | Maximum commute time in minutes |
| `page` | number | 1 | Page |
| `pageSize` | number | 20 | Results per page (max 50) |

**Commute fallback:** If OneMap is unavailable for a school, a Haversine-based estimate is used instead. Schools with estimated commute data are marked `commute.estimated: true` in the response. The endpoint never returns 0 schools solely because OneMap timed out.

**Example response:**
```json
{
  "ok": true,
  "data": {
    "schools": [
      {
        "id": "abc123",
        "name": "Raffles Institution",
        "address": "1 Raffles Institution Lane",
        "postalCode": "575954",
        "lat": 1.3399,
        "lng": 103.8421,
        "commute": {
          "durationMins": 18,
          "transfers": 1,
          "estimated": false
        }
      }
    ],
    "pagination": { "total": 45, "page": 1, "pageSize": 20, "totalPages": 3 }
  }
}
```

---

## C. Ranked Shortlist — POST /recommendations

### Request Schema

```typescript
{
  home: {
    postal?: string,   // 6-digit Singapore postal code
    lat?: number,
    lng?: number,
  },
  mustHaves: {
    maxCommuteMins?: number,
    requiredProgrammes?: string[],
    requiredSubjectsLanguages?: string[],
    requiredCCAs?: string[],
    requiredDistinctive?: string[],
  },
  goodToHaves: {
    rankedCriteria: Array<'commute'|'programmes'|'subjectsLanguages'|'ccas'|'distinctive'>,
    desiredProgrammes?: string[],
    desiredSubjectsLanguages?: string[],
    desiredCCAs?: string[],
    desiredDistinctive?: string[],
  },
  page?: number,      // default 1, used only in browse/filter mode
  pageSize?: number,  // default 15, max 200, used only in browse/filter mode
}
```

### Result Mode Detection

The endpoint detects one of three result modes from the request before executing the pipeline:

| Mode | Condition | Behaviour |
|---|---|---|
| `recommendation` | `rankedCriteria.length > 0` | Full scoring pipeline → ranked top-5 results |
| `filter` | `rankedCriteria` is empty AND at least one must-have is set | Must-have filter only → paginated list sorted by commute |
| `browse` | `rankedCriteria` is empty AND no must-haves | No filtering → all secondary schools paginated, sorted by commute |

> **Note:** An empty `rankedCriteria` array is valid and selects browse or filter mode. It is not a validation error.

The mode value is returned in every response as `data.mode`.

---

### Must-have vs Good-to-have Separation (No Double Counting)

**A criterion set as a must-have cannot also appear in `goodToHaves.rankedCriteria`.** The schema rejects this with a 400.

| Active must-have | Blocked ranked criterion |
|---|---|
| `maxCommuteMins` (set) | `commute` |
| `requiredCCAs` (non-empty) | `ccas` |
| `requiredProgrammes` (non-empty) | `programmes` |
| `requiredSubjectsLanguages` (non-empty) | `subjectsLanguages` |
| `requiredDistinctive` (non-empty) | `distinctive` |

---

### Validation Rules

| Rule | Error path |
|---|---|
| At most 4 must-have categories may be active simultaneously | `mustHaves` |
| A criterion active as must-have cannot also be ranked | `goodToHaves.rankedCriteria` |
| Using commute (as must-have **or** as a ranked criterion) requires a home location (`postal` or `lat`+`lng`) | `home` |

Home location is also resolved from the authenticated user's saved profile (`UserProfile.homeLat/homeLng`) when no coordinates or postal are provided in the request body.

---

### Stage 1 — Non-Commute Must-Have Filtering

Non-commute must-haves are applied first as a cheap pre-filter before any IO.

| Category | Field | Logic |
|---|---|---|
| Required CCAs | `requiredCCAs` | ALL required CCAs must be present (AND) |
| Required Programmes | `requiredProgrammes` | ALL required programmes must be present (AND) |
| Required Subjects/Languages | `requiredSubjectsLanguages` | ALL required subjects/languages must be present (AND) |
| Required Distinctive Programmes | `requiredDistinctive` | ALL required items must be present (AND) |

Implemented in `passesNonCommuteMustHaves`, which calls `passesMustHaves` with `maxCommuteMins` forced to `undefined`.

---

### Stage 2 — Commute Computation

OneMap routing is computed in batch for all schools that survived Stage 1 and have valid coordinates. Up to 10 concurrent OneMap requests are made. Results are cached in the database to avoid redundant API calls.

For any school where OneMap returns no result, `estimateCommute` is used as a fallback:

```
estimate: 4 min/km + 5 min base
transfers: 1 if distance > 3 km, else 0
```

Schools with no coordinates at all have `commute: null` and are passed through to Stage 3 (they receive a commute score of 0 if commute is ranked).

---

### Stage 3 — Commute Must-Have Filter

```typescript
// passesMustHaves — commute branch
if (maxCommuteMins != null) {
  if (school.commute !== null && school.commute.durationMins > maxCommuteMins) return false;
}
```

Schools whose commute was computed AND exceeds the limit are excluded. Schools with `commute: null` pass through.

After Stage 3, the remaining set is called the **feasible set** (`feasible`).

---

### Stage 4 — Response by Mode

#### Browse / Filter mode (`rankedCriteria` is empty)

The feasible set is sorted by commute ascending (null last), then name ascending, then paginated.

```json
{
  "ok": true,
  "data": {
    "noResults": false,
    "mode": "filter",
    "candidateCount": 42,
    "pagination": { "page": 1, "pageSize": 15, "totalCount": 42, "totalPages": 3 },
    "schools": [
      {
        "school": { "id": "...", "name": "...", "address": "...", "postalCode": "...", "lat": 1.3, "lng": 103.8 },
        "commute": { "durationMins": 14, "transfers": 0 }
      }
    ]
  }
}
```

#### Recommendation mode (`rankedCriteria` is non-empty)

Proceeds to Stage 5 (ROC weighting + scoring). Returns ranked top-5 results.

---

### Stage 5 — ROC Weight Computation

Weights are assigned to the ranked criteria using the **Rank-Order Centroid (ROC)** formula. For `k` ranked criteria, the weight at rank `r` is:

```
w_r = (1/k) × Σ_{j=r}^{k} (1/j)
```

Properties:
- Strictly descending: `w_1 > w_2 > ... > w_k`
- Weights sum to exactly 1
- Example for k=2: `w_1 = 0.75`, `w_2 = 0.25`
- Example for k=3: `w_1 ≈ 0.611`, `w_2 ≈ 0.278`, `w_3 ≈ 0.111`

---

### Stage 6 — Per-Criterion Scoring

#### Commute score

Applied when `commute` is a ranked criterion.

```
tMin  = 10
tMax  = mustHaves.maxCommuteMins  (if set)  else  60
base  = 1 − (durationMins − tMin) / (tMax − tMin)
score = clamp(clamp(base, 0, 1) − 0.05 × transfers, 0, 1)
```

- Schools with `commute: null` receive score `0`.
- `tMax` defaults to 60 if no commute must-have is set.
- Each transfer subtracts 0.05 from the score, applied after clamping the base decay.

#### Set overlap score (CCAs, programmes, subjects/languages, distinctive programmes)

**When the user has specified desired items:**

```
score = |desired ∩ school| / |desired|
```

**Richness fallback — when the user has ranked a criterion but specified no desired items:**

```
score = count(schoolItems) / max(count across feasible set)
```

The max is computed across the feasible set only, so richness is always relative to the actual candidates being compared. This ensures schools with more offerings are still differentiated even when no specific preferences are stated.

**Distinctive programmes** are stored internally as `"domain::title"` strings. Matching is exact string comparison against this format.

---

### Stage 7 — Final Score, Sort, and Explanation

```
totalScore = Σ_i (weight_i × score_i)    over all ranked criteria
```

Schools are sorted descending by `totalScore`. The top 5 are returned.

The `explanation` field in each result contains:
- `topCriteria` — the 2 criteria with highest contribution (`weight × score`) for that school
- `matched` — items from each desired list that the school actually has

**Recommendation mode success response:**
```json
{
  "ok": true,
  "data": {
    "noResults": false,
    "mode": "recommendation",
    "candidateCount": 87,
    "results": [
      {
        "school": { "id": "...", "name": "..." },
        "commute": { "durationMins": 22, "transfers": 1, "estimated": false },
        "totalScore": 0.83,
        "breakdown": [
          { "criterion": "ccas", "weight": 0.75, "score": 1.0, "contribution": 0.75 },
          { "criterion": "commute", "weight": 0.25, "score": 0.32, "contribution": 0.08 }
        ],
        "explanation": {
          "topCriteria": ["ccas", "commute"],
          "matched": {
            "programmes": [],
            "subjectsLanguages": [],
            "ccas": ["BASKETBALL"],
            "distinctive": []
          }
        }
      }
    ]
  }
}
```

`candidateCount` — number of schools remaining after all must-have filtering (before scoring and top-5 truncation).

---

### Stage 8 — No-results Bottleneck Detection

Triggered when the feasible set is empty (all must-have filters yield 0 candidates).

**Input set:** `schoolsWithCommute` — schools that passed the non-commute must-have filter (Stage 1) and have had commute computed (Stage 2). If no non-commute must-haves are active, this equals the full secondary school corpus. If they are active, only the pre-filtered subset is analysed.

#### Bottleneck identification

For each active constraint, an **isolation count** is computed — how many schools in the input set pass that one constraint if tested alone:

| Constraint type | Isolation count definition |
|---|---|
| Must-have set constraint (CCAs, Programmes, etc.) | Schools where ALL required items of that constraint are present, tested with no other constraints active |
| Commute must-have | Schools where `commute.durationMins ≤ maxCommuteMins` (schools with `commute: null` excluded) |
| Good-to-have desired items | Schools that contain at least 1 item from the desired list (OR, not AND) — included for informational context only |

All isolation counts are combined and sorted ascending. The bottleneck is the constraint with the **smallest** isolation count.

The `details` string in the response uses the format:

```
"${bottleneckLabel}" is the most restrictive requirement (matches ${bottleneckCount} school(s) on its own)
```

#### Relaxation suggestions

Up to 3 suggestions are generated, targeting must-have constraints only. Each suggestion's `newCount` is the number of schools that would pass **all current must-haves** if only that one change were applied — every other constraint remains unchanged. Suggestions where `newCount === 0` are suppressed. The returned suggestions are sorted by `newCount` descending (highest impact first).

| Suggestion | Condition | Change applied |
|---|---|---|
| 1. Increase commute limit | `maxCommuteMins` is set | Raises `maxCommuteMins` by 15 mins, capped at 120. `newCount` = `passesMustHaves(s, { ...mustHaves, maxCommuteMins: newMax })` |
| 2. Remove rarest item | At least one set must-have is active | Removes the item with the lowest occurrence count from the most restrictive set constraint. `newCount` = `passesMustHaves(s, { ...mustHaves, [key]: itemsMinusRarest })` |
| 3. Drop second constraint | At least two set must-haves are active | Clears all items from the second most restrictive set constraint. `newCount` = `passesMustHaves(s, { ...mustHaves, [key]: [] })` |

**No-results response:**
```json
{
  "ok": true,
  "data": {
    "noResults": true,
    "mode": "recommendation",
    "bottleneck": {
      "type": "CCAs",
      "details": "\"CCAs\" is the most restrictive requirement (matches 3 schools on its own)"
    },
    "suggestions": [
      {
        "label": "Remove \"Water Polo\" from required CCAs",
        "patch": { "requiredCCAs": ["Basketball"] },
        "newCount": 42
      },
      {
        "label": "Remove all required Programmes constraints",
        "patch": { "requiredProgrammes": [] },
        "newCount": 18
      }
    ]
  }
}
```

---

## Validation Error Response

HTTP 400 when `RecommendationRequestSchema` fails:

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body",
    "details": {
      "home": ["Home postal code is required when using commute as a criterion."]
    }
  }
}
```

---

## Notes / Deviations from CLAUDE.md Spec

| Area | CLAUDE.md / spec | Actual implementation |
|---|---|---|
| **Review default status** | "Reviews APPROVED by default" | ✅ Matches — `ReviewStatus @default(APPROVED)` in schema |
| **Commute relaxation** | "+15 mins" | ✅ Matches — `maxCommuteMins + 15`, capped at 120 |
| **Must-have minimum** | "must-haves are optional (can be empty)" | ✅ Matches — `mustHaves: {}` is valid |
| **`rankedCriteria` minimum** | "≥ 1 entry required" | ⚠️ Schema has no `.min(1)`. An empty array is valid and selects browse/filter mode rather than returning a validation error. |
| **Bottleneck scope** | "full school corpus" implied | ⚠️ Actual: `schoolsWithCommute` (post non-commute filter). If no non-commute must-haves are active, this equals all secondary schools. If they are, only the filtered subset is analysed. |
| **Relaxation `newCount`** | Previously: count with commute dropped from filter | ✅ Fixed — each `newCount` is computed with **all current must-haves preserved**, only the patched field changed. Zero-improvement suggestions are suppressed. |
| **SUPABASE_JWT_SECRET** | Listed in env setup guides | ⚠️ The variable appears in `.env.example` but is **not read by `auth.ts`**. JWT verification uses the remote JWKS endpoint at `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`. The secret is not needed. |
| **Admin creation** | "Manual SQL promotion" described | ⚠️ `POST /bootstrap-admin` (frontend: `/setup` page) is the primary self-service method for the first admin. The Admin UI's promote button and manual SQL are secondary options. |
| **`nearby` endpoint path** | Described as separate from recommendations | ✅ Implemented as `GET /schools/nearby` |
| **`candidateCount` field** | In success response | ✅ Present in both `recommendation` and `filter`/`browse` success responses. Absent from `noResults` responses. |
| **CCA column naming** | `ccaGroup` = specific name | ✅ Matches — `SchoolCCA.ccaGroup` holds the specific CCA name (e.g. `"BASKETBALL"`); `ccaName` holds the broad category (e.g. `"PHYSICAL SPORTS"`). The `/schools` filter and recommendation engine both use `ccaGroup`. |
| **UserProfile role enum** | `ADMIN` / user roles | ✅ Enum values: `STUDENT_PARENT`, `ADMIN` |
| **Review status enum** | `PENDING / APPROVED / REJECTED` | ✅ All three exist in schema; new reviews default to `APPROVED` |
| **Ban side effects** | Ban removes content | ✅ `POST /admin/users/:id/ban` deletes the user's reviews, the reports on those reviews, and reports filed by the user before setting `banned: true` |

---

## Running Tests

```bash
cd apps/api
pnpm test          # run once
pnpm test:watch    # watch mode
```

Test files:
- `apps/api/src/engine/__tests__/ranking.test.ts` — unit tests for the ranking engine
- `apps/api/src/routes/__tests__/http.test.ts` — HTTP integration tests (supertest)

Test coverage:
- `computeRocWeights` — formula correctness, sum-to-1, descending order
- `commuteScore` — decay, transfer penalty, clamping
- `setOverlapScore` — empty/partial/full match
- `passesMustHaves` — AND logic, multi-constraint, null-commute passthrough
- `rankSchools` — sorted output, breakdown, weight sum, relative ranking
- **Richness fallback** — school with more offerings ranks higher when no desired items specified
- `detectBottleneck` — `noResults` flag, suggestions, bottleneck minimum-count selection
- **Relaxation suggestion correctness** — `newCount` computed with all other must-haves preserved; commute not dropped from set-constraint counts; zero-improvement suggestions suppressed; suggestions sorted by `newCount` descending
- Must-have hard filtering — strict exclusion, 3–4 simultaneous must-haves
- ROC weights scoped to good-to-haves only
- `RecommendationRequestSchema` validation — 0 must-haves valid, double-count rejection, commute-requires-home, boundary cases
- HTTP integration — `/health`, `/schools`, `/schools/meta`, `/schools/nearby`, `/recommendations`
