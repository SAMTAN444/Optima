import { useState } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getSchool,
  getSchoolReviews,
  getSchoolCommute,
  createReview,
  editReview,
  deleteOwnReview,
  reportReview,
  saveSchool,
  unsaveSchool,
  getMe,
} from '../lib/api';
import type { ReviewWithUser, RecommendationResult, ScoreBreakdown } from '@optima/shared';
import { useAuth } from '../contexts/AuthContext';
import { useForm } from '../hooks/useForm';
import { Navbar } from '../components/Navbar';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { PageSkeleton } from '../components/LoadingSkeleton';
import {
  MapPin,
  Phone,
  Globe,
  Bookmark,
  BookmarkCheck,
  ChevronRight,
  Star,
  Flag,
  CheckCircle,
  BookOpen,
  Trophy,
  Layers,
  Bus,
  Pencil,
  Trash2,
} from 'lucide-react';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'ccas', label: 'CCAs' },
  { id: 'programmes', label: 'Programmes' },
  { id: 'subjects', label: 'Subjects' },
  { id: 'commute', label: 'Commute' },
  { id: 'reviews', label: 'Reviews' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const SUBJECT_GROUPS: { title: string; match: (s: string) => boolean }[] = [
  {
    title: 'Core',
    match: (s) =>
      ['English Language', 'Mathematics', 'Science', 'Social Studies', 'Physical Education'].includes(s),
  },
  {
    title: 'Humanities',
    match: (s) =>
      s.startsWith('Humanities') ||
      s.includes('Geography') ||
      s.includes('History') ||
      s.includes('Literature'),
  },
  {
    title: 'Sciences',
    match: (s) =>
      s.includes('Biology') ||
      s.includes('Chemistry') ||
      s.includes('Physics') ||
      s.startsWith('Science ('),
  },
  {
    title: 'Mother Tongue & Languages',
    match: (s) =>
      ['Chinese', 'Malay', 'Tamil', 'Hindi', 'Urdu', 'French', 'Burmese', 'Gujarati', 'Punjabi', 'Bengali', 'Arabic'].some(
        (lang) => s.includes(lang),
      ),
  },
  {
    title: 'Computing & Tech',
    match: (s) => s.includes('Comput') || s.includes('Design') || s.includes('Technology'),
  },
  {
    title: 'Arts',
    match: (s) => s.includes('Art') || s.includes('Music'),
  },
  {
    title: 'Business & Applied',
    match: (s) =>
      s.includes('Accounts') ||
      s.includes('Business') ||
      s.includes('Food') ||
      s.includes('Nutrition'),
  },
];

function groupSubjects(subjects: string[]): Record<string, string[]> {
  const seen = new Set<string>();
  const result: Record<string, string[]> = {};

  for (const group of SUBJECT_GROUPS) {
    result[group.title] = [];
  }
  result['Others'] = [];

  for (const raw of subjects) {
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const matched = SUBJECT_GROUPS.find((g) => g.match(raw));
    const title = matched ? matched.title : 'Others';
    result[title].push(raw);
  }

  for (const title of Object.keys(result)) {
    result[title].sort((a, b) => a.localeCompare(b));
    if (result[title].length === 0) delete result[title];
  }

  return result;
}

// Generate a deterministic soft background color from school name
function schoolColor(name: string) {
  const palette = [
    'bg-blue-50 text-blue-600',
    'bg-violet-50 text-violet-600',
    'bg-emerald-50 text-emerald-600',
    'bg-amber-50 text-amber-600',
    'bg-rose-50 text-rose-600',
    'bg-cyan-50 text-cyan-600',
    'bg-indigo-50 text-indigo-600',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  return palette[Math.abs(hash) % palette.length];
}

// ── Overview mode helpers ─────────────────────────────────────────────────

const OVERVIEW_CRITERION_LABELS: Record<string, string> = {
  commute: 'Commute',
  programmes: 'Programmes',
  subjectsLanguages: 'Subjects & Languages',
  ccas: 'CCAs',
  distinctive: 'Distinctive Programmes',
};

/** Infer a broad Singapore region from an address string, or null if unknown. */
export function inferRegion(address: string | null): string | null {
  if (!address) return null;
  const a = address.toLowerCase();
  if (/tampines|pasir ris|bedok|changi|geylang|kallang|katong|siglap/.test(a)) return 'East';
  if (/woodlands|yishun|sembawang|sengkang|punggol|ang mo kio|bishan|serangoon|hougang/.test(a)) return 'North / North-East';
  if (/jurong|boon lay|clementi|bukit batok|choa chu kang|bukit panjang|west coast|tengah/.test(a)) return 'West';
  if (/orchard|novena|toa payoh|queenstown|buona vista|bukit merah|alexandra|tiong bahru|dover|kent ridge/.test(a)) return 'Central';
  return null;
}

/** Generate 2–3 neutral school highlights from school data alone. */
export function generateHighlights(
  ccaCount: number,
  subjectCount: number,
  programmeCount: number,
  distinctiveCount: number,
  section: string | null,
): string[] {
  const highlights: string[] = [];
  if (ccaCount >= 20) highlights.push('Wide variety of CCAs');
  else if (ccaCount >= 10) highlights.push('Good range of CCAs');
  if (subjectCount >= 25) highlights.push('Broad academic curriculum');
  else if (subjectCount >= 15) highlights.push('Diverse subject offerings');
  if (programmeCount >= 3) highlights.push('Multiple MOE programmes');
  if (distinctiveCount >= 2) highlights.push('Distinctive school programmes');
  const sec = section?.toLowerCase() ?? '';
  if (sec.includes('mixed level') || sec.includes('integrated')) {
    highlights.push('Integrated Programme (direct JC pathway)');
  }
  return highlights.slice(0, 3);
}

/** Router state shape for SchoolProfile */
interface SchoolRouterState {
  from?: string;
  recommendation?: { result: RecommendationResult; rank: number };
}

function StarRating({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={size}
          className={i < rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'}
        />
      ))}
    </div>
  );
}

export function SchoolProfile() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const routerLocation = useLocation();
  const routerState = (routerLocation.state as SchoolRouterState | null) ?? {};
  const backUrl = routerState.from ?? '/app/search';
  // recContext is present only when the user navigated here from the ranked
  // recommendation list. In all other cases (browse, filter, quick-filters)
  // it is undefined → Browse/Filter mode.
  const recContext = routerState.recommendation ?? null;
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [reportModal, setReportModal] = useState<{ open: boolean; reviewId: string }>({
    open: false,
    reviewId: '',
  });
  const [reportReason, setReportReason] = useState('');
  const [reviewSuccess, setReviewSuccess] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  // Track which reviews the current user has already reported (local session state)
  const [reportedReviewIds, setReportedReviewIds] = useState<Set<string>>(new Set());
  const [reportSuccess, setReportSuccess] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [commutePostal, setCommutePostal] = useState('');
  const [editingReview, setEditingReview] = useState<{ id: string; rating: number; comment: string } | null>(null);
  const [deletingReviewId, setDeletingReviewId] = useState<string | null>(null);

  const { data: schoolResp, isPending } = useQuery({
    queryKey: ['school', id],
    queryFn: () => getSchool(id!),
    enabled: !!id,
  });

  const { data: reviewsResp } = useQuery({
    queryKey: ['school-reviews', id],
    queryFn: () => getSchoolReviews(id!),
    enabled: !!id && activeTab === 'reviews',
  });

  const { data: meResp } = useQuery({
    queryKey: ['me', user?.id],
    queryFn: getMe,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
  const myProfileId = meResp?.ok ? meResp.data?.id : undefined;

  const saveMutation = useMutation({
    mutationFn: () =>
      schoolResp?.ok && schoolResp.data.savedByMe ? unsaveSchool(id!) : saveSchool(id!),
    onSuccess: (data) => {
      if (!data.ok) return;
      queryClient.invalidateQueries({ queryKey: ['school', id] });
      // Also invalidate saved list so Saved Schools page reflects the change immediately
      queryClient.invalidateQueries({ queryKey: ['saved-schools', user?.id] });
    },
  });

  const {
    values: reviewValues,
    handleChange: handleReviewChange,
    setValue: setReviewValue,
    reset: resetReview,
  } = useForm({ rating: '', comment: '' });

  const reviewMutation = useMutation({
    mutationFn: () =>
      createReview(id!, { rating: parseInt(reviewValues.rating), comment: reviewValues.comment }),
    onSuccess: (data) => {
      setReviewError(null);
      if (!data.ok) {
        // Show user-friendly error for known codes
        const code = (data as { ok: false; error: { code: string; message: string } }).error?.code;
        if (code === 'DUPLICATE') {
          setReviewError('You have already reviewed this school. You can edit your existing review.');
        } else if (code === 'BANNED') {
          setReviewError('Your account has been suspended from posting reviews.');
        } else {
          setReviewError('Failed to submit review. Please try again.');
        }
        return;
      }
      setReviewSuccess(true);
      resetReview();
      queryClient.invalidateQueries({ queryKey: ['school-reviews', id] });
      queryClient.invalidateQueries({ queryKey: ['school', id] });
      setTimeout(() => setReviewSuccess(false), 4000);
    },
    onError: () => {
      setReviewError('Could not reach the server. Please check your connection and try again.');
    },
  });

  const reportMutation = useMutation({
    mutationFn: () => reportReview(reportModal.reviewId, { reason: reportReason }),
    onSuccess: (data) => {
      const reportedId = reportModal.reviewId;
      if (!data.ok) {
        // Duplicate report — keep modal open and show message
        setReportError('You have already reported this review.');
        return;
      }
      setReportModal({ open: false, reviewId: '' });
      setReportReason('');
      setReportError(null);
      // Mark this review as reported locally so the button shows "Reported"
      setReportedReviewIds((prev) => new Set(prev).add(reportedId));
      setReportSuccess(true);
      setTimeout(() => setReportSuccess(false), 3000);
    },
  });

  const editReviewMutation = useMutation({
    mutationFn: (vars: { id: string; rating: number; comment: string }) =>
      editReview(vars.id, { rating: vars.rating, comment: vars.comment }),
    onSuccess: (data) => {
      if (!data.ok) return;
      setEditingReview(null);
      queryClient.invalidateQueries({ queryKey: ['school-reviews', id] });
      queryClient.invalidateQueries({ queryKey: ['school', id] });
    },
  });

  const deleteReviewMutation = useMutation({
    mutationFn: (reviewId: string) => deleteOwnReview(reviewId),
    onSuccess: (data) => {
      if (!data.ok) return;
      setDeletingReviewId(null);
      queryClient.invalidateQueries({ queryKey: ['school-reviews', id] });
      queryClient.invalidateQueries({ queryKey: ['school', id] });
    },
  });

  const commuteMutation = useMutation({
    mutationFn: () => getSchoolCommute(id!, commutePostal),
  });

  if (isPending) return <PageSkeleton />;
  if (!schoolResp?.ok || !schoolResp.data) {
    return (
      <div className="min-h-screen bg-surface flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-4xl mb-3">🏫</p>
            <p className="text-muted">School not found</p>
            <Link to={backUrl} className="text-sky-700 text-sm mt-2 block hover:underline">
              ← Back to search
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const school = schoolResp.data;
  const reviews: ReviewWithUser[] = reviewsResp?.ok ? reviewsResp.data : [];
  const colorClass = schoolColor(school.name);
  const initials = school.name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  const tabCounts: Record<TabId, string> = {
    overview: '',
    ccas: school.ccas.length > 0 ? `${school.ccas.length}` : '',
    programmes: school.programmes.length > 0 ? `${school.programmes.length}` : '',
    subjects: school.subjects.length > 0 ? `${school.subjects.length}` : '',
    commute: '',
    reviews: school.reviewCount > 0 ? `${school.reviewCount}` : '',
  };

  return (
    <div className="min-h-screen bg-surface">
      <Navbar />

      {/* ── School Header ── */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-[1700px] mx-auto px-8 lg:px-16 py-8">
          <Link
            to={backUrl}
            className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-dark transition-colors mb-6"
          >
            ← Back to search
          </Link>

          <div className="flex items-start gap-5">
            {/* School avatar */}
            <div
              className={`w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold flex-shrink-0 ${colorClass}`}
            >
              {initials}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h1 className="text-[30px] md:text-[36px] font-extrabold text-dark tracking-[-0.02em] leading-tight">
                    {school.name}
                  </h1>
                  <div className="flex items-center flex-wrap gap-3 mt-2">
                    {school.section && (
                      <Badge variant="blue">{school.section}</Badge>
                    )}
                    {school.avgRating != null && (
                      <div className="flex items-center gap-1.5">
                        <StarRating rating={Math.round(school.avgRating)} size={13} />
                        <span className="text-[13px] font-semibold text-dark">
                          {school.avgRating.toFixed(1)}
                        </span>
                        <span className="text-[13px] text-muted">
                          ({school.reviewCount} review{school.reviewCount !== 1 ? 's' : ''})
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                    {school.address && (
                      <span className="flex items-center gap-1 text-[13px] text-muted">
                        <MapPin size={13} />
                        {school.address}
                      </span>
                    )}
                    {school.telephone && (
                      <span className="flex items-center gap-1 text-[13px] text-muted">
                        <Phone size={13} />
                        {school.telephone}
                      </span>
                    )}
                    {school.url && (
                      <a
                        href={school.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[13px] text-sky-700 hover:underline"
                      >
                        <Globe size={13} />
                        Website
                        <ChevronRight size={11} />
                      </a>
                    )}
                  </div>
                </div>

                {user && (
                  <Button
                    variant={school.savedByMe ? 'secondary' : 'primary'}
                    size="sm"
                    onClick={() => saveMutation.mutate()}
                    loading={saveMutation.isPending}
                  >
                    {school.savedByMe ? (
                      <>
                        <BookmarkCheck size={14} /> Saved
                      </>
                    ) : (
                      <>
                        <Bookmark size={14} /> Save School
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Stat strip */}
          <div className="flex gap-6 mt-6 pt-5 border-t border-gray-100 overflow-x-auto">
            {[
              { label: 'CCAs', value: school.ccas.length, icon: <Trophy size={14} /> },
              { label: 'Programmes', value: school.programmes.length, icon: <BookOpen size={14} /> },
              { label: 'Subjects', value: school.subjects.length, icon: <Layers size={14} /> },
              {
                label: 'Distinctive',
                value: school.distinctiveProgrammes.length,
                icon: <Star size={14} />,
              },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-2 flex-shrink-0">
                <span className="text-muted">{s.icon}</span>
                <span className="text-[22px] font-extrabold text-dark tracking-tight">
                  {s.value}
                </span>
                <span className="text-[13px] text-muted">{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tab nav */}
        <div className="max-w-[1700px] mx-auto px-8 lg:px-16">
          <div className="flex gap-0 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-3.5 text-[14px] font-semibold border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-sky-400 text-sky-600'
                    : 'border-transparent text-muted hover:text-dark'
                }`}
              >
                {tab.label}
                {tabCounts[tab.id] && (
                  <span
                    className={`text-[11px] px-1.5 py-0.5 rounded-full font-bold ${
                      activeTab === tab.id
                        ? 'bg-sky-50 text-sky-600'
                        : 'bg-gray-100 text-muted'
                    }`}
                  >
                    {tabCounts[tab.id]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div className="max-w-[1700px] mx-auto px-8 lg:px-16 py-8">
        {/* Overview */}
        {activeTab === 'overview' && (
          <div className="space-y-6">

            {/* ── Top row: overview card (dominant) + compact school info ── */}
            {/* 3:1 ratio in both modes — left is always the main focus */}
            <div className="grid grid-cols-1 lg:grid-cols-[3fr_1fr] gap-5 items-start">
              {/* Left: context-aware overview card */}
              <div>
                {recContext && <RecommendationOverviewCard rec={recContext} />}
                {!recContext && <BrowseOverviewCard school={school} onTabChange={setActiveTab} />}
              </div>

              {/* Right: compact school info — sized to content, not stretched */}
              <div className="bg-white rounded-2xl border border-gray-200 p-4">
                <h3 className="text-[13px] font-bold text-dark mb-3">School Info</h3>
                <div className="space-y-3">
                  {school.section && (
                    <div>
                      <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-1">
                        Type
                      </p>
                      <p className="text-[14px] text-dark font-medium">{school.section}</p>
                    </div>
                  )}
                  {school.address && (
                    <div>
                      <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-1">
                        Address
                      </p>
                      <p className="text-[14px] text-dark leading-snug">{school.address}</p>
                    </div>
                  )}
                  {school.telephone && (
                    <div>
                      <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-1">
                        Phone
                      </p>
                      <p className="text-[14px] text-dark">{school.telephone}</p>
                    </div>
                  )}
                  {school.url && (
                    <a
                      href={school.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-[13px] text-sky-700 hover:underline font-medium"
                    >
                      <Globe size={13} />
                      Official Website
                      <ChevronRight size={11} />
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* ── Distinctive Programmes (full-width, below top row) ── */}
            {school.distinctiveProgrammes.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[15px] font-bold text-dark">Distinctive Programmes</h2>
                  {school.distinctiveProgrammes.length > 4 && (
                    <button
                      onClick={() => setActiveTab('programmes')}
                      className="text-[12px] text-sky-700 hover:underline font-medium"
                    >
                      View all →
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {school.distinctiveProgrammes.slice(0, 4).map((d) => (
                    <div key={d.id} className="bg-surface rounded-xl p-4 border border-gray-100">
                      <p className="text-[11px] font-bold text-sky-700 uppercase tracking-widest mb-1">
                        {d.domain}
                      </p>
                      <p className="text-[14px] text-dark font-medium leading-snug">{d.title}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* CCAs */}
        {activeTab === 'ccas' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="text-[16px] font-bold text-dark mb-5">Co-Curricular Activities</h2>
            {school.ccas.length === 0 ? (
              <EmptyState icon="🏃" message="No CCA data available for this school." />
            ) : (
              <div>
                {/* Group by ccaGroup */}
                {(() => {
                  // ccaName = broad category (PHYSICAL SPORTS), ccaGroup = specific CCA (BOCCIA)
                  const groups = new Map<string, typeof school.ccas>();
                  school.ccas.forEach((cca) => {
                    const g = cca.ccaName || 'Others';
                    groups.set(g, [...(groups.get(g) ?? []), cca]);
                  });
                  return Array.from(groups.entries()).map(([group, ccas]) => (
                    <div key={group} className="mb-6 last:mb-0">
                      <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-3">
                        {group}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {ccas.map((cca) => (
                          <span
                            key={cca.id}
                            className="px-3 py-1.5 rounded-xl bg-surface border border-gray-200 text-[13px] font-medium text-dark"
                          >
                            {cca.ccaGroup || cca.ccaName}
                          </span>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>
        )}

        {/* Programmes */}
        {activeTab === 'programmes' && (
          <div className="space-y-4">
            {school.programmes.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="text-[16px] font-bold text-dark mb-4">MOE Programmes</h2>
                <ul className="space-y-2.5">
                  {school.programmes.map((p) => (
                    <li key={p.id} className="flex items-center gap-3">
                      <CheckCircle size={15} className="text-sky-500 flex-shrink-0" />
                      <span className="text-[14px] text-dark">{p.programmeName}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {school.distinctiveProgrammes.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="text-[16px] font-bold text-dark mb-4">
                  School Distinctive Programmes
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {school.distinctiveProgrammes.map((d) => (
                    <div
                      key={d.id}
                      className="bg-surface rounded-xl p-4 border border-gray-100"
                    >
                      <p className="text-[11px] font-bold text-sky-500 uppercase tracking-widest mb-1">
                        {d.domain}
                      </p>
                      <p className="text-[14px] text-dark font-medium leading-snug">{d.title}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {school.programmes.length === 0 && school.distinctiveProgrammes.length === 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <EmptyState icon="📚" message="No programme data available for this school." />
              </div>
            )}
          </div>
        )}

        {/* Subjects */}
        {activeTab === 'subjects' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="text-[16px] font-bold text-dark mb-5">Subjects Offered</h2>
            {school.subjects.length === 0 ? (
              <EmptyState icon="📖" message="No subject data available for this school." />
            ) : (
              <div>
                {Object.entries(groupSubjects(school.subjects.map((s) => s.subjectName))).map(
                  ([title, names]) => (
                    <div key={title} className="mb-6 last:mb-0">
                      <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-3">
                        {title}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {names.map((name) => (
                          <span
                            key={name}
                            className="px-3 py-1.5 rounded-xl bg-surface border border-gray-200 text-[13px] font-medium text-dark"
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        )}

        {/* Commute */}
        {activeTab === 'commute' && (
          <div className="space-y-4">
            {/* Interactive commute checker */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="flex items-start gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center text-sky-500 flex-shrink-0">
                  <Bus size={20} />
                </div>
                <div>
                  <h2 className="text-[16px] font-bold text-dark">Check Commute</h2>
                  <p className="text-[14px] text-muted mt-0.5">
                    Public transport from your home to this school
                  </p>
                </div>
              </div>

              {/* Postal input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={commutePostal}
                  onChange={(e) => setCommutePostal(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && commutePostal.length === 6) commuteMutation.mutate();
                  }}
                  placeholder="Your postal code (e.g. 425304)"
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] text-dark placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-navy/15 focus:border-navy/30 transition-colors"
                />
                <Button
                  size="sm"
                  loading={commuteMutation.isPending}
                  onClick={() => commuteMutation.mutate()}
                  disabled={commutePostal.length !== 6}
                >
                  Check
                </Button>
              </div>

              {/* Error */}
              {commuteMutation.data && !commuteMutation.data.ok && (
                <div className="mt-4 bg-red-50 border border-red-100 rounded-xl p-4">
                  <p className="text-[13px] text-red-700">
                    {commuteMutation.data.error.message}
                  </p>
                </div>
              )}

              {/* No result (should not happen with fallback, kept as safety net) */}
              {commuteMutation.data?.ok && commuteMutation.data.data === null && (
                <div className="mt-4 bg-amber-50 border border-amber-100 rounded-xl p-4">
                  <p className="text-[13px] text-amber-700">
                    Could not estimate commute for this postal code. Please double-check it.
                  </p>
                </div>
              )}

              {/* Results */}
              {commuteMutation.data?.ok && commuteMutation.data.data != null && (() => {
                const result = commuteMutation.data.data!;
                const isEstimate = (result as { estimated?: boolean }).estimated === true;
                return (
                  <div className="mt-5">
                    {isEstimate && (
                      <div className="mb-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2.5">
                        <p className="text-[12px] text-amber-700">
                          Live transit data unavailable — showing distance-based estimate.
                        </p>
                      </div>
                    )}
                    {/* Summary strip */}
                    <div className="flex items-center gap-6 bg-sky-50 border border-sky-100 rounded-xl px-5 py-4 mb-5">
                      <div className="text-center">
                        <p className="text-[28px] font-extrabold text-sky-600 leading-none">
                          {result.durationMins}
                        </p>
                        <p className="text-[11px] font-medium text-muted mt-1">min total</p>
                      </div>
                      <div className="h-10 w-px bg-sky-100" />
                      <div className="text-center">
                        <p className="text-[28px] font-extrabold text-dark leading-none">
                          {result.transfers}
                        </p>
                        <p className="text-[11px] font-medium text-muted mt-1">
                          transfer{result.transfers !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>

                    {/* Route legs */}
                    {result.legs && result.legs.length > 0 && (
                      <div>
                        <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-3">
                          Route breakdown
                        </p>
                        <div className="space-y-0">
                          {result.legs.map((leg, i) => {
                            const isWalk = leg.mode === 'WALK';
                            const isBus = leg.mode === 'BUS';
                            const isMrt = leg.mode === 'SUBWAY' || leg.mode === 'RAIL';
                            const bgColor = isWalk
                              ? 'bg-gray-100 text-gray-500'
                              : isBus
                              ? 'bg-emerald-100 text-emerald-700'
                              : isMrt
                              ? 'bg-sky-100 text-navy'
                              : 'bg-violet-100 text-violet-600';
                            const label = isWalk
                              ? 'Walk'
                              : isBus
                              ? `Bus${leg.route ? ` ${leg.route}` : ''}`
                              : isMrt
                              ? `MRT${leg.route ? ` ${leg.route}` : ''}`
                              : leg.mode;

                            return (
                              <div key={i} className="flex items-start gap-3">
                                <div className="flex flex-col items-center flex-shrink-0">
                                  <div
                                    className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold ${bgColor}`}
                                  >
                                    {isWalk ? '🚶' : isBus ? '🚌' : isMrt ? '🚇' : '🚃'}
                                  </div>
                                  {i < result.legs!.length - 1 && (
                                    <div className="w-px flex-1 min-h-[20px] bg-gray-200 my-1" />
                                  )}
                                </div>
                                <div className="pb-3 min-w-0">
                                  <p className="text-[13px] font-semibold text-dark">
                                    {label}
                                    <span className="font-normal text-muted ml-2">
                                      {leg.durationMins} min
                                    </span>
                                  </p>
                                  {(leg.from || leg.to) && (
                                    <p className="text-[12px] text-muted mt-0.5 truncate">
                                      {leg.from}
                                      {leg.from && leg.to && ' → '}
                                      {leg.to}
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* School location card */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h3 className="text-[13px] font-bold text-dark mb-3">School Location</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {school.postalCode && (
                  <div className="bg-surface rounded-xl p-3 border border-gray-100">
                    <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-1">
                      Postal Code
                    </p>
                    <p className="text-[15px] font-bold text-dark">{school.postalCode}</p>
                  </div>
                )}
                {school.lat && school.lng && (
                  <div className="bg-surface rounded-xl p-3 border border-gray-100">
                    <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-1">
                      Coordinates
                    </p>
                    <p className="text-[15px] font-bold text-dark">
                      {school.lat.toFixed(4)}, {school.lng.toFixed(4)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Reviews */}
        {activeTab === 'reviews' && (
          <div className="space-y-4">
            {/* Write review */}
            {user && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h3 className="text-[16px] font-bold text-dark mb-4">Write a Review</h3>
                {reviewSuccess && (
                  <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                    <CheckCircle size={18} className="text-green-600 flex-shrink-0" />
                    <p className="text-[14px] text-green-700">
                      Your review has been posted!
                    </p>
                  </div>
                )}
                {reviewError && (
                  <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
                    <p className="text-[14px] text-red-700">{reviewError}</p>
                  </div>
                )}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const r = parseInt(reviewValues.rating);
                      const c = reviewValues.comment.trim();
                      if (!r || r < 1 || r > 5) {
                        setReviewError('Please select a star rating before submitting.');
                        return;
                      }
                      if (c.length < 5) {
                        setReviewError('Please enter at least 5 characters in your comment.');
                        return;
                      }
                      reviewMutation.mutate();
                    }}
                    className="space-y-4"
                  >
                    <div>
                      <label className="text-[13px] font-semibold text-dark block mb-2">
                        Rating
                      </label>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setReviewValue('rating', String(n))}
                            className="p-0.5 transition-transform hover:scale-110"
                          >
                            <Star
                              size={28}
                              className={
                                parseInt(reviewValues.rating) >= n
                                  ? 'text-amber-400 fill-amber-400'
                                  : 'text-gray-200 fill-gray-200 hover:text-amber-300 hover:fill-amber-300'
                              }
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[13px] font-semibold text-dark block mb-2">
                        Comment
                      </label>
                      <textarea
                        name="comment"
                        value={reviewValues.comment}
                        onChange={(e) => { handleReviewChange(e); setReviewError(null); }}
                        rows={3}
                        placeholder="Share your experience at this school…"
                        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-dark bg-white focus:outline-none focus:ring-2 focus:ring-sky-300/30 focus:border-sky-400/50 resize-none"
                      />
                    </div>
                    <Button type="submit" loading={reviewMutation.isPending} size="sm">
                      Submit Review
                    </Button>
                  </form>
              </div>
            )}

            {/* Report success toast */}
            {reportSuccess && (
              <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
                <Flag size={16} className="text-amber-600 flex-shrink-0" />
                <p className="text-[14px] text-amber-800">
                  Report submitted. Our moderators will review it.
                </p>
              </div>
            )}

            {/* Review list */}
            {reviews.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
                <EmptyState icon="💬" message="No approved reviews yet. Be the first to review!" />
              </div>
            ) : (
              reviews.map((review) => {
                const displayName = review.user?.displayName ?? null;
                const avatarInitial = displayName
                  ? displayName.charAt(0).toUpperCase()
                  : '?';
                const isOwn = review.userId === myProfileId;
                const isEditing = editingReview?.id === review.id;
                const isDeleting = deletingReviewId === review.id;
                return (
                  <div key={review.id} className="bg-white rounded-2xl border border-gray-200 p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-surface rounded-full flex items-center justify-center border border-gray-200 flex-shrink-0">
                          <span className="text-[12px] font-bold text-muted">{avatarInitial}</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-semibold text-dark">
                              {displayName ?? 'Anonymous'}
                            </span>
                            {!isEditing && <StarRating rating={review.rating} size={12} />}
                            {isOwn && (
                              <span className="text-[10px] font-bold bg-sky-50 text-sky-600 px-1.5 py-0.5 rounded-full border border-sky-200">
                                You
                              </span>
                            )}
                          </div>
                          <p className="text-[12px] text-muted mt-0.5">
                            {new Date(review.createdAt).toLocaleDateString('en-SG', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {user && isOwn && !isEditing && !isDeleting && (
                          <>
                            <button
                              onClick={() => setEditingReview({ id: review.id, rating: review.rating, comment: review.comment })}
                              className="flex items-center gap-1 text-[12px] text-muted hover:text-sky-600 transition-colors p-1"
                            >
                              <Pencil size={12} />
                              Edit
                            </button>
                            <button
                              onClick={() => setDeletingReviewId(review.id)}
                              className="flex items-center gap-1 text-[12px] text-muted hover:text-red-500 transition-colors p-1"
                            >
                              <Trash2 size={12} />
                              Delete
                            </button>
                          </>
                        )}
                        {user && !isOwn && (
                          reportedReviewIds.has(review.id) ? (
                            <span className="flex items-center gap-1 text-[12px] text-amber-500 p-1">
                              <Flag size={12} className="fill-amber-400" />
                              Reported
                            </span>
                          ) : (
                            <button
                              onClick={() => setReportModal({ open: true, reviewId: review.id })}
                              className="flex items-center gap-1 text-[12px] text-muted hover:text-red-400 transition-colors p-1"
                            >
                              <Flag size={12} />
                              Report
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    {/* Inline delete confirm */}
                    {isDeleting && (
                      <div className="mb-3 bg-red-50 border border-red-100 rounded-xl p-3 flex items-center justify-between gap-3">
                        <p className="text-[13px] text-red-700">Delete this review?</p>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" onClick={() => setDeletingReviewId(null)}>Cancel</Button>
                          <Button
                            variant="danger"
                            size="sm"
                            loading={deleteReviewMutation.isPending}
                            onClick={() => deleteReviewMutation.mutate(review.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Inline edit form */}
                    {isEditing && editingReview && (
                      <div className="space-y-3 mt-1">
                        <div>
                          <label className="text-[12px] font-semibold text-dark block mb-1.5">Rating</label>
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <button
                                key={n}
                                type="button"
                                onClick={() => setEditingReview((prev) => prev ? { ...prev, rating: n } : prev)}
                                className="p-0.5 transition-transform hover:scale-110"
                              >
                                <Star
                                  size={24}
                                  className={editingReview.rating >= n ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'}
                                />
                              </button>
                            ))}
                          </div>
                        </div>
                        <textarea
                          value={editingReview.comment}
                          onChange={(e) => setEditingReview((prev) => prev ? { ...prev, comment: e.target.value } : prev)}
                          rows={3}
                          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-dark bg-white focus:outline-none focus:ring-2 focus:ring-sky-300/30 focus:border-sky-400/50 resize-none"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            loading={editReviewMutation.isPending}
                            onClick={() => editReviewMutation.mutate(editingReview)}
                            disabled={editingReview.comment.trim().length < 5}
                          >
                            Save
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setEditingReview(null)}>Cancel</Button>
                        </div>
                        {editReviewMutation.data && !editReviewMutation.data.ok && (
                          <p className="text-[12px] text-red-600">Failed to save. Please try again.</p>
                        )}
                      </div>
                    )}

                    {!isEditing && <p className="text-[14px] text-dark leading-relaxed">{review.comment}</p>}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Report modal */}
      <Modal
        open={reportModal.open}
        onClose={() => { setReportModal({ open: false, reviewId: '' }); setReportError(null); }}
        title="Report Review"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-[14px] text-muted">
            Please describe why you are reporting this review.
          </p>
          {reportError && (
            <p className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {reportError}
            </p>
          )}
          <textarea
            value={reportReason}
            onChange={(e) => { setReportReason(e.target.value); setReportError(null); }}
            rows={3}
            placeholder="Reason for reporting…"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300/30"
          />
          <div className="flex gap-3 justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setReportModal({ open: false, reviewId: '' }); setReportError(null); }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={reportMutation.isPending}
              onClick={() => reportMutation.mutate()}
              disabled={!reportReason.trim()}
            >
              Submit Report
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <div className="flex flex-col items-center py-8 text-center">
      <span className="text-4xl mb-3">{icon}</span>
      <p className="text-[14px] text-muted">{message}</p>
    </div>
  );
}

// ── Recommendation Overview Card ──────────────────────────────────────────────
// Shown ONLY when the user arrived from the ranked recommendation list.
// All displayed values come directly from backend recommendation data.
// Styling: light sky-blue background with dark navy text for readability.
function RecommendationOverviewCard({
  rec,
}: {
  rec: { result: RecommendationResult; rank: number };
}) {
  const { result, rank } = rec;
  const fitPct = Math.round(result.totalScore * 100);
  const matched = result.explanation.matched;

  function matchedLabel(b: ScoreBreakdown): string | null {
    switch (b.criterion) {
      case 'commute':
        return result.commute.durationMins > 0
          ? `${result.commute.durationMins} min · ${result.commute.transfers} transfer${result.commute.transfers !== 1 ? 's' : ''}`
          : null;
      case 'ccas':
        return matched.ccas.length > 0
          ? `${matched.ccas.length} CCA${matched.ccas.length !== 1 ? 's' : ''} matched`
          : null;
      case 'programmes':
        return matched.programmes.length > 0
          ? `${matched.programmes.length} programme${matched.programmes.length !== 1 ? 's' : ''} matched`
          : null;
      case 'subjectsLanguages':
        return matched.subjectsLanguages.length > 0
          ? `${matched.subjectsLanguages.length} subject${matched.subjectsLanguages.length !== 1 ? 's' : ''} matched`
          : null;
      case 'distinctive':
        return matched.distinctive.length > 0
          ? `${matched.distinctive.length} distinctive programme${matched.distinctive.length !== 1 ? 's' : ''} matched`
          : null;
      default:
        return null;
    }
  }

  const allMatchedItems = [
    ...matched.ccas,
    ...matched.programmes,
    ...matched.subjectsLanguages,
    ...matched.distinctive.map((d) => d.split('::').pop() ?? d),
  ];

  return (
    <div className="bg-sky-50 border border-sky-200 rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-600 mb-1">
            Personalised Match
          </p>
          <h2 className="text-[18px] font-extrabold text-navy leading-tight">
            Why this school matches you
          </h2>
          <p className="text-[13px] text-dark/60 mt-1">
            Ranked #{rank} by your preferences
          </p>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-[38px] font-extrabold leading-none text-navy">
            {fitPct}%
          </p>
          <p className="text-[11px] text-dark/50 mt-0.5">overall fit</p>
        </div>
      </div>

      {/* Breakdown bars */}
      <div className="space-y-3">
        {result.breakdown.map((b) => {
          const label = OVERVIEW_CRITERION_LABELS[b.criterion] ?? b.criterion;
          const scorePct = Math.round(b.score * 100);
          const detail = matchedLabel(b);
          return (
            <div key={b.criterion}>
              <div className="flex items-center justify-between mb-1 gap-3">
                <span className="text-[12px] font-semibold text-dark/80 flex-shrink-0">
                  {label}
                </span>
                <span className="text-[12px] text-dark/50 truncate text-right">
                  {detail ?? `${scorePct}% score`}
                </span>
              </div>
              <div className="h-1.5 bg-sky-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-navy rounded-full transition-all duration-500"
                  style={{ width: `${scorePct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Matched items chips */}
      {allMatchedItems.length > 0 && (
        <div className="mt-5 pt-4 border-t border-sky-100">
          <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600 mb-2">
            Items matched
          </p>
          <div className="flex flex-wrap gap-1.5">
            {allMatchedItems.map((item) => (
              <span
                key={item}
                className="text-[11px] font-medium bg-white border border-sky-200 text-navy px-2.5 py-0.5 rounded-full"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Browse / Filter Overview Card ─────────────────────────────────────────────
// Shown when the user arrived from browse, search, quick filters, or filter mode.
// Contains ONLY factual, non-personalised school information.
// No inferred claims ("broad range", "strong offering", etc.).
// Acts as a preview dashboard — each section links to its full tab.
function BrowseOverviewCard({
  school,
  onTabChange,
}: {
  school: {
    name: string;
    section: string | null;
    address: string | null;
    avgRating: number | null;
    reviewCount: number;
    ccas: { id: string; ccaName: string; ccaGroup: string | null }[];
    subjects: { id: string; subjectName: string }[];
    programmes: { id: string; programmeName: string }[];
    distinctiveProgrammes: { id: string; domain: string; title: string }[];
  };
  onTabChange: (tab: TabId) => void;
}) {
  const region = inferRegion(school.address);

  const summaryParts: string[] = [];
  if (region) summaryParts.push(`located in ${region}`);
  const summary = summaryParts.length > 0
    ? `A secondary school ${summaryParts.join(', ')}.`
    : 'A Singapore secondary school.';

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted mb-0.5">
          General Overview
        </p>
        <p className="text-[14px] text-dark/80 leading-relaxed">{summary}</p>
      </div>

      {/* Preview sections — one per row */}
      <div className="divide-y divide-gray-100">

        {/* CCAs */}
        <div className="px-6 py-4 flex items-start gap-4">
          <div className="w-28 flex-shrink-0">
            <p className="text-[12px] font-bold text-dark">
              CCAs
              {school.ccas.length > 0 && (
                <span className="ml-1.5 text-[10px] font-semibold bg-gray-100 text-muted px-1.5 py-0.5 rounded-full">
                  {school.ccas.length}
                </span>
              )}
            </p>
          </div>
          <div className="flex-1 min-w-0">
            {school.ccas.length === 0 ? (
              <p className="text-[13px] text-muted italic">No CCA data available</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {school.ccas.slice(0, 6).map((cca) => (
                  <span
                    key={cca.id}
                    className="text-[12px] bg-surface border border-gray-200 text-dark px-2.5 py-0.5 rounded-lg font-medium"
                  >
                    {cca.ccaGroup || cca.ccaName}
                  </span>
                ))}
                {school.ccas.length > 6 && (
                  <span className="text-[12px] text-muted px-1 py-0.5">
                    +{school.ccas.length - 6} more
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => onTabChange('ccas')}
            className="flex-shrink-0 flex items-center gap-0.5 text-[12px] font-semibold text-sky-700 hover:text-sky-900 transition-colors"
          >
            View all <ChevronRight size={13} />
          </button>
        </div>

        {/* Programmes */}
        <div className="px-6 py-4 flex items-start gap-4">
          <div className="w-28 flex-shrink-0">
            <p className="text-[12px] font-bold text-dark">
              Programmes
              {school.programmes.length > 0 && (
                <span className="ml-1.5 text-[10px] font-semibold bg-gray-100 text-muted px-1.5 py-0.5 rounded-full">
                  {school.programmes.length}
                </span>
              )}
            </p>
          </div>
          <div className="flex-1 min-w-0">
            {school.programmes.length === 0 ? (
              <p className="text-[13px] text-muted italic">No programmes listed</p>
            ) : (
              <div className="space-y-0.5">
                {school.programmes.slice(0, 3).map((p) => (
                  <p key={p.id} className="text-[13px] text-dark/80 truncate">
                    {p.programmeName}
                  </p>
                ))}
                {school.programmes.length > 3 && (
                  <p className="text-[12px] text-muted">+{school.programmes.length - 3} more</p>
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => onTabChange('programmes')}
            className="flex-shrink-0 flex items-center gap-0.5 text-[12px] font-semibold text-sky-700 hover:text-sky-900 transition-colors"
          >
            View all <ChevronRight size={13} />
          </button>
        </div>

        {/* Subjects */}
        <div className="px-6 py-4 flex items-start gap-4">
          <div className="w-28 flex-shrink-0">
            <p className="text-[12px] font-bold text-dark">
              Subjects
              {school.subjects.length > 0 && (
                <span className="ml-1.5 text-[10px] font-semibold bg-gray-100 text-muted px-1.5 py-0.5 rounded-full">
                  {school.subjects.length}
                </span>
              )}
            </p>
          </div>
          <div className="flex-1 min-w-0">
            {school.subjects.length === 0 ? (
              <p className="text-[13px] text-muted italic">No subject data available</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {school.subjects.slice(0, 6).map((s) => (
                  <span
                    key={s.id}
                    className="text-[12px] bg-surface border border-gray-200 text-dark px-2.5 py-0.5 rounded-lg font-medium"
                  >
                    {s.subjectName}
                  </span>
                ))}
                {school.subjects.length > 6 && (
                  <span className="text-[12px] text-muted px-1 py-0.5">
                    +{school.subjects.length - 6} more
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => onTabChange('subjects')}
            className="flex-shrink-0 flex items-center gap-0.5 text-[12px] font-semibold text-sky-700 hover:text-sky-900 transition-colors"
          >
            View all <ChevronRight size={13} />
          </button>
        </div>

        {/* Commute */}
        <div className="px-6 py-4 flex items-start gap-4">
          <div className="w-28 flex-shrink-0">
            <p className="text-[12px] font-bold text-dark">Commute</p>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-muted">
              Enter your postal code to check transit time
            </p>
          </div>
          <button
            onClick={() => onTabChange('commute')}
            className="flex-shrink-0 flex items-center gap-0.5 text-[12px] font-semibold text-sky-700 hover:text-sky-900 transition-colors"
          >
            Check <ChevronRight size={13} />
          </button>
        </div>

        {/* Reviews */}
        <div className="px-6 py-4 flex items-start gap-4">
          <div className="w-28 flex-shrink-0">
            <p className="text-[12px] font-bold text-dark">Reviews</p>
          </div>
          <div className="flex-1 min-w-0">
            {school.reviewCount === 0 ? (
              <p className="text-[13px] text-muted italic">No reviews yet</p>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      size={12}
                      className={
                        school.avgRating != null && i < Math.round(school.avgRating)
                          ? 'text-amber-400 fill-amber-400'
                          : 'text-gray-200 fill-gray-200'
                      }
                    />
                  ))}
                </div>
                {school.avgRating != null && (
                  <span className="text-[13px] font-semibold text-dark">
                    {school.avgRating.toFixed(1)}
                  </span>
                )}
                <span className="text-[13px] text-muted">
                  ({school.reviewCount} review{school.reviewCount !== 1 ? 's' : ''})
                </span>
              </div>
            )}
          </div>
          <button
            onClick={() => onTabChange('reviews')}
            className="flex-shrink-0 flex items-center gap-0.5 text-[12px] font-semibold text-sky-700 hover:text-sky-900 transition-colors"
          >
            Read <ChevronRight size={13} />
          </button>
        </div>

      </div>

      {/* Footer CTA */}
      <div className="px-6 py-3.5 bg-surface border-t border-gray-100">
        <p className="text-[12px] text-muted">
          <Link to="/app/search" className="text-sky-700 hover:underline font-medium">
            Set your preferences
          </Link>
          {' '}to see how well this school matches your needs.
        </p>
      </div>
    </div>
  );
}
