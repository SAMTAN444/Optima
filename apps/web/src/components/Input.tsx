import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-[13px] font-semibold text-dark">{label}</label>
        )}
        <input
          ref={ref}
          className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy/40 transition-all ${
            error
              ? 'border-red-300 bg-red-50/50 focus:ring-red-300/30 focus:border-red-400'
              : 'border-gray-200 bg-white hover:border-gray-300'
          } ${className}`}
          {...props}
        />
        {error && <p className="text-[12px] text-red-500">{error}</p>}
        {hint && !error && <p className="text-[12px] text-muted">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
