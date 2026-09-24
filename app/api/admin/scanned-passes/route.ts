import { NextRequest, NextResponse } from 'next/server';
import { checkAdminSession, getLiveAdminPermissions, isPMEmail } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await checkAdminSession();
    if (!session) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const isPM = session.role === 'PROJECT_MANAGER' || isPMEmail(session.email);

    // 1. Dynamic Permission Check: If not PM, verify user has scanned_passes permission
    if (!isPM) {
      const livePerms = await getLiveAdminPermissions(session.id);
      if (!livePerms.scanned_passes) {
        return NextResponse.json({
          success: false,
          message: 'Access denied: Scanned passes permission required',
        }, { status: 403 });
      }
    }

    const { searchParams } = new URL(req.url);
    const search = (searchParams.get('search') || '').trim();
    const department = (searchParams.get('department') || '').trim();
    const dateFrom = (searchParams.get('date_from') || '').trim();
    const dateTo = (searchParams.get('date_to') || '').trim();

    const supabase = createAdminClient();

    // 2. Fetch all successful admitted gate scans (valid and forced overrides)
    let query = supabase
      .from('scan_audit')
      .select('id, approved_pass_id, qr_token, student_name, roll_no, scanned_by, scanned_at, status, device_info')
      .in('status', ['valid', 'forced_override'])
      .order('scanned_at', { ascending: false });

    // STEALTH FILTER: If caller is not PM, strictly hide scans of PM stealth passes and PM volunteer scans
    if (!isPM) {
      const pmEmails = ['muhammadarham979@gmail.com', 'arham.personal28@gmail.com'];
      for (const email of pmEmails) {
        query = query.not('scanned_by', 'ilike', `%${email}%`);
      }

      // Hide scans belonging to PM-generated stealth passes
      const { data: pmPasses } = await supabase
        .from('approved_passes')
        .select('id, roll_no')
        .eq('created_by_pm', true);

      if (pmPasses && pmPasses.length > 0) {
        const pmPassIds = pmPasses.map((p) => p.id).filter(Boolean);
        const pmRollNos = pmPasses.map((p) => p.roll_no).filter(Boolean);
        if (pmPassIds.length > 0) {
          query = query.not('approved_pass_id', 'in', `(${pmPassIds.map((id) => `"${id}"`).join(',')})`);
        }
        if (pmRollNos.length > 0) {
          query = query.not('roll_no', 'in', `(${pmRollNos.map((r) => `"${r}"`).join(',')})`);
        }
      }
    }

    if (dateFrom) query = query.gte('scanned_at', dateFrom);
    if (dateTo) query = query.lte('scanned_at', dateTo);

    const { data: scans, error: scansError } = await query;
    if (scansError) throw scansError;

    // 3. Deduplicate by roll_no if multiple scans exist (keep the first/original admitted scan)
    const scanMap = new Map<string, any>();
    for (const scan of (scans || [])) {
      const key = (scan.roll_no || '').trim().toUpperCase();
      if (!key) continue;
      // Because scans are ordered descending, earlier we replace or keep earliest?
      // Keeping earliest scan time is official admission time
      if (!scanMap.has(key)) {
        scanMap.set(key, scan);
      } else {
        // Replace if current scan is earlier
        const existing = scanMap.get(key);
        if (new Date(scan.scanned_at) < new Date(existing.scanned_at)) {
          scanMap.set(key, scan);
        }
      }
    }

    const uniqueScans = Array.from(scanMap.values());

    // 4. Enrich scans with approved_passes data (Department, Section/Ticket ID, Batch)
    const rollNos = uniqueScans.map((s) => s.roll_no).filter(Boolean);
    let passesMap = new Map<string, any>();

    if (rollNos.length > 0) {
      // Chunk queries if rollNos count is large
      const { data: passesData } = await supabase
        .from('approved_passes')
        .select('roll_no, name, department, batch, section, society, created_by_pm')
        .in('roll_no', rollNos);

      if (passesData) {
        passesData.forEach((p) => {
          passesMap.set((p.roll_no || '').toUpperCase(), p);
        });
      }
    }

    // 5. Combine and calculate stats
    const todayStr = new Date().toISOString().slice(0, 10);
    const departmentBreakdown: Record<string, number> = {};
    let scannedTodayCount = 0;

    let enrichedScans = uniqueScans.map((scan) => {
      const pass = passesMap.get((scan.roll_no || '').toUpperCase());
      const studentName = scan.student_name !== 'Unknown' && scan.student_name ? scan.student_name : (pass?.name || 'Student');
      const dept = pass?.department || 'General';
      const batch = pass?.batch || '';
      const section = pass?.section || ''; // Ticket ID
      const society = pass?.society || '';
      const isPmPass = Boolean(pass?.created_by_pm);

      // Tally department
      departmentBreakdown[dept] = (departmentBreakdown[dept] || 0) + 1;

      // Tally today
      if (scan.scanned_at && scan.scanned_at.startsWith(todayStr)) {
        scannedTodayCount++;
      }

      return {
        id: scan.id,
        roll_no: scan.roll_no,
        student_name: studentName,
        department: dept,
        batch,
        section, // Ticket ID (e.g. FP26-XXXXX)
        society,
        scanned_at: scan.scanned_at,
        scanned_by: scan.scanned_by,
        status: scan.status,
        is_override: scan.status === 'forced_override',
        is_pm_pass: isPmPass,
      };
    });

    // 6. Apply search and department filter on enriched list
    if (department && department !== 'all') {
      enrichedScans = enrichedScans.filter((s) => s.department?.toLowerCase() === department.toLowerCase());
    }

    if (search) {
      const q = search.toLowerCase();
      enrichedScans = enrichedScans.filter((s) =>
        s.student_name?.toLowerCase().includes(q) ||
        s.roll_no?.toLowerCase().includes(q) ||
        s.section?.toLowerCase().includes(q) ||
        s.department?.toLowerCase().includes(q)
      );
    }

    // Sort by scanned_at descending
    enrichedScans.sort((a, b) => new Date(b.scanned_at).getTime() - new Date(a.scanned_at).getTime());

    return NextResponse.json({
      success: true,
      total_scanned: uniqueScans.length,
      scanned_today: scannedTodayCount,
      department_breakdown: departmentBreakdown,
      scans: enrichedScans,
    });
  } catch (err: any) {
    console.error('Error fetching scanned passes:', err);
    return NextResponse.json({ success: false, message: err.message || 'Server error' }, { status: 500 });
  }
}
