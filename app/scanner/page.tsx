'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

interface ScanResult {
  status: 'valid' | 'duplicate' | 'invalid' | 'expired' | 'error' | 'revoked';
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

/* ─── Professional Audio & Haptic Feedback ─────────────────── */
function playScanSound(type: 'valid' | 'duplicate' | 'error') {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    if (type === 'valid') {
      // High-tech pleasant double chime
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      const gain2 = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now); // A5
      gain1.gain.setValueAtTime(0.2, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.1);

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1318.5, now + 0.1); // E6
      gain2.gain.setValueAtTime(0.25, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.25);

      if (navigator.vibrate) navigator.vibrate([70]);
    } else if (type === 'duplicate') {
      // Amber warning tone: double low buzz
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(260, now);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);

      if (navigator.vibrate) navigator.vibrate([100, 60, 100]);
    } else {
      // Error / Revoked: dissonant saw buzz
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);

      if (navigator.vibrate) navigator.vibrate([150, 80, 150]);
    }
  } catch {
    /* ignore audio policy errors */
  }
}

/* ─── High-Tech Animated Scanning Laser Overlay ───────────── */
function ScannerOverlay() {
  return (
    <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden rounded-3xl">
      {/* Dynamic Laser Beam with Glowing Trailing Aura */}
      <div
        className="absolute left-2 right-2 animate-scan-line pointer-events-none z-30"
        style={{ animationDuration: '2.4s' }}
      >
        {/* Glow trailing gradient */}
        <div
          className="h-10 w-full"
          style={{
            background: 'linear-gradient(to top, rgba(6, 182, 212, 0.22), transparent)',
          }}
        />
        {/* Sharp laser beam */}
        <div
          className="h-[2.5px] w-full rounded-full"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(34, 211, 238, 0.3) 10%, #22d3ee 50%, rgba(34, 211, 238, 0.3) 90%, transparent 100%)',
            boxShadow: '0 0 12px 2px #06b6d4, 0 0 24px 6px rgba(6, 182, 212, 0.4)',
          }}
        />
      </div>

      {/* Viewfinder Target Framing Box */}
      <div className="absolute inset-8 border border-cyan-500/20 rounded-2xl flex items-center justify-center">
        {/* Corner Accents */}
        {/* Top-left */}
        <div className="absolute -top-[2px] -left-[2px] w-7 h-7">
          <div className="absolute top-0 left-0 w-full h-[3px] bg-cyan-400 rounded-full shadow-[0_0_8px_#22d3ee]" />
          <div className="absolute top-0 left-0 w-[3px] h-full bg-cyan-400 rounded-full shadow-[0_0_8px_#22d3ee]" />
          <div className="absolute top-[1px] left-[1px] w-1.5 h-1.5 bg-cyan-300 rounded-full animate-ping" />
        </div>
        {/* Top-right */}
        <div className="absolute -top-[2px] -right-[2px] w-7 h-7">
          <div className="absolute top-0 right-0 w-full h-[3px] bg-cyan-400 rounded-full shadow-[0_0_8px_#22d3ee]" />
          <div className="absolute top-0 right-0 w-[3px] h-full bg-cyan-400 rounded-full shadow-[0_0_8px_#22d3ee]" />
          <div className="absolute top-[1px] right-[1px] w-1.5 h-1.5 bg-cyan-300 rounded-full animate-ping" />
        </div>
        {/* Bottom-left */}
        <div className="absolute -bottom-[2px] -left-[2px] w-7 h-7">
          <div className="absolute bottom-0 left-0 w-full h-[3px] bg-cyan-400 rounded-full shadow-[0_0_8px_#22d3ee]" />
          <div className="absolute bottom-0 left-0 w-[3px] h-full bg-cyan-400 rounded-full shadow-[0_0_8px_#22d3ee]" />
          <div className="absolute bottom-[1px] left-[1px] w-1.5 h-1.5 bg-cyan-300 rounded-full animate-ping" />
        </div>
        {/* Bottom-right */}
        <div className="absolute -bottom-[2px] -right-[2px] w-7 h-7">
          <div className="absolute bottom-0 right-0 w-full h-[3px] bg-cyan-400 rounded-full shadow-[0_0_8px_#22d3ee]" />
          <div className="absolute bottom-0 right-0 w-[3px] h-full bg-cyan-400 rounded-full shadow-[0_0_8px_#22d3ee]" />
          <div className="absolute bottom-[1px] right-[1px] w-1.5 h-1.5 bg-cyan-300 rounded-full animate-ping" />
        </div>

        {/* Center Target Reticle */}
        <div className="relative w-16 h-16 flex items-center justify-center">
          <div className="absolute w-8 h-[1px] bg-cyan-400/40" />
          <div className="absolute h-8 w-[1px] bg-cyan-400/40" />
          <div className="w-4 h-4 rounded-full border border-cyan-400/60 animate-ping opacity-60" />
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee]" />
        </div>
      </div>

      {/* Cyberpunk Vignette & Radial Glow */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(circle at center, transparent 45%, rgba(10, 15, 30, 0.6) 100%)',
        }}
      />

      {/* Top HUD Telemetry */}
      <div className="absolute top-3 left-4 right-4 flex items-center justify-between text-[9px] font-mono text-cyan-400/70 tracking-wider">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          OPTICAL SCANNER
        </span>
        <span className="opacity-60">AUTO-DETECT ON</span>
      </div>
    </div>
  );
}

/* ─── Expanding ring effect for success ────────────────────── */
function SuccessRings() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
      <div className="w-20 h-20 rounded-full border-emerald-400 animate-ring-expand absolute" />
      <div className="w-20 h-20 rounded-full border-emerald-400 animate-ring-expand absolute" style={{ animationDelay: '0.4s' }} />
      <div className="w-20 h-20 rounded-full border-emerald-400 animate-ring-expand absolute" style={{ animationDelay: '0.8s' }} />
    </div>
  );
}

/* ─── Particle burst on result ─────────────────────────────── */
function ParticleBurst({ color }: { color: string }) {
  const particles = Array.from({ length: 12 }, (_, i) => {
    const angle = (i * 30 * Math.PI) / 180;
    const distance = 60 + Math.random() * 40;
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;
    const size = 3 + Math.random() * 4;
    const delay = Math.random() * 0.2;
    return (
      <div
        key={i}
        className="absolute rounded-full"
        style={{
          width: size,
          height: size,
          backgroundColor: color,
          left: '50%',
          top: '50%',
          opacity: 0,
          animation: `particle-fly-${i} 0.8s ease-out ${delay}s forwards`,
        }}
      />
    );
  });

  // Inject dynamic particle styles
  const styleContent = Array.from({ length: 12 }, (_, i) => {
    const angle = (i * 30 * Math.PI) / 180;
    const distance = 60 + Math.random() * 40;
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;
    return `@keyframes particle-fly-${i} {
      0% { transform: translate(0, 0) scale(1); opacity: 1; }
      100% { transform: translate(${x}px, ${y}px) scale(0); opacity: 0; }
    }`;
  }).join('\n');

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <style>{styleContent}</style>
      {particles}
    </div>
  );
}

export default function ScannerPage() {
  const router = useRouter();
  const [volunteerName, setVolunteerName] = useState('Volunteer');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [manualRoll, setManualRoll] = useState('');
  const [manualLoading, setManualLoading] = useState(false);
  const [lastScannedToken, setLastScannedToken] = useState<string>('');
  const [overriding, setOverriding] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const html5QrRef = useRef<any>(null);
  const autoResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load sound preference from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedSound = localStorage.getItem('scanner_sound');
      if (storedSound !== null) setSoundEnabled(storedSound === 'true');
    }
  }, []);

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

      if (soundEnabled) {
        if (data.status === 'valid') playScanSound('valid');
        else if (data.status === 'duplicate') playScanSound('duplicate');
        else playScanSound('error');
      }

      if (data.status === 'valid') {
        setScanCount((c) => c + 1);
      }

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
      if (soundEnabled) playScanSound('error');
      setProcessing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processing, volunteerName, soundEnabled]);

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
      if (data.status === 'valid') {
        if (soundEnabled) playScanSound('valid');
        setScanCount((c) => c + 1);
      }
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

      if (soundEnabled) {
        if (data.status === 'valid') playScanSound('valid');
        else if (data.status === 'duplicate') playScanSound('duplicate');
        else playScanSound('error');
      }

      if (data.status === 'valid') {
        setScanCount((c) => c + 1);
        if (!data.was_override) {
          autoResetRef.current = setTimeout(() => {
            resetScan();
          }, 3500);
        }
      }
    } catch {
      setResult({ status: 'error', message: 'Network error during manual lookup' });
      if (soundEnabled) playScanSound('error');
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
      {/* Ambient background glow */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] opacity-[0.06]"
          style={{ background: 'radial-gradient(ellipse, rgba(59,130,246,1) 0%, transparent 70%)' }}
        />
      </div>

      {/* Top bar */}
      <header className="px-4 py-3 border-b border-surface-800/80 flex items-center justify-between bg-surface-900/90 backdrop-blur-xl sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-3 h-3 rounded-full bg-success-500" />
            <div className="absolute inset-0 w-3 h-3 rounded-full bg-success-500 animate-ping opacity-75" />
          </div>
          <div>
            <h1 className="text-sm font-bold leading-tight">Fresher Party 2026</h1>
            <p className="text-xs text-surface-400">Gate Check-in · DUET</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {scanCount > 0 && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold font-mono animate-count-up">
              ✓ {scanCount}
            </span>
          )}
          <button
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              localStorage.setItem('scanner_sound', String(next));
            }}
            className="text-xs px-2.5 py-1 rounded-lg bg-surface-800 text-surface-300 hover:text-white border border-surface-700/50 transition-all flex items-center gap-1 font-medium"
            title={soundEnabled ? 'Mute sound' : 'Enable sound'}
            id="sound-toggle-btn"
          >
            {soundEnabled ? '🔊 Sound On' : '🔇 Muted'}
          </button>
          <span className="text-xs px-2.5 py-1 rounded-full bg-surface-800 text-surface-300 font-medium">
            👤 {volunteerName}
          </span>
          <button
            onClick={handleLogout}
            className="text-xs text-surface-400 hover:text-white px-2 py-1 rounded-lg hover:bg-surface-800 transition-all"
            title="Log out"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main scanner view */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 relative z-10">
        <div className="w-full max-w-sm flex flex-col items-center">
          {/* Camera preview container with professional scanner frame */}
          <div className="w-full aspect-square bg-surface-900 rounded-3xl overflow-hidden relative border border-surface-700/50 shadow-2xl shadow-black/40 flex items-center justify-center">
            <div id="qr-reader" className="w-full h-full" />

            {/* Professional scanning overlay — only shown when camera is active */}
            {scanning && cameraReady && <ScannerOverlay />}

            {/* Camera OFF state */}
            {!scanning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-900 p-6 text-center z-10">
                {/* Animated scanner icon */}
                <div className="relative mb-6">
                  <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-primary-600/20 to-purple-600/20 flex items-center justify-center border border-primary-500/30 backdrop-blur">
                    <svg className="w-12 h-12 text-primary-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5z" />
                    </svg>
                  </div>
                  <div className="absolute -inset-1 rounded-2xl border border-primary-500/20 animate-pulse-glow" />
                </div>
                <h2 className="text-lg font-bold mb-1">Camera Inactive</h2>
                <p className="text-surface-400 text-xs mb-6 max-w-xs leading-relaxed">
                  Activate the camera and position the student&apos;s QR pass within the scan frame.
                </p>
                <Button onClick={startScanner} size="lg" className="w-full shadow-lg shadow-primary-500/25 font-bold" id="activate-camera-btn">
                  <span className="mr-2">📷</span> Activate Scanner
                </Button>
              </div>
            )}

            {/* Scanning active label */}
            {scanning && cameraReady && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30">
                <div
                  className="px-4 py-1.5 rounded-full text-[11px] font-bold text-primary-300 border border-primary-500/30 backdrop-blur-md"
                  style={{
                    background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.15))',
                  }}
                >
                  <span className="inline-block w-2 h-2 rounded-full bg-primary-400 mr-2 animate-pulse" />
                  SCANNING...
                </div>
              </div>
            )}
          </div>

          {/* Camera toggle button */}
          <div className="w-full mt-3 flex">
            {scanning ? (
              <Button variant="secondary" onClick={stopScanner} className="w-full group" size="md">
                <span className="group-hover:scale-110 transition-transform inline-block mr-1">⏸️</span> Pause Camera
              </Button>
            ) : (
              <Button variant="secondary" onClick={startScanner} className="w-full group" size="md">
                <span className="group-hover:scale-110 transition-transform inline-block mr-1">▶️</span> Resume Camera
              </Button>
            )}
          </div>

          {/* Manual Ticket ID Entry Card */}
          <div className="w-full mt-4 p-4 rounded-2xl bg-surface-900/95 border border-surface-800 shadow-xl backdrop-blur-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <span>⌨️</span> Manual Ticket Entry
              </span>
              <span className="text-[10px] text-surface-400 font-mono px-2 py-0.5 rounded bg-surface-800">5-Digit ID</span>
            </div>
            <form onSubmit={handleManualLookup} className="flex gap-2">
              <input
                className="flex-1 bg-surface-950 border border-surface-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 rounded-xl px-3.5 py-2.5 text-white placeholder-surface-500 text-sm focus:outline-none font-mono uppercase transition-all"
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

      {/* ═══════════ FULLSCREEN RESULT OVERLAYS ═══════════ */}
      {result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-lg animate-fade-in">

          {/* ─── 1. VALID ENTRY (Green) ─── */}
          {result.status === 'valid' && (
            <div className="w-full max-w-sm rounded-3xl overflow-hidden relative animate-bounce-in">
              {/* Background glow effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-950 via-surface-900 to-emerald-900" />
              <div className="absolute inset-0 opacity-30" style={{ background: 'radial-gradient(circle at 50% 30%, rgba(16,185,129,0.5), transparent 70%)' }} />

              {/* Success rings animation */}
              <SuccessRings />

              {/* Particle burst */}
              <ParticleBurst color="rgba(52, 211, 153, 0.8)" />

              {/* Content */}
              <div className="relative z-10 p-6 text-center border-2 border-emerald-500/60 rounded-3xl">
                {/* Animated checkmark */}
                <div className="relative inline-block mb-3">
                  <div className="text-7xl animate-success-burst">✅</div>
                </div>

                <h2 className="text-3xl font-black text-emerald-400 mb-1 animate-slide-down tracking-tight">
                  ENTRY ALLOWED
                </h2>

                {result.was_override && (
                  <div
                    className="inline-block px-3 py-1 font-extrabold text-xs uppercase tracking-wider rounded-full mb-3 shadow animate-slide-down"
                    style={{
                      background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                      color: '#000',
                      animationDelay: '0.1s',
                    }}
                  >
                    ⚠️ Forced Override Logged
                  </div>
                )}

                <h3 className="text-2xl font-bold text-white mb-2 animate-slide-down" style={{ animationDelay: '0.1s' }}>
                  {result.student_name}
                </h3>

                <div className="flex items-center justify-center gap-2 mb-3 animate-slide-down" style={{ animationDelay: '0.15s' }}>
                  <span className="text-sm opacity-90 font-mono bg-black/40 px-3 py-1 rounded-lg border border-white/20">
                    {result.roll_no}
                  </span>
                  {result.ticket_id && (
                    <span
                      className="text-sm font-mono font-bold px-3 py-1 rounded-lg shadow-lg"
                      style={{ background: 'linear-gradient(135deg, #34d399, #10b981)', color: '#000' }}
                    >
                      🎟️ {result.ticket_id}
                    </span>
                  )}
                </div>

                <p className="text-xs opacity-80 mb-5 text-surface-300 animate-slide-down" style={{ animationDelay: '0.2s' }}>
                  {result.department} · {result.batch}
                </p>

                {/* Progress bar for auto-reset */}
                {!result.was_override && (
                  <div className="w-full h-1 bg-emerald-900 rounded-full overflow-hidden mb-4">
                    <div
                      className="h-full bg-emerald-400 rounded-full"
                      style={{ animation: 'shrink-bar 3.5s linear forwards' }}
                    />
                  </div>
                )}

                <Button
                  onClick={resetScan}
                  size="lg"
                  className="w-full font-bold text-black shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/40 transition-all"
                  style={{ background: 'linear-gradient(135deg, #34d399, #10b981)' }}
                >
                  Scan Next Pass →
                </Button>
              </div>
            </div>
          )}

          {/* ─── 2. DUPLICATE SCAN (Amber) ─── */}
          {result.status === 'duplicate' && (
            <div className="w-full max-w-sm rounded-3xl overflow-hidden relative animate-bounce-in">
              <div className="absolute inset-0 bg-gradient-to-br from-amber-950 via-surface-900 to-amber-900" />
              <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(circle at 50% 30%, rgba(245,158,11,0.5), transparent 70%)' }} />

              <div className="relative z-10 p-6 text-center border-2 border-amber-500/60 rounded-3xl">
                <div className="text-7xl mb-3 animate-shake">⚠️</div>

                <h2 className="text-2xl font-black text-amber-400 mb-1 tracking-tight">ALREADY CHECKED IN</h2>

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
                    className="w-full py-3 px-4 rounded-xl font-extrabold text-sm transition-all shadow-lg disabled:opacity-50 text-black hover:brightness-110 active:scale-[0.98]"
                    style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)' }}
                  >
                    {overriding ? 'Logging Override...' : '⚠️ Force Override & Allow'}
                  </button>
                  <Button variant="secondary" onClick={resetScan} size="md" className="w-full">
                    Deny Entry / Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ─── 3. INVALID / ERROR (Red) ─── */}
          {(result.status === 'invalid' || result.status === 'expired' || result.status === 'error') && (
            <div className="w-full max-w-sm rounded-3xl overflow-hidden relative animate-bounce-in">
              <div className="absolute inset-0 bg-gradient-to-br from-rose-950 via-surface-900 to-rose-900" />
              <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(circle at 50% 30%, rgba(244,63,94,0.5), transparent 70%)' }} />

              <div className="relative z-10 p-6 text-center border-2 border-rose-500/60 rounded-3xl animate-shake">
                <div className="text-7xl mb-3">❌</div>

                <h2 className="text-2xl font-black text-rose-400 mb-2 tracking-tight">
                  {result.status === 'expired' ? 'PASS EXPIRED' : 'INVALID PASS'}
                </h2>

                <p className="text-xs text-rose-200 mb-6 leading-relaxed">{result.message || 'Pass not recognized in the system database.'}</p>

                <Button
                  onClick={resetScan}
                  size="lg"
                  className="w-full font-bold text-white shadow-lg"
                  style={{ background: 'linear-gradient(135deg, #f43f5e, #e11d48)' }}
                >
                  Try Again
                </Button>
              </div>
            </div>
          )}

          {/* ─── 4. REVOKED (Deep Red — No Override) ─── */}
          {result.status === 'revoked' && (
            <div className="w-full max-w-sm rounded-3xl overflow-hidden relative animate-bounce-in">
              <div className="absolute inset-0 bg-gradient-to-br from-red-950 via-surface-900 to-rose-950" />
              <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(circle at 50% 30%, rgba(220,38,38,0.5), transparent 70%)' }} />

              <div className="relative z-10 p-6 text-center border-2 border-red-600/60 rounded-3xl animate-shake">
                <div className="text-7xl mb-3">⛔</div>

                <h2 className="text-2xl font-black text-red-400 mb-1 tracking-tight">PASS REVOKED</h2>

                <div
                  className="inline-block px-3 py-1 font-extrabold text-xs uppercase tracking-wider rounded-full mb-3 border border-red-500/40"
                  style={{ background: 'rgba(220,38,38,0.2)', color: '#fca5a5' }}
                >
                  Entry Strictly Denied
                </div>

                {result.student_name && (
                  <h3 className="text-xl font-bold text-white mb-2">{result.student_name}</h3>
                )}

                {result.roll_no && (
                  <div className="flex items-center justify-center gap-2 mb-4">
                    <span className="text-xs opacity-90 font-mono bg-black/40 px-2.5 py-1 rounded-lg border border-white/20">
                      {result.roll_no}
                    </span>
                    {result.ticket_id && (
                      <span className="text-xs font-mono font-bold bg-red-500/30 text-red-300 px-2.5 py-1 rounded-lg border border-red-500/40">
                        🎟️ {result.ticket_id}
                      </span>
                    )}
                  </div>
                )}

                <p className="text-xs text-red-200 mb-6 font-semibold leading-relaxed">
                  {result.message || 'This pass has been cancelled/revoked by event administration.'}
                </p>

                <Button
                  onClick={resetScan}
                  size="lg"
                  className="w-full font-bold text-white shadow-lg"
                  style={{ background: 'linear-gradient(135deg, #dc2626, #b91c1c)' }}
                >
                  Scan Next Pass →
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Inline style for progress bar & clean video stream */}
      <style>{`
        @keyframes shrink-bar {
          0% { width: 100%; }
          100% { width: 0%; }
        }
        #qr-reader {
          border: none !important;
          background: transparent !important;
        }
        #qr-reader video {
          object-fit: cover !important;
          width: 100% !important;
          height: 100% !important;
          border-radius: 1.5rem !important;
        }
        #qr-reader__scan_region {
          border: none !important;
        }
        #qr-reader__dashboard_section_csr {
          display: none !important;
        }
      `}</style>
    </div>
  );
}
