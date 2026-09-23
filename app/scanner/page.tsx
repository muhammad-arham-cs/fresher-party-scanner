'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

interface ScanResult {
  status: 'valid' | 'duplicate' | 'invalid' | 'expired' | 'error';
  student_name?: string;
  roll_no?: string;
  ticket_id?: string;
  department?: string;
  batch?: string;
  society?: string;
  scanned_at?: string;
  scanned_by?: string;
  qr_token?: string;
  message?: string;
  was_override?: boolean;
}

export default function ScannerPage() {
  const router = useRouter();
  const [volunteerName, setVolunteerName] = useState('Volunteer');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [manualRoll, setManualRoll] = useState('');
  const [manualLoading, setManualLoading] = useState(false);
  const [lastScannedToken, setLastScannedToken] = useState<string>('');
  const [overriding, setOverriding] = useState(false);
  const html5QrRef = useRef<any>(null);
  const autoResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load volunteer name from storage with fallback
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedName = sessionStorage.getItem('volunteer_name') || localStorage.getItem('volunteer_name');
      if (storedName) {
        setVolunteerName(storedName);
      } else {
        router.push('/scanner/login');
      }
    }
  }, [router]);

  const stopScanner = useCallback(async () => {
    try {
      if (html5QrRef.current) {
        const state = html5QrRef.current.getState?.();
        // 2 = SCANNING, 3 = PAUSED
        if (state === 2 || state === 3) {
          await html5QrRef.current.stop();
        }
      }
    } catch {
      /* ignore cleanup errors */
    }
    setScanning(false);
    setCameraReady(false);
  }, []);

  const handleScan = useCallback(async (qrToken: string) => {
    if (!qrToken || processing) return;
    setProcessing(true);
    setLastScannedToken(qrToken);

    // Pause camera stream smoothly instead of destroying the video canvas
    try {
      if (html5QrRef.current && html5QrRef.current.getState?.() === 2) {
        html5QrRef.current.pause(true);
      }
    } catch {
      /* ignore pause errors */
    }

    try {
      const activeVolunteer = sessionStorage.getItem('volunteer_name') || localStorage.getItem('volunteer_name') || volunteerName || 'Gate Volunteer';

      const res = await fetch('/api/scanner/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qr_token: qrToken,
          scanned_by: activeVolunteer,
          device_info: navigator.userAgent,
        }),
      });
      const data = await res.json();
      setResult({ ...data, qr_token: qrToken });

      // Auto-reset valid scans after 3.5 seconds
      if (data.status === 'valid' && !data.was_override) {
        autoResetRef.current = setTimeout(() => {
          resetScan();
        }, 3500);
      } else {
        setProcessing(false);
      }
    } catch {
      setResult({ status: 'error', message: 'Network error connecting to server' });
      setProcessing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processing, volunteerName]);

  const startScanner = useCallback(async () => {
    try {
      setScanning(true);
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');

      if (!html5QrRef.current) {
        html5QrRef.current = new Html5Qrcode('qr-reader', {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false,
        });
      }

      const scanner = html5QrRef.current;
      const state = scanner.getState?.();

      if (state === 3) {
        // Resume if paused
        scanner.resume();
        setCameraReady(true);
        return;
      }

      if (state === 2) {
        setCameraReady(true);
        return;
      }

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 15,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const edgeSize = Math.max(180, Math.floor(minEdge * 0.72));
            return { width: edgeSize, height: edgeSize };
          },
        },
        (decodedText: string) => {
          handleScan(decodedText);
        },
        () => {
          /* frame decode pass-through */
        }
      );
      setCameraReady(true);
    } catch (err) {
      setScanning(false);
      setCameraReady(false);
      const msg = err instanceof Error ? err.message : 'Camera unavailable';
      setResult({ status: 'error', message: `Camera error: ${msg}. Make sure camera permissions are allowed.` });
    }
  }, [handleScan]);

  const resetScan = () => {
    if (autoResetRef.current) clearTimeout(autoResetRef.current);
    setResult(null);
    setProcessing(false);
    setManualRoll('');
    setLastScannedToken('');

    // Resume camera scanning seamlessly without remounting the video stream
    try {
      if (html5QrRef.current && html5QrRef.current.getState?.() === 3) {
        html5QrRef.current.resume();
      }
    } catch {
      /* ignore resume error */
    }
  };

  useEffect(() => {
    return () => {
      if (autoResetRef.current) clearTimeout(autoResetRef.current);
      stopScanner();
    };
  }, [stopScanner]);

  const handleOverride = async () => {
    if (!result) return;
    const tokenToOverride = result.ticket_id || result.qr_token || lastScannedToken || result.roll_no;
    if (!tokenToOverride) return;

    setOverriding(true);
    try {
      const activeVolunteer = sessionStorage.getItem('volunteer_name') || localStorage.getItem('volunteer_name') || volunteerName || 'Gate Volunteer';

      const res = await fetch('/api/scanner/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qr_token: tokenToOverride,
          scanned_by: activeVolunteer,
          device_info: navigator.userAgent,
          override: true,
        }),
      });
      const data = await res.json();
      setResult({ ...data, was_override: true });
    } catch {
      alert('Network error while processing override');
    } finally {
      setOverriding(false);
    }
  };

  const handleManualLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualRoll.trim()) return;
    setManualLoading(true);
    const query = manualRoll.trim();
    setLastScannedToken(query);

    // Pause camera if running
    try {
      if (html5QrRef.current && html5QrRef.current.getState?.() === 2) {
        html5QrRef.current.pause(true);
      }
    } catch { }

    try {
      const activeVolunteer = sessionStorage.getItem('volunteer_name') || localStorage.getItem('volunteer_name') || volunteerName || 'Gate Volunteer';

      const res = await fetch('/api/scanner/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qr_token: query,
          scanned_by: activeVolunteer,
          device_info: navigator.userAgent,
          manual: true,
        }),
      });
      const data = await res.json();
      setResult({ ...data, qr_token: query });
      setManualRoll('');

      if (data.status === 'valid' && !data.was_override) {
        autoResetRef.current = setTimeout(() => {
          resetScan();
        }, 3500);
      }
    } catch {
      setResult({ status: 'error', message: 'Network error during manual lookup' });
    } finally {
      setManualLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('volunteer_name');
    localStorage.removeItem('volunteer_name');
    router.push('/scanner/login');
  };

  return (
    <div className="min-h-screen bg-surface-950 text-white flex flex-col relative overflow-hidden">
      {/* Top bar */}
      <header className="px-4 py-3 border-b border-surface-800 flex items-center justify-between bg-surface-900/90 backdrop-blur sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-success-500 animate-pulse" />
          <div>
            <h1 className="text-sm font-bold leading-tight">Fresher Party 2026</h1>
            <p className="text-xs text-surface-400">Gate Check-in · DUET</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2.5 py-1 rounded-full bg-surface-800 text-surface-300 font-medium">
            👤 {volunteerName}
          </span>
          <button
            onClick={handleLogout}
            className="text-xs text-surface-400 hover:text-white px-2 py-1 rounded hover:bg-surface-800 transition-colors"
            title="Log out"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main scanner view - ALWAYS stays in DOM so camera never resets */}
      <main className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm flex flex-col items-center">
          {/* Camera preview container */}
          <div className="w-full aspect-square bg-surface-900 rounded-3xl overflow-hidden relative border border-surface-800 shadow-2xl flex items-center justify-center">
            <div id="qr-reader" className="w-full h-full" />
            {!scanning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-900 p-6 text-center z-10">
                <div className="w-20 h-20 rounded-2xl bg-surface-800 flex items-center justify-center mb-4 text-3xl">
                  📷
                </div>
                <h2 className="text-lg font-bold mb-2">Camera is Off</h2>
                <p className="text-surface-400 text-xs mb-6 max-w-xs">
                  Position the student pass QR code within the frame to verify entry.
                </p>
                <Button onClick={startScanner} size="lg" className="w-full shadow-lg shadow-primary-500/25" id="activate-camera-btn">
                  Turn On Camera
                </Button>
              </div>
            )}
          </div>

          {/* Camera toggle button */}
          <div className="w-full mt-3 flex">
            {scanning ? (
              <Button variant="secondary" onClick={stopScanner} className="w-full" size="md">
                ⏸️ Pause Camera
              </Button>
            ) : (
              <Button variant="secondary" onClick={startScanner} className="w-full" size="md">
                ▶️ Resume Camera
              </Button>
            )}
          </div>

          {/* Permanent Ticket ID / Roll No Manual Entry Card */}
          <div className="w-full mt-4 p-4 rounded-2xl bg-surface-900/95 border border-surface-800 shadow-xl backdrop-blur">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <span>⌨️</span> Manual Ticket Entry
              </span>
              <span className="text-[10px] text-surface-400 font-mono">5-Digit ID</span>
            </div>
            <form onSubmit={handleManualLookup} className="flex gap-2">
              <input
                className="flex-1 bg-surface-950 border border-surface-700 focus:border-primary-500 rounded-xl px-3.5 py-2.5 text-white placeholder-surface-500 text-sm focus:outline-none font-mono uppercase"
                placeholder="e.g. FP26-41211 or 41211"
                value={manualRoll}
                onChange={(e) => setManualRoll(e.target.value)}
                id="scanner-manual-input"
              />
              <Button type="submit" size="md" loading={manualLoading} className="px-5 font-bold">
                Verify
              </Button>
            </form>
          </div>
        </div>
      </main>

      {/* FULLSCREEN POPUP OVERLAYS - Rendered on top so camera hardware stays on */}
      {result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          {/* 1. Valid Entry Screen (Green) */}
          {result.status === 'valid' && (
            <div className="w-full max-w-sm rounded-3xl p-6 bg-gradient-to-br from-emerald-950 via-surface-900 to-emerald-900 border-2 border-emerald-500 text-center shadow-2xl animate-scale-in">
              <div className="text-7xl mb-3">✅</div>
              <h2 className="text-3xl font-black text-emerald-400 mb-1">ENTRY ALLOWED</h2>
              {result.was_override && (
                <div className="inline-block px-3 py-1 bg-amber-500 text-black font-extrabold text-xs uppercase tracking-wider rounded-full mb-3 shadow">
                  ⚠️ Forced Override Logged
                </div>
              )}
              <h3 className="text-2xl font-bold text-white mb-2">{result.student_name}</h3>
              <div className="flex items-center justify-center gap-2 mb-3">
                <span className="text-sm opacity-90 font-mono bg-black/40 px-3 py-1 rounded-lg border border-white/20">
                  {result.roll_no}
                </span>
                {result.ticket_id && (
                  <span className="text-sm font-mono font-bold bg-emerald-400 text-black px-3 py-1 rounded-lg shadow">
                    🎟️ {result.ticket_id}
                  </span>
                )}
              </div>
              <p className="text-xs opacity-80 mb-6 text-surface-300">{result.department} · {result.batch}</p>
              {!result.was_override && (
                <p className="opacity-70 text-xs mb-4 text-emerald-200">Auto-resetting in 3.5 seconds...</p>
              )}
              <Button onClick={resetScan} size="lg" className="w-full bg-emerald-500 hover:bg-emerald-600 text-black font-bold">
                Scan Next Pass →
              </Button>
            </div>
          )}

          {/* 2. Duplicate Scan Screen (Yellow) */}
          {result.status === 'duplicate' && (
            <div className="w-full max-w-sm rounded-3xl p-6 bg-gradient-to-br from-amber-950 via-surface-900 to-amber-900 border-2 border-amber-500 text-center shadow-2xl animate-scale-in">
              <div className="text-7xl mb-3">⚠️</div>
              <h2 className="text-2xl font-black text-amber-400 mb-1">ALREADY CHECKED IN</h2>
              <h3 className="text-xl font-bold text-white mb-2">{result.student_name}</h3>
              <div className="flex items-center justify-center gap-2 mb-4">
                <span className="text-xs opacity-90 font-mono bg-black/40 px-2.5 py-1 rounded-lg border border-white/20">
                  {result.roll_no}
                </span>
                {result.ticket_id && (
                  <span className="text-xs font-mono font-bold bg-amber-400 text-black px-2.5 py-1 rounded-lg">
                    🎟️ {result.ticket_id}
                  </span>
                )}
              </div>
              <div className="bg-black/40 rounded-xl p-3 mb-5 text-left text-xs text-amber-200 border border-amber-500/30 space-y-1">
                <p>⏱️ Checked in: <strong className="text-white">{result.scanned_at ? new Date(result.scanned_at).toLocaleTimeString() : 'Earlier'}</strong></p>
                <p>👤 Volunteer: <strong className="text-white">{result.scanned_by || 'Gate Scanner'}</strong></p>
              </div>
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={handleOverride}
                  disabled={overriding}
                  className="w-full py-3 px-4 rounded-xl bg-amber-500 text-black font-extrabold text-sm hover:bg-amber-400 transition-all shadow-lg disabled:opacity-50"
                >
                  {overriding ? 'Logging Override...' : '⚠️ Force Override & Allow'}
                </button>
                <Button variant="secondary" onClick={resetScan} size="md" className="w-full">
                  Deny Entry / Cancel
                </Button>
              </div>
            </div>
          )}

          {/* 3. Invalid or Error Screen (Red) */}
          {(result.status === 'invalid' || result.status === 'expired' || result.status === 'error') && (
            <div className="w-full max-w-sm rounded-3xl p-6 bg-gradient-to-br from-rose-950 via-surface-900 to-rose-900 border-2 border-rose-500 text-center shadow-2xl animate-scale-in">
              <div className="text-7xl mb-3">❌</div>
              <h2 className="text-2xl font-black text-rose-400 mb-2">
                {result.status === 'expired' ? 'PASS EXPIRED' : 'INVALID PASS'}
              </h2>
              <p className="text-xs text-rose-200 mb-6">{result.message || 'Pass not recognized in the system database.'}</p>
              <Button onClick={resetScan} size="lg" className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold">
                Try Again
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
