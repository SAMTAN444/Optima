import { Link, useLocation } from 'react-router-dom';
import { Mail, ArrowLeft } from 'lucide-react';

export function VerifyEmail() {
  const { state } = useLocation();
  const email: string | undefined = (state as { email?: string } | null)?.email;

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

        <div className="bg-white rounded-2xl border border-gray-200 p-10 shadow-card text-center">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-full bg-sky-50 flex items-center justify-center">
              <Mail size={28} className="text-sky-500" />
            </div>
          </div>

          <h1 className="text-[28px] font-extrabold text-dark tracking-[-0.02em] mb-3">
            Verify your email
          </h1>

          <p className="text-[15px] text-muted leading-relaxed mb-2">
            We sent a confirmation link to
          </p>
          {email && (
            <p className="text-[15px] font-semibold text-dark mb-4">{email}</p>
          )}
          <p className="text-[14px] text-muted leading-relaxed mb-8">
            Click the link in that email to activate your account. If you don't see it, check your spam folder.
          </p>

          <p className="text-[13px] text-muted">
            Already verified?{' '}
            <Link to="/login" className="text-navy font-semibold hover:text-sky-700 transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
