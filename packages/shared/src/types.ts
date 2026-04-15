export interface CcaGroup {
  category: string;
  ccas: string[];
}

export interface SchoolsMeta {
  ccas: string[];
  ccasGrouped: CcaGroup[];
  programmes: string[];
  subjects: string[];
  distinctiveProgrammes: string[];
}

export type Role = 'STUDENT_PARENT' | 'ADMIN';
export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface UserProfile {
  id: string;
  supabaseUserId: string;
  role: Role;
  banned: boolean;
  displayName: string | null;
  homeAddress: string | null;
  homePostal: string | null;
  homeLat: number | null;
  homeLng: number | null;
  createdAt: string;
}

export interface SchoolSummary {
  id: string;
  name: string;
  section: string | null;
  address: string | null;
  postalCode: string | null;
  url: string | null;
  telephone: string | null;
  lat: number | null;
  lng: number | null;
}

export interface SchoolDetail extends SchoolSummary {
  overview: string | null;
  ccas: SchoolCCA[];
  programmes: SchoolProgramme[];
  subjects: SchoolSubject[];
  distinctiveProgrammes: SchoolDistinctiveProgramme[];
  avgRating: number | null;
  reviewCount: number;
  savedByMe: boolean;
}

export interface SchoolCCA {
  id: string;
  ccaName: string;
  ccaGroup: string | null;
}

export interface SchoolProgramme {
  id: string;
  programmeName: string;
}

export interface SchoolSubject {
  id: string;
  subjectName: string;
}

export interface SchoolDistinctiveProgramme {
  id: string;
  domain: string;
  title: string;
}

export interface Review {
  id: string;
  schoolId: string;
  userId: string;
  rating: number;
  comment: string;
  status: ReviewStatus;
  createdAt: string;
}

export interface ReviewWithUser extends Review {
  user?: { displayName: string | null };
}

export interface ReviewWithReports extends Review {
  reportCount: number;
  reports: ReviewReport[];
  user: { id: string; displayName: string | null; banned: boolean };
  school?: { name: string };
}

export interface ReviewReport {
  id: string;
  reviewId: string;
  reporterUserId: string;
  reason: string;
  createdAt: string;
  reporter?: { displayName: string | null };
}

export interface AdminUser {
  id: string;
  supabaseUserId: string;
  displayName: string | null;
  role: Role;
  banned: boolean;
  createdAt: string;
  _count: { reviews: number };
}

export interface MustHaves {
  maxCommuteMins?: number;
  requiredProgrammes?: string[];
  requiredSubjectsLanguages?: string[];
  requiredCCAs?: string[];
  requiredDistinctive?: string[];
}

export type RankedCriterion = 'commute' | 'programmes' | 'subjectsLanguages' | 'ccas' | 'distinctive';

export interface GoodToHaves {
  rankedCriteria: RankedCriterion[];
  desiredProgrammes?: string[];
  desiredSubjectsLanguages?: string[];
  desiredCCAs?: string[];
  desiredDistinctive?: string[];
}

export interface CommuteLeg {
  mode: string;    // WALK | BUS | SUBWAY | TRAM
  route?: string;  // bus service number or MRT line code
  durationMins: number;
  from: string;
  to: string;
}

export interface CommuteInfo {
  durationMins: number;
  transfers: number;
  legs?: CommuteLeg[];
}

export interface ScoreBreakdown {
  criterion: string;
  weight: number;
  score: number;
  contribution: number;
}

export interface RecommendationResult {
  school: SchoolSummary;
  commute: CommuteInfo;
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

export type ResultMode = 'browse' | 'filter' | 'recommendation';

export interface FilteredSchool {
  school: SchoolSummary;
  commute: (CommuteInfo & { estimated?: boolean }) | null;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

/** Returned when mode is 'filter' or 'browse' — no scores, no ranking */
export interface FilteredResponse {
  noResults: false;
  mode: 'filter' | 'browse';
  schools: FilteredSchool[];
  candidateCount: number;
  pagination: PaginationMeta;
}

export interface RecommendationResponse {
  noResults: false;
  mode: 'recommendation';
  results: RecommendationResult[];
  candidateCount: number;
}

export interface NoResultsResponse {
  noResults: true;
  mode: ResultMode;
  bottleneck: { type: string; details: string };
  suggestions: RelaxSuggestion[];
}

