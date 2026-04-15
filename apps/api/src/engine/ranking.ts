/**
 * Optima Ranking Engine
 *
 * Pipeline:
 * 1. Must-have filter (AND logic within each category)
 * 2. ROC weight computation
 * 3. Scoring per criterion
 * 4. Weighted sum → sort → top 5
 * 5. Bottleneck detection if 0 results
 */

export interface SchoolForRanking {
  id: string;
  name: string;
  address: string | null;
  postalCode: string | null;
  lat: number | null;
  lng: number | null;
  ccas: string[];
  programmes: string[];
  subjects: string[];
  /** Format: "domain::title" */
  distinctive: string[];
  /** estimated: true when value comes from Haversine fallback, not OneMap */
  commute: { durationMins: number; transfers: number; estimated?: boolean } | null;
}

export interface MustHaves {
  maxCommuteMins?: number;
  requiredProgrammes?: string[];
  requiredSubjectsLanguages?: string[];
  requiredCCAs?: string[];
  requiredDistinctive?: string[];
}

export type RankedCriterion =
  | 'commute'
  | 'programmes'
  | 'subjectsLanguages'
  | 'ccas'
  | 'distinctive';

export interface GoodToHaves {
  rankedCriteria: RankedCriterion[];
  desiredProgrammes?: string[];
  desiredSubjectsLanguages?: string[];
  desiredCCAs?: string[];
  desiredDistinctive?: string[];
}

export interface ScoreBreakdown {
  criterion: string;
  weight: number;
  score: number;
  contribution: number;
}

export interface RankedResult {
  school: SchoolForRanking;
  commute: { durationMins: number; transfers: number; estimated?: boolean };
  totalScore: number;
  breakdown: ScoreBreakdown[];
  explanation: {
    topCriteria: string[];
    matched: {
      programmes: string[];
      subjectsLanguages: string[];
      ccas: string[];
      distinctive: string[];
    };
  };
}

export interface RelaxSuggestion {
  label: string;
  patch: Partial<MustHaves>;
  newCount: number;
}

export interface NoResultsPayload {
  noResults: true;
  bottleneck: { type: string; details: string };
  suggestions: RelaxSuggestion[];
}

// ---------------------------------------------------------------------------
// ROC Weights: w_r = (1/k) * Σ_{j=r..k} (1/j)
// ---------------------------------------------------------------------------
export function computeRocWeights(k: number): number[] {
  if (k === 0) return [];
  const weights: number[] = [];
  for (let r = 1; r <= k; r++) {
    let sum = 0;
    for (let j = r; j <= k; j++) {
      sum += 1 / j;
    }
    weights.push(sum / k);
  }
  return weights;
}

// ---------------------------------------------------------------------------
// Commute score: linear decay + transfer penalty, clamped to [0,1]
// ---------------------------------------------------------------------------
export function commuteScore(durationMins: number, transfers: number, tMax: number): number {
  const tMin = 10;
  const base = 1 - (durationMins - tMin) / (tMax - tMin);
  const clamped = Math.max(0, Math.min(1, base));
  return Math.max(0, Math.min(1, clamped - 0.05 * transfers));
}

// ---------------------------------------------------------------------------
// Set overlap score: |U ∩ S| / |U|  (0 if desired is empty)
// ---------------------------------------------------------------------------
export function setOverlapScore(desired: string[], schoolItems: string[]): number {
  if (!desired || desired.length === 0) return 0;
  const matched = desired.filter((d) => schoolItems.includes(d));
  return matched.length / desired.length;
}

// ---------------------------------------------------------------------------
// Must-have filter — AND logic within every category
// ---------------------------------------------------------------------------
export function passesMustHaves(school: SchoolForRanking, mustHaves: MustHaves): boolean {
  const {
    maxCommuteMins,
    requiredProgrammes,
    requiredSubjectsLanguages,
    requiredCCAs,
    requiredDistinctive,
  } = mustHaves;

  // Commute constraint — only drop schools whose commute was computed AND exceeds the limit.
  // Schools with null commute (missing coordinates) are passed through; they get score 0.
  if (maxCommuteMins != null) {
    if (school.commute !== null && school.commute.durationMins > maxCommuteMins) return false;
  }

  // Programmes — AND: every required programme must be present
  if (requiredProgrammes && requiredProgrammes.length > 0) {
    if (!requiredProgrammes.every((p) => school.programmes.includes(p))) return false;
  }

  // Subjects / Languages — AND
  if (requiredSubjectsLanguages && requiredSubjectsLanguages.length > 0) {
    if (!requiredSubjectsLanguages.every((s) => school.subjects.includes(s))) return false;
  }

  // CCAs — AND
  if (requiredCCAs && requiredCCAs.length > 0) {
    if (!requiredCCAs.every((c) => school.ccas.includes(c))) return false;
  }

  // Distinctive — AND
  if (requiredDistinctive && requiredDistinctive.length > 0) {
    if (!requiredDistinctive.every((d) => school.distinctive.includes(d))) return false;
  }

  return true;
}

// Must-have filter ignoring commute (used before commute is computed)
export function passesNonCommuteMustHaves(
  school: SchoolForRanking,
  mustHaves: MustHaves
): boolean {
  return passesMustHaves(school, { ...mustHaves, maxCommuteMins: undefined });
}

// ---------------------------------------------------------------------------
// Full ranking pipeline
// ---------------------------------------------------------------------------
export function rankSchools(
  feasibleSchools: SchoolForRanking[],
  mustHaves: MustHaves,
  goodToHaves: GoodToHaves
): RankedResult[] {
  const {
    rankedCriteria,
    desiredProgrammes,
    desiredSubjectsLanguages,
    desiredCCAs,
    desiredDistinctive,
  } = goodToHaves;

  const k = rankedCriteria.length;

  // When no good-to-haves are ranked, sort by commute ASC (null last), then name ASC.
  if (k === 0) {
    return feasibleSchools
      .map((school) => ({
        school,
        commute: school.commute ?? { durationMins: 0, transfers: 0 },
        totalScore: 0,
        breakdown: [],
        explanation: {
          topCriteria: [] as string[],
          matched: { programmes: [], subjectsLanguages: [], ccas: [], distinctive: [] },
        },
      }))
      .sort((a, b) => {
        const aMin = a.school.commute?.durationMins ?? 9999;
        const bMin = b.school.commute?.durationMins ?? 9999;
        if (aMin !== bMin) return aMin - bMin;
        return a.school.name.localeCompare(b.school.name);
      });
  }

  const rocWeights = computeRocWeights(k);
  const tMax = mustHaves.maxCommuteMins ?? 60;

  // Pre-compute max item counts for richness fallback.
  // When a user ranks a criterion but specifies no desired items, we use
  // score = count(schoolItems) / maxCountAcrossCandidateSet so that schools
  // with richer offerings still differentiate from each other.
  const maxCCACount = Math.max(1, ...feasibleSchools.map((s) => s.ccas.length));
  const maxProgrammeCount = Math.max(1, ...feasibleSchools.map((s) => s.programmes.length));
  const maxSubjectCount = Math.max(1, ...feasibleSchools.map((s) => s.subjects.length));
  const maxDistinctiveCount = Math.max(1, ...feasibleSchools.map((s) => s.distinctive.length));

  // Score helper: overlap if desired items provided; richness fallback otherwise.
  function scoreSet(desired: string[] | undefined, schoolItems: string[], maxCount: number): number {
    if (!desired || desired.length === 0) {
      return maxCount > 0 ? schoolItems.length / maxCount : 0;
    }
    return setOverlapScore(desired, schoolItems);
  }

  const results: RankedResult[] = feasibleSchools.map((school) => {
    const breakdown: ScoreBreakdown[] = rankedCriteria.map((criterion, i) => {
      const weight = rocWeights[i];
      let score = 0;

      switch (criterion) {
        case 'commute':
          if (school.commute) {
            score = commuteScore(school.commute.durationMins, school.commute.transfers, tMax);
          }
          break;
        case 'programmes':
          score = scoreSet(desiredProgrammes, school.programmes, maxProgrammeCount);
          break;
        case 'subjectsLanguages':
          score = scoreSet(desiredSubjectsLanguages, school.subjects, maxSubjectCount);
          break;
        case 'ccas':
          score = scoreSet(desiredCCAs, school.ccas, maxCCACount);
          break;
        case 'distinctive':
          score = scoreSet(desiredDistinctive, school.distinctive, maxDistinctiveCount);
          break;
      }

      return { criterion, weight, score, contribution: weight * score };
    });

    const totalScore = breakdown.reduce((sum, b) => sum + b.contribution, 0);

    const sortedByContribution = [...breakdown].sort((a, b) => b.contribution - a.contribution);
    const topCriteria = sortedByContribution.slice(0, 2).map((b) => b.criterion);

    return {
      school,
      commute: school.commute ?? { durationMins: 0, transfers: 0 },
      totalScore,
      breakdown,
      explanation: {
        topCriteria,
        matched: {
          programmes: (desiredProgrammes ?? []).filter((p) => school.programmes.includes(p)),
          subjectsLanguages: (desiredSubjectsLanguages ?? []).filter((s) =>
            school.subjects.includes(s)
          ),
          ccas: (desiredCCAs ?? []).filter((c) => school.ccas.includes(c)),
          distinctive: (desiredDistinctive ?? []).filter((d) => school.distinctive.includes(d)),
        },
      },
    };
  });

  return results.sort((a, b) => b.totalScore - a.totalScore);
}

// ---------------------------------------------------------------------------
// Bottleneck detection — called when must-have filter yields 0 schools.
//
// Scans ALL constraints (must-have set items, commute, and good-to-have
// desired items) in isolation to find the most restrictive one.  The
// bottleneck is whichever constraint has the smallest per-isolation count.
// Suggestions focus on relaxing must-have constraints (the only ones that
// actually caused 0 results).
// ---------------------------------------------------------------------------
type SetConstraintKey =
  | 'requiredProgrammes'
  | 'requiredSubjectsLanguages'
  | 'requiredCCAs'
  | 'requiredDistinctive';

function getSchoolItemsForConstraint(
  school: SchoolForRanking,
  constraintKey: SetConstraintKey
): string[] {
  switch (constraintKey) {
    case 'requiredProgrammes':       return school.programmes;
    case 'requiredSubjectsLanguages': return school.subjects;
    case 'requiredCCAs':             return school.ccas;
    case 'requiredDistinctive':      return school.distinctive;
  }
}

export function detectBottleneck(
  allSchools: SchoolForRanking[],
  mustHaves: MustHaves,
  goodToHaves?: GoodToHaves
): NoResultsPayload {
  const suggestions: RelaxSuggestion[] = [];

  const SET_CONSTRAINT_DEFS: { key: SetConstraintKey; label: string }[] = [
    { key: 'requiredProgrammes',       label: 'Programmes' },
    { key: 'requiredSubjectsLanguages', label: 'Subjects/Languages' },
    { key: 'requiredCCAs',             label: 'CCAs' },
    { key: 'requiredDistinctive',      label: 'Distinctive Programmes' },
  ];

  // ── Must-have SET constraint isolation counts ──────────────────────────────
  // Each constraint is tested in isolation: how many schools pass it alone?
  const setIsolationCounts: {
    key: SetConstraintKey;
    label: string;
    count: number;
    items: string[];
  }[] = [];

  for (const { key, label } of SET_CONSTRAINT_DEFS) {
    const items = mustHaves[key] as string[] | undefined;
    if (!items || items.length === 0) continue;
    const count = allSchools.filter((s) =>
      passesMustHaves(s, { [key]: items } as MustHaves)
    ).length;
    setIsolationCounts.push({ key, label, count, items });
  }

  // Sort ascending so index 0 = most restrictive set constraint
  setIsolationCounts.sort((a, b) => a.count - b.count);

  // ── Commute isolation count ────────────────────────────────────────────────
  // Count schools whose computed commute time satisfies the limit in isolation.
  const commuteIsolationCount: number | null =
    mustHaves.maxCommuteMins != null
      ? allSchools.filter(
          (s) => s.commute !== null && s.commute.durationMins <= mustHaves.maxCommuteMins!
        ).length
      : null;

  // ── Good-to-have desired items isolation counts ────────────────────────────
  // For each good-to-have desired group, count schools that have ≥1 matching
  // item.  These are soft criteria but help identify unusually rare preferences.
  interface GthCount { label: string; count: number }
  const gthIsolationCounts: GthCount[] = [];

  if (goodToHaves) {
    const fields: {
      label: string;
      items?: string[];
      field: 'ccas' | 'programmes' | 'subjects' | 'distinctive';
    }[] = [
      { label: 'Desired CCAs',                 items: goodToHaves.desiredCCAs,                 field: 'ccas' },
      { label: 'Desired Programmes',           items: goodToHaves.desiredProgrammes,           field: 'programmes' },
      { label: 'Desired Subjects/Languages',   items: goodToHaves.desiredSubjectsLanguages,   field: 'subjects' },
      { label: 'Desired Distinctive Programmes', items: goodToHaves.desiredDistinctive,        field: 'distinctive' },
    ];
    for (const { label, items, field } of fields) {
      if (items && items.length > 0) {
        const count = allSchools.filter((s) =>
          items.some((item) => (s[field] as string[]).includes(item))
        ).length;
        gthIsolationCounts.push({ label, count });
      }
    }
  }

  // ── Unified constraint list: pick true bottleneck (minimum count) ──────────
  // Combines must-have set constraints + commute + good-to-have desired items.
  const allConstraintCounts: { label: string; count: number }[] = [
    ...setIsolationCounts.map(({ label, count }) => ({ label, count })),
    ...(commuteIsolationCount != null
      ? [{ label: 'Commute', count: commuteIsolationCount }]
      : []),
    ...gthIsolationCounts,
  ];
  allConstraintCounts.sort((a, b) => a.count - b.count);

  const overallBottleneck = allConstraintCounts[0];

  // ── Suggestions (relax must-have constraints) ──────────────────────────────

  // Suggestion 1: Relax commute threshold
  // newCount = schools passing ALL current must-haves with ONLY commute limit raised.
  if (mustHaves.maxCommuteMins != null) {
    const newMax = Math.min(mustHaves.maxCommuteMins + 15, 120);
    const newCount = allSchools.filter((s) =>
      passesMustHaves(s, { ...mustHaves, maxCommuteMins: newMax })
    ).length;
    if (newCount > 0) {
      suggestions.push({
        label: `Increase max commute from ${mustHaves.maxCommuteMins} to ${newMax} minutes`,
        patch: { maxCommuteMins: newMax },
        newCount,
      });
    }
  }

  // Suggestion 2: Remove least-frequent item from most restrictive set constraint.
  // newCount = schools passing ALL current must-haves with that one item removed.
  if (setIsolationCounts.length > 0) {
    const mostRestrictive = setIsolationCounts[0];
    const { key, items } = mostRestrictive;

    const freq = items.map((item) => ({
      item,
      count: allSchools.filter((s) => getSchoolItemsForConstraint(s, key).includes(item)).length,
    }));
    freq.sort((a, b) => a.count - b.count);
    const leastFrequent = freq[0];

    if (leastFrequent) {
      const newItems = items.filter((i) => i !== leastFrequent.item);
      const patch: Partial<MustHaves> = { [key]: newItems };
      // Keep ALL other must-haves (including commute) — only this one item is removed.
      const newCount = allSchools.filter((s) =>
        passesMustHaves(s, { ...mustHaves, ...patch })
      ).length;
      if (newCount > 0) {
        suggestions.push({
          label: `Remove "${leastFrequent.item}" from required ${mostRestrictive.label}`,
          patch,
          newCount,
        });
      }
    }
  }

  // Suggestion 3: Drop the second most restrictive set constraint entirely.
  // newCount = schools passing ALL current must-haves with that whole constraint cleared.
  if (setIsolationCounts.length > 1) {
    const second = setIsolationCounts[1];
    const patch: Partial<MustHaves> = { [second.key]: [] };
    // Keep ALL other must-haves (including commute) — only this constraint is removed.
    const newCount = allSchools.filter((s) =>
      passesMustHaves(s, { ...mustHaves, ...patch })
    ).length;
    if (newCount > 0) {
      suggestions.push({
        label: `Remove all required ${second.label} constraints`,
        patch,
        newCount,
      });
    }
  }

  // Sort by descending impact so the most helpful suggestion appears first.
  suggestions.sort((a, b) => b.newCount - a.newCount);

  const bottleneckLabel = overallBottleneck?.label ?? 'unknown';
  const bottleneckCount = overallBottleneck?.count ?? 0;

  return {
    noResults: true,
    bottleneck: {
      type: bottleneckLabel,
      details: `"${bottleneckLabel}" is the most restrictive requirement (matches ${bottleneckCount} school${bottleneckCount !== 1 ? 's' : ''} on its own)`,
    },
    suggestions: suggestions.slice(0, 3),
  };
}
