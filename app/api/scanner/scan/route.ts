import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/audit';
import { formatTicketId } from '@/lib/pass-generator';
import { v4 as uuidv4 } from 'uuid';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HARDCODED_EXPIRY = new Date('2026-09-30T23:59:59Z');

export async function POST(req: NextRequest) {
  try {
    const { qr_token, scanned_by, device_info, override } = await req.json();

    if (!qr_token || !String(qr_token).trim()) {
      return NextResponse.json({ status: 'invalid', message: 'Ticket ID or QR code is required' }, { status: 400 });
    }

    const scannerName = (scanned_by && String(scanned_by).trim()) || 'Gate Volunteer';
    const tokenInput = String(qr_token).trim();
    const isUuid = UUID_REGEX.test(tokenInput);
    const supabase = createAdminClient();

    // Look up pass by qr_token, ticket_id, section, or roll_no
    let pass: any = null;

    // 1. Direct UUID lookup
    if (isUuid) {
      const { data } = await supabase
        .from('approved_passes')
        .select('*')
        .eq('qr_token', tokenInput)
        .maybeSingle();
      if (data) pass = data;
    }

    // 2. Roll Number lookup (e.g. 24f-cs-908)
    if (!pass) {
      const { data } = await supabase
        .from('approved_passes')
        .select('*')
        .ilike('roll_no', tokenInput)
        .maybeSingle();
      if (data) pass = data;
    }

    // 3. Ticket ID lookup (e.g. "FP26-41211", "41211", or "fp26-41211")
    if (!pass) {
      const cleanDigits = tokenInput.replace(/[^0-9]/g, '');
      const normalizedTicketId = tokenInput.toUpperCase().startsWith('FP26-')
        ? tokenInput.toUpperCase()
        : cleanDigits.length === 5 ? `FP26-${cleanDigits}` : tokenInput.toUpperCase();

      // Check section column (where ticket ID is safely stored)
      const { data: bySection } = await supabase
        .from('approved_passes')
        .select('*')
        .or(`section.ilike.${tokenInput},section.ilike.${normalizedTicketId}`)
        .maybeSingle();
      if (bySection) pass = bySection;

      // Check ticket_id column if present
      if (!pass) {
        try {
          const { data: byCol } = await supabase
            .from('approved_passes')
            .select('*')
            .or(`ticket_id.ilike.${tokenInput},ticket_id.ilike.${normalizedTicketId}`)
            .maybeSingle();
          if (byCol) pass = byCol;
        } catch {
          // ignore if column doesn't exist
        }
      }
    }

    if (!pass) {
      // Log invalid scan safely
      const auditToken = isUuid ? tokenInput : uuidv4();
      await supabase.from('scan_audit').insert({
        qr_token: auditToken,
        student_name: 'Unknown',
        roll_no: tokenInput,
        scanned_by: scannerName,
        status: 'invalid',
        device_info: `${device_info || ''} [raw: ${tokenInput}]`.trim(),
      });

      return NextResponse.json({
        status: 'invalid',
        message: 'Pass not found for this Ticket ID, QR Code, or Roll Number',
      });
    }

    const ticket_id = pass.ticket_id || (pass.section && pass.section.startsWith('FP26-') ? pass.section : formatTicketId(pass.qr_token));

    // Security Update #2: QR Expiration Check (30 September 2026)
    const passExpiry = pass.expires_at ? new Date(pass.expires_at) : HARDCODED_EXPIRY;
    if (new Date() > passExpiry) {
      return NextResponse.json({
        status: 'expired',
        message: 'QR expired - Event has ended',
        student_name: pass.name,
        roll_no: pass.roll_no,
      });
    }

    // Check for previous valid scan
    const { data: previousScan } = await supabase
      .from('scan_audit')
      .select('scanned_at, scanned_by, status')
      .eq('qr_token', pass.qr_token)
      .in('status', ['valid', 'forced_override'])
      .order('scanned_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    const now = new Date().toISOString();

    if (previousScan) {
      // Security Update #3: Duplicate QR Scan handling
      if (override === true) {
        // Volunteer forced override: Allow entry BUT log in audit_logs
        await logAuditEvent({
          action_type: 'double_scan_forced',
          performed_by: scanned_by,
          roll_no: pass.roll_no,
          student_name: pass.name,
          details: {
            first_scanned_at: previousScan.scanned_at,
            first_scanned_by: previousScan.scanned_by,
            override_at: now,
            device_info: device_info || null,
          },
        });

        // Record in scan_audit
        await supabase.from('scan_audit').insert({
          approved_pass_id: pass.id,
          qr_token: pass.qr_token,
          student_name: pass.name,
          roll_no: pass.roll_no,
          scanned_by,
          status: 'forced_override',
          device_info: `${device_info || ''} [OVERRIDE]`.trim(),
          scanned_at: now,
        });

        return NextResponse.json({
          status: 'valid',
          student_name: pass.name,
          roll_no: pass.roll_no,
          ticket_id,
          department: pass.department,
          batch: pass.batch,
          society: pass.society,
          message: 'Entry Allowed (Forced Override Logged)',
          was_override: true,
        });
      }

      // Not an override: log duplicate attempt and return warning
      await supabase.from('scan_audit').insert({
        approved_pass_id: pass.id,
        qr_token: pass.qr_token,
        student_name: pass.name,
        roll_no: pass.roll_no,
        scanned_by,
        status: 'already_scanned',
        device_info: device_info || null,
      });

      return NextResponse.json({
        status: 'duplicate',
        student_name: pass.name,
        roll_no: pass.roll_no,
        ticket_id,
        department: pass.department,
        scanned_at: previousScan.scanned_at,
        scanned_by: previousScan.scanned_by,
        qr_token: pass.qr_token,
        message: 'This pass has already been scanned',
      });
    }

    // Valid first scan
    await supabase.from('scan_audit').insert({
      approved_pass_id: pass.id,
      qr_token: pass.qr_token,
      student_name: pass.name,
      roll_no: pass.roll_no,
      scanned_by,
      status: 'valid',
      device_info: device_info || null,
      scanned_at: now,
    });

    return NextResponse.json({
      status: 'valid',
      student_name: pass.name,
      roll_no: pass.roll_no,
      ticket_id,
      department: pass.department,
      batch: pass.batch,
      society: pass.society,
      message: 'Entry allowed',
    });
  } catch (err) {
    console.error('Scan error:', err);
    return NextResponse.json({ status: 'error', message: 'Server error during scan' }, { status: 500 });
  }
}
