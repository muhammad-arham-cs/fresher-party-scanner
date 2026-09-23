import { GoogleGenerativeAI } from '@google/generative-ai';

interface ExcelRow {
  name?: string;
  roll_no?: string;
  email?: string;
  department?: string;
  batch?: string;
  section?: string;
  society?: string;
}

interface ValidationIssue {
  roll_no: string;
  name: string;
  issue_type: 'duplicate' | 'missing_email' | 'incomplete_data' | 'invalid_format' | 'other';
  detail: string;
}

interface ValidationResult {
  issues: ValidationIssue[];
  valid_count: number;
  issue_count: number;
}

const VALIDATION_PROMPT = `You are a data validation expert. Analyze this student registration Excel data and find issues.

Check for:
1. Duplicate roll numbers (same roll_no appears more than once)
2. Missing emails (email field is empty, null, or not a valid email format)
3. Incomplete data (missing name, department, or batch)
4. Invalid roll number formats (should follow pattern like 24F-CS-116, 23E-EE-045, etc.)
5. Any other data quality issues

Return ONLY valid JSON (no markdown, no explanation):
{
  "issues": [
    {
      "roll_no": "string",
      "name": "string",
      "issue_type": "duplicate|missing_email|incomplete_data|invalid_format|other",
      "detail": "human readable explanation"
    }
  ],
  "valid_count": number,
  "issue_count": number
}

If there are no issues, return empty issues array with valid_count = total rows.`;

/**
 * Validate Excel data using Gemini AI with Grok backup and local heuristic fallback.
 */
export async function validateExcelData(rows: ExcelRow[]): Promise<ValidationResult> {
  const dataJson = JSON.stringify(rows, null, 2);

  // 1. Try Gemini AI
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    const candidateModels = ['gemini-2.5-flash', 'gemini-3.6-flash', 'gemini-1.5-flash'];
    const genAI = new GoogleGenerativeAI(apiKey);
    const prompt = `${VALIDATION_PROMPT}\n\nDATA:\n${dataJson}`;

    for (const modelName of candidateModels) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();
        const jsonText = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

        return JSON.parse(jsonText) as ValidationResult;
      } catch (geminiErr: any) {
        // Try next model if 404 or unsupported
        if (modelName === candidateModels[candidateModels.length - 1]) {
          console.warn('Gemini validation failed across all models, attempting Grok/local backup:', geminiErr?.message || geminiErr);
        }
      }
    }
  }

  // 2. Try Grok/Groq backup if Gemini fails or key is absent
  const grokResult = await grokValidation(rows, dataJson);
  if (grokResult) return grokResult;

  // 3. Fall back to robust local deterministic validation
  return localValidation(rows);
}

/**
 * Secondary AI validation using Grok / Groq API.
 */
async function grokValidation(rows: ExcelRow[], dataJson: string): Promise<ValidationResult | null> {
  const grokKey = process.env.GROK_API_KEY;
  if (!grokKey) return null;

  try {
    const isGroq = grokKey.startsWith('gsk_');
    const endpoint = isGroq
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://api.x.ai/v1/chat/completions';
    const modelsToTry = isGroq ? ['qwen/qwen3.8-27b', 'llama-3.3-70b-versatile'] : ['grok-beta'];

    for (const model of modelsToTry) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${grokKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: 'You are a strict data validation assistant. Always output raw JSON only.' },
              { role: 'user', content: `${VALIDATION_PROMPT}\n\nDATA:\n${dataJson}` },
            ],
            temperature: 0.1,
          }),
        });

        if (!res.ok) continue;
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content?.trim() || '';
        const cleanJson = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
        return JSON.parse(cleanJson) as ValidationResult;
      } catch (err) {
        // try next model
      }
    }
    return null;
  } catch (err) {
    console.warn('Grok/Groq backup validation failed:', err);
    return null;
  }
}

/**
 * Local fallback validation if AI APIs fail.
 */
function localValidation(rows: ExcelRow[]): ValidationResult {
  const issues: ValidationIssue[] = [];
  const rollNos = new Map<string, number>();

  rows.forEach((row) => {
    const roll = row.roll_no?.trim() || '';
    if (roll) {
      rollNos.set(roll.toUpperCase(), (rollNos.get(roll.toUpperCase()) || 0) + 1);
    }
  });

  rows.forEach((row) => {
    const roll = row.roll_no?.trim() || '';
    const name = row.name?.trim() || 'Unknown';

    if (!row.name?.trim() || !row.department?.trim() || !row.batch?.trim()) {
      issues.push({ roll_no: roll || 'UNKNOWN', name, issue_type: 'incomplete_data', detail: 'Missing name, department, or batch' });
    }

    if (row.email && (!row.email.includes('@') || !row.email.includes('.'))) {
      issues.push({ roll_no: roll || 'UNKNOWN', name, issue_type: 'invalid_format', detail: 'Invalid email address' });
    }

    if (roll && (rollNos.get(roll.toUpperCase()) || 0) > 1) {
      issues.push({ roll_no: roll, name, issue_type: 'duplicate', detail: `Duplicate roll number (${roll}) found` });
    }
  });

  const issueRolls = new Set(issues.map((i) => i.roll_no));
  return {
    issues,
    valid_count: Math.max(0, rows.length - issueRolls.size),
    issue_count: issueRolls.size,
  };
}
