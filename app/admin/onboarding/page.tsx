'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

interface UserInfo {
  name: string;
  email: string;
  role: string;
}

function OnboardingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') || '';
  const emailParam = searchParams.get('email') || '';

  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [validating, setValidating] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Validate token on initial page load
  useEffect(() => {
    if (!token && !emailParam) {
      router.push('/admin/login');
      return;
    }

    const params = new URLSearchParams();
    if (token) params.set('token', token);
    if (emailParam) params.set('email', emailParam);

    fetch(`/api/auth/setup-password?${params.toString()}`)
      .then(async (res) => {
        const data = await res.json();
        if (data.success) {
          setUserInfo({ name: data.name, email: data.email, role: data.role });
        } else {
          setTokenError(data.message || 'This setup link is invalid or expired.');
        }
      })
      .catch(() => {
        setTokenError('Network error checking setup link. Please refresh.');
      })
      .finally(() => {
        setValidating(false);
      });
  }, [token, emailParam, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/setup-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email: emailParam, password }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(true);
        setTimeout(() => router.push('/admin/login'), 2000);
      } else {
        setError(data.message || 'Failed to set password');
      }
    } catch {
      setError('Network error connecting to server');
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
          <p className="text-surface-400 text-sm">Verifying onboarding link...</p>
        </div>
      </div>
    );
  }

  if (tokenError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-surface-950">
        <div className="w-full max-w-md animate-scale-in">
          <Card className="text-center p-6 space-y-4">
            <div className="text-4xl">⚠️</div>
            <h2 className="text-lg font-bold text-white">Setup Link Problem</h2>
            <p className="text-surface-400 text-sm leading-relaxed">
              {tokenError}
            </p>
            <div className="pt-2">
              <Button onClick={() => router.push('/admin/login')} className="w-full">
                Go to Admin Login
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-950">
        <div className="text-center animate-scale-in">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-xl font-bold text-white mb-2">Password Set Successfully!</h2>
          <p className="text-surface-400">Redirecting to admin login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-surface-950">
      <div className="w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-1">Set Your Admin Password</h1>
          <p className="text-surface-400 text-sm">
            {userInfo ? (
              <>
                Welcome <strong className="text-white">{userInfo.name}</strong> ({userInfo.email})
              </>
            ) : (
              emailParam ? `Account setup for ${emailParam}` : 'Fresher Party 2026 Admin Portal'
            )}
          </p>
          <p className="text-xs text-amber-400 mt-1">⚠️ This onboarding link expires in 15 minutes</p>
        </div>
        <Card>
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3 rounded-xl bg-danger-500/10 border border-danger-500/30 text-danger-400 text-sm">
                {error}
              </div>
            )}
            <Input
              label="New Password"
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              placeholder="Min 8 characters"
              required
              id="new-password"
              hint="At least 8 characters"
            />
            <Input
              label="Confirm Password"
              type="password"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setError(''); }}
              placeholder="Repeat your password"
              required
              id="confirm-password"
            />
            <Button type="submit" loading={loading} className="w-full" size="lg">
              Set Password & Access Portal
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-surface-950">
        <div className="w-8 h-8 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
      </div>
    }>
      <OnboardingContent />
    </Suspense>
  );
}
