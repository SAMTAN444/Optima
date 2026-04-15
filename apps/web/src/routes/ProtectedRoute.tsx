import { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { getMe } from '../lib/api';
import { PageSkeleton } from '../components/LoadingSkeleton';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  // Reuse the same cache key as Navbar — no extra HTTP request when Navbar already fetched it
  const { data: meResp } = useQuery({
    queryKey: ['me', user?.id],
    queryFn: getMe,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!meResp) return;
    if (meResp.ok) return;
    const code = (meResp as { ok: false; error?: { code?: string } }).error?.code;
    if (code === 'BANNED') {
      signOut().then(() => {
        sessionStorage.setItem(
          'loginError',
          'Your account has been suspended. Please contact an administrator.'
        );
        navigate('/login', { replace: true });
      });
    }
  }, [meResp, signOut, navigate]);

  if (loading) return <PageSkeleton />;
  if (!user) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
