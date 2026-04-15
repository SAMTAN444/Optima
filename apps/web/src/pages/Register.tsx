import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from '../hooks/useForm';
import { RegisterSchema, RegisterInput } from '@optima/shared';
import { useAuth } from '../contexts/AuthContext';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { ArrowLeft } from 'lucide-react';

export function Register() {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

  const { values, errors, handleChange, validate } = useForm<RegisterInput>({
    email: '',
    password: '',
    displayName: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate(RegisterSchema)) return;

    setLoading(true);
    setServerError('');

    const result = await signUp(values.email, values.password, values.displayName);
    setLoading(false);

    if (result.error) {
      setServerError(result.error);
      return;
    }

    if (result.needsVerification) {
      navigate('/verify-email', { state: { email: values.email } });
    } else {
      navigate('/app/search');
    }
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
              Create your account
            </h1>
            <p className="text-[17px] text-muted">Get started with Optima for free</p>
          </div>

          {/* Form card */}
          <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-card">
            <form onSubmit={handleSubmit} className="space-y-5">
              <Input
                label="Your name"
                type="text"
                name="displayName"
                value={values.displayName}
                onChange={handleChange}
                error={errors.displayName}
                placeholder="e.g. Ahmad Razif"
                autoComplete="name"
                className="py-3.5 text-[15px]"
              />
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
                placeholder="Min. 6 characters"
                autoComplete="new-password"
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
                  Create account
                </Button>
              </div>
            </form>

            <p className="text-center text-[14px] text-muted mt-6">
              Already have an account?{' '}
              <Link to="/login" className="text-navy font-semibold hover:text-sky-700 transition-colors">
                Sign in
              </Link>
            </p>
          </div>
      </div>
    </div>
  );
}
