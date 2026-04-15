import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft } from 'lucide-react';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError('Email is required.'); return; }
    if (!EMAIL_RE.test(email.trim())) { setError('Please enter a valid email address.'); return; }

    setLoading(true);
    setError('');

    try {
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
    } catch {
      setLoading(false);
      setError('Something went wrong. Please check your connection and try again.');
      return;
    }

    // Always show the generic success — never reveal whether the account exists
    setLoading(false);
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-6">
      <div className="w-full max-w-[520px] page-in">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-dark transition-colors group mb-10"
        >
          <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform duration-150" />
          Back to login
        </Link>

        <div className="mb-8">
          <h1 className="text-[38px] font-extrabold text-dark tracking-[-0.03em] mb-2">Reset password</h1>
          <p className="text-[16px] text-muted">
            Enter your email and we'll send you a link to reset your password.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-card">
          {submitted ? (
            <div className="text-center py-4 space-y-3">
              <div className="w-12 h-12 bg-green-50 border border-green-200 rounded-2xl flex items-center justify-center mx-auto">
                <span className="text-2xl">✉️</span>
              </div>
              <p className="text-[15px] font-semibold text-dark">Check your email</p>
              <p className="text-[14px] text-muted">
                If an account exists for this email, a password reset link has been sent.
              </p>
              <Link to="/login" className="block mt-4 text-[14px] text-navy font-semibold hover:underline">
                Back to login
              </Link>
              <p className="text-[13px] text-muted pt-1">
                Don&apos;t have an account?{' '}
                <Link to="/register" className="text-navy font-semibold hover:underline">
                  Sign up
                </Link>
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-dark block">Email</label>
                <input
                  type="text"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="w-full px-4 py-3.5 bg-white border border-gray-200 rounded-xl text-[15px] text-dark placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-300/30 focus:border-sky-400/50 transition-colors"
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
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
