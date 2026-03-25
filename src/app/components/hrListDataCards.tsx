export interface HrListEmployeeRow {
  EmployeeName?: string;
  EmployeeEmail?: string;
  EmploymentStatus?: string;
  WorkPermit?: string;
  FormI9Availability?: string;
  Section1SignedDate?: string;
  Section2SignedDate?: string;
  EVerifiedDate?: string;
  NextReverificationDate?: string;
}

export interface HrListPayload {
  Data: HrListEmployeeRow[];
  TotalI9FormsCount?: number;
  CurrentPageNo?: number;
  PageSize?: number;
}

export type JsonListCardsResult =
  | { variant: 'i9'; payload: HrListPayload }
  | { variant: 'array'; rows: Record<string, unknown>[] };

const DETAIL_FIELDS: { key: keyof HrListEmployeeRow; label: string }[] = [
  { key: 'EmployeeEmail', label: 'Email' },
  { key: 'EmploymentStatus', label: 'Employment status' },
  { key: 'WorkPermit', label: 'Work permit' },
  { key: 'FormI9Availability', label: 'Form I-9 availability' },
  { key: 'Section1SignedDate', label: 'Section 1 signed' },
  { key: 'Section2SignedDate', label: 'Section 2 signed' },
  { key: 'EVerifiedDate', label: 'E-Verified' },
  { key: 'NextReverificationDate', label: 'Next reverification' },
];

const TITLE_KEY_PRIORITY = [
  'ConsultantName',
  'EmployeeName',
  'Name',
  'Title',
  'Subject',
  'Label',
  'JobName',
] as const;

const PILL_KEY_HINT = /^(status|employmentstatus|formi9availability|h1bstatus|workpermit)$/i;

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

/** Parse JSON from assistant text (optional markdown fence; tolerates extra prose via slice). */
function parseJsonFromAssistantContent(raw: string): unknown | null {
  const trimmed = raw.trim();
  let body = trimmed;
  if (trimmed.startsWith('```')) {
    const firstLineEnd = trimmed.indexOf('\n');
    const lastFence = trimmed.lastIndexOf('```');
    if (firstLineEnd !== -1 && lastFence > firstLineEnd) {
      body = trimmed.slice(firstLineEnd + 1, lastFence).trim();
    }
  }
  try {
    return JSON.parse(body);
  } catch {
    const trySlice = (s: string): unknown | null => {
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    };
    const oStart = body.indexOf('{');
    const oEnd = body.lastIndexOf('}');
    if (oStart !== -1 && oEnd > oStart) {
      const v = trySlice(body.slice(oStart, oEnd + 1));
      if (v !== null) return v;
    }
    const aStart = body.indexOf('[');
    const aEnd = body.lastIndexOf(']');
    if (aStart !== -1 && aEnd > aStart) {
      const v = trySlice(body.slice(aStart, aEnd + 1));
      if (v !== null) return v;
    }
  }
  return null;
}

function isI9DataRow(first: Record<string, unknown>): boolean {
  return typeof first.EmployeeName === 'string' || typeof first.EmployeeEmail === 'string';
}

function hrPayloadFromObject(parsed: Record<string, unknown>, data: Record<string, unknown>[]): HrListPayload {
  return {
    Data: data as HrListEmployeeRow[],
    TotalI9FormsCount:
      typeof parsed.TotalI9FormsCount === 'number' ? parsed.TotalI9FormsCount : undefined,
    CurrentPageNo: typeof parsed.CurrentPageNo === 'number' ? parsed.CurrentPageNo : undefined,
    PageSize: typeof parsed.PageSize === 'number' ? parsed.PageSize : undefined,
  };
}

/**
 * Detects JSON list payloads for card UI:
 * - `{ Data: [...] }` with I-9-shaped rows → I-9 cards
 * - `{ Data: [...] }` otherwise → generic cards from `Data`
 * - `[...]` top-level array of objects → generic cards (e.g. `apiResponse.json`)
 */
export function tryParseJsonListCards(content: string): JsonListCardsResult | null {
  const parsed = parseJsonFromAssistantContent(content);
  if (parsed === null) return null;

  if (Array.isArray(parsed)) {
    if (parsed.length === 0 || !parsed.every(isPlainObject)) return null;
    return { variant: 'array', rows: parsed };
  }

  if (!isPlainObject(parsed)) return null;

  const data = parsed.Data;
  if (!Array.isArray(data) || data.length === 0 || !data.every(isPlainObject)) return null;

  const first = data[0] as Record<string, unknown>;
  if (isI9DataRow(first)) {
    return { variant: 'i9', payload: hrPayloadFromObject(parsed, data) };
  }
  return { variant: 'array', rows: data as Record<string, unknown>[] };
}

function pillClass(kind: 'status' | 'availability', value: string): string {
  const u = value.toUpperCase();
  if (kind === 'availability') {
    if (u === 'AVAILABLE') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200';
    if (u === 'INCOMPLETE') return 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100';
  }
  if (kind === 'status') {
    if (u === 'ACTIVE') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200';
  }
  return 'border-border bg-muted/60 text-muted-foreground';
}

export function HrListDataCards({ payload }: { payload: HrListPayload }) {
  const { Data, TotalI9FormsCount, CurrentPageNo, PageSize } = payload;
  const metaParts: string[] = [];
  if (TotalI9FormsCount !== undefined) metaParts.push(`Total forms: ${TotalI9FormsCount}`);
  if (CurrentPageNo !== undefined) metaParts.push(`Page ${CurrentPageNo + 1}`);
  if (PageSize !== undefined) metaParts.push(`${PageSize} per page`);

  return (
    <div className="space-y-4">
      {metaParts.length > 0 && (
        <p
          className="text-sm text-muted-foreground"
          style={{ fontFamily: 'var(--font-source-sans-pro)' }}
        >
          {metaParts.join(' · ')}
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {Data.map((row, idx) => (
          <article
            key={`${row.EmployeeEmail ?? ''}-${row.EmployeeName ?? ''}-${idx}`}
            className="flex flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm"
          >
            <header
              className="border-b border-border px-4 py-3"
              style={{ backgroundColor: 'var(--muted)' }}
            >
              <h3
                className="text-base font-semibold text-card-foreground"
                style={{ fontFamily: 'var(--font-source-sans-pro)' }}
              >
                {row.EmployeeName?.trim() || 'Employee'}
              </h3>
            </header>
            <div className="flex flex-1 flex-col gap-3 p-4">
              <dl className="grid grid-cols-1 gap-2.5 text-sm sm:grid-cols-2">
                {DETAIL_FIELDS.map(({ key, label }) => {
                  const value = row[key];
                  const text = value === undefined || value === null ? '—' : String(value);
                  const isPill = key === 'EmploymentStatus' || key === 'FormI9Availability';
                  return (
                    <div
                      key={key}
                      className={key === 'EmployeeEmail' ? 'min-w-0 sm:col-span-2' : 'min-w-0'}
                    >
                      <dt
                        className="mb-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                        style={{ fontFamily: 'var(--font-source-sans-pro)' }}
                      >
                        {label}
                      </dt>
                      <dd className="text-card-foreground" style={{ fontFamily: 'var(--font-source-sans-pro)' }}>
                        {isPill && text !== '—' ? (
                          <span
                            className={`inline-flex max-w-full rounded-md border px-2 py-0.5 text-xs font-medium ${pillClass(
                              key === 'FormI9Availability' ? 'availability' : 'status',
                              text
                            )}`}
                          >
                            {text}
                          </span>
                        ) : (
                          <span className="break-words">{text}</span>
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function formatKeyLabel(key: string): string {
  const spaced = key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ');
  return spaced.replace(/\s+/g, ' ').trim().replace(/^./, c => c.toUpperCase());
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '—';
  if (typeof value === 'string') return value.trim() === '' ? '—' : value;
  if (Array.isArray(value)) return value.length === 0 ? '—' : JSON.stringify(value);
  return JSON.stringify(value);
}

function pickCardTitle(row: Record<string, unknown>, index: number): string {
  for (const k of TITLE_KEY_PRIORITY) {
    const v = row[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  for (const [, v] of Object.entries(row)) {
    if (typeof v === 'string' && v.trim() && v.length <= 200) return v.trim();
  }
  return `Item ${index + 1}`;
}

function stableRowKey(row: Record<string, unknown>, index: number): string {
  const id =
    (typeof row.H1BId === 'string' && row.H1BId) ||
    (typeof row.ConsultantId === 'string' && row.ConsultantId) ||
    (typeof row.EmployeeID === 'string' && row.EmployeeID) ||
    (typeof row.ConsultantEmail === 'string' && row.ConsultantEmail) ||
    '';
  return id ? `${id}-${index}` : `row-${index}`;
}

function shouldUsePill(key: string, raw: unknown): boolean {
  if (typeof raw !== 'string' || !raw.trim()) return false;
  if (PILL_KEY_HINT.test(key)) return true;
  return key === 'Status';
}

function pillClassForGeneric(text: string): string {
  const u = text.toUpperCase();
  if (/approved|active|available|complete/i.test(text)) {
    return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200';
  }
  if (/pending|incomplete|n\/a|denied|rejected/i.test(u)) {
    return 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100';
  }
  return 'border-border bg-muted/60 text-muted-foreground';
}

/** Same Tailwind card layout as I-9 list, with one card per object and dynamic fields (e.g. H-1B list). */
export function JsonArrayCards({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <div className="space-y-4">
      <p
        className="text-sm text-muted-foreground"
        style={{ fontFamily: 'var(--font-source-sans-pro)' }}
      >
        {rows.length} {rows.length === 1 ? 'record' : 'records'}
      </p>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {rows.map((row, idx) => {
        const title = pickCardTitle(row, idx);
        const entries = Object.entries(row);
        return (
          <article
            key={stableRowKey(row, idx)}
            className="flex flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm"
          >
            <header
              className="border-b border-border px-4 py-3"
              style={{ backgroundColor: 'var(--muted)' }}
            >
              <h3
                className="text-base font-semibold text-card-foreground"
                style={{ fontFamily: 'var(--font-source-sans-pro)' }}
              >
                {title}
              </h3>
            </header>
            <div className="flex flex-1 flex-col gap-3 p-4">
              <dl className="grid grid-cols-1 gap-2.5 text-sm sm:grid-cols-2">
                {entries.map(([key, value]) => {
                  const text = formatCellValue(value);
                  const label = formatKeyLabel(key);
                  const isPill = shouldUsePill(key, value);
                  const fullWidth =
                    key.toLowerCase().includes('email') ||
                    key.toLowerCase().includes('description') ||
                    key === 'ReceiptNumber';
                  return (
                    <div key={key} className={fullWidth ? 'min-w-0 sm:col-span-2' : 'min-w-0'}>
                      <dt
                        className="mb-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                        style={{ fontFamily: 'var(--font-source-sans-pro)' }}
                      >
                        {label}
                      </dt>
                      <dd
                        className="text-card-foreground"
                        style={{ fontFamily: 'var(--font-source-sans-pro)' }}
                      >
                        {isPill && text !== '—' ? (
                          <span
                            className={`inline-flex max-w-full rounded-md border px-2 py-0.5 text-xs font-medium ${pillClassForGeneric(
                              text
                            )}`}
                          >
                            {text}
                          </span>
                        ) : (
                          <span className="break-words">{text}</span>
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          </article>
        );
      })}
      </div>
    </div>
  );
}
