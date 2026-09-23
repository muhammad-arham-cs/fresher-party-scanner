import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-surface-950 text-center relative overflow-hidden">
      {/* Background glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-primary-600/15 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-accent-600/15 blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-success-600/5 blur-3xl pointer-events-none" />

      <div className="relative max-w-xl animate-slide-up">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary-600/20 border border-primary-600/30 text-primary-400 text-xs font-semibold mb-6">
          <span className="w-2 h-2 rounded-full bg-success-400 animate-pulse" />
          DUET
        </div>

        {/* Logo */}
        <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-primary-600 via-accent-600 to-success-600 flex items-center justify-center shadow-2xl shadow-primary-900/40">
          <span className="text-4xl">🎉</span>
        </div>

        <h1 className="text-4xl md:text-5xl font-black text-white mb-3 leading-tight">
          Fresher Party{' '}
          <span className="gradient-text">2026</span>
        </h1>
        <p className="text-surface-400 text-lg mb-10">
          Campus of I&CS · DUET
        </p>

        {/* Admin Dashboard Action */}
        <div className="max-w-md mx-auto mb-8">
          <Link href="/admin/login" className="group block">
            <div className="card hover:border-primary-600/50 hover:bg-surface-700/50 transition-all duration-200 group-hover:shadow-lg group-hover:shadow-primary-900/20 text-left p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary-600/20 flex items-center justify-center group-hover:bg-primary-600/30 transition-colors shrink-0">
                  <svg className="w-6 h-6 text-primary-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-white font-bold text-lg mb-1">Admin Dashboard</h2>
                  <p className="text-surface-400 text-sm">Click To Login</p>
                </div>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
