'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  glass?: boolean;
}

export function Card({ children, glass, className, ...props }: CardProps) {
  return (
    <div
      className={cn(glass ? 'glass' : 'card', className)}
      {...props}
    >
      {children}
    </div>
  );
}
