import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { getMe } from '../lib/api';
import { PageSkeleton } from '../components/LoadingSkeleton';
import { Shield } from 'lucide-react';

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();

  const { data: meResp, isPending } = useQuery({
    queryKey: ['me', user?.id],
    queryFn: getMe,
    enabled: !!user,
  });

  const role = meResp?.ok ? meResp.data?.role : null;

  console.log('[AdminRoute]', { authLoading, isPending, userId: user?.id ?? null, role, path: window.location.pathname });

  // Must check in this order:
  // 1. Wait for auth to resolve (loading=true means we don't know yet)
  // 2. If auth resolved and no user → redirect to login (not "still loading")
  // 3. Wait for profile query (only runs when user is non-null)
  if (authLoading) return <PageSkeleton />;
  if (!user) return <Navigate to="/login" replace />;
  if (isPending) return <PageSkeleton />;

  if (role !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-red-50 border border-red-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Shield size={28} className="text-red-400" />
          </div>
          <h1 className="text-[24px] font-extrabold text-dark tracking-[-0.02em] mb-2">
            Admin access only
          </h1>
          <p className="text-[15px] text-muted leading-relaxed mb-8">
            This area is restricted to administrators. If you believe this is an error, contact your system administrator.
          </p>
          <div className="flex gap-3 justify-center">
            <Link
              to="/app/search"
              className="px-5 py-2.5 bg-dark text-white font-semibold rounded-xl text-[14px] hover:bg-[#222] transition-colors"
            >
              Go to search
            </Link>
            <Link
              to="/"
              className="px-5 py-2.5 border border-gray-200 text-dark font-semibold rounded-xl text-[14px] hover:bg-surface transition-colors"
            >
              Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
