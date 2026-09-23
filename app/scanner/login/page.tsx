'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ScannerLoginPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Please enter your name'); return; }
    if (!password) { setError('Please enter the scanner password'); return; }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/scanner/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), password }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message || 'Incorrect scanner password');
        return;
      }

      // Save name to both sessionStorage and localStorage
      sessionStorage.setItem('volunteer_name', data.volunteer_name);
      localStorage.setItem('volunteer_name', data.volunteer_name);
      router.push('/scanner');
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-surface-950">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-success-600/10 blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative animate-slide-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-success-600 to-primary-600 flex items-center justify-center shadow-lg shadow-success-500/20">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">Gate Scanner Access</h1>
          <p className="text-surface-400 text-sm">Fresher Party 2026 — DUET</p>
        </div>

        <div className="card">
          <form onSubmit={handleStart} className="space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-danger-500/10 border border-danger-500/30 text-danger-400 text-sm animate-fade-in">
                {error}
              </div>
            )}
            <Input
              label="Volunteer Name"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              placeholder="Full Name"
              required
              id="volunteer-name-input"
              hint="Enter your Name it will be Recorded in Logs"
              autoFocus
            />
            <Input
              label="Scanner Password"
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              placeholder="Enter gate password"
              required
              id="scanner-password-input"
              hint="Password Provided to you"
            />
            <Button type="submit" size="lg" className="w-full mt-2" loading={loading} id="start-scanning-btn">
              📷 Start Scanning
            </Button>
          </form>

          <div className="mt-5 pt-4 border-t border-surface-800 text-center">
            <Link
              href="/admin/login"
              className="text-xs text-surface-400 hover:text-white transition-colors inline-flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              Go to Admin Portal Login
            </Link>
          </div>
        </div>

        <p className="text-center text-surface-600 text-xs mt-6">
          Fresher Party 2026 · Gate Entry Security System
        </p>
      </div>
    </div>
  );
}
