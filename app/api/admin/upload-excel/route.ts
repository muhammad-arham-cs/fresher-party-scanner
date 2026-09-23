import { NextRequest, NextResponse } from 'next/server';
import { checkAdminSession } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase';
import { validateExcelData } from '@/lib/gemini';
import * as XLSX from 'xlsx';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Flexible roll number pattern: e.g. 24F-CS-878, 23E-EE-045, 24-AI-012, 24F/CS/101, 24F CS 101
const ROLL_NO_PATTERN = /^[0-9]{2}[A-Za-z]?[-/\s.]?[A-Za-z]{2,8}[-/\s.]?[0-9]{1,5}$/i;

function normalizeRollNo(raw: string): string {
  if (!raw) return '';
  let clean = raw.trim().toUpperCase();
  clean = clean.replace(/[/._\s]+/g, '-');
  clean = clean.replace(/-+/g, '-');
  clean = clean.replace(/^-+|-+$/g, '');
  return clean;
}

function deriveBatchAndDept(rollNo: string): { derivedBatch: string; derivedDept: string } {
  const parts = rollNo.split('-');
  let derivedBatch = '';
  let derivedDept = '';

  if (parts.length >= 1 && parts[0].length >= 2) {
    const yearDigits = parts[0].slice(0, 2);
    if (/^\d{2}$/.test(yearDigits)) {
      derivedBatch = `20${yearDigits}`;
    }
  }

  if (parts.length >= 2) {
    const code = parts[1].toUpperCase();
    if (code.includes('CS') || code === 'BCS') derivedDept = 'BS Computer Science';
    else if (code.includes('AI') || code === 'BAI') derivedDept = 'BS Artificial Intelligence';
    else if (code.includes('DS') || code === 'BDS') derivedDept = 'BS Data Science';
    else if (code.includes('CY') || code === 'CYS') derivedDept = 'BS Cyber Security';
    else if (code.includes('SE') || code === 'SWE') derivedDept = 'BS Software Engineering';
    else if (code.includes('EE')) derivedDept = 'Electrical Engineering';
    else if (code.includes('TE') || code.includes('TL')) derivedDept = 'Telecommunication Engineering';
    else if (code.includes('EL') || code.includes('ES')) derivedDept = 'Electronic Engineering';
    else derivedDept = code;
  }

  return { derivedBatch, derivedDept };
}

export async function POST(req: NextRequest) {
  try {
    const session = await checkAdminSession();
    if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) return NextResponse.json({ success: false, message: 'No file uploaded' }, { status: 400 });

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, message: 'File too large. Maximum 10MB.' }, { status: 400 });
    }

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
      return NextResponse.json({ success: false, message: 'Invalid file type. Use .xlsx, .xls, or .csv' }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });

    if (rawRows.length === 0) {
      return NextResponse.json({ success: false, message: 'Uploaded file contains no data rows.' }, { status: 400 });
    }

    // Lenient header normalization
    const normalizedRows = rawRows
      .map((row) => {
        const normalized: Record<string, string> = {};
        Object.entries(row).forEach(([k, v]) => {
          normalized[k.toLowerCase().trim().replace(/[\s._-]+/g, '_')] = String(v).trim();
        });

        // Smart name detection
        const nameKey = Object.keys(normalized).find((k) =>
          k.includes('name') || k.includes('student') || k.includes('candidate')
        );
        const name = (nameKey ? normalized[nameKey] : '') || normalized['full_name'] || normalized['name'] || '';

        // Smart roll number detection
        const rollKey = Object.keys(normalized).find((k) =>
          k.includes('roll') || k.includes('reg') || k.includes('enroll') || k.includes('seat')
        );
        const rawRoll = (rollKey ? normalized[rollKey] : '') || normalized['roll_no'] || normalized['id'] || '';
        const roll_no = normalizeRollNo(rawRoll);

        // Smart email detection
        const emailKey = Object.keys(normalized).find((k) =>
          k.includes('email') || k.includes('mail') || k.includes('gmail')
        );
        const email = (emailKey ? normalized[emailKey] : '') || '';

        // Smart department detection
        const deptKey = Object.keys(normalized).find((k) =>
          k.includes('dept') || k.includes('department') || k.includes('program') || k.includes('field') || k.includes('discipline')
        );
        let department = (deptKey ? normalized[deptKey] : '') || '';

        // Smart batch detection
        const batchKey = Object.keys(normalized).find((k) =>
          k.includes('batch') || k.includes('year') || k.includes('session') || k.includes('class')
        );
        let batch = (batchKey ? normalized[batchKey] : '') || '';

        // Fallback: auto-derive batch and department from roll number if omitted
        const { derivedBatch, derivedDept } = deriveBatchAndDept(roll_no);
        if (!batch && derivedBatch) batch = derivedBatch;
        if (!department && derivedDept) department = derivedDept;

        const section = normalized['section'] || normalized['sec'] || '';
        const society = normalized['society'] || normalized['society_name'] || normalized['club'] || '';

        return { name, roll_no, email, department, batch, section, society };
      })
      .filter((r) => r.name || r.roll_no); // Ignore completely empty rows

    if (normalizedRows.length === 0) {
      return NextResponse.json({ success: false, message: 'Could not detect any valid student rows in file.' }, { status: 400 });
    }

    // Query Supabase for existing passes to detect already generated passes
    const supabase = createAdminClient();
    let existingPasses: any[] = [];
    const { data: passesWithTicket, error: tErr } = await supabase
      .from('approved_passes')
      .select('id, roll_no, name, email, ticket_id, section, pass_status, created_at');

    if (tErr) {
      const { data: fallbackPasses } = await supabase
        .from('approved_passes')
        .select('id, roll_no, name, email, section, pass_status, created_at');
      existingPasses = fallbackPasses || [];
    } else {
      existingPasses = passesWithTicket || [];
    }

    const existingPassMap = new Map<string, any>();
    if (existingPasses && existingPasses.length > 0) {
      existingPasses.forEach((p) => {
        if (p.roll_no) {
          existingPassMap.set(normalizeRollNo(p.roll_no), p);
        }
      });
    }

    const validRows: typeof normalizedRows = [];
    const alreadyGeneratedRows: (typeof normalizedRows[0] & { existing_ticket_id: string; pass_status: string; created_at: string })[] = [];
    const suspiciousRows: typeof normalizedRows = [];
    const issues: { roll_no: string; name: string; issue_type: string; detail: string }[] = [];

    const seenInFile = new Set<string>();

    for (const row of normalizedRows) {
      const rollClean = row.roll_no;
      let hasError = false;

      // 1. Check if name is provided
      if (!row.name || row.name.length < 2) {
        issues.push({ roll_no: rollClean || 'N/A', name: row.name || 'Unknown', issue_type: 'incomplete_data', detail: 'Student name is missing or too short' });
        hasError = true;
      }

      // 2. Check roll number format
      if (!rollClean || (!ROLL_NO_PATTERN.test(rollClean) && rollClean.length < 4)) {
        issues.push({
          roll_no: rollClean || 'N/A',
          name: row.name,
          issue_type: 'invalid_format',
          detail: `Invalid roll number: "${rollClean}". Expected format like 24F-CS-001`,
        });
        hasError = true;
      }

      // 3. Check for duplicates within uploaded file
      const rollUpper = rollClean.toUpperCase();
      if (seenInFile.has(rollUpper)) {
        issues.push({ roll_no: rollClean, name: row.name, issue_type: 'duplicate', detail: 'Duplicate roll number in this uploaded file' });
        hasError = true;
      } else if (rollClean) {
        seenInFile.add(rollUpper);
      }

      // 4. Check email format if provided
      if (row.email && !EMAIL_REGEX.test(row.email)) {
        issues.push({ roll_no: rollClean, name: row.name, issue_type: 'invalid_format', detail: `Invalid email format: "${row.email}"` });
        hasError = true;
      }

      // 5. Check if pass is already generated in database
      const existingInDb = existingPassMap.get(rollUpper);
      if (existingInDb && !hasError) {
        alreadyGeneratedRows.push({
          ...row,
          existing_ticket_id: existingInDb.ticket_id || existingInDb.section || 'Assigned',
          pass_status: existingInDb.pass_status || 'generated',
          created_at: existingInDb.created_at,
        });
        continue;
      }

      if (hasError) {
        suspiciousRows.push(row);
      } else {
        validRows.push(row);
      }
    }

    // Secondary verification via Gemini AI on valid candidate rows
    let aiFlaggedRollNos = new Set<string>();
    if (validRows.length > 0) {
      try {
        const aiResult = await validateExcelData(validRows);
        if (aiResult?.issues && aiResult.issues.length > 0) {
          for (const aiIssue of aiResult.issues) {
            issues.push(aiIssue);
            aiFlaggedRollNos.add(normalizeRollNo(aiIssue.roll_no));
          }
        }
      } catch (aiErr) {
        console.warn('AI validation warning (proceeding with rule-based validation):', aiErr);
      }
    }

    const finalValidRows = validRows.filter((r) => !aiFlaggedRollNos.has(r.roll_no));
    const finalFlaggedRows = [
      ...suspiciousRows,
      ...validRows.filter((r) => aiFlaggedRollNos.has(r.roll_no)),
    ];

    // Record issues in flagged_entries table
    const flaggedToInsert = issues.map((issue) => {
      const match = normalizedRows.find((r) => r.roll_no === issue.roll_no) || {};
      return {
        roll_no: issue.roll_no,
        name: (match as Record<string, string>).name || '',
        email: (match as Record<string, string>).email || null,
        department: (match as Record<string, string>).department || '',
        batch: (match as Record<string, string>).batch || '',
        society: (match as Record<string, string>).society || '',
        flag_type: issue.issue_type,
        flag_details: issue.detail,
        is_approved: false,
      };
    });

    if (flaggedToInsert.length > 0) {
      try {
        await supabase.from('flagged_entries').insert(flaggedToInsert);
      } catch (err) {
        console.warn('Flagged entries insert notice:', err);
      }
    }

    return NextResponse.json({
      success: true,
      message: `File processed: ${finalValidRows.length} new entries to generate, ${alreadyGeneratedRows.length} already generated (skipped), ${finalFlaggedRows.length} flagged.`,
      total_rows: normalizedRows.length,
      valid_count: finalValidRows.length,
      already_generated_count: alreadyGeneratedRows.length,
      issue_count: finalFlaggedRows.length,
      issues,
      rows: normalizedRows,
      valid_rows: finalValidRows,
      already_generated_rows: alreadyGeneratedRows,
      flagged_rows: finalFlaggedRows,
    });
  } catch (err) {
    console.error('Upload excel error:', err);
    return NextResponse.json({ success: false, message: 'Failed to process file' }, { status: 500 });
  }
}
