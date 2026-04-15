import { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  children,
  loading,
  disabled,
  className = '',
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center font-semibold rounded-xl transition-all active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-offset-2';

  const variants = {
    primary:
      'bg-sky-300 text-white hover:bg-navy-600 focus:ring-navy/20 disabled:opacity-50 shadow-sm hover:shadow-md',
    secondary:
      'border border-gray-200 text-dark hover:bg-surface hover:border-gray-300 focus:ring-gray-200',
    danger:
      'bg-red-500 text-white hover:bg-red-600 focus:ring-red-500/30 disabled:opacity-50',
    ghost:
      'text-muted hover:bg-surface hover:text-dark focus:ring-gray-200',
  };

  const sizes = {
    sm: 'text-[13px] px-4 py-2 gap-1.5',
    md: 'text-[15px] px-6 py-3 gap-2',
    lg: 'text-[16px] px-8 py-4 gap-2.5',
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
