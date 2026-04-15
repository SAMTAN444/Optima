import { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  variant?: 'blue' | 'yellow' | 'green' | 'red' | 'gray' | 'navy';
  size?: 'sm' | 'md';
}

export function Badge({ children, variant = 'blue', size = 'sm' }: BadgeProps) {
  const variants = {
    blue:   'bg-sky-50 text-sky-600 border border-sky-100',
    navy:   'bg-navy/8 text-navy border border-navy/15',
    yellow: 'bg-yellow-50 text-yellow-700 border border-yellow-100',
    green:  'bg-green-50 text-green-700 border border-green-100',
    red:    'bg-red-50 text-red-700 border border-red-100',
    gray:   'bg-gray-100 text-gray-600 border border-gray-200',
  };

  const sizes = {
    sm: 'text-[11px] px-2 py-0.5',
    md: 'text-[13px] px-3 py-1',
  };

  return (
    <span className={`inline-flex items-center rounded-full font-semibold ${variants[variant]} ${sizes[size]}`}>
      {children}
    </span>
  );
}
