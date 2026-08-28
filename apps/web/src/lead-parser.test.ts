import { describe, expect, it } from 'vitest';
import { parseCsv } from './lead-parser';

describe('CSV lead parser', () => {
  it('parses quoted values, whitespace, blank rows, and case-insensitive headers', () => {
    const result = parseCsv(' Name , EMAIL\n Alice , "alice@example.com"\n\nBob,bob@example.com\n');
    expect(result.recipients).toEqual(['alice@example.com', 'bob@example.com']);
    expect(result.invalidRows).toHaveLength(0);
  });

  it('reports invalid rows and deduplicates valid addresses', () => {
    const result = parseCsv('email\nvalid1@example.com\nbad-email\nvalid2@example.com\nvalid1@example.com');
    expect(result.recipients).toEqual(['valid1@example.com', 'valid2@example.com']);
    expect(result.invalidRows).toEqual([{ row: 3, message: 'Invalid email address.' }]);
    expect(result.duplicates).toBe(1);
  });

  it('rejects missing, empty, header-only, and malformed input', () => {
    expect(parseCsv('name\nAlice').error).toBe('CSV must contain an email column.');
    expect(parseCsv('').error).toBe('The CSV file is empty.');
    expect(parseCsv('email\n').recipients).toEqual([]);
    expect(parseCsv('email\n"unclosed@example.com').error).toContain('Unclosed');
  });
});
