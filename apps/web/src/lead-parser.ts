export type CsvIssue = { row: number; message: string };
export type CsvResult = { recipients: string[]; duplicates: number; invalidRows: CsvIssue[]; error?: string };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseRows(text: string): { rows: string[][]; malformed?: string } {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false, quoteClosed = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (quoted) { quoted = false; quoteClosed = true; }
      else if (!field.trim()) quoted = true;
      else return { rows, malformed: 'Unexpected quote in CSV input.' };
    } else if (char === ',' && !quoted) { row.push(field.trim()); field = ''; quoteClosed = false; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field.trim()); rows.push(row); row = []; field = ''; quoteClosed = false;
    } else { if (quoteClosed && !/\s/.test(char)) return { rows, malformed: 'Unexpected characters after a quoted value.' }; field += char; }
  }
  if (quoted) return { rows, malformed: 'Unclosed quoted value in CSV input.' };
  if (field || row.length) { row.push(field.trim()); rows.push(row); }
  return { rows };
}

export function parseCsv(text: string): CsvResult {
  if (!text.trim()) return { recipients: [], duplicates: 0, invalidRows: [], error: 'The CSV file is empty.' };
  const parsed = parseRows(text);
  if (parsed.malformed) return { recipients: [], duplicates: 0, invalidRows: [], error: parsed.malformed };
  const headerIndex = parsed.rows.findIndex((row) => row.some((value) => value.trim()));
  if (headerIndex < 0) return { recipients: [], duplicates: 0, invalidRows: [], error: 'The CSV file is empty.' };
  const emailColumn = parsed.rows[headerIndex].findIndex((value) => value.trim().toLowerCase() === 'email');
  if (emailColumn < 0) return { recipients: [], duplicates: 0, invalidRows: [], error: 'CSV must contain an email column.' };
  const recipients: string[] = [], seen = new Set<string>(), invalidRows: CsvIssue[] = [];
  parsed.rows.slice(headerIndex + 1).forEach((row, index) => {
    const rowNumber = headerIndex + index + 2;
    if (!row.some((value) => value.trim())) return;
    const email = row[emailColumn]?.trim().toLowerCase();
    if (!email) { invalidRows.push({ row: rowNumber, message: 'Email is required.' }); return; }
    if (!emailPattern.test(email)) { invalidRows.push({ row: rowNumber, message: 'Invalid email address.' }); return; }
    if (seen.has(email)) return;
    seen.add(email); recipients.push(email);
  });
  const dataRows = parsed.rows.slice(headerIndex + 1).filter((row) => row.some((value) => value.trim()));
  const duplicates = dataRows.length - invalidRows.length - recipients.length;
  return { recipients, duplicates, invalidRows };
}
