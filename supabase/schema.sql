-- ============================================================
-- FRESHER PARTY 2026 — SUPABASE DATABASE SCHEMA (SECURITY HARDENED)
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. APPROVED PASSES TABLE
CREATE TABLE IF NOT EXISTS approved_passes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roll_no TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  department TEXT NOT NULL,
  batch TEXT NOT NULL,
  section TEXT,
  society TEXT NOT NULL,
  qr_token UUID UNIQUE NOT NULL,
  pass_status TEXT DEFAULT 'generated',
  -- 'generated' | 'email_sent' | 'sent_via_whatsapp'
  source TEXT NOT NULL,
  -- 'excel_automated' | 'manual_entry'
  is_society_member BOOLEAN DEFAULT FALSE,
  entry_created_by TEXT NOT NULL,
  entry_created_at TIMESTAMP DEFAULT NOW(),
  pass_generated_at TIMESTAMP,
  pass_sent_at TIMESTAMP,
  pass_pdf_url TEXT,
  expires_at TIMESTAMP DEFAULT '2026-09-30 23:59:59',
  pass_pdf_cached_url TEXT,
  pass_pdf_cache_expires TIMESTAMP,
  ticket_id TEXT UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Migration columns in case approved_passes already exists:
ALTER TABLE approved_passes ADD COLUMN IF NOT EXISTS ticket_id TEXT UNIQUE;
ALTER TABLE approved_passes ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP DEFAULT '2026-09-30 23:59:59';
ALTER TABLE approved_passes ADD COLUMN IF NOT EXISTS pass_pdf_cached_url TEXT;
ALTER TABLE approved_passes ADD COLUMN IF NOT EXISTS pass_pdf_cache_expires TIMESTAMP;

-- Backfill any existing approved passes with unique ticket_id:
UPDATE approved_passes 
SET ticket_id = 'FP26-' || UPPER(SUBSTRING(REPLACE(qr_token::text, '-', ''), 1, 6))
WHERE ticket_id IS NULL;

-- 2. FLAGGED ENTRIES TABLE (AI validation results)
CREATE TABLE IF NOT EXISTS flagged_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roll_no TEXT,
  name TEXT,
  email TEXT,
  department TEXT,
  batch TEXT,
  society TEXT,
  flag_type TEXT NOT NULL,
  -- 'duplicate' | 'missing_email' | 'incomplete_data' | 'invalid_format' | 'other'
  flag_details TEXT,
  is_approved BOOLEAN DEFAULT FALSE,
  approved_by TEXT,
  approved_at TIMESTAMP,
  rejected_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 3. SCAN AUDIT LOG
CREATE TABLE IF NOT EXISTS scan_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approved_pass_id UUID REFERENCES approved_passes(id),
  qr_token TEXT NOT NULL,
  student_name TEXT NOT NULL,
  roll_no TEXT NOT NULL,
  scanned_by TEXT NOT NULL,
  scanned_at TIMESTAMP DEFAULT NOW(),
  status TEXT NOT NULL,
  -- 'valid' | 'already_scanned' | 'invalid' | 'forced_override'
  device_info TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 4. ADMIN USERS TABLE
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  -- 'PROJECT_MANAGER' | 'ENTRY_MANAGER' | 'ENTRY_SUPERVISOR' | 'SCANNER'
  is_active BOOLEAN DEFAULT TRUE,
  created_by TEXT,
  password_setup_token UUID,
  password_setup_expires TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP
);

-- Migration columns in case admin_users already exists:
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS password_setup_token UUID;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS password_setup_expires TIMESTAMP;

-- 5. EMAIL QUEUE TABLE (Rate limiting & asynchronous sending)
CREATE TABLE IF NOT EXISTS email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_name TEXT,
  email TEXT,
  student_email TEXT,
  roll_no TEXT,
  department TEXT,
  batch TEXT,
  society TEXT,
  qr_token UUID,
  pass_pdf_url TEXT,
  approved_pass_id UUID REFERENCES approved_passes(id),
  email_type TEXT DEFAULT 'pass',
  status TEXT DEFAULT 'queued',
  -- 'queued' | 'sent' | 'failed'
  attempts INT DEFAULT 0,
  attempted_count INT DEFAULT 0,
  error_message TEXT,
  failed_reason TEXT,
  api_used TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  sent_at TIMESTAMP,
  scheduled_for TIMESTAMP DEFAULT NOW()
);

-- Migration columns for email_queue
ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS student_email TEXT;
ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS email_type TEXT DEFAULT 'pass';
ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS attempted_count INT DEFAULT 0;
ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS failed_reason TEXT;
ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS api_used TEXT;
ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS approved_pass_id UUID REFERENCES approved_passes(id);

-- 6. EMAIL QUOTA TRACKING TABLE (70/hour, 550/day limit enforcement)
CREATE TABLE IF NOT EXISTS email_quota (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date TEXT NOT NULL, -- 'YYYY-MM-DD'
  hour INT NOT NULL DEFAULT 0,  -- 0-23
  count INT DEFAULT 0,
  emails_sent_today INT DEFAULT 0,
  emails_sent_this_hour INT DEFAULT 0,
  last_hour_reset TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(date, hour)
);

-- Migration columns for email_quota
ALTER TABLE email_quota ADD COLUMN IF NOT EXISTS emails_sent_today INT DEFAULT 0;
ALTER TABLE email_quota ADD COLUMN IF NOT EXISTS emails_sent_this_hour INT DEFAULT 0;
ALTER TABLE email_quota ADD COLUMN IF NOT EXISTS last_hour_reset TIMESTAMP DEFAULT NOW();

-- 7. EMAIL LOGS TABLE (Logs every single outbound email for audit and quota tracking)
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  api_used TEXT NOT NULL,
  status TEXT NOT NULL,
  sent_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 8. AUDIT LOGS TABLE (Comprehensive security audit trail)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type TEXT NOT NULL,
  -- 'double_scan_forced' | 'pass_downloaded' | 'manual_entry_created' | 'admin_login' | 'email_sent'
  performed_by TEXT NOT NULL,
  roll_no TEXT,
  student_name TEXT,
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 9. INDEXES
CREATE INDEX IF NOT EXISTS idx_approved_passes_roll_no ON approved_passes(roll_no);
CREATE INDEX IF NOT EXISTS idx_approved_passes_qr_token ON approved_passes(qr_token);
CREATE INDEX IF NOT EXISTS idx_flagged_entries_roll_no ON flagged_entries(roll_no);
CREATE INDEX IF NOT EXISTS idx_scan_audit_qr_token ON scan_audit(qr_token);
CREATE INDEX IF NOT EXISTS idx_scan_audit_status ON scan_audit(status);
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status);
CREATE INDEX IF NOT EXISTS idx_email_queue_created ON email_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_email_quota_date ON email_quota(date);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON email_logs(sent_at);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_roll ON audit_logs(roll_no);

-- ============================================================
-- STORAGE SETUP
-- 1. Go to: Supabase Dashboard → Storage → Create Bucket
-- 2. Bucket name: "passes"
-- 3. Public: NO (Private bucket - signed URLs are used for security)
-- ============================================================

-- ============================================================
-- RLS (Row Level Security) — RECOMMENDED
-- Enable RLS on all tables and restrict to service role only.
-- The app uses SUPABASE_SERVICE_ROLE_KEY for all server operations.
-- ============================================================

ALTER TABLE approved_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE flagged_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_quota ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access on approved_passes') THEN
    CREATE POLICY "Service role full access on approved_passes" ON approved_passes FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access on flagged_entries') THEN
    CREATE POLICY "Service role full access on flagged_entries" ON flagged_entries FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access on scan_audit') THEN
    CREATE POLICY "Service role full access on scan_audit" ON scan_audit FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access on admin_users') THEN
    CREATE POLICY "Service role full access on admin_users" ON admin_users FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access on email_queue') THEN
    CREATE POLICY "Service role full access on email_queue" ON email_queue FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access on email_quota') THEN
    CREATE POLICY "Service role full access on email_quota" ON email_quota FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access on email_logs') THEN
    CREATE POLICY "Service role full access on email_logs" ON email_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access on audit_logs') THEN
    CREATE POLICY "Service role full access on audit_logs" ON audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
