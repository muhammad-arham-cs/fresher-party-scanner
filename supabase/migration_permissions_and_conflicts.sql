-- ==============================================================================
-- MIGRATION: Dynamic Permissions, PM Stealth Passes, and Conflict Management
-- Execute this in your Supabase Dashboard -> SQL Editor
-- ==============================================================================

-- 1. Add custom_permissions JSONB column to admin_users
ALTER TABLE admin_users 
ADD COLUMN IF NOT EXISTS custom_permissions JSONB DEFAULT '{"audit_logs": false, "scanner_logs": false, "manual_entry": false, "user_management": false}'::jsonb;

-- 2. Add created_by_pm boolean column to approved_passes
ALTER TABLE approved_passes 
ADD COLUMN IF NOT EXISTS created_by_pm BOOLEAN DEFAULT FALSE;

-- 3. Create pm_pass_conflicts table
CREATE TABLE IF NOT EXISTS pm_pass_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pm_pass_id UUID REFERENCES approved_passes(id) ON DELETE CASCADE,
  conflicting_pass_id UUID REFERENCES approved_passes(id) ON DELETE CASCADE,
  student_roll_no TEXT NOT NULL,
  student_name TEXT,
  conflicting_admin_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'merged' | 'kept_both' | 'dismissed'
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- Enable RLS and create service role policy
ALTER TABLE pm_pass_conflicts ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pm_pass_conflicts' AND policyname = 'Service role full access on pm_pass_conflicts'
  ) THEN
    CREATE POLICY "Service role full access on pm_pass_conflicts" 
    ON pm_pass_conflicts FOR ALL USING (true);
  END IF;
END $$;
