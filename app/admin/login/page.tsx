'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Suspense } from 'react';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Active tab: 'admin' or 'scanner'
  const initialTab = searchParams.get('tab') === 'scanner' ? 'scanner' : 'admin';
  const [activeTab, setActiveTab] = useState<'admin' | 'scanner'>(initialTab);

  // Admin form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState('');

  // Scanner form state
  const [volunteerName, setVolunteerName] = useState('');
  const [scannerPassword, setScannerPassword] = useState('');
  const [scannerLoading, setScannerLoading] = useState(false);
  const [scannerError, setScannerError] = useState('');

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'scanner') {
      setActiveTab('scanner');
    } else if (tabParam === 'admin') {
      setActiveTab('admin');
    }
  }, [searchParams]);

  // Admin login submission
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setAdminError('Email and password are required');
      return;
    }
    setAdminLoading(true);
    setAdminError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.success) {
        const redirect = searchParams.get('redirect') || '/admin/dashboard';
        router.push(redirect);
      } else {
        setAdminError(data.message || 'Invalid credentials');
      }
    } catch {
      setAdminError('Network error. Please try again.');
    } finally {
      setAdminLoading(false);
    }
  };

  // Volunteer scanner login submission
  const handleScannerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!volunteerName.trim()) {
      setScannerError('Please enter your name');
      return;
    }
    if (!scannerPassword) {
      setScannerError('Please enter the scanner password');
      return;
    }
    setScannerLoading(true);
    setScannerError('');
    try {
      const res = await fetch('/api/scanner/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: volunteerName.trim(), password: scannerPassword }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setScannerError(data.message || 'Incorrect scanner password');
        return;
      }

      sessionStorage.setItem('volunteer_name', data.volunteer_name);
      localStorage.setItem('volunteer_name', data.volunteer_name);
      router.push('/scanner');
    } catch {
      setScannerError('Connection error. Please try again.');
    } finally {
      setScannerLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-surface-950 py-10 relative">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary-600/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-accent-600/10 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-success-600/5 blur-3xl" />
      </div>

      <div className="w-full max-w-md relative animate-slide-up">
        {/* Header / Logo */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary-600 via-accent-600 to-success-600 flex items-center justify-center shadow-lg shadow-primary-900/40">
            {activeTab === 'admin' ? (
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
              </svg>
            )}
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">
            {activeTab === 'admin' ? 'Admin Portal' : 'Gate Scanner Access'}
          </h1>
          <p className="text-surface-400 text-sm">Fresher Party 2026 — DUET</p>
        </div>

        {/* Tab Selector */}
        <div className="bg-surface-900/80 p-1 rounded-2xl border border-surface-800 flex gap-1 mb-5">
          <button
            type="button"
            onClick={() => setActiveTab('admin')}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'admin'
                ? 'bg-primary-600 text-white shadow-md shadow-primary-900/40'
                : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800/50'
            }`}
            id="tab-admin-login"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            Admin Sign In
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('scanner')}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'scanner'
                ? 'bg-success-600 text-white shadow-md shadow-success-900/40'
                : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800/50'
            }`}
            id="tab-scanner-login"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
            </svg>
            Gate Scanner
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </button>
        </div>

        {/* Tab 1: Admin Sign In */}
        {activeTab === 'admin' ? (
          <Card>
            <form onSubmit={handleAdminLogin} className="space-y-4">
              {adminError && (
                <div className="p-3 rounded-xl bg-danger-500/10 border border-danger-500/30 text-danger-400 text-sm animate-fade-in" role="alert">
                  {adminError}
                </div>
              )}
              <Input
                label="Email Address"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setAdminError(''); }}
                placeholder="admin@fresherparty.com"
                required
                id="admin-email"
                autoComplete="email"
              />
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setAdminError(''); }}
                placeholder="••••••••"
                required
                id="admin-password"
                autoComplete="current-password"
              />
              <Button type="submit" loading={adminLoading} className="w-full" size="lg" id="admin-login-btn">
                Sign In to Dashboard
              </Button>
            </form>

            <div className="mt-4 text-center">
              <p className="text-xs text-surface-500">
                Need admin access?{' '}
                <span className="text-primary-400">Contact the President to get an invite.</span>
              </p>
            </div>

            {/* Prominent Volunteer Scanner Quick Access Link */}
            <div className="mt-6 pt-5 border-t border-surface-800">
              <div className="text-[11px] font-semibold text-surface-400 uppercase tracking-wider text-center mb-2.5">
                Gate Security & Volunteers
              </div>
              <button
                type="button"
                onClick={() => { setActiveTab('scanner'); setScannerError(''); }}
                className="w-full group flex items-center justify-between p-3.5 rounded-xl bg-gradient-to-r from-success-500/10 via-emerald-500/5 to-surface-800/40 border border-success-500/25 hover:border-success-500/50 hover:bg-success-500/15 transition-all text-left"
                id="switch-to-scanner-btn"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-success-500/20 border border-success-500/30 flex items-center justify-center text-success-400 group-hover:scale-105 transition-transform shrink-0">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white group-hover:text-success-300 transition-colors flex items-center gap-1.5">
                      QR & Ticket Scanner
                      <span className="w-2 h-2 rounded-full bg-success-400 animate-pulse" />
                    </div>
                    <div className="text-xs text-surface-400">
                      Camera scanning & manual ticket entry
                    </div>
                  </div>
                </div>
                <div className="flex items-center text-success-400 text-xs font-semibold gap-1 group-hover:translate-x-1 transition-transform">
                  <span>Open</span>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </button>
            </div>
          </Card>
        ) : (
          /* Tab 2: Gate Scanner Volunteer Login */
          <Card>
            <form onSubmit={handleScannerLogin} className="space-y-4">
              {scannerError && (
                <div className="p-3 rounded-xl bg-danger-500/10 border border-danger-500/30 text-danger-400 text-sm animate-fade-in" role="alert">
                  {scannerError}
                </div>
              )}
              <Input
                label="Volunteer Name"
                value={volunteerName}
                onChange={(e) => { setVolunteerName(e.target.value); setScannerError(''); }}
                placeholder="Full Name (e.g. Ali Ahmed)"
                required
                id="volunteer-name-input"
                hint="Your name will be logged with every entry"
                autoFocus
              />
              <Input
                label="Scanner Password"
                type="password"
                value={scannerPassword}
                onChange={(e) => { setScannerPassword(e.target.value); setScannerError(''); }}
                placeholder="Enter gate password"
                required
                id="scanner-password-input"
                hint="Session valid for 8 hours"
              />
              <Button type="submit" size="lg" className="w-full mt-2 bg-success-600 hover:bg-success-500 shadow-md shadow-success-900/30" loading={scannerLoading} id="start-scanning-btn">
                📷 Start Scanning
              </Button>
            </form>

            <div className="mt-5 pt-4 border-t border-surface-800 text-center flex flex-col gap-2">
              <button
                type="button"
                onClick={() => { setActiveTab('admin'); setAdminError(''); }}
                className="text-xs text-surface-400 hover:text-white transition-colors flex items-center justify-center gap-1.5"
                id="switch-back-admin-btn"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                Switch back to Admin Sign In
              </button>
              <Link href="/scanner/login" className="text-[11px] text-surface-500 hover:text-surface-400 transition-colors">
                Or open dedicated full-page scanner login →
              </Link>
            </div>
          </Card>
        )}

        <p className="text-center text-surface-600 text-xs mt-6">
          Fresher Party 2026 · Campus of I&CS · DUET
        </p>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-12 h-12 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" /></div>}>
      <LoginContent />
    </Suspense>
  );
}
