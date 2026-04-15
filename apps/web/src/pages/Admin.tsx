import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getAllReviews,
  getAdminReports,
  getAdminUsers,
  approveReview,
  rejectReview,
  ignoreReports,
  deleteReview,
  banUser,
  unbanUser,
  promoteUser,
  demoteUser,
} from '../lib/api';
import type { ReviewWithReports, AdminUser } from '@optima/shared';
import { Navbar } from '../components/Navbar';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { PageSkeleton } from '../components/LoadingSkeleton';
import {
  CheckCircle,
  XCircle,
  Trash2,
  Flag,
  Star,
  Ban,
  Shield,
  ShieldCheck,
  Users,
  MessageSquare,
  AlertTriangle,
  EyeOff,
  UserCheck,
  UserX,
} from 'lucide-react';

type TabKey = 'reported' | 'all' | 'users';

export function Admin() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>('reported');

  const { data: allResp, isPending: allPending } = useQuery({
    queryKey: ['admin-all-reviews'],
    queryFn: getAllReviews,
    refetchInterval: 10 * 1000,
  });

  const { data: reportsResp, isPending: reportsPending } = useQuery({
    queryKey: ['admin-reports'],
    queryFn: getAdminReports,
    refetchInterval: 10 * 1000,
  });

  const { data: usersResp, isPending: usersPending } = useQuery({
    queryKey: ['admin-users'],
    queryFn: getAdminUsers,
    refetchInterval: 10 * 1000,
  });

  const allReviews: ReviewWithReports[] = allResp?.ok ? allResp.data : [];
  const reportedReviews: ReviewWithReports[] = reportsResp?.ok ? reportsResp.data : [];
  const allUsers: AdminUser[] = usersResp?.ok ? usersResp.data : [];

  const reportedCount = reportedReviews.length;
  const bannedCount = allUsers.filter((u) => u.banned).length;
  const isPending =
    tab === 'all' ? allPending : tab === 'reported' ? reportsPending : usersPending;

  const invalidateAll = (schoolId?: string) => {
    queryClient.invalidateQueries({ queryKey: ['admin-all-reviews'] });
    queryClient.invalidateQueries({ queryKey: ['admin-reports'] });
    queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    // Also refresh the school's public review cache so the school profile page
    // reflects moderation changes (approve/reject/delete) without a full page reload.
    if (schoolId) {
      queryClient.invalidateQueries({ queryKey: ['school-reviews', schoolId] });
      queryClient.invalidateQueries({ queryKey: ['school', schoolId] });
    }
  };

  // Review-action mutations pass the returned Review's schoolId so the school
  // profile cache is cross-invalidated immediately after each moderation action.
  const approveMutation = useMutation({
    mutationFn: approveReview,
    onSuccess: (data) => invalidateAll(data?.ok ? data.data?.schoolId : undefined),
  });
  const rejectMutation = useMutation({
    mutationFn: rejectReview,
    onSuccess: (data) => invalidateAll(data?.ok ? data.data?.schoolId : undefined),
  });
  const ignoreReportsMutation = useMutation({
    mutationFn: ignoreReports,
    onSuccess: (data) => invalidateAll(data?.ok ? data.data?.schoolId : undefined),
  });
  const deleteMutation = useMutation({ mutationFn: deleteReview, onSuccess: () => invalidateAll() });
  const banMutation = useMutation({ mutationFn: banUser, onSuccess: () => invalidateAll() });
  const unbanMutation = useMutation({ mutationFn: unbanUser, onSuccess: () => invalidateAll() });
  const promoteMutation = useMutation({ mutationFn: promoteUser, onSuccess: () => invalidateAll() });
  const demoteMutation = useMutation({ mutationFn: demoteUser, onSuccess: () => invalidateAll() });

  const isActionLoading =
    approveMutation.isPending || rejectMutation.isPending || ignoreReportsMutation.isPending ||
    deleteMutation.isPending || banMutation.isPending || unbanMutation.isPending ||
    promoteMutation.isPending || demoteMutation.isPending;

  const reviews = tab === 'all' ? allReviews : reportedReviews;

  return (
    <div className="min-h-screen bg-surface">
      <Navbar />

      <div className="max-w-[1700px] mx-auto px-8 lg:px-16">

        {/* ── Header ── */}
        <div className="py-8 page-in">
          <h1 className="text-[38px] font-extrabold text-dark tracking-[-0.03em] flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-300 flex items-center justify-center flex-shrink-0">
              <Shield size={17} className="text-white" />
            </div>
            Moderation Panel
          </h1>
          <p className="text-[15px] text-muted mt-2">
            Review reported content, manage reviews, and control user access.
          </p>
        </div>

        {/* ── Stats row ── */}
        <div className="grid grid-cols-3 gap-4 mb-8 page-in-delay">
          <StatCard
            label="Total users"
            value={allUsers.length}
            icon={<Users size={18} className="text-sky-500" />}
            bg="bg-sky-50"
          />
          <StatCard
            label="Reported reviews"
            value={reportedCount}
            icon={<AlertTriangle size={18} className="text-amber-500" />}
            bg="bg-amber-50"
            highlight={reportedCount > 0}
          />
          <StatCard
            label="Total reviews"
            value={allReviews.length}
            icon={<MessageSquare size={18} className="text-emerald-500" />}
            bg="bg-emerald-50"
          />
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 bg-white border border-gray-200 rounded-2xl p-1 mb-6 w-fit">
          <TabButton
            active={tab === 'reported'}
            onClick={() => setTab('reported')}
            label="Reported"
            badge={reportedCount > 0 ? reportedCount : undefined}
            badgeColor="red"
          />
          <TabButton
            active={tab === 'all'}
            onClick={() => setTab('all')}
            label="All Reviews"
          />
          <TabButton
            active={tab === 'users'}
            onClick={() => setTab('users')}
            label="Users"
            badge={bannedCount > 0 ? bannedCount : undefined}
            badgeColor="gray"
          />
        </div>

        {/* ── Content ── */}
        {isPending ? (
          <PageSkeleton />
        ) : tab === 'users' ? (
          <UsersTab
            users={allUsers}
            onBan={(id) => banMutation.mutate(id)}
            onUnban={(id) => unbanMutation.mutate(id)}
            onPromote={(id) => promoteMutation.mutate(id)}
            onDemote={(id) => demoteMutation.mutate(id)}
            isLoading={isActionLoading}
          />
        ) : reviews.length === 0 ? (
          <EmptyState
            icon={<CheckCircle size={28} className="text-green-500" />}
            bg="bg-green-50"
            title="All clear!"
            description={tab === 'reported' ? 'No reported reviews at this time.' : 'No reviews have been submitted yet.'}
          />
        ) : (
          <div className="space-y-4">
            {reviews.map((review) => (
              <ReviewCard
                key={review.id}
                review={review}
                mode={tab === 'reported' ? 'reported' : 'all'}
                onApprove={() => approveMutation.mutate(review.id)}
                onReject={() => rejectMutation.mutate(review.id)}
                onIgnoreReports={() => ignoreReportsMutation.mutate(review.id)}
                onDelete={() => deleteMutation.mutate(review.id)}
                onBan={() => banMutation.mutate(review.user.id)}
                onUnban={() => unbanMutation.mutate(review.user.id)}
                isLoading={isActionLoading}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  icon,
  bg,
  highlight,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  bg: string;
  highlight?: boolean;
}) {
  return (
    <div className={`bg-white rounded-2xl border ${highlight ? 'border-amber-200' : 'border-gray-200'} p-5 hover:-translate-y-px hover:shadow-md transition-all duration-200`}>
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center`}>
          {icon}
        </div>
      </div>
      <p className="text-[28px] font-extrabold text-dark tracking-[-0.02em]">{value}</p>
      <p className="text-[13px] text-muted mt-0.5">{label}</p>
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────
function EmptyState({ icon, bg, title, description }: {
  icon: React.ReactNode;
  bg: string;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-14 text-center">
      <div className={`w-14 h-14 ${bg} rounded-2xl flex items-center justify-center mx-auto mb-4`}>
        {icon}
      </div>
      <p className="text-[17px] font-semibold text-dark">{title}</p>
      <p className="text-[14px] text-muted mt-1.5">{description}</p>
    </div>
  );
}

// ── Tab Button ────────────────────────────────────────────────────────────────
function TabButton({
  active,
  onClick,
  label,
  badge,
  badgeColor = 'red',
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: number;
  badgeColor?: 'red' | 'gray';
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold transition-colors ${
        active ? 'bg-sky-300 text-white' : 'text-muted hover:text-sky-300'
      }`}
    >
      {label}
      {badge != null && (
        <span
          className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
            active
              ? 'bg-white/20 text-white'
              : badgeColor === 'gray'
              ? 'bg-gray-100 text-muted'
              : 'bg-red-100 text-red-600'
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

// ── Users Tab ─────────────────────────────────────────────────────────────────
function UsersTab({
  users,
  onBan,
  onUnban,
  onPromote,
  onDemote,
  isLoading,
}: {
  users: AdminUser[];
  onBan: (id: string) => void;
  onUnban: (id: string) => void;
  onPromote: (id: string) => void;
  onDemote: (id: string) => void;
  isLoading: boolean;
}) {
  if (users.length === 0) {
    return (
      <EmptyState
        icon={<Users size={28} className="text-sky-500" />}
        bg="bg-sky-50"
        title="No users yet"
        description="Users will appear here once they register."
      />
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Table header */}
      <div className="px-5 py-3.5 border-b border-gray-100 grid grid-cols-[1fr_90px_64px_auto] gap-4 items-center">
        <span className="text-[12px] font-semibold text-muted uppercase tracking-wide">User</span>
        <span className="text-[12px] font-semibold text-muted uppercase tracking-wide">Role</span>
        <span className="text-[12px] font-semibold text-muted uppercase tracking-wide">Reviews</span>
        <span className="text-[12px] font-semibold text-muted uppercase tracking-wide">Actions</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-gray-50">
        {users.map((user) => {
          const initial = (user.displayName ?? user.supabaseUserId).charAt(0).toUpperCase();
          return (
            <div
              key={user.id}
              className={`px-5 py-3.5 grid grid-cols-[1fr_90px_64px_auto] gap-4 items-center ${user.banned ? 'bg-red-50/40' : 'hover:bg-surface/50'} transition-colors`}
            >
              {/* User info */}
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold flex-shrink-0 ${
                  user.banned ? 'bg-red-100 text-red-500' : 'bg-navy/10 text-navy'
                }`}>
                  {initial}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-dark truncate">
                      {user.displayName ?? 'No name'}
                    </span>
                    {user.banned && (
                      <Badge variant="red" size="sm">
                        <Ban size={9} className="mr-0.5" />
                        Banned
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted truncate">
                    Joined {new Date(user.createdAt).toLocaleDateString('en-SG', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </p>
                </div>
              </div>

              {/* Role */}
              <Badge variant={user.role === 'ADMIN' ? 'blue' : 'gray'} size="sm">
                {user.role === 'ADMIN' ? 'Admin' : 'User'}
              </Badge>

              {/* Review count */}
              <span className="text-[13px] text-muted text-center">
                {user._count.reviews}
              </span>

              {/* Actions */}
              <div className="flex items-center gap-2">
                {user.role === 'ADMIN' ? (
                  <Button size="sm" variant="secondary" onClick={() => onDemote(user.id)} loading={isLoading}>
                    <UserX size={13} />
                    Demote
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => onPromote(user.id)} loading={isLoading} disabled={user.banned}>
                    <UserCheck size={13} />
                    Promote
                  </Button>
                )}
                {user.banned ? (
                  <Button size="sm" variant="secondary" onClick={() => onUnban(user.id)} loading={isLoading}>
                    <ShieldCheck size={13} />
                    Unban
                  </Button>
                ) : (
                  <Button size="sm" variant="danger" onClick={() => onBan(user.id)} loading={isLoading} disabled={user.role === 'ADMIN'}>
                    <Ban size={13} />
                    Ban
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Review Card ───────────────────────────────────────────────────────────────
function ReviewCard({
  review,
  mode,
  onApprove,
  onReject,
  onIgnoreReports,
  onDelete,
  onBan,
  onUnban,
  isLoading,
}: {
  review: ReviewWithReports;
  mode: 'reported' | 'all';
  onApprove: () => void;
  onReject: () => void;
  onIgnoreReports: () => void;
  onDelete: () => void;
  onBan: () => void;
  onUnban: () => void;
  isLoading: boolean;
}) {
  const statusVariant = {
    APPROVED: 'green',
    REJECTED: 'red',
    PENDING: 'yellow',
  }[review.status] as 'green' | 'red' | 'yellow';

  const isBanned = review.user?.banned;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Card header */}
      <div className="px-6 pt-5 pb-4 border-b border-gray-100">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {review.reportCount > 0 && (
                <Badge variant="red">
                  <Flag size={10} className="mr-1" />
                  {review.reportCount} report{review.reportCount !== 1 ? 's' : ''}
                </Badge>
              )}
              <Badge variant={statusVariant}>{review.status}</Badge>
              {isBanned && (
                <Badge variant="red">
                  <Ban size={10} className="mr-1" />
                  User banned
                </Badge>
              )}
            </div>
            <p className="text-[15px] font-semibold text-dark">
              {review.school?.name ?? 'Unknown school'}
            </p>
            <div className="flex items-center gap-3 mt-1">
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    size={12}
                    className={i < review.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'}
                  />
                ))}
              </div>
              <span className="text-[13px] text-muted">
                by <span className="font-medium text-dark">{review.user?.displayName ?? 'Anonymous'}</span>
                {' · '}
                {new Date(review.createdAt).toLocaleDateString('en-SG', { year: 'numeric', month: 'short', day: 'numeric' })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Review text */}
      <div className="px-6 py-4 bg-surface/50 border-b border-gray-100">
        <p className="text-[14px] text-dark leading-relaxed">{review.comment}</p>
      </div>

      {/* Report reasons */}
      {review.reports.length > 0 && (
        <div className="px-6 py-4 bg-red-50/30 border-b border-red-100/50">
          <p className="text-[11px] font-bold text-red-500 uppercase tracking-widest mb-3">
            Report reasons
          </p>
          <ul className="space-y-2">
            {review.reports.map((r) => (
              <li key={r.id} className="flex items-start gap-2 text-[13px]">
                <span className="text-red-400 mt-0.5 flex-shrink-0">•</span>
                <span className="text-dark">
                  {r.reason}
                  {r.reporter && (
                    <span className="text-muted ml-2">— by {r.reporter.displayName ?? 'Anonymous'}</span>
                  )}
                  <span className="text-muted ml-2">
                    · {new Date(r.createdAt).toLocaleDateString('en-SG')}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="px-6 py-4 flex items-center gap-2 flex-wrap">
        {mode === 'reported' ? (
          <>
            {/* Reported tab: Ignore Report (dismiss, keep visible) + Take Down (hide) */}
            <Button
              size="sm"
              variant="primary"
              onClick={onIgnoreReports}
              loading={isLoading}
              title="Dismiss all reports — review stays visible"
            >
              <CheckCircle size={13} />
              Ignore Report
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={onReject}
              loading={isLoading}
              disabled={review.status === 'REJECTED'}
              title="Hide review from school page"
            >
              <EyeOff size={13} />
              Take Down
            </Button>
            <Button size="sm" variant="danger" onClick={onDelete} loading={isLoading} title="Permanently delete review">
              <Trash2 size={13} />
              Delete
            </Button>
          </>
        ) : (
          <>
            {/* All reviews tab: standard Approve / Reject / Delete */}
            <Button
              size="sm"
              variant="primary"
              onClick={onApprove}
              loading={isLoading}
              disabled={review.status === 'APPROVED'}
            >
              <CheckCircle size={13} />
              Approve
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={onReject}
              loading={isLoading}
              disabled={review.status === 'REJECTED'}
            >
              <XCircle size={13} />
              Reject
            </Button>
            <Button size="sm" variant="danger" onClick={onDelete} loading={isLoading}>
              <Trash2 size={13} />
              Delete
            </Button>
          </>
        )}

        <div className="flex-1" />

        {isBanned ? (
          <Button size="sm" variant="secondary" onClick={onUnban} loading={isLoading}>
            <ShieldCheck size={13} />
            Unban user
          </Button>
        ) : (
          <Button size="sm" variant="danger" onClick={onBan} loading={isLoading}>
            <Ban size={13} />
            Ban user
          </Button>
        )}
      </div>
    </div>
  );
}
