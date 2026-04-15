import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from '../hooks/useForm';
import { LoginSchema, LoginInput } from '@optima/shared';
import { useAuth } from '../contexts/AuthContext';
import { getMe } from '../lib/api';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Shield, User, ArrowLeft } from 'lucide-react';

export function Login() {
  const navigate = useNavigate();
  const { signIn, signOut, user } = useAuth();
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginMode, setLoginMode] = useState<'user' | 'admin'>('user');

  useEffect(() => {
    const stored = sessionStorage.getItem('loginError');
    if (stored) {
      sessionStorage.removeItem('loginError');
      setServerError(stored);
    }
  }, []);

  const { values, errors, handleChange, validate } = useForm<LoginInput>({
    email: '',
    password: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate(LoginSchema)) return;

    setLoading(true);
    setServerError('');

    const result = await signIn(values.email, values.password);
    if (result.error) {
      setLoading(false);
      setServerError(result.error);
      return;
    }

    try {
      const meResp = await getMe();
      if (!meResp.ok) {
        const errCode = (meResp as { error?: { code?: string } }).error?.code;
        if (errCode === 'BANNED') {
          await signOut();
          setLoading(false);
          setServerError('Your account has been suspended. Please contact an administrator.');
          return;
        }
      } else {
        const role = (meResp as { data?: { role?: string } }).data?.role;
        if (loginMode === 'admin' && role !== 'ADMIN') {
          await signOut();
          const msg = 'You are not an admin. Please use the Student / Parent login instead.';
          setLoading(false);
          setServerError(msg);
          sessionStorage.setItem('loginError', msg);
          return;
        }
      }
    } catch {
      // non-fatal
    }

    setLoading(false);
    const dest = loginMode === 'admin' ? '/app/admin' : '/app/search';
    navigate(dest);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-6">
      <div className="w-full max-w-[520px] page-in">

          {/* Back link */}
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-dark transition-colors group mb-10"
          >
            <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform duration-150" />
            Back to home
          </Link>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-[44px] font-extrabold text-dark tracking-[-0.03em] mb-2">
              Welcome back
            </h1>
            <p className="text-[17px] text-muted">Sign in to your Optima account</p>
          </div>

          {/* Mode toggle */}
          <div className="flex bg-white border border-gray-200 rounded-2xl p-1.5 mb-6 gap-1.5 shadow-sm">
            <button
              type="button"
              onClick={() => setLoginMode('user')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[14px] font-semibold transition-all duration-200 ${
                loginMode === 'user'
                  ? 'bg-black text-white shadow-sm'
                  : 'text-muted hover:dark'
              }`}
            >
              <User size={14} />
              Student / Parent
            </button>
            <button
              type="button"
              onClick={() => setLoginMode('admin')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[14px] font-semibold transition-all duration-200 ${
                loginMode === 'admin'
                  ? 'bg-black text-white shadow-sm'
                  : 'text-muted hover:text-dark'
              }`}
            >
              <Shield size={14} />
              Admin
            </button>
          </div>

          {/* Admin notice */}
          {loginMode === 'admin' && (
            <div className="bg-sky-50 border border-sky-100 rounded-xl px-4 py-3.5 mb-5">
              <p className="text-[13px] text-sky-700 leading-relaxed">
                Admin accounts are redirected to the moderation panel after sign-in. Your role is enforced server-side.
              </p>
            </div>
          )}

          {/* Form card */}
          <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-card">
            <form onSubmit={handleSubmit} className="space-y-5">
              <Input
                label="Email"
                type="email"
                name="email"
                value={values.email}
                onChange={handleChange}
                error={errors.email}
                placeholder="you@example.com"
                autoComplete="email"
                className="py-3.5 text-[15px]"
              />
              <Input
                label="Password"
                type="password"
                name="password"
                value={values.password}
                onChange={handleChange}
                error={errors.password}
                placeholder="••••••••"
                autoComplete="current-password"
                className="py-3.5 text-[15px]"
              />

              {serverError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3.5">
                  <p className="text-[13px] text-red-600">{serverError}</p>
                </div>
              )}

              <div className="pt-1">
                <Button
                  type="submit"
                  loading={loading}
                  className="w-full py-3.5 text-[15px] active:scale-[0.98] transition-transform"
                >
                  {loginMode === 'admin' ? 'Sign in → Admin Panel' : 'Sign in'}
                </Button>
              </div>
            </form>

            <div className="mt-6 space-y-3 text-center">
              <p className="text-[14px] text-muted">
                Don&apos;t have an account?{' '}
                <Link to="/register" className="text-navy font-semibold hover:text-sky-700 transition-colors">
                  Create one
                </Link>
              </p>
              <p className="text-[13px] text-muted">
                <Link to="/forgot-password" className="text-muted hover:text-dark transition-colors underline underline-offset-2">
                  Forgot password?
                </Link>
              </p>
            </div>
          </div>
      </div>
    </div>
  );
}
