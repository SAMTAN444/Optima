import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, ArrowLeft, CheckCircle2, AlertCircle, LogIn } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { bootstrapAdmin } from '../lib/api';
import { Button } from '../components/Button';
import { useQueryClient } from '@tanstack/react-query';

/**
 * /setup — First-admin setup page.
 *
 * Allows the very first registered user to claim the ADMIN role.
 * After one admin exists, this page permanently shows "setup complete".
 * Subsequent admins must be promoted by an existing admin via the Admin panel.
 */
export function Setup() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'exists' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleClaim = async () => {
    setStatus('loading');
    const resp = await bootstrapAdmin();
    if (resp.ok) {
      setStatus('done');
      // Invalidate stale ['me'] cache so AdminRoute picks up the new ADMIN role,
      // then navigate directly to the admin dashboard (no sign-out required).
      queryClient.invalidateQueries({ queryKey: ['me', userId] });
      setTimeout(() => navigate('/app/admin'), 2000);
    } else if (resp.error?.code === 'BOOTSTRAP_DISABLED') {
      setStatus('exists');
    } else {
      setStatus('error');
      setErrorMsg(resp.error?.message ?? 'Unknown error');
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-6">
      <div className="w-full max-w-[520px] page-in">

        {/* Back */}
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-dark transition-colors group mb-8"
        >
          <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform duration-150" />
          Back to home
        </Link>

        <div className="bg-white rounded-2xl border border-black/[0.07] p-8"
          style={{ boxShadow: '0 2px 24px rgba(0,0,0,0.06)' }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center flex-shrink-0">
              <Shield size={20} className="text-sky-500" />
            </div>
            <div>
              <h1 className="text-[20px] font-extrabold text-dark tracking-[-0.02em]">First admin setup</h1>
              <p className="text-[13px] text-muted">One-time · works only when no admin exists</p>
            </div>
          </div>

          {/* Not logged in */}
          {!loading && !user && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                <p className="text-[14px] font-semibold text-amber-800 mb-1">Sign in required</p>
                <p className="text-[13px] text-amber-700 leading-relaxed">
                  Register a normal account first, then return here while signed in to claim the admin role.
                </p>
              </div>
              <Link to="/register">
                <Button className="w-full">
                  <LogIn size={15} className="mr-2" />
                  Register first
                </Button>
              </Link>
              <Link to="/login">
                <Button variant="secondary" className="w-full mt-2">
                  Already registered? Sign in
                </Button>
              </Link>
            </div>
          )}

          {/* Logged in, idle */}
          {!loading && user && status === 'idle' && (
            <div className="space-y-4">
              <div className="bg-sky-50 border border-sky-100 rounded-xl p-4">
                <p className="text-[13px] text-sky-700 leading-relaxed">
                  Signed in as <strong className="font-semibold">{user.email}</strong>.
                  Clicking below will promote your account to ADMIN — this only works once.
                </p>
              </div>
              <Button className="w-full py-3" onClick={handleClaim}>
                Claim admin role
              </Button>
            </div>
          )}

          {/* Loading */}
          {status === 'loading' && (
            <div className="py-6 text-center">
              <div className="w-8 h-8 border-2 border-sky-300/30 border-t-sky-400 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-[14px] text-muted">Promoting account…</p>
            </div>
          )}

          {/* Success */}
          {status === 'done' && (
            <div className="py-4 text-center space-y-3">
              <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto">
                <CheckCircle2 size={24} className="text-emerald-500" />
              </div>
              <div>
                <p className="text-[16px] font-semibold text-dark">Admin account created</p>
                <p className="text-[13px] text-muted mt-1">
                  Redirecting you to the admin dashboard…
                </p>
              </div>
            </div>
          )}

          {/* Already exists */}
          {status === 'exists' && (
            <div className="py-4 text-center space-y-3">
              <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto">
                <AlertCircle size={24} className="text-amber-500" />
              </div>
              <div>
                <p className="text-[16px] font-semibold text-dark">Setup already complete</p>
                <p className="text-[13px] text-muted mt-1 leading-relaxed">
                  An admin account already exists. Ask your admin to promote you from the Admin panel.
                </p>
              </div>
              <Link to="/login">
                <Button variant="secondary" className="mt-2">Sign in</Button>
              </Link>
            </div>
          )}

          {/* Error */}
          {status === 'error' && (
            <div className="space-y-3">
              <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                <p className="text-[13px] text-red-600">{errorMsg}</p>
              </div>
              <Button variant="secondary" className="w-full" onClick={() => setStatus('idle')}>
                Try again
              </Button>
            </div>
          )}
        </div>

        {/* How future admins are created */}
        {(status === 'idle' || (!loading && !user)) && (
          <p className="text-center text-[12px] text-muted mt-5 leading-relaxed">
            Future admins are promoted by an existing admin via the Admin panel → Users tab.
          </p>
        )}
      </div>
    </div>
  );
}
