import { supabase } from './supabase';
import type {
  ApiResponse,
  UserProfile,
  SchoolSummary,
  SchoolDetail,
  SchoolsMeta,
  Review,
  ReviewWithUser,
  ReviewWithReports,
  RecommendationResponse,
  FilteredResponse,
  NoResultsResponse,
  RecommendationRequest,
  UpdateProfileInput,
  CreateReviewInput,
  UpdateReviewInput,
  ReportReviewInput,
  CommuteInfo,
  AdminUser,
} from '@optima/shared';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { 'Content-Type': 'application/json' };
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const headers = await getAuthHeaders();
  const resp = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string>) },
  });
  return resp.json() as Promise<ApiResponse<T>>;
}

// Profile
export const getMe = () => apiFetch<UserProfile>('/me');
export const updateMe = (body: UpdateProfileInput) =>
  apiFetch<UserProfile>('/me', { method: 'PATCH', body: JSON.stringify(body) });
export const getSavedSchools = () => apiFetch<SchoolSummary[]>('/me/saved-schools');

// Schools
function buildSchoolsQs(params?: Record<string, string | string[]>): string {
  if (!params) return '';
  const parts: string[] = [];
  for (const [key, val] of Object.entries(params)) {
    const arr = Array.isArray(val) ? val : [val];
    for (const v of arr) parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
  }
  return parts.length ? '?' + parts.join('&') : '';
}

export const getSchools = (params?: Record<string, string | string[]>) => {
  return apiFetch<{ schools: SchoolSummary[]; pagination: { total: number; page: number; pageSize: number; totalPages: number } }>(
    `/schools${buildSchoolsQs(params)}`
  );
};

export const getSchool = (id: string) => apiFetch<SchoolDetail>(`/schools/${id}`);

export const getSchoolsMeta = () => apiFetch<SchoolsMeta>('/schools/meta');

export const getSchoolCommute = (schoolId: string, postal: string) =>
  apiFetch<CommuteInfo | null>(`/schools/${schoolId}/commute`, {
    method: 'POST',
    body: JSON.stringify({ postal }),
  });

export const getSchoolReviews = (id: string) =>
  apiFetch<ReviewWithUser[]>(`/schools/${id}/reviews`);

export const createReview = (schoolId: string, body: CreateReviewInput) =>
  apiFetch<Review>(`/schools/${schoolId}/reviews`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const saveSchool = (id: string) =>
  apiFetch<{ saved: boolean }>(`/schools/${id}/save`, { method: 'POST' });

export const unsaveSchool = (id: string) =>
  apiFetch<{ saved: boolean }>(`/schools/${id}/save`, { method: 'DELETE' });

// Reviews
export const reportReview = (id: string, body: ReportReviewInput) =>
  apiFetch<{ reported: boolean }>(`/reviews/${id}/report`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const editReview = (id: string, body: UpdateReviewInput) =>
  apiFetch<ReviewWithUser>(`/reviews/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const deleteOwnReview = (id: string) =>
  apiFetch<{ deleted: boolean }>(`/reviews/${id}`, { method: 'DELETE' });

// Recommendations
export const getRecommendations = (body: RecommendationRequest) =>
  apiFetch<RecommendationResponse | FilteredResponse | NoResultsResponse>('/recommendations', {
    method: 'POST',
    body: JSON.stringify(body),
  });

// Admin
export const getAdminReports = () =>
  apiFetch<ReviewWithReports[]>('/admin/reports');

export const getAllReviews = () =>
  apiFetch<ReviewWithReports[]>('/admin/reviews');

export const approveReview = (id: string) =>
  apiFetch<Review>(`/admin/reviews/${id}/approve`, { method: 'POST' });

export const rejectReview = (id: string) =>
  apiFetch<Review>(`/admin/reviews/${id}/reject`, { method: 'POST' });

export const ignoreReports = (id: string) =>
  apiFetch<Review>(`/admin/reviews/${id}/ignore-reports`, { method: 'POST' });

export const deleteReview = (id: string) =>
  apiFetch<{ deleted: boolean }>(`/admin/reviews/${id}`, { method: 'DELETE' });

export const getAdminUsers = () =>
  apiFetch<AdminUser[]>('/admin/users');

export const banUser = (userId: string) =>
  apiFetch<{ id: string; banned: boolean }>(`/admin/users/${userId}/ban`, { method: 'POST' });

export const unbanUser = (userId: string) =>
  apiFetch<{ id: string; banned: boolean }>(`/admin/users/${userId}/unban`, { method: 'POST' });

export const promoteUser = (userId: string) =>
  apiFetch<{ id: string; role: string }>(`/admin/users/${userId}/promote`, { method: 'POST' });

export const demoteUser = (userId: string) =>
  apiFetch<{ id: string; role: string }>(`/admin/users/${userId}/demote`, { method: 'POST' });

// One-time first admin creation — only works when 0 ADMIN accounts exist
export const bootstrapAdmin = () =>
  apiFetch<UserProfile>('/bootstrap-admin', { method: 'POST' });
