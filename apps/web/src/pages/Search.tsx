import { useState, useCallback, useRef, useEffect, Fragment } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useMutation, useQuery } from '@tanstack/react-query';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import {
  Search as SearchIcon, SlidersHorizontal, X, MapPin,
  ChevronLeft, ChevronRight, Save, AlertCircle, RefreshCw,
  GraduationCap, Dumbbell, Music, Code2, Users, CheckCircle2,
  BookMarked, Trophy, Star,
} from 'lucide-react';
import { getRecommendations, getSchools, getSchoolsMeta } from '../lib/api';
import type {
  MustHaves,
  GoodToHaves,
  RankedCriterion,
  RecommendationResult,
  FilteredSchool,
  RelaxSuggestion,
  RecommendationRequest,
  CcaGroup,
} from '@optima/shared';
import { Navbar } from '../components/Navbar';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { MultiSelect } from '../components/MultiSelect';
import { RankList } from '../components/RankList';
import { SchoolCardSkeleton } from '../components/LoadingSkeleton';
import { Input } from '../components/Input';
import { MapFocusModal, ExpandMapButton } from '../components/MapFocusModal';

// ── Saved preferences helpers ──────────────────────────────────────────────
const PREFS_KEY = 'optima-prefs';

function prefsKeyForUser(userId?: string) {
  return userId ? `optima-prefs-${userId}` : PREFS_KEY;
}

function loadSavedPrefs(key: string = PREFS_KEY): PreferencesState | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as PreferencesState;
  } catch {}
  return null;
}

function savePrefs(prefs: PreferencesState, key: string = PREFS_KEY) {
  try { localStorage.setItem(key, JSON.stringify(prefs)); } catch {}
}

function clearSavedPrefs(key: string = PREFS_KEY) {
  localStorage.removeItem(key);
}

// ── Types ──────────────────────────────────────────────────────────────────
interface PreferencesState {
  mustHaves: MustHaves;
  goodToHaves: GoodToHaves;
  home: { postal: string; lat?: number; lng?: number };
}

const DEFAULT_PREFS: PreferencesState = {
  home: { postal: '' },
  mustHaves: {},
  goodToHaves: { rankedCriteria: [] },
};

const ALL_CRITERIA: RankedCriterion[] = ['commute', 'programmes', 'subjectsLanguages', 'ccas', 'distinctive'];
const CRITERION_LABELS: Record<RankedCriterion, string> = {
  commute: 'Commute Time',
  programmes: 'Programmes',
  subjectsLanguages: 'Subjects & Languages',
  ccas: 'CCAs',
  distinctive: 'Distinctive Programmes',
};

// CCA quick filters — route through browse API (returns ALL matching schools)
const CCA_QUICK_FILTERS = [
  { label: 'Basketball',      icon: Dumbbell,  ccas: ['BASKETBALL'] },
  { label: 'Football',        icon: Dumbbell,  ccas: ['FOOTBALL'] },
  { label: 'Choir',           icon: Music,     ccas: ['CHOIR'] },
  { label: 'Robotics',        icon: Code2,     ccas: ['ROBOTICS'] },
  { label: 'Swimming',        icon: Dumbbell,  ccas: ['SWIMMING'] },
  { label: 'Scouts / Guides', icon: Users,     ccas: ['BOYS BRIGADE', 'GIRL GUIDES'] },
] as const;

// 6 most recognisable MOE programme quick filters
const PROGRAMME_QUICK_FILTERS = [
  'Art Elective Programme',
  'Music Elective Programme',
  'Enhanced Art Programme',
  'Enhanced Music Programme',
  'Bicultural Studies Programme',
  'Engineering and Tech Programme and Scholarship',
] as const;

// IP track quick filter (uses ?ip= browse param, NOT recommendations)
const IP_QUICK_FILTERS = [
  { label: 'IP Schools', value: 'ip' as const, desc: 'Integrated Programme (through JC)' },
] as const;

const PAGE_SIZE = 15;
const DEFAULT_CENTER: [number, number] = [1.3521, 103.8198];

// ── URL ↔ prefs serialisation ──────────────────────────────────────────────
const SCROLL_KEY = 'optima-scroll';

function encodePrefs(prefs: PreferencesState): string {
  try { return btoa(encodeURIComponent(JSON.stringify(prefs))); } catch { return ''; }
}

function decodePrefs(encoded: string | null): PreferencesState | null {
  if (!encoded) return null;
  try { return JSON.parse(decodeURIComponent(atob(encoded))) as PreferencesState; } catch { return null; }
}

// ── Main Search Page ───────────────────────────────────────────────────────
export function Search() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [prefOpen, setPrefOpen] = useState(false);
  const [showNearbyInput, setShowNearbyInput] = useState(false);
  const nearbyInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ── Read state from URL (source of truth) ─────────────────────────────
  const urlMode   = searchParams.get('mode'); // null | 'recs' | 'nearby'
  const urlQ      = searchParams.get('q') ?? '';
  const urlPage   = parseInt(searchParams.get('page') ?? '1', 10);
  const urlPrefs  = decodePrefs(searchParams.get('prefs'));
  // Quick-filter params — these use the browse API (no recommendation engine)
  const urlQfCca  = searchParams.get('qf_cca');  // comma-separated CCAs e.g. "BOYS BRIGADE,GIRL GUIDES"
  const urlQfProg = searchParams.get('qf_prog'); // programme name
  // qf_ip stores the selected IP pathway toggle, e.g. "ip" or absent
  const urlQfIpRaw = searchParams.get('qf_ip') ?? '';
  const urlQfIpSet = new Set(
    urlQfIpRaw.split(',').filter((v): v is 'ip' => v === 'ip')
  );
  const urlQfIpParam: 'ip' | null = urlQfIpSet.has('ip') ? 'ip' : null;
  // Stable string key for query cache
  const urlQfIpKey = [...urlQfIpSet].sort().join(',');

  // hasSearched is derived: true whenever a recommendation mode is active in the URL
  const hasSearched = urlMode !== null;

  // ── Local mirror state (kept in sync with URL) ─────────────────────────
  const [keyword, setKeyword] = useState(urlQ);
  const [browsePage, setBrowsePage] = useState(urlPage);
  const [prefs, setPrefs] = useState<PreferencesState>(
    urlPrefs ?? loadSavedPrefs() ?? DEFAULT_PREFS
  );
  const [nearbyPostal, setNearbyPostal] = useState('');
  // Ephemeral: postal used for the CURRENT nearby session. Never written to prefs/localStorage/URL.
  // Cleared when user clears the search or starts a different mode.
  const [activeNearbyPostal, setActiveNearbyPostal] = useState('');
  const [focusOpen, setFocusOpen] = useState(false);
  // Pagination for filter/browse results returned by /recommendations
  const [recPage, setRecPage] = useState(1);

  // Sync local state when URL changes (browser back / forward).
  // Nearby mode uses no prefs in URL — skip the prefs sync for it.
  useEffect(() => {
    setKeyword(urlQ);
    setBrowsePage(urlPage);
    if (urlPrefs && urlMode !== 'nearby') setPrefs(urlPrefs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const userPrefsKey = prefsKeyForUser(user?.id);

  useEffect(() => {
    // Only load user-specific saved prefs when NOT in an active filter mode
    if (!urlMode) {
      const saved = loadSavedPrefs(userPrefsKey);
      if (saved) setPrefs(saved);
    }
  }, [userPrefsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: metaResp } = useQuery({
    queryKey: ['schools-meta'],
    queryFn: getSchoolsMeta,
    staleTime: Infinity,
  });
  const meta = metaResp?.ok
    ? metaResp.data
    : { ccas: [], ccasGrouped: [], programmes: [], subjects: [], distinctiveProgrammes: [] };

  const {
    data: browseResp,
    isError: browseIsError,
    isPending: browseIsPending,
    refetch: browseRefetch,
  } = useQuery({
    queryKey: ['schools', keyword, browsePage, urlQfCca, urlQfProg, urlQfIpKey],
    queryFn: () =>
      getSchools({
        ...(keyword       ? { q:         keyword              } : {}),
        ...(urlQfCca      ? { cca:       urlQfCca.split(',')  } : {}),
        ...(urlQfProg     ? { programme: urlQfProg             } : {}),
        ...(urlQfIpParam  ? { ip:        urlQfIpParam          } : {}),
        page: browsePage.toString(),
        pageSize: PAGE_SIZE.toString(),
      }),
    enabled: !hasSearched,
  });

  // Fetch ALL matching schools for focus mode (browse only; recommendations already have full set)
  // Only triggers when focus modal opens; result is cached for the current filter state.
  const { data: focusResp, isFetching: focusIsFetching } = useQuery({
    queryKey: ['schools-focus', keyword, urlQfCca, urlQfProg, urlQfIpKey],
    queryFn: () =>
      getSchools({
        ...(keyword      ? { q:         keyword              } : {}),
        ...(urlQfCca     ? { cca:       urlQfCca.split(',')  } : {}),
        ...(urlQfProg    ? { programme: urlQfProg             } : {}),
        ...(urlQfIpParam ? { ip:        urlQfIpParam          } : {}),
        pageSize: '500',
      }),
    enabled: focusOpen && !hasSearched,
    staleTime: 60_000,
  });

  const recommendMutation = useMutation({
    mutationFn: (req: RecommendationRequest) => getRecommendations(req),
  });

  // ── On mount: re-fire mutation from URL (refresh / browser-back restore) ──
  useEffect(() => {
    if (urlMode === 'nearby') {
      // Nearby mode is ephemeral — postal not stored in URL.
      // On refresh, show the input prompt and clear the mode so browse is shown.
      setShowNearbyInput(true);
      setSearchParams({}, { replace: true });
    } else if (urlMode && urlPrefs) {
      recommendMutation.mutate({
        home: { postal: urlPrefs.home.postal || undefined },
        mustHaves: urlPrefs.mustHaves,
        goodToHaves: urlPrefs.goodToHaves,
      });
    }
    // Restore scroll position saved before navigating to a school
    const savedScroll = sessionStorage.getItem(SCROLL_KEY);
    if (savedScroll) {
      sessionStorage.removeItem(SCROLL_KEY);
      // Wait a tick for the list content to render, then restore
      setTimeout(() => {
        if (listRef.current) listRef.current.scrollTop = parseInt(savedScroll, 10);
      }, 50);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount only

  // ── Helper: navigate to school, saving URL + scroll position ──────────
  // `recommendation` is passed only when navigating from the ranked result
  // list — SchoolProfile uses it to show a personalised "Why this matches you"
  // overview. All other entry points (filter, browse, quick filters) omit it
  // so the school page shows neutral content.
  const goToSchool = useCallback((
    schoolId: string,
    recommendation?: { result: RecommendationResult; rank: number }
  ) => {
    if (listRef.current) {
      sessionStorage.setItem(SCROLL_KEY, String(listRef.current.scrollTop));
    }
    navigate(`/app/schools/${schoolId}`, {
      state: {
        from: location.pathname + location.search,
        ...(recommendation ? { recommendation } : {}),
      },
    });
  }, [navigate, location]);

  // ── Handlers ───────────────────────────────────────────────────────────
  const handleApplyPrefs = useCallback(
    (newPrefs: PreferencesState) => {
      setPrefs(newPrefs);
      setActiveNearbyPostal('');
      setRecPage(1);
      setShowNearbyInput(false);
      const encoded = encodePrefs(newPrefs);
      setSearchParams({ mode: 'recs', prefs: encoded }, { replace: true });
      recommendMutation.mutate({
        home: { postal: newPrefs.home.postal || undefined },
        mustHaves: newPrefs.mustHaves,
        goodToHaves: newPrefs.goodToHaves,
        page: 1,
        pageSize: PAGE_SIZE,
      });
    },
    [recommendMutation, setSearchParams]
  );

  // Build the current browse-param object so handlers can merge instead of replace.
  // Only includes non-empty quick-filter values (never mode/prefs — those live in a different URL shape).
  const currentBrowseParams = (): Record<string, string> => {
    const p: Record<string, string> = {};
    if (urlQ) p.q = urlQ;
    if (urlQfCca) p.qf_cca = urlQfCca;
    if (urlQfProg) p.qf_prog = urlQfProg;
    if (urlQfIpKey) p.qf_ip = urlQfIpKey;
    return p;
  };

  // Quick filters use browse API — returns ALL matching schools, paginated, no recommendation scoring.
  // Each handler toggles its own value and merges with the other active filters.
  const handleCcaQuickFilter = (filter: typeof CCA_QUICK_FILTERS[number]) => {
    const ccaVal = [...filter.ccas].join(',');
    const isActive = urlQfCca === ccaVal;
    setBrowsePage(1);
    const p = currentBrowseParams();
    if (isActive) delete p.qf_cca; else p.qf_cca = ccaVal;
    setSearchParams(p, { replace: true });
  };

  const handleProgrammeQuickFilter = (programmeName: string) => {
    const isActive = urlQfProg === programmeName;
    setBrowsePage(1);
    const p = currentBrowseParams();
    if (isActive) delete p.qf_prog; else p.qf_prog = programmeName;
    setSearchParams(p, { replace: true });
  };

  const handleIpQuickFilter = (value: 'ip') => {
    const isActive = urlQfIpSet.has(value);
    setBrowsePage(1);
    const p = currentBrowseParams();
    delete p.qf_ip;
    if (!isActive) p.qf_ip = 'ip';
    setSearchParams(p, { replace: true });
  };

  // Always prompt for postal — never reuse saved prefs for nearby search.
  // The postal entered here is used only for this session and is NOT saved.
  const handleNearbyClick = () => {
    setNearbyPostal('');
    setShowNearbyInput(true);
    setTimeout(() => nearbyInputRef.current?.focus(), 50);
  };

  const handleNearbySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (nearbyPostal.length !== 6) return;
    // Store postal in ephemeral state ONLY — never written to prefs/localStorage/URL.
    // This ensures the user's saved home preferences remain untouched.
    setActiveNearbyPostal(nearbyPostal);
    setRecPage(1);
    setShowNearbyInput(false);
    // No prefs in URL — nearby is a transient session search
    setSearchParams({ mode: 'nearby' }, { replace: true });
    recommendMutation.mutate({
      home: { postal: nearbyPostal },
      mustHaves: { maxCommuteMins: 30 },
      goodToHaves: { rankedCriteria: [] },
      page: 1,
      pageSize: PAGE_SIZE,
    });
  };

  const handleRelax = (patch: Partial<MustHaves>) => {
    const patched: PreferencesState = { ...prefs, mustHaves: { ...prefs.mustHaves, ...patch } };
    setPrefs(patched);
    setRecPage(1);
    setSearchParams({ mode: 'recs', prefs: encodePrefs(patched) }, { replace: true });
    recommendMutation.mutate({
      home: { postal: patched.home.postal || undefined },
      mustHaves: patched.mustHaves,
      goodToHaves: patched.goodToHaves,
      page: 1,
      pageSize: PAGE_SIZE,
    });
  };

  const handleClear = () => {
    setKeyword('');
    setBrowsePage(1);
    setShowNearbyInput(false);
    setActiveNearbyPostal('');
    setSearchParams({}, { replace: true }); // clears all URL params (mode, qf_cca, qf_prog, q, etc.)
    recommendMutation.reset();
  };

  const recData = recommendMutation.data?.ok ? recommendMutation.data.data : null;
  const recError = recommendMutation.data && !recommendMutation.data.ok
    ? (recommendMutation.data as { ok: false; error: { code: string; message: string; details?: Record<string, string[]> } }).error
    : null;
  const isNoResults = recData && 'noResults' in recData && recData.noResults;
  // API-reported mode: 'recommendation' | 'filter' | 'browse' | null (before first search)
  const apiMode = recData && !isNoResults ? (recData as { mode: string }).mode as 'recommendation' | 'filter' | 'browse' : null;
  // Recommendation results (only in recommendation mode)
  const results = apiMode === 'recommendation' ? (recData as { results: RecommendationResult[] }).results : [];
  // Filter/browse results (mode is 'filter' or 'browse')
  const filteredSchools: FilteredSchool[] = (apiMode === 'filter' || apiMode === 'browse')
    ? ((recData as { schools: FilteredSchool[] }).schools ?? [])
    : [];
  // Pagination for filter/browse mode
  const filteredPagination = (apiMode === 'filter' || apiMode === 'browse')
    ? (recData as { pagination: { page: number; pageSize: number; totalCount: number; totalPages: number } }).pagination
    : null;
  const noResultsData = isNoResults
    ? (recData as { noResults: true; bottleneck: { type: string; details: string }; suggestions: RelaxSuggestion[] })
    : null;

  // Handler: paginate through filter/browse results without re-running full mutation from scratch
  const handleRecPageChange = useCallback((newPage: number) => {
    setRecPage(newPage);
    if (urlMode === 'nearby') {
      // Nearby is ephemeral — use the in-memory activeNearbyPostal
      recommendMutation.mutate({
        home: { postal: activeNearbyPostal || undefined },
        mustHaves: { maxCommuteMins: 30 },
        goodToHaves: { rankedCriteria: [] },
        page: newPage,
        pageSize: PAGE_SIZE,
      });
    } else {
      recommendMutation.mutate({
        home: { postal: prefs.home.postal || undefined },
        mustHaves: prefs.mustHaves,
        goodToHaves: prefs.goodToHaves,
        page: newPage,
        pageSize: PAGE_SIZE,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs, urlMode, activeNearbyPostal]);

  const browseSchools = browseResp?.ok ? browseResp.data?.schools ?? [] : [];
  const pagination = browseResp?.ok ? browseResp.data?.pagination : null;
  // displaySchools for map pins: from recommendation results, filtered schools, or browse list
  const displaySchools = hasSearched
    ? apiMode === 'recommendation'
      ? results.map((r) => r.school)
      : filteredSchools.map((f) => f.school)
    : browseSchools;
  const mapPins = displaySchools.filter((s) => s.lat && s.lng);

  // Focus mode: in browse, use full-page fetch; in recs/nearby, all results are already in memory
  const focusSchools = hasSearched
    ? displaySchools
    : (focusResp?.ok ? (focusResp.data.schools ?? []) : browseSchools);

  const isNearbyMode = urlMode === 'nearby';
  const isQuickFiltered = !hasSearched && (urlQfCca !== null || urlQfProg !== null || urlQfIpSet.size > 0);
  const totalSchools = pagination?.total ?? 133;

  const ipLabel = urlQfIpSet.has('ip') ? 'IP Schools' : '';
  const quickFilterLabel = urlQfCca
    ? urlQfCca.split(',').join(' / ')
    : urlQfProg ?? ipLabel;

  // Count of schools — for filter/browse show total across all pages, for rec show result count
  const resultCount = apiMode === 'recommendation'
    ? results.length
    : filteredPagination?.totalCount ?? filteredSchools.length;

  const listLabel = !hasSearched
    ? isQuickFiltered
      ? `${pagination?.total ?? '…'} school${pagination?.total !== 1 ? 's' : ''} · ${quickFilterLabel}`
      : keyword ? `Results for "${keyword}"` : 'All Secondary Schools'
    : recommendMutation.isPending
    ? 'Computing…'
    : isNoResults
    ? 'No matches'
    : isNearbyMode
    ? `${resultCount} school${resultCount !== 1 ? 's' : ''} nearby`
    : apiMode === 'filter'
    ? `${resultCount} school${resultCount !== 1 ? 's' : ''} matched`
    : `${resultCount} school${resultCount !== 1 ? 's' : ''} matched`;

  return (
    <div className="h-screen overflow-hidden bg-surface flex flex-col">
      <Navbar />

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col w-full max-w-[1700px] mx-auto px-8 lg:px-16">

        {/* ── PAGE HEADER ── */}
        <div className="flex items-end justify-between gap-6 py-4 flex-shrink-0">
          <div>
            <h1 className="text-[36px] lg:text-[38px] font-extrabold text-dark tracking-[-0.03em] leading-tight">
              Find your secondary school
            </h1>
            <p className="text-[15px] text-muted mt-1.5 leading-relaxed max-w-[600px]">
              {!hasSearched
                ? keyword
                  ? `Searching for "${keyword}"…`
                  : `Browse all ${totalSchools} Singapore secondary schools, or set preferences for a ranked recommendation.`
                : recommendMutation.isPending
                ? 'Computing your personalised ranking…'
                : isNoResults
                ? 'No schools matched your must-haves — try relaxing a constraint below.'
                : isNearbyMode
                ? `${resultCount} school${resultCount !== 1 ? 's' : ''} within 30 min commute of ${activeNearbyPostal}`
                : apiMode === 'filter'
                ? `${resultCount} school${resultCount !== 1 ? 's' : ''} match all your requirements`
                : `${resultCount} school${resultCount !== 1 ? 's' : ''} ranked by your priorities`}
            </p>
          </div>
          {(hasSearched || isQuickFiltered) && (
            <button
              onClick={handleClear}
              className="flex-shrink-0 flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-dark bg-white border border-gray-200 px-4 py-2 rounded-full shadow-sm transition-colors"
            >
              <X size={13} />
              Clear search
            </button>
          )}
        </div>

        {/* ── MAP — z-[0] creates a stacking context that keeps Leaflet's compositing layers below the z-50 navbar ── */}
        <div
          className="relative z-[0] w-full rounded-2xl overflow-hidden border border-gray-200 mb-3 flex-shrink-0"
          style={{ height: 280, boxShadow: '0 2px 20px rgba(0,0,0,0.08)' }}
        >
          <MapContainer center={DEFAULT_CENTER} zoom={12} style={{ width: '100%', height: '100%' }}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://openstreetmap.org">OSM</a>'
            />
            {mapPins.map((school) => (
              <Marker key={school.id} position={[school.lat!, school.lng!]}>
                <Popup>
                  <div className="min-w-[150px]">
                    <p className="font-semibold text-dark text-[13px] leading-snug">{school.name}</p>
                    {school.address && (
                      <p className="text-muted text-[11px] mt-0.5">{school.address}</p>
                    )}
                    <button
                      className="mt-2 text-sky-700 text-[12px] font-semibold hover:underline"
                      onClick={() => goToSchool(school.id)}
                    >
                      View profile →
                    </button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
          <ExpandMapButton onClick={() => setFocusOpen(true)} />
        </div>

        <MapFocusModal
          isOpen={focusOpen}
          onClose={() => setFocusOpen(false)}
          schools={focusSchools}
          loading={focusIsFetching}
        />

        {/* ── BOTTOM: 2-column — controls left, list right ── */}
        <div className="flex gap-4 lg:gap-5 flex-1 min-h-0 overflow-hidden pb-4 lg:pb-5">

          {/* ── LEFT: Controls panel ── */}
          <div className="w-[340px] lg:w-[360px] flex-shrink-0 space-y-3 lg:space-y-3.5 overflow-y-auto">

            {/* Search & actions card */}
            <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden" style={{ boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }}>
              <div className="p-3.5 space-y-2.5">
                {/* Search input */}
                <div className="relative">
                  <SearchIcon size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={keyword}
                    onChange={(e) => {
                      const q = e.target.value;
                      setKeyword(q);
                      setBrowsePage(1);
                      setShowNearbyInput(false);
                      // Update URL (replace so keyword edits don't flood history)
                      const p = currentBrowseParams();
                      if (q) p.q = q; 
                      else delete p.q;
                      setSearchParams(p, { replace: true });
                    }}
                    placeholder="Search schools by name…"
                    className="w-full pl-9 pr-4 py-2.5 bg-surface rounded-lg text-[14px] text-dark placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-300/40 border border-gray-200 focus:border-sky-400 transition-all"
                  />
                </div>

                {/* Nearby toggle */}
                {!showNearbyInput ? (
                  <button
                    onClick={handleNearbyClick}
                    className={`w-full flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg text-[13px] font-semibold border transition-all ${
                      isNearbyMode
                        ? 'bg-sky-100 text-sky-700 border-sky-300 shadow-sm'
                        : 'border-gray-200 text-muted hover:border-sky-300 hover:text-sky-600 hover:bg-sky-50 bg-white'
                    }`}
                  >
                    <MapPin size={13} />
                    Nearby schools (30 min)
                  </button>
                ) : (
                  <form onSubmit={handleNearbySubmit} className="flex items-center gap-2">
                    <input
                      ref={nearbyInputRef}
                      type="text"
                      value={nearbyPostal}
                      onChange={(e) => setNearbyPostal(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="Postal code"
                      className="flex-1 px-3 py-2.5 bg-surface border border-sky-300 rounded-xl text-[14px] focus:outline-none focus:ring-2 focus:ring-sky-300/20"
                    />
                    <button
                      type="submit"
                      disabled={nearbyPostal.length !== 6}
                      className="px-4 py-2.5 bg-navy text-white rounded-xl text-[14px] font-semibold disabled:opacity-40 hover:bg-navy-600 active:scale-[0.97] transition-all"
                    >
                      Go
                    </button>
                    <button type="button" onClick={() => setShowNearbyInput(false)} className="p-1.5 text-muted hover:text-dark rounded-lg transition-colors">
                      <X size={13} />
                    </button>
                  </form>
                )}

                {/* Preferences CTA */}
                <button
                  onClick={() => setPrefOpen(true)}
                  className="w-full flex items-center justify-center gap-2 text-muted border border-gray-200 font-semibold px-3.5 py-2.5 rounded-lg text-[13px] hover:border-sky-300 hover:text-sky-600 hover:bg-sky-50 active:scale-[0.97] transition-all shadow-sm"
                >
                  <SlidersHorizontal size={13} />
                  Set Preferences & Get Recommendations
                </button>
              </div>

              {/* Quick filters — always visible in browse mode so users can toggle and combine */}
              {!hasSearched && (
                <div className="px-3.5 pb-3 border-t border-gray-100 pt-3 space-y-2">
                  <p className="text-[10px] font-bold text-muted uppercase tracking-[0.14em]">Track</p>
                  <div className="flex flex-wrap gap-1.5">
                    {IP_QUICK_FILTERS.map((f) => {
                      const isActive = urlQfIpSet.has(f.value);
                      return (
                      <button
                        key={f.value}
                        onClick={() => handleIpQuickFilter(f.value)}
                        title={f.desc}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface border text-[11px] font-medium transition-all duration-150 active:scale-[0.97] ${
                          isActive
                            ? 'bg-sky-100 text-sky-700 border-sky-300 shadow-sm'
                            : 'border-gray-200 text-muted hover:border-sky-400 hover:text-sky-600 hover:bg-sky-50'
                        }`}
                      >
                        <GraduationCap size={10} />
                        {f.label}
                      </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] font-bold text-muted uppercase tracking-[0.14em] pt-1">CCAs</p>
                  <div className="flex flex-wrap gap-1.5">
                    {CCA_QUICK_FILTERS.map((f) => {
                      const isActive = urlQfCca === [...f.ccas].join(',');
                      return (
                      <button
                        key={f.label}
                        onClick={() => handleCcaQuickFilter(f)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface border text-[11px] font-medium transition-all duration-150 active:scale-[0.97] ${
                          isActive
                            ? 'bg-sky-100 text-sky-700 border-sky-300 shadow-sm'
                            : 'border-gray-200 text-muted hover:border-sky-400 hover:text-sky-600 hover:bg-sky-50'
                        }`}
                      >
                        <f.icon size={10} />
                        {f.label}
                      </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] font-bold text-muted uppercase tracking-[0.14em] pt-1">Programmes</p>
                  <div className="flex flex-wrap gap-1.5">
                    {PROGRAMME_QUICK_FILTERS.map((p) => (
                      <button
                        key={p}
                        onClick={() => handleProgrammeQuickFilter(p)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface border text-[11px] font-medium transition-all duration-150 active:scale-[0.97] ${
                          urlQfProg === p
                            ? 'bg-sky-100 text-sky-700 border-sky-300 shadow-sm'
                            : 'border-gray-200 text-muted hover:border-sky-400 hover:text-sky-600 hover:bg-sky-50'
                        }`}
                      >
                        <GraduationCap size={10} />
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── How to use Optima — step/progress flow ── */}
            {!hasSearched && !browseIsError && (
              <div className="bg-white rounded-2xl border border-gray-200/80 p-4 space-y-3" style={{ boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }}>
                <div>
                  <p className="text-[10px] font-bold text-navy uppercase tracking-[0.18em] mb-1">Get started</p>
                  <h2 className="text-[15px] font-extrabold text-dark tracking-[-0.02em]">How to use Optima</h2>
                </div>

                {/* Vertical step list */}
                <div className="space-y-0">
                  {([
                    {
                      n: 1, done: false, active: true,
                      Icon: MapPin,
                      label: 'Enter location',
                      desc: 'Add your postal code for real transit times.',
                    },
                    {
                      n: 2, done: false, active: false,
                      Icon: SlidersHorizontal,
                      label: 'Set must-haves',
                      desc: 'Hard constraints: CCA, programme, or max commute.',
                    },
                    {
                      n: 3, done: false, active: false,
                      Icon: Trophy,
                      label: 'Rank priorities',
                      desc: 'Drag criteria to weight your preferences.',
                    },
                    {
                      n: 4, done: false, active: false,
                      Icon: Star,
                      label: 'Get shortlist',
                      desc: 'Up to 5 ranked schools with score breakdowns.',
                    },
                    {
                      n: 5, done: false, active: false,
                      Icon: BookMarked,
                      label: 'Explore & save',
                      desc: 'View school profiles, read reviews, save picks.',
                    },
                  ] as const).map((step, idx, arr) => (
                    <div key={step.n} className="flex gap-3">
                      {/* Left: connector column */}
                      <div className="flex flex-col items-center">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 border-2 mt-0.5 text-[11px] ${
                          step.active
                            ? 'bg-navy border-navy text-white'
                            : 'bg-white border-gray-200 text-gray-400'
                        }`}>
                          <step.Icon size={13} />
                        </div>
                        {idx < arr.length - 1 && (
                          <div className="w-0.5 flex-1 bg-gray-200 mt-1 mb-1" style={{ minHeight: 16 }} />
                        )}
                      </div>

                      {/* Right: text */}
                      <div className={`pb-3 min-w-0 flex-1 ${idx === arr.length - 1 ? 'pb-0' : ''}`}>
                        <div className="flex items-center gap-1.5">
                          <p className={`text-[12px] font-bold leading-snug ${step.active ? 'text-navy' : 'text-dark/70'}`}>
                            {step.label}
                          </p>
                          {step.active && (
                            <span className="text-[8px] font-bold bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded-full border border-sky-300">
                              Start here
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted mt-0.5 leading-relaxed">{step.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setPrefOpen(true)}
                  className="mt-3 w-full flex items-center justify-center gap-1.5 text-[12px] font-semibold text-sky-700 bg-sky-50 border border-sky-200 px-3.5 py-2 rounded-lg hover:bg-sky-100 active:scale-[0.97] transition-all"
                >
                  <SlidersHorizontal size={12} />
                  Open Preferences
                </button>
              </div>
            )}
          </div>

          {/* ── RIGHT: School list panel ── */}
          <div
            className="flex-1 min-w-0 rounded-2xl border border-gray-200/80 flex flex-col overflow-hidden bg-white"
            style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.08)' }}
          >
            {/* Panel header */}
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between flex-shrink-0 bg-white">
              <span className="text-[13px] font-bold text-dark tracking-[-0.01em]">{listLabel}</span>
              <div className="flex items-center gap-1.5 text-[11px]">
                {!isNoResults && results.length > 0 && apiMode === 'recommendation' && (
                  <Badge variant="blue" size="sm">ROC ranked</Badge>
                )}
                {!hasSearched && !browseIsPending && !browseIsError && pagination && (
                  <span className="text-[11px] text-muted bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-lg">
                    {pagination.total} total
                  </span>
                )}
              </div>
            </div>

            {/* Scrollable list */}
            <div ref={listRef} className="flex-1 overflow-y-auto min-h-0 bg-[#F9FAFC]">
              <div className="p-3 space-y-1.5">

                {recommendMutation.isPending &&
                  Array.from({ length: 4 }).map((_, i) => <SchoolCardSkeleton key={i} />)}

                {!hasSearched && browseIsPending &&
                  Array.from({ length: 6 }).map((_, i) => <SchoolCardSkeleton key={i} />)}

                {!hasSearched && browseIsError && (
                  <div className="py-16 flex flex-col items-center gap-4 text-center px-4">
                    <div className="w-12 h-12 bg-red-50 border border-red-100 rounded-2xl flex items-center justify-center">
                      <AlertCircle size={22} className="text-red-400" />
                    </div>
                    <div>
                      <p className="text-[15px] font-semibold text-dark mb-1">Can't reach the server</p>
                      <p className="text-[13px] text-muted leading-relaxed max-w-[260px]">
                        The API server may not be running. Make sure Docker is started and the API is up on port 4000.
                      </p>
                    </div>
                    <button
                      onClick={() => browseRefetch()}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-[13px] font-medium text-dark hover:bg-surface active:scale-[0.97] transition-all"
                    >
                      <RefreshCw size={13} />
                      Retry
                    </button>
                  </div>
                )}

                {isNoResults && noResultsData && (
                  <div className="space-y-3 pt-1">
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                      <p className="text-[14px] font-semibold text-amber-800 mb-0.5">
                        No schools match all your must-haves
                      </p>
                      <p className="text-[13px] text-amber-600">{noResultsData.bottleneck.details}</p>
                    </div>
                    <p className="text-[11px] font-bold text-muted uppercase tracking-wide px-0.5 pt-1">
                      Try relaxing
                    </p>
                    {noResultsData.suggestions.map((s, i) => (
                      <div key={i} className="border border-gray-100 bg-white rounded-xl p-4">
                        <p className="text-[14px] font-medium text-dark mb-1.5">{s.label}</p>
                        {s.newCount > 0 && (
                          <p className="text-[13px] text-muted mb-3">
                            Would give {s.newCount} matching school{s.newCount !== 1 ? 's' : ''} (all other requirements kept)
                          </p>
                        )}
                        <Button size="sm" onClick={() => handleRelax(s.patch)}>Apply</Button>
                      </div>
                    ))}
                    <Button variant="secondary" size="sm" className="w-full" onClick={() => setPrefOpen(true)}>
                      Edit preferences
                    </Button>
                  </div>
                )}

                {hasSearched && !recommendMutation.isPending && recError && (
                  <div className="bg-red-50 border border-red-100 rounded-xl p-4 space-y-2">
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 bg-red-100 border border-red-200 rounded-xl flex items-center justify-center flex-shrink-0">
                        <AlertCircle size={16} className="text-red-500" />
                      </div>
                      <div>
                        <p className="text-[14px] font-semibold text-red-800">
                          {recError.code === 'POSTAL_NOT_FOUND'
                            ? 'Postal code not found'
                            : recError.code === 'VALIDATION_ERROR'
                            ? 'Preferences need a quick fix'
                            : 'Something went wrong'}
                        </p>
                        <p className="text-[13px] text-red-600 mt-0.5">
                          {recError.code === 'POSTAL_NOT_FOUND'
                            ? 'That postal code could not be found. Please check it and try again.'
                            : recError.code === 'VALIDATION_ERROR'
                            ? 'One or more preferences have invalid values.'
                            : 'Could not compute recommendations. Please try again.'}
                        </p>
                      </div>
                    </div>
                    <button
                      className="w-full mt-1 text-[13px] font-semibold text-red-700 bg-red-100 border border-red-200 rounded-xl px-4 py-2 hover:bg-red-200 transition-colors"
                      onClick={() => setPrefOpen(true)}
                    >
                      Edit preferences
                    </button>
                  </div>
                )}

                {!recommendMutation.isPending && apiMode === 'recommendation' && results.map((result, i) => (
                  <ResultCard
                    key={result.school.id}
                    result={result}
                    rank={i + 1}
                    showScores
                    onClick={() => goToSchool(result.school.id, { result, rank: i + 1 })}
                  />
                ))}

                {!recommendMutation.isPending && (apiMode === 'filter' || apiMode === 'browse') && filteredSchools.map((item, i) => (
                  <FilterCard
                    key={item.school.id}
                    item={item}
                    rank={i + 1}
                    isFilter={apiMode === 'filter'}
                    onClick={() => goToSchool(item.school.id)}
                  />
                ))}

                {!hasSearched && !browseIsPending && !browseIsError && browseSchools.map((school) => (
                  <BrowseCard
                    key={school.id}
                    school={school}
                    onClick={() => goToSchool(school.id)}
                  />
                ))}

                {!hasSearched && !browseIsPending && !browseIsError && browseSchools.length === 0 && keyword && (
                  <div className="py-16 text-center">
                    <p className="text-[15px] font-semibold text-dark mb-1">No schools found</p>
                    <p className="text-[13px] text-muted">
                      No schools match &quot;{keyword}&quot;. Try a different name.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Pagination — browse/filter from /schools (no active mode) */}
            {!hasSearched && pagination && pagination.totalPages > 1 && (
              <div className="border-t border-gray-100 px-3.5 py-2.5 flex items-center justify-between bg-white flex-shrink-0 gap-2">
                <button
                  onClick={() => {
                    const next = Math.max(1, browsePage - 1);
                    setBrowsePage(next);
                    const p = currentBrowseParams();
                    if (next > 1)
                      p.page = String(next);
                    else delete p.page;
                    setSearchParams(p, { replace: true });
                  }}
                  disabled={browsePage === 1}
                  className="flex items-center gap-1 text-[12px] font-medium text-muted hover:text-dark disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={14} />
                  Previous
                </button>
                <span className="text-[12px] text-muted">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button
                  onClick={() => {
                    const next = Math.min(pagination.totalPages, browsePage + 1);
                    setBrowsePage(next);
                    const p = currentBrowseParams();
                    p.page = String(next);
                    setSearchParams(p, { replace: true });
                  }}
                  disabled={browsePage === pagination.totalPages}
                  className="flex items-center gap-1 text-[12px] font-medium text-muted hover:text-dark disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                  <ChevronRight size={14} />
                </button>
              </div>
            )}

            {/* Pagination — filter/browse results from /recommendations */}
            {hasSearched && !recommendMutation.isPending && filteredPagination && filteredPagination.totalPages > 1 && (
              <div className="border-t border-gray-100 px-3.5 py-2.5 flex items-center justify-between bg-white flex-shrink-0 gap-2">
                <button
                  onClick={() => handleRecPageChange(Math.max(1, recPage - 1))}
                  disabled={recPage === 1}
                  className="flex items-center gap-1 text-[12px] font-medium text-muted hover:text-dark disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={14} />
                  Previous
                </button>
                <span className="text-[12px] text-muted">
                  Page {filteredPagination.page} of {filteredPagination.totalPages}
                </span>
                <button
                  onClick={() => handleRecPageChange(Math.min(filteredPagination.totalPages, recPage + 1))}
                  disabled={recPage === filteredPagination.totalPages}
                  className="flex items-center gap-1 text-[12px] font-medium text-muted hover:text-dark disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Preferences modal */}
      <PreferenceModal
        open={prefOpen}
        onClose={() => setPrefOpen(false)}
        initial={prefs}
        onApply={handleApplyPrefs}
        saveKey={userPrefsKey}
        ccaOptions={meta.ccas}
        ccasGrouped={meta.ccasGrouped ?? []}
        programmeOptions={meta.programmes}
        subjectOptions={meta.subjects}
        distinctiveOptions={meta.distinctiveProgrammes ?? []}
      />
    </div>
  );
}

// ── Result Card ──────────────────────────────────────────────────────────────
function ResultCard({ result, rank, showScores, onClick }: {
  result: RecommendationResult;
  rank: number;
  /** true only in full recommendation mode (not nearby, not browse) */
  showScores?: boolean;
  onClick: () => void;
}) {
  const top2 = result.breakdown.slice().sort((a, b) => b.contribution - a.contribution).slice(0, 2);
  const hasCommute = result.commute.durationMins > 0;
  const isEstimatedCommute = (result.commute as { estimated?: boolean }).estimated === true;
  const isFirst = rank === 1;

  // Build a human-readable label for each criterion's match score
  function criterionMatchLabel(b: { criterion: string; score: number }): string {
    const matched = result.explanation.matched;
    switch (b.criterion) {
      case 'commute': return `${(b.score * 100).toFixed(0)}% commute score`;
      case 'subjectsLanguages': {
        const desired = (result as unknown as { goodToHaves?: { desiredSubjectsLanguages?: string[] } }).goodToHaves?.desiredSubjectsLanguages;
        if (desired && desired.length > 0) return `${matched.subjectsLanguages.length} / ${desired.length} matched`;
        return `${(b.score * 100).toFixed(0)}% richness`;
      }
      case 'programmes': {
        const desired = (result as unknown as { goodToHaves?: { desiredProgrammes?: string[] } }).goodToHaves?.desiredProgrammes;
        if (desired && desired.length > 0) return `${matched.programmes.length} / ${desired.length} matched`;
        return `${(b.score * 100).toFixed(0)}% richness`;
      }
      case 'ccas': {
        const desired = (result as unknown as { goodToHaves?: { desiredCCAs?: string[] } }).goodToHaves?.desiredCCAs;
        if (desired && desired.length > 0) return `${matched.ccas.length} / ${desired.length} matched`;
        return `${(b.score * 100).toFixed(0)}% richness`;
      }
      case 'distinctive': {
        const desired = (result as unknown as { goodToHaves?: { desiredDistinctive?: string[] } }).goodToHaves?.desiredDistinctive;
        if (desired && desired.length > 0) return `${matched.distinctive.length} / ${desired.length} matched`;
        return `${(b.score * 100).toFixed(0)}% richness`;
      }
      default: return `${(b.score * 100).toFixed(0)}%`;
    }
  }

  return (
    <div
      onClick={onClick}
      className={`group rounded-xl border cursor-pointer transition-all duration-200 hover:-translate-y-px ${
        isFirst
          ? 'border-sky-200 bg-sky-50/40 hover:border-sky-300 hover:shadow-md'
          : 'border-gray-200 bg-white hover:border-sky-200 hover:shadow-md'
      }`}
    >
      <div className="px-4 py-4">
        <div className="flex items-start gap-3">
          <span className={`flex-shrink-0 w-7 h-7 rounded-full text-[12px] font-bold flex items-center justify-center mt-0.5 ${
            isFirst ? 'bg-navy text-white shadow-sm' : 'bg-gray-100 text-muted'
          }`}>
            {rank}
          </span>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <h3 className={`font-bold text-[16px] leading-tight transition-colors ${
                isFirst ? 'text-dark group-hover:text-navy' : 'text-dark group-hover:text-sky-600'
              }`}>{result.school.name}</h3>
              {showScores && (
                <div className="flex-shrink-0 text-right">
                  <span className={`text-[15px] font-extrabold block ${isFirst ? 'text-navy' : 'text-sky-700'}`}>
                    {(result.totalScore * 100).toFixed(0)}%
                  </span>
                  <span className="text-[9px] text-muted block leading-none">overall fit</span>
                </div>
              )}
            </div>

            {result.school.address && (
              <p className="text-[12px] text-muted mt-0.5 truncate">{result.school.address}</p>
            )}

            {hasCommute && (
              <p className="text-[12px] text-muted mt-1 flex items-center gap-1">
                <MapPin size={10} className="flex-shrink-0" />
                {result.commute.durationMins} min
                {result.commute.transfers > 0 &&
                  ` · ${result.commute.transfers} transfer${result.commute.transfers !== 1 ? 's' : ''}`}
                {isEstimatedCommute && (
                  <span className="ml-1 text-[9px] bg-amber-50 text-amber-600 border border-amber-200 px-1 py-0.5 rounded font-medium">est.</span>
                )}
              </p>
            )}

            {showScores && (
              <div className="mt-2.5 space-y-1.5">
                {top2.map((b) => (
                  <div key={b.criterion} className="flex items-center gap-2">
                    <span className="text-[11px] text-muted w-[90px] flex-shrink-0 truncate">
                      {CRITERION_LABELS[b.criterion as keyof typeof CRITERION_LABELS] ?? b.criterion}
                    </span>
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${isFirst ? 'bg-navy' : 'bg-sky-300'}`}
                        style={{ width: `${b.score * 100}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-muted w-[80px] text-right flex-shrink-0 truncate">
                      {criterionMatchLabel(b)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Filter Card ───────────────────────────────────────────────────────────────
// Used for filter mode (has must-haves, no good-to-haves) and browse mode from /recommendations
function FilterCard({ item, rank, isFilter, onClick }: {
  item: FilteredSchool;
  rank: number;
  /** true = filter mode (show "Matches requirements" tag); false = nearby / browse */
  isFilter: boolean;
  onClick: () => void;
}) {
  const commute = item.commute;
  const isEstimated = commute && (commute as { estimated?: boolean }).estimated === true;
  return (
    <div
      onClick={onClick}
      className="group flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3.5 cursor-pointer hover:border-sky-200 hover:shadow-sm hover:-translate-y-px transition-all duration-150"
    >
      <div className="w-7 h-7 rounded-full bg-gray-100 text-muted text-[12px] font-bold flex items-center justify-center flex-shrink-0">
        {rank}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <h3 className="font-semibold text-dark text-[15px] leading-snug truncate group-hover:text-navy transition-colors flex-1">
            {item.school.name}
          </h3>
          {isFilter && (
            <span className="flex-shrink-0 flex items-center gap-1 text-[10px] font-semibold bg-green-50 text-green-700 border border-green-200 px-1.5 py-0.5 rounded-full">
              <CheckCircle2 size={9} />
              Matches
            </span>
          )}
        </div>
        {item.school.address && (
          <p className="text-[12px] text-muted mt-0.5 truncate">{item.school.address}</p>
        )}
        {commute && commute.durationMins > 0 && (
          <p className="text-[12px] text-muted mt-1 flex items-center gap-1">
            <MapPin size={10} className="flex-shrink-0" />
            {commute.durationMins} min
            {commute.transfers > 0 && ` · ${commute.transfers} transfer${commute.transfers !== 1 ? 's' : ''}`}
            {isEstimated && (
              <span className="ml-1 text-[9px] bg-amber-50 text-amber-600 border border-amber-200 px-1 py-0.5 rounded font-medium">est.</span>
            )}
          </p>
        )}
      </div>
      <ChevronRight size={14} className="text-gray-300 flex-shrink-0 group-hover:text-sky-400 transition-colors" />
    </div>
  );
}

// ── Browse Card ──────────────────────────────────────────────────────────────
function BrowseCard({ school, onClick }: { school: { id: string; name: string; address: string | null }; onClick: () => void }) {
  const initial = school.name.charAt(0).toUpperCase();
  return (
    <div
      onClick={onClick}
      className="group flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3.5 cursor-pointer hover:border-sky-200 hover:shadow-sm hover:-translate-y-px transition-all duration-150"
    >
      <div className="w-8 h-8 rounded-lg bg-navy/8 border border-navy/12 flex items-center justify-center flex-shrink-0">
        <span className="text-[13px] font-bold text-navy">{initial}</span>
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-dark text-[15px] leading-snug truncate group-hover:text-navy transition-colors">{school.name}</h3>
        {school.address && (
          <p className="text-[12px] text-muted mt-0.5 truncate">{school.address}</p>
        )}
      </div>
      <ChevronRight size={14} className="text-gray-300 flex-shrink-0 group-hover:text-sky-400 transition-colors" />
    </div>
  );
}

// ── Grouped CCA Selector ─────────────────────────────────────────────────────
function CcaGroupSelect({
  label, groups, fallbackOptions, selected, onChange,
}: {
  label?: string;
  groups: CcaGroup[];
  fallbackOptions: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const toggleCca = (cca: string) => {
    onChange(selected.includes(cca) ? selected.filter((s) => s !== cca) : [...selected, cca]);
  };

  const displayGroups = groups.length > 0 ? groups : [{ category: 'ALL', ccas: fallbackOptions }];
  const filteredGroups = search
    ? displayGroups.map((g) => ({ ...g, ccas: g.ccas.filter((c) => c.toLowerCase().includes(search.toLowerCase())) })).filter((g) => g.ccas.length > 0)
    : displayGroups;

  return (
    <div className="space-y-2">
      {label && <label className="text-[13px] font-semibold text-dark block">{label}</label>}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((item) => (
            <span key={item} className="inline-flex items-center gap-1 bg-sky-50 text-sky-600 text-[12px] px-2.5 py-1 rounded-full font-medium border border-sky-100">
              {item}
              <button type="button" onClick={() => toggleCca(item)} className="text-sky-400 hover:text-sky-700">
                <X size={10} strokeWidth={2.5} />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          if (e.target.value) setExpandedCategories(new Set(displayGroups.map((g) => g.category)));
        }}
        placeholder="Search CCAs…"
        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-sky-300/20 focus:border-sky-300/40"
      />
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        {filteredGroups.map((group, idx) => {
          const isOpen = expandedCategories.has(group.category);
          const sel = group.ccas.filter((c) => selected.includes(c)).length;
          return (
            <div key={group.category} className={idx > 0 ? 'border-t border-gray-100' : ''}>
              <button type="button" onClick={() => toggleCategory(group.category)} className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-surface transition-colors text-left">
                <span className="text-[13px] font-semibold text-dark">{group.category}</span>
                <div className="flex items-center gap-2">
                  {sel > 0 && <span className="text-[11px] bg-sky-50 text-sky-600 font-bold px-1.5 py-0.5 rounded-full border border-sky-100">{sel}</span>}
                  <span className="text-muted text-[10px]">{isOpen ? '▲' : '▼'}</span>
                </div>
              </button>
              {isOpen && (
                <div className="bg-surface/50 max-h-40 overflow-y-auto divide-y divide-gray-100">
                  {group.ccas.map((cca) => (
                    <label key={cca} className="flex items-center gap-2.5 px-4 py-2 cursor-pointer hover:bg-white transition-colors">
                      <input type="checkbox" checked={selected.includes(cca)} onChange={() => toggleCca(cca)} className="w-3.5 h-3.5 accent-sky-400" />
                      <span className="text-[13px] text-dark">{cca}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Subject Group Select ─────────────────────────────────────────────────────
const SUBJECT_FILTER_GROUPS: { title: string; match: (s: string) => boolean }[] = [
  {
    title: 'Languages & Mother Tongue',
    match: (s) =>
      ['Chinese', 'Malay', 'Tamil', 'Hindi', 'Urdu', 'French', 'Burmese', 'Gujarati', 'Punjabi', 'Bengali', 'Arabic', 'English'].some(
        (lang) => s.includes(lang),
      ),
  },
  {
    title: 'Sciences',
    match: (s) =>
      s.includes('Biology') || s.includes('Chemistry') || s.includes('Physics') || s.startsWith('Science ('),
  },
  {
    title: 'Humanities',
    match: (s) =>
      s.startsWith('Humanities') || s.includes('Geography') || s.includes('History') || s.includes('Literature') ||
      s.includes('Social Studies'),
  },
  {
    title: 'Math & Computing',
    match: (s) => s.includes('Mathematics') || s.includes('Comput') || s.includes('Statistics'),
  },
  {
    title: 'Arts & Music',
    match: (s) => s.includes('Art') || s.includes('Music') || s.includes('Drama'),
  },
  {
    title: 'Business & Applied',
    match: (s) =>
      s.includes('Accounts') || s.includes('Business') || s.includes('Food') || s.includes('Nutrition') ||
      s.includes('Design') || s.includes('Technology') || s.includes('Physical Education'),
  },
];

function groupSubjectsForFilter(subjects: string[]): { title: string; items: string[] }[] {
  const seen = new Set<string>();
  const groups: { title: string; items: string[] }[] = SUBJECT_FILTER_GROUPS.map((g) => ({ title: g.title, items: [] }));
  const others: string[] = [];

  for (const s of subjects) {
    if (seen.has(s)) continue;
    seen.add(s);
    const matched = SUBJECT_FILTER_GROUPS.findIndex((g) => g.match(s));
    if (matched >= 0) groups[matched].items.push(s);
    else others.push(s);
  }
  if (others.length > 0) groups.push({ title: 'Others', items: others });
  return groups.filter((g) => g.items.length > 0);
}

function SubjectGroupSelect({
  label, options, selected, onChange,
}: {
  label?: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const allGroups = groupSubjectsForFilter(options);
  const toggle = (item: string) =>
    onChange(selected.includes(item) ? selected.filter((s) => s !== item) : [...selected, item]);
  const toggleGroup = (title: string) =>
    setExpandedGroups((prev) => { const n = new Set(prev); if (n.has(title)) n.delete(title); else n.add(title); return n; });

  const filteredGroups = search
    ? allGroups.map((g) => ({ ...g, items: g.items.filter((i) => i.toLowerCase().includes(search.toLowerCase())) })).filter((g) => g.items.length > 0)
    : allGroups;

  return (
    <div className="space-y-2">
      {label && <label className="text-[13px] font-semibold text-dark block">{label}</label>}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((item) => (
            <span key={item} className="inline-flex items-center gap-1 bg-sky-50 text-sky-600 text-[12px] px-2.5 py-1 rounded-full font-medium border border-sky-100">
              {item}
              <button type="button" onClick={() => toggle(item)} className="text-sky-400 hover:text-sky-700">
                <X size={10} strokeWidth={2.5} />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        value={search}
        onChange={(e) => { setSearch(e.target.value); if (e.target.value) setExpandedGroups(new Set(allGroups.map((g) => g.title))); }}
        placeholder="Search subjects…"
        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-sky-300/20 focus:border-sky-300/40"
      />
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        {filteredGroups.map((group, idx) => {
          const isOpen = expandedGroups.has(group.title);
          const sel = group.items.filter((i) => selected.includes(i)).length;
          return (
            <div key={group.title} className={idx > 0 ? 'border-t border-gray-100' : ''}>
              <button type="button" onClick={() => toggleGroup(group.title)} className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-surface transition-colors text-left">
                <span className="text-[13px] font-semibold text-dark">{group.title}</span>
                <div className="flex items-center gap-2">
                  {sel > 0 && <span className="text-[11px] bg-sky-50 text-sky-600 font-bold px-1.5 py-0.5 rounded-full border border-sky-100">{sel}</span>}
                  <span className="text-muted text-[10px]">{isOpen ? '▲' : '▼'}</span>
                </div>
              </button>
              {isOpen && (
                <div className="bg-surface/50 max-h-40 overflow-y-auto divide-y divide-gray-100">
                  {group.items.map((item) => (
                    <label key={item} className="flex items-center gap-2.5 px-4 py-2 cursor-pointer hover:bg-white transition-colors">
                      <input type="checkbox" checked={selected.includes(item)} onChange={() => toggle(item)} className="w-3.5 h-3.5 accent-sky-400" />
                      <span className="text-[13px] text-dark">{item}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Programme Group Select ────────────────────────────────────────────────────
const PROGRAMME_FILTER_GROUPS: { title: string; match: (s: string) => boolean }[] = [
  { title: 'Music',              match: (s) => /music/i.test(s) },
  { title: 'Arts & Aesthetics',  match: (s) => /\b(art|aesthetic|drama|visual)\b/i.test(s) },
  { title: 'Languages & Culture',match: (s) => /bicultural|chinese|malay|tamil|hindi|language|mother tongue|burmese|urdu|punjabi|literacy/i.test(s) },
  { title: 'STEM',               match: (s) => /engineering|tech|infocomm|computing|science|mathematics|robotics/i.test(s) },
  { title: 'Sports',             match: (s) => /sport|physical education|pe\b/i.test(s) },
  { title: 'Leadership & Enrichment', match: (s) => /gifted|leadership|enrichment|learning support|reading|thinking|programme for/i.test(s) },
];

function groupProgrammesForFilter(programmes: string[]): { title: string; items: string[] }[] {
  const seen = new Set<string>();
  const groups: { title: string; items: string[] }[] = PROGRAMME_FILTER_GROUPS.map((g) => ({ title: g.title, items: [] }));
  const others: string[] = [];
  for (const p of programmes) {
    if (seen.has(p)) continue;
    seen.add(p);
    const idx = PROGRAMME_FILTER_GROUPS.findIndex((g) => g.match(p));
    if (idx >= 0) groups[idx].items.push(p);
    else others.push(p);
  }
  if (others.length > 0) groups.push({ title: 'Others', items: others });
  return groups.filter((g) => g.items.length > 0);
}

function ProgrammeGroupSelect({
  label, options, selected, onChange,
}: {
  label?: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const allGroups = groupProgrammesForFilter(options);
  const toggle = (item: string) =>
    onChange(selected.includes(item) ? selected.filter((s) => s !== item) : [...selected, item]);
  const toggleGroup = (title: string) =>
    setExpandedGroups((prev) => { const n = new Set(prev); if (n.has(title)) n.delete(title); else n.add(title); return n; });

  const filteredGroups = search
    ? allGroups.map((g) => ({ ...g, items: g.items.filter((i) => i.toLowerCase().includes(search.toLowerCase())) })).filter((g) => g.items.length > 0)
    : allGroups;

  return (
    <div className="space-y-2">
      {label && <label className="text-[13px] font-semibold text-dark block">{label}</label>}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((item) => (
            <span key={item} className="inline-flex items-center gap-1 bg-sky-50 text-sky-600 text-[12px] px-2.5 py-1 rounded-full font-medium border border-sky-100">
              {item}
              <button type="button" onClick={() => toggle(item)} className="text-sky-400 hover:text-sky-700">
                <X size={10} strokeWidth={2.5} />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        value={search}
        onChange={(e) => { setSearch(e.target.value); if (e.target.value) setExpandedGroups(new Set(allGroups.map((g) => g.title))); }}
        placeholder="Search programmes…"
        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-sky-300/20 focus:border-sky-300/40"
      />
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        {filteredGroups.map((group, idx) => {
          const isOpen = expandedGroups.has(group.title);
          const sel = group.items.filter((i) => selected.includes(i)).length;
          return (
            <div key={group.title} className={idx > 0 ? 'border-t border-gray-100' : ''}>
              <button type="button" onClick={() => toggleGroup(group.title)} className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-surface transition-colors text-left">
                <span className="text-[13px] font-semibold text-dark">{group.title}</span>
                <div className="flex items-center gap-2">
                  {sel > 0 && <span className="text-[11px] bg-sky-50 text-sky-600 font-bold px-1.5 py-0.5 rounded-full border border-sky-100">{sel}</span>}
                  <span className="text-muted text-[10px]">{isOpen ? '▲' : '▼'}</span>
                </div>
              </button>
              {isOpen && (
                <div className="bg-surface/50 max-h-40 overflow-y-auto divide-y divide-gray-100">
                  {group.items.map((item) => (
                    <label key={item} className="flex items-center gap-2.5 px-4 py-2 cursor-pointer hover:bg-white transition-colors">
                      <input type="checkbox" checked={selected.includes(item)} onChange={() => toggle(item)} className="w-3.5 h-3.5 accent-sky-400" />
                      <span className="text-[13px] text-dark">{item}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Distinctive Programme Group Select ────────────────────────────────────────
// Items are stored as "DOMAIN::Title" strings. Domain is the natural group label;
// only the title portion is shown in checkboxes and chips.
function toTitleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function groupDistinctiveForFilter(items: string[]): { title: string; items: string[] }[] {
  const grouped: Record<string, string[]> = {};
  for (const item of items) {
    const sep = item.indexOf('::');
    const domain = sep >= 0 ? item.slice(0, sep) : 'Others';
    if (!grouped[domain]) grouped[domain] = [];
    grouped[domain].push(item);
  }
  return Object.keys(grouped)
    .sort()
    .map((domain) => ({ title: toTitleCase(domain), items: grouped[domain] }));
}

function DistinctiveGroupSelect({
  label, options, selected, onChange,
}: {
  label?: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  // Display only the portion after "::"
  const displayTitle = (item: string) => { const i = item.indexOf('::'); return i >= 0 ? item.slice(i + 2) : item; };

  const allGroups = groupDistinctiveForFilter(options);
  const toggle = (item: string) =>
    onChange(selected.includes(item) ? selected.filter((s) => s !== item) : [...selected, item]);
  const toggleGroup = (title: string) =>
    setExpandedGroups((prev) => { const n = new Set(prev); if (n.has(title)) n.delete(title); else n.add(title); return n; });

  const filteredGroups = search
    ? allGroups
        .map((g) => ({ ...g, items: g.items.filter((i) => displayTitle(i).toLowerCase().includes(search.toLowerCase())) }))
        .filter((g) => g.items.length > 0)
    : allGroups;

  return (
    <div className="space-y-2">
      {label && <label className="text-[13px] font-semibold text-dark block">{label}</label>}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((item) => (
            <span key={item} className="inline-flex items-center gap-1 bg-sky-50 text-sky-600 text-[12px] px-2.5 py-1 rounded-full font-medium border border-sky-100">
              {displayTitle(item)}
              <button type="button" onClick={() => toggle(item)} className="text-sky-400 hover:text-sky-700">
                <X size={10} strokeWidth={2.5} />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        value={search}
        onChange={(e) => { setSearch(e.target.value); if (e.target.value) setExpandedGroups(new Set(allGroups.map((g) => g.title))); }}
        placeholder="Search distinctive programmes…"
        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-sky-300/20 focus:border-sky-300/40"
      />
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        {filteredGroups.map((group, idx) => {
          const isOpen = expandedGroups.has(group.title);
          const sel = group.items.filter((i) => selected.includes(i)).length;
          return (
            <div key={group.title} className={idx > 0 ? 'border-t border-gray-100' : ''}>
              <button type="button" onClick={() => toggleGroup(group.title)} className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-surface transition-colors text-left">
                <span className="text-[13px] font-semibold text-dark">{group.title}</span>
                <div className="flex items-center gap-2">
                  {sel > 0 && <span className="text-[11px] bg-sky-50 text-sky-600 font-bold px-1.5 py-0.5 rounded-full border border-sky-100">{sel}</span>}
                  <span className="text-muted text-[10px]">{isOpen ? '▲' : '▼'}</span>
                </div>
              </button>
              {isOpen && (
                <div className="bg-surface/50 max-h-40 overflow-y-auto divide-y divide-gray-100">
                  {group.items.map((item) => (
                    <label key={item} className="flex items-center gap-2.5 px-4 py-2 cursor-pointer hover:bg-white transition-colors">
                      <input type="checkbox" checked={selected.includes(item)} onChange={() => toggle(item)} className="w-3.5 h-3.5 accent-sky-400" />
                      <span className="text-[13px] text-dark">{displayTitle(item)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Preference Modal ─────────────────────────────────────────────────────────
function PreferenceModal({
  open, onClose, initial, onApply, saveKey, ccaOptions, ccasGrouped, programmeOptions, subjectOptions, distinctiveOptions,
}: {
  open: boolean;
  onClose: () => void;
  initial: PreferencesState;
  onApply: (p: PreferencesState) => void;
  saveKey: string;
  ccaOptions: string[];
  ccasGrouped: CcaGroup[];
  programmeOptions: string[];
  subjectOptions: string[];
  distinctiveOptions: string[];
}) {
  const [step, setStep] = useState(0);
  const [homePostal, setHomePostal] = useState(initial.home.postal);
  const [mustHaves, setMustHaves] = useState<MustHaves>(initial.mustHaves);
  const [rankedCriteria, setRankedCriteria] = useState<RankedCriterion[]>(initial.goodToHaves.rankedCriteria);
  const [desiredCCAs, setDesiredCCAs] = useState<string[]>(initial.goodToHaves.desiredCCAs ?? []);
  const [desiredProgrammes, setDesiredProgrammes] = useState<string[]>(initial.goodToHaves.desiredProgrammes ?? []);
  const [desiredSubjects, setDesiredSubjects] = useState<string[]>(initial.goodToHaves.desiredSubjectsLanguages ?? []);
  const [desiredDistinctive, setDesiredDistinctive] = useState<string[]>(initial.goodToHaves.desiredDistinctive ?? []);
  const [maxCommute, setMaxCommute] = useState(initial.mustHaves.maxCommuteMins?.toString() ?? '');
  const [commuteIsMust, setCommuteIsMust] = useState(initial.mustHaves.maxCommuteMins != null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [postalStatus, setPostalStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');

  // Auto-validate postal when exactly 6 digits are entered
  useEffect(() => {
    if (!/^\d{6}$/.test(homePostal)) {
      setPostalStatus('idle');
      return;
    }
    setPostalStatus('checking');
    const ctrl = new AbortController();
    fetch(
      `https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${homePostal}&returnGeom=N&getAddrDetails=N&pageNum=1`,
      { signal: ctrl.signal }
    )
      .then((r) => r.json())
      .then((d: { found?: number }) => setPostalStatus((d.found ?? 0) > 0 ? 'valid' : 'invalid'))
      .catch(() => setPostalStatus('idle')); // network error — don't block
    return () => ctrl.abort();
  }, [homePostal]);

  // Criteria that are locked as must-haves cannot also appear as good-to-have ranked criteria.
  // A non-commute criterion is locked if it has one or more required items set.
  const mustHaveLockedCriteria = new Set<RankedCriterion>([
    ...(commuteIsMust ? ['commute' as const] : []),
    ...(mustHaves.requiredCCAs?.length         ? ['ccas' as const]              : []),
    ...(mustHaves.requiredProgrammes?.length   ? ['programmes' as const]        : []),
    ...(mustHaves.requiredSubjectsLanguages?.length ? ['subjectsLanguages' as const] : []),
    ...(mustHaves.requiredDistinctive?.length  ? ['distinctive' as const]       : []),
  ]);
  const criteriaForRanking = ALL_CRITERIA.filter((c) => !mustHaveLockedCriteria.has(c));
  const effectiveRanked = rankedCriteria.filter((c) => criteriaForRanking.includes(c));

  const buildPrefs = (): PreferencesState => ({
    home: { postal: homePostal },
    mustHaves: {
      ...(commuteIsMust && maxCommute ? { maxCommuteMins: parseInt(maxCommute) } : {}),
      requiredCCAs: mustHaves.requiredCCAs ?? [],
      requiredProgrammes: mustHaves.requiredProgrammes ?? [],
      requiredSubjectsLanguages: mustHaves.requiredSubjectsLanguages ?? [],
      requiredDistinctive: mustHaves.requiredDistinctive ?? [],
    },
    goodToHaves: {
      rankedCriteria: effectiveRanked,
      desiredCCAs,
      desiredProgrammes,
      desiredSubjectsLanguages: desiredSubjects,
      desiredDistinctive,
    },
  });

  const handleApply = () => { onApply(buildPrefs()); onClose(); };

  const handleSave = () => {
    savePrefs(buildPrefs(), saveKey);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  };

  const handleReset = () => {
    clearSavedPrefs(saveKey);
    setHomePostal(''); setMustHaves({}); setRankedCriteria([]); setDesiredCCAs([]);
    setDesiredProgrammes([]); setDesiredSubjects([]); setDesiredDistinctive([]); setMaxCommute(''); setCommuteIsMust(false);
  };

  const steps = ['Home & Commute', 'Must-haves', 'Rank Priorities'];

  return (
    <Modal open={open} onClose={onClose} title="Set Your Preferences" size="lg">
      {/* Step indicator */}
      <div className="flex items-center mb-7">
        {steps.map((s, i) => (
          <Fragment key={s}>
            <button onClick={() => setStep(i)} className="flex flex-col items-center gap-1 group">
              <div className={`w-7 h-7 rounded-full text-[11px] font-bold flex items-center justify-center transition-all ${
                i < step
                  ? 'bg-sky-300 text-navy'
                  : i === step
                  ? 'bg-navy text-white ring-4 ring-navy/15'
                  : 'bg-surface text-muted border border-gray-200 group-hover:border-sky-300'
              }`}>
                {i < step ? <CheckCircle2 size={14} /> : i + 1}
              </div>
              <span className={`text-[10px] font-medium leading-none ${i === step ? 'text-navy' : 'text-muted'}`}>{s}</span>
            </button>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-px mx-2 mb-4 transition-colors ${i < step ? 'bg-sky-400' : 'bg-gray-200'}`} />
            )}
          </Fragment>
        ))}
      </div>

      {/* Step 0 — Home & Commute */}
      {step === 0 && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-dark block">Home Postal Code</label>
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={homePostal}
                onChange={(e) => setHomePostal(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="e.g. 520123"
                className={`w-full px-4 py-2.5 border rounded-xl text-[14px] bg-white focus:outline-none focus:ring-2 transition-colors pr-10 ${
                  postalStatus === 'valid'   ? 'border-green-400 focus:ring-green-200' :
                  postalStatus === 'invalid' ? 'border-red-400 focus:ring-red-200' :
                  'border-gray-200 focus:ring-sky-300/30 focus:border-sky-400/50'
                }`}
              />
              {postalStatus === 'checking' && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted animate-pulse">Checking…</span>
              )}
              {postalStatus === 'valid' && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-600 text-[16px]">✓</span>
              )}
              {postalStatus === 'invalid' && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500 text-[16px]">✗</span>
              )}
            </div>
            {postalStatus === 'invalid' && (
              <p className="text-[12px] text-red-500">Postal code not found on OneMap. Please check it.</p>
            )}
            {postalStatus !== 'invalid' && (
              <p className="text-[12px] text-muted">Used to compute commute time to each school.</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="commute-must" checked={commuteIsMust} onChange={(e) => setCommuteIsMust(e.target.checked)} className="w-4 h-4 accent-sky-400" />
            <label htmlFor="commute-must" className="text-[13px] font-medium text-dark">Set max commute as a must-have</label>
          </div>
          {commuteIsMust && (
            <Input label="Max Commute (minutes)" type="number" value={maxCommute} onChange={(e) => setMaxCommute(e.target.value)} placeholder="e.g. 45" hint="Schools exceeding this will be excluded" />
          )}
        </div>
      )}

      {/* Step 1 — Must-haves */}
      {step === 1 && (
        <div className="space-y-6">
          <p className="text-[13px] text-muted">Schools must satisfy ALL must-haves to appear in results.</p>

          <div>
            <h4 className="text-[13px] font-semibold text-dark mb-2">Required CCAs</h4>
            <CcaGroupSelect groups={ccasGrouped} fallbackOptions={ccaOptions} selected={mustHaves.requiredCCAs ?? []} onChange={(v) => setMustHaves((p) => ({ ...p, requiredCCAs: v }))} />
          </div>
          <div>
            <h4 className="text-[13px] font-semibold text-dark mb-2">Required Programmes</h4>
            <ProgrammeGroupSelect options={programmeOptions} selected={mustHaves.requiredProgrammes ?? []} onChange={(v) => setMustHaves((p) => ({ ...p, requiredProgrammes: v }))} />
          </div>
          <div>
            <h4 className="text-[13px] font-semibold text-dark mb-2">Required Subjects / Languages</h4>
            <SubjectGroupSelect options={subjectOptions} selected={mustHaves.requiredSubjectsLanguages ?? []} onChange={(v) => setMustHaves((p) => ({ ...p, requiredSubjectsLanguages: v }))} />
          </div>
          <div>
            <h4 className="text-[13px] font-semibold text-dark mb-2">Required Distinctive Programmes</h4>
            <DistinctiveGroupSelect options={distinctiveOptions} selected={mustHaves.requiredDistinctive ?? []} onChange={(v) => setMustHaves((p) => ({ ...p, requiredDistinctive: v }))} />
          </div>
        </div>
      )}

      {/* Step 2 — Rank priorities */}
      {step === 2 && (
        <div className="space-y-6">
          <p className="text-[13px] text-muted">Rank criteria from most to least important. ROC weights are applied in this order.</p>
          {mustHaveLockedCriteria.size > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-[12px] text-amber-800">
              <span className="font-semibold">Some criteria are already must-haves</span> and cannot be ranked here:{' '}
              {[...mustHaveLockedCriteria].map((c) => (
                <span key={c} className="inline-block bg-amber-100 border border-amber-300 text-amber-700 font-medium px-2 py-0.5 rounded-full mx-0.5">
                  {CRITERION_LABELS[c]}
                </span>
              ))}
              <span className="block mt-1 text-amber-600">Remove them from must-haves (Step 2) to rank them instead.</span>
            </div>
          )}
          <div>
            <h4 className="text-[13px] font-semibold text-dark mb-3">Select & rank criteria</h4>
            <div className="flex flex-wrap gap-2 mb-4">
              {criteriaForRanking.map((c) => (
                <button key={c} type="button"
                  onClick={() => {
                    if (effectiveRanked.includes(c)) setRankedCriteria(effectiveRanked.filter((x) => x !== c));
                    else setRankedCriteria([...effectiveRanked, c]);
                  }}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition-all ${
                    effectiveRanked.includes(c)
                      ? 'bg-navy text-white border-navy'
                      : 'border-gray-200 text-muted hover:border-gray-300 hover:text-dark'
                  }`}
                >
                  {CRITERION_LABELS[c]}
                </button>
              ))}
            </div>
            <RankList criteria={effectiveRanked} onChange={setRankedCriteria} />
          </div>
          {effectiveRanked.includes('ccas') && (
            <CcaGroupSelect label="Desired CCAs (for scoring)" groups={ccasGrouped} fallbackOptions={ccaOptions} selected={desiredCCAs} onChange={setDesiredCCAs} />
          )}
          {effectiveRanked.includes('programmes') && (
            <ProgrammeGroupSelect label="Desired Programmes (for scoring)" options={programmeOptions} selected={desiredProgrammes} onChange={setDesiredProgrammes} />
          )}
          {effectiveRanked.includes('subjectsLanguages') && (
            <MultiSelect label="Desired Subjects (for scoring)" options={subjectOptions} selected={desiredSubjects} onChange={setDesiredSubjects} />
          )}
          {effectiveRanked.includes('distinctive') && (
            <DistinctiveGroupSelect label="Desired Distinctive Programmes (for scoring)" options={distinctiveOptions} selected={desiredDistinctive} onChange={setDesiredDistinctive} />
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between mt-8 pt-4 border-t border-gray-100">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={step === 0 ? onClose : () => setStep((s) => s - 1)}>
            {step === 0 ? 'Cancel' : '← Back'}
          </Button>
          <button type="button" onClick={handleReset} className="text-[12px] text-muted hover:text-dark transition-colors px-2 py-1">
            Reset
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleSave}
            className={`flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-xl border transition-all ${
              savedFlash ? 'border-green-300 bg-green-50 text-green-600' : 'border-gray-200 text-muted hover:border-gray-300 hover:text-dark'
            }`}
          >
            <Save size={12} />
            {savedFlash ? 'Saved!' : 'Save default'}
          </button>
          {step < steps.length - 1
            ? <Button onClick={() => setStep((s) => s + 1)}>Next →</Button>
            : <Button onClick={handleApply}>Generate Results</Button>}
        </div>
      </div>
    </Modal>
  );
}
