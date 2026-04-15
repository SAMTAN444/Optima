# Optima Recommendation Algorithm

This document describes exactly how school recommendations are scored and ranked.
It is derived line-for-line from `ranking.ts` and `recommendations.ts`.

---

## High-Level Overview

The `/recommendations` endpoint takes a user's home location, must-have constraints, and
ranked preferences, then returns a personalised shortlist of Singapore secondary schools.

The pipeline has two stages:

1. **Must-have filter** — eliminates schools that fail any hard constraint (AND logic within every category)
2. **ROC-weighted scoring** — scores the remaining schools across ranked preferences and sorts them

The result mode (`browse`, `filter`, or `recommendation`) determines how output is shaped
and whether the ranking engine runs at all.

---

## Result Modes

| Mode | When it applies | Ranking engine | Scores shown? |
|---|---|---|---|
| `browse` | No must-haves AND no ranked good-to-haves | Skipped | No |
| `filter` | Any must-have is set AND no ranked good-to-haves | Skipped | No — "Matches" badge only |
| `recommendation` | Any good-to-have criteria are ranked | ROC ranking runs | Yes — weighted ROC score |

The response always includes a `mode` field.

**Filter and browse** use `FilteredResponse`:
`{ mode, schools, candidateCount, pagination: { page, pageSize, totalCount, totalPages } }`.
Schools are sorted by commute ascending (null commutes last), then alphabetically.
All matching schools are returned, paginated (default 15 per page) — no top-N cut-off.

**Recommendation** uses `RecommendationResponse`:
`{ mode: 'recommendation', results, candidateCount }`.
No pagination — top 5 results only.

**Nearby search** sends `mustHaves: { maxCommuteMins: 30 }` with no ranked preferences,
which triggers **filter mode**. The user's entered postal code is held in ephemeral React
state (`activeNearbyPostal`) only — it is never written to the URL, localStorage, or the
user profile.

**CCA / Programme / IP quick filters** hit the `/schools` browse endpoint directly and
bypass the recommendation engine entirely.

---

## Input Structure

Every `/recommendations` request carries three top-level fields:

### `home`
The user's origin for commute calculation. One of:
- `postal`: 6-digit Singapore postal code (geocoded via OneMap)
- `lat` + `lng`: coordinates directly

A home location is required whenever `commute` is used as a must-have (`maxCommuteMins`)
or ranked as a good-to-have. If neither is provided, commute is skipped and schools with
no coordinates receive `commute: null`.

### `mustHaves`
Hard constraints. A school must satisfy **all** active must-haves or it is dropped entirely.

| Field | What it enforces |
|---|---|
| `maxCommuteMins` | Upper bound on travel time from home |
| `requiredProgrammes` | Every listed MOE programme must be offered |
| `requiredSubjectsLanguages` | Every listed subject or language must be offered |
| `requiredCCAs` | Every listed CCA must be offered |
| `requiredDistinctive` | Every listed distinctive programme must be offered |

At most **4 of the 5** must-have categories may be active in one request.

### `goodToHaves`
Ranked preferences used only in recommendation mode.

- `rankedCriteria`: ordered list of criteria the user cares about (e.g. `["commute", "ccas", "programmes"]`)
- Optional desired-item arrays for each criterion: `desiredCCAs`, `desiredProgrammes`, `desiredSubjectsLanguages`, `desiredDistinctive`

**Mutual exclusion rule**: a criterion cannot appear in both `mustHaves` and `goodToHaves.rankedCriteria`.
For example, if `requiredCCAs` is non-empty, `"ccas"` cannot be in `rankedCriteria`. This is enforced at the schema validation layer before the pipeline runs.

---

## Pipeline (Step by Step)

### Step 1 — Load schools
All secondary schools are fetched from the database. The query includes pure secondary schools
(`section LIKE '%SECONDARY%'`) and IP/mixed-level schools (`section LIKE 'MIXED LEVEL%'`),
along with their full CCA, programme, subject, and distinctive programme records.

### Step 2 — Non-commute must-have filter (cheap pass)
All must-have constraints **except** the commute limit are applied first. This reduces the
candidate set before any network calls are made. AND logic within every category: every item
in a required list must be present in the school.

### Step 3 — Commute computation
Commute times are computed **only for the schools that passed Step 2**. This avoids
unnecessary API calls for schools already ruled out.

For each school with coordinates, the system:
1. Checks the commute cache (PostgreSQL, 30-day TTL) for a stored result
2. If not cached, calls the OneMap routing API (max 10 concurrent requests)
3. If OneMap is unavailable or returns no route, falls back to a Haversine estimate:

```
distance_km = Haversine(home, school)
durationMins = max(5, round(distance_km × 4 + 5))
transfers    = distance_km > 3 ? 1 : 0
estimated    = true
```

Schools with no GPS coordinates remain with `commute: null` throughout.

### Step 4 — Commute must-have filter
If `maxCommuteMins` is set, schools whose **computed** commute exceeds the limit are dropped.
Schools with `commute: null` (missing coordinates) are **passed through** — they are not
dropped by the commute constraint, but they receive a commute score of 0 if the ranking
engine runs.

### Step 5 — Zero-results check
If no schools remain after Steps 2–4, bottleneck detection runs (see below) and the
endpoint returns a `noResults: true` response with relax suggestions. The ranking engine
does not run.

### Step 6 — Mode detection
The mode is determined from the request:
- If `goodToHaves.rankedCriteria.length > 0` → `recommendation`
- Else if any must-have field is non-empty → `filter`
- Otherwise → `browse`

### Step 7 — Filter / browse response (no ranking)
In `filter` or `browse` mode the ranking engine is skipped entirely. Feasible schools are:
- Sorted by commute ascending (null commutes sorted last), then alphabetically by name
- Paginated and returned as `FilteredResponse`

### Step 8 — Recommendation scoring and ranking
In `recommendation` mode:
1. ROC weights are computed from the ranked criteria list
2. Each feasible school is scored against every ranked criterion
3. A weighted total score is computed
4. Schools are sorted by total score descending
5. The top 5 are returned

---

## ROC Weights

ROC (Rank Order Centroid) weights convert the user's priority ranking into numeric weights
that sum to 1.0. The formula for the criterion at rank `r` out of `k` total ranked criteria is:

```
w_r = (1/k) × Σ_{j=r..k} (1/j)
```

Example for k = 3 (commute first, CCAs second, programmes third):

| Rank | Criterion | Weight |
|---|---|---|
| 1 | commute | (1/3)(1/1 + 1/2 + 1/3) = **0.611** |
| 2 | ccas | (1/3)(1/2 + 1/3) = **0.278** |
| 3 | programmes | (1/3)(1/3) = **0.111** |

The highest-ranked criterion always receives the largest share of the total score.

---

## Per-Criterion Scoring

### Commute score

```
tMax  = mustHaves.maxCommuteMins ?? 60   (default 60 if no commute must-have)
base  = 1 - (durationMins - 10) / (tMax - 10)
score = clamp(base - 0.05 × transfers, 0, 1)
```

- A commute of 10 minutes or less approaches a score of 1.0
- A commute at `tMax` approaches 0.0
- Each transfer deducts 0.05 from the score (floored at 0)
- A school with `commute: null` scores 0

### Set-overlap score (programmes, subjects/languages, CCAs, distinctive)

**When the user specifies desired items:**
```
score = |desired ∩ school_items| / |desired|
```
Example: user lists 5 desired subjects; school offers 2 of them → score = 2/5 = 0.40

**When the user ranks a criterion but specifies no desired items (richness fallback):**
```
maxCount = highest item count for this criterion across all feasible schools
score    = school_item_count / maxCount
```
Schools with more offerings rank higher relative to each other. This prevents a criterion
from being a dead weight when the user cares about it but did not pick specific items.

---

## Total Score and Final Ranking

```
totalScore = Σ (w_r × score_r)   for each ranked criterion r
```

- `totalScore` is always in [0, 1]
- Displayed in the UI as a percentage: `totalScore × 100` = **"Overall fit %"**
- Schools are sorted by `totalScore` descending; the top 5 are returned

### What "Overall fit %" means
It is a weighted sum of per-criterion scores. A score of 78% means the school's weighted
combination of all ranked criteria scored 78 out of 100. It is **not** "the school offers
78% of what you asked for" — the value depends on both match quality and the importance
weight assigned to each criterion.

### No ranked criteria (k = 0)
If the user provides no ranked criteria but the mode is still reached (edge case), schools
are sorted by commute ascending (null commutes last), then alphabetically. Total score is 0
for all; no breakdown is generated.

### Ties
Ties in `totalScore` are broken by the sort order of the JavaScript `.sort()` implementation
(stable in V8). In practice, ROC weights and continuous commute scores make exact ties rare.

---

## When 0 Results: Bottleneck Detection

If all schools are eliminated by the must-have filter, `detectBottleneck` runs to identify
which single constraint is most responsible and to suggest targeted relaxations.

### How the bottleneck is identified

Every active constraint is tested **in isolation** — as if it were the only constraint —
and the number of schools it would pass on its own is recorded:

- Each must-have set constraint (programmes, subjects, CCAs, distinctive) is tested alone
- The commute constraint is tested alone
- Each good-to-have desired group is also tested (a school counts if it has **at least one**
  matching desired item — these are informational only, not the cause of 0 results)

The constraint with the lowest isolation count is declared the bottleneck.

### Relax suggestions (up to 3)

| Suggestion | What it does |
|---|---|
| Relax commute | Raises `maxCommuteMins` by 15 minutes (capped at 120). Shown only if commute is a must-have. |
| Remove rarest item | Removes the single least-common item from the most restrictive set constraint. |
| Drop second constraint | Removes the entire second most restrictive set constraint. |

Each suggestion reports `newCount`: how many schools would match if **all other must-haves
are kept** and only that one change is applied. Suggestions with `newCount = 0` are omitted.
The final list is sorted by `newCount` descending (most helpful first), limited to 3 entries.

---

## Filtering vs Ranking — Key Distinction

| Aspect | Must-Have Filter | ROC Ranking |
|---|---|---|
| Logic | AND — all constraints must pass | Weighted sum — partial matches contribute |
| Effect | Binary pass/fail | Continuous score in [0, 1] |
| A school that fails | Eliminated entirely | Does not apply — already eliminated |
| Used in | All modes | Recommendation mode only |
| Result | Candidate set | Ordered shortlist (top 5) |

A criterion can be set as a must-have **or** as a ranked preference, but not both.
This is enforced at schema validation time.

---

## Key Assumptions and Implementation Notes

- **CCA field mapping**: `SchoolCCA.ccaGroup` holds the specific CCA name (e.g. "Basketball").
  `SchoolCCA.ccaName` is the broad category (e.g. "Physical Sports"). The ranking engine and
  all must-have/good-to-have matching uses `ccaGroup`.

- **Distinctive programme format**: stored and matched as `"domain::title"` strings
  (e.g. `"STEM::Aerospace Programme"`).

- **Commute cache TTL**: 30 days. Transit routes in Singapore are stable over months,
  so cached values are reused across sessions.

- **Estimated commutes**: when OneMap is unavailable, the Haversine fallback sets
  `estimated: true` on the commute object. The UI shows an indicator when a commute is
  estimated. Estimated commutes can still cause schools to fail a `maxCommuteMins` must-have.

- **No-origin behaviour**: if no home location is provided and commute is not used,
  schools are ranked without any commute component. Commute score is 0 for all; other
  criteria determine ranking.

- **Page / pageSize**: only used in `filter` and `browse` modes. In `recommendation` mode,
  pagination fields are ignored and always exactly 5 results are returned.
