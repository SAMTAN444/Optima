import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  // Supabase recovery links arrive with access_token in the URL hash.
  // onAuthStateChange fires with event PASSWORD_RECOVERY and establishes a session.
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setSessionReady(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    setError('');

    const { error: sbError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (sbError) {
      setError(sbError.message);
    } else {
      await supabase.auth.signOut();
      navigate('/login', { state: { message: 'Password updated. Please sign in.' } });
    }
  };

  if (!sessionReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface p-6">
        <div className="text-center space-y-3">
          <p className="text-[15px] text-muted">Verifying reset link…</p>
          <p className="text-[13px] text-muted">If this takes too long, the link may have expired.</p>
          <a href="/login" className="text-[14px] text-navy font-semibold hover:underline block mt-4">
            Back to login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-6">
      <div className="w-full max-w-[520px] page-in">
        <div className="mb-8">
          <h1 className="text-[38px] font-extrabold text-dark tracking-[-0.03em] mb-2">Set new password</h1>
          <p className="text-[16px] text-muted">Choose a new password for your account.</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-card">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-dark block">New password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full px-4 py-3.5 bg-white border border-gray-200 rounded-xl text-[15px] focus:outline-none focus:ring-2 focus:ring-sky-300/30 focus:border-sky-400/50 transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-dark block">Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat password"
                className="w-full px-4 py-3.5 bg-white border border-gray-200 rounded-xl text-[15px] focus:outline-none focus:ring-2 focus:ring-sky-300/30 focus:border-sky-400/50 transition-colors"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3.5">
                <p className="text-[13px] text-red-600">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-navy text-white font-semibold rounded-xl text-[15px] hover:opacity-90 disabled:opacity-50 transition-opacity active:scale-[0.98]"
            >
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
