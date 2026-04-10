/**
 * Converts HR API glued text into Markdown for the Recco pipeline (`EmailMarkdown`-style marked + insane).
 * Shapes are driven by `sampleResponse.txt` (timesheet success + clarifying questions).
 */

export function shouldNormalizeApiShape(t: string): boolean {
  const s = t.trim();
  if (s.length < 28) return false;

  // Legacy I-9 / quoted-field streams
  if (
    /I-9|compliance records|Employee Name:|Details of the Retrieved|Date Range"\s*:|records:\s*-\s*"|details:\s*-\s*"/i.test(s)
  ) {
    return true;
  }

  // Current timesheet samples: **Success!**, glued details / stats, "What I Need From You"
  if (
    /\*\*Success!|Here are the details:\s*-|What I Need From You\s*-|\*\*Total Records Found|\*\*Approved Timesheets|\*\*Pending Timesheets|timesheet records for|Pending Timesheets:\s*\d|Approved Timesheets:\s*\d/i.test(
      s
    )
  ) {
    return true;
  }

  // Clarifying questions: "?- " between questions
  if (/\?\s*-\s*/.test(s) && s.length > 40) return true;

  // Glued "- **" field separators (no space between blocks)
  if (s.length > 60 && /[a-zA-Z0-9]\s*-\s*\*\*/.test(s)) return true;

  return false;
}

/**
 * Normalizes API text to Markdown. See sampleResponse.txt Response 1 & 2.
 */
export function normalizeApiTextToMarkdown(input: string): string {
  let t = input.trim();

  // Optional "Response N:" labelling from fixtures
  t = t.replace(/^Response\s*\d+\s*:\s*/gim, '');

  // --- Glue: number + capital letter (e.g. ...0If you need...) ---
  t = t.replace(/(\d)([A-Z][a-z])/g, '$1\n\n$2');

  // --- Legacy I-9 glue (keep) ---
  t = t.replace(/(N\/A|(\d{2}\/\d{2}\/\d{4}))(\d{1,2}\.\s*")/g, '$1\n\n$3');
  t = t.replace(/N\/A(Would\b)/gi, 'N/A\n\n$1');
  t = t.replace(/:"Summary:"\s*-\s*/g, ':\n\n### Summary\n\n- ');
  t = t.replace(
    /"Total Records Found:"\s*([\d,]+)\s*employees\.\s*"Details of the Retrieved Employees:"\s*/gi,
    '**Total Records Found:** $1 employees.\n\n### Details of the Retrieved Employees\n\n'
  );
  t = t.replace(/^"\s*([^"]+?)"\s+(Here are the)/i, '## $1\n\n$2');

  // --- Response 1 (timesheet success): **Success!** + details:- Status: ... - **Total... ---
  t = t.replace(/^\*\*Success!\*\*\s*/i, '## Success\n\n');

  // "Here are the details:" immediately followed by "- "
  t = t.replace(/(Here are the details:)\s*-\s*/gi, '$1\n\n- ');

  // Between fields: value then "- **NextField**" (e.g. Success- **Total**, 0- **Approved)
  t = t.replace(/([a-zA-Z0-9])\s*-\s*\*\*/g, '$1\n\n- **');

  // --- Response 2: What I Need From You- Do you ... ?- Would ... ?- Do you ---
  t = t.replace(/\?\s*-\s*/g, '?\n\n- ');
  t = t.replace(/(You)\s*-\s*(Do you|Would you)/gi, '$1\n\n- $2');

  // --- Legacy quoted bullets & employee blocks ---
  t = t.replace(/(\?)\s*-\s*"([^"]+)"\s*:/g, '$1\n\n- **$2**: ');
  t = t.replace(/records:\s*-\s*"/gi, 'records:\n\n- "');
  t = t.replace(/details:\s*-\s*"/gi, 'details:\n\n- "');

  let empIdx = 0;
  t = t.replace(/(\d+)\.\s*"Employee Name:"\s+([^-]+?)\s-\s"/g, (_, n: string, name: string) => {
    empIdx += 1;
    const sep = empIdx > 1 ? '\n\n---\n\n' : '\n\n';
    return `${sep}### ${n}. ${name}\n\n`;
  });

  t = t.replace(/\s+"([^"]+):\s*"\s*/g, '\n- **$1:** ');

  // Response 2: title line → heading (after You- / ?- splits)
  t = t.replace(/^What I Need From You(\n\n-)/m, '### What I Need From You$1');

  /*
   * marked/GFM: `**Label:**0` (no space before the number) often fails to emit <strong> in list items.
   * Insert space: `:**0` → `:** 0` (colon + closing ** + digits).
   */
  t = t.replace(/:\*\*(\d+)/g, ':** $1');

  // Tighten excessive blank lines
  t = t.replace(/\n{4,}/g, '\n\n\n');
  return t.trim();
}
