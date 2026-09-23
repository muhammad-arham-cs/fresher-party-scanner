import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Fresher Party 2026 — Admin & Scanner System',
  description: 'Pass generation, QR scanning, and admin dashboard for Fresher Party 2026 at DUET Islamabad.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-surface-950 min-h-screen font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
