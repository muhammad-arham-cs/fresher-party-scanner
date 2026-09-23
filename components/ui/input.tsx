'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Input({ label, error, hint, className, id, ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="form-label">
          {label}
          {props.required && <span className="text-danger-400 ml-1">*</span>}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          'form-input',
          error && 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/20',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-danger-400">{error}</p>}
      {hint && !error && <p className="text-xs text-surface-500">{hint}</p>}
    </div>
  );
}
