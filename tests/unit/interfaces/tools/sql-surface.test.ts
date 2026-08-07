import { describe, it, expect } from '@jest/globals';

/**
 * ADR 0047 — `conducks_graph_query` guards a capability, not a string shape.
 *
 * The tool advertised "Only SELECT statements are permitted" and enforced it with
 * `sql.trim().toUpperCase().startsWith('SELECT')`. DuckDB's core table functions need no extension,
 * so this was verified against the project's own vault BEFORE the fix:
 *
 *     SELECT * FROM read_text('/etc/hosts')   ->  returned the contents of the file
 *
 * `read_csv_auto('http://…')` is the same hole pointed outward. The tool is driven by an LLM agent,
 * which is steerable by content it reads, so "the caller wouldn't do that" is not a control.
 *
 * This tests the PREDICATE rather than the handler, because the handler needs an anchored registry
 * and a vault; the predicate is the thing that has to be right.
 */
const FORBIDDEN = [
  'read_text', 'read_blob', 'read_csv', 'read_csv_auto', 'read_json', 'read_json_auto',
  'read_parquet', 'read_ndjson', 'read_ndjson_auto', 'parquet_scan', 'iceberg_scan',
  'glob', 'sniff_csv', 'attach', 'copy_from', 'install', 'load',
];
const rejects = (sql: string) => FORBIDDEN.find(fn => new RegExp(`\\b${fn}\\s*\\(`, 'i').test(sql));

import { sqlGuardReason } from '@/interfaces/tools/tools/synapse.js';

// The tool's OWN guard, not a copy. The previous version of this file replicated the check with a
// local `rejects()` — and the replica had no multi-statement rule, so `SELECT 1; DROP TABLE nodes;`
// was never tested and reached the read-only DB in production. A test that copies the thing it
// guards cannot catch a gap the copy also has.
const reason = (sql: string) => sqlGuardReason(sql)?.message ?? null;

describe('the graph_query SQL surface', () => {
  it('refuses the statement that was verified to read a local file', () => {
    expect(reason("SELECT * FROM read_text('/etc/hosts')")).toMatch(/read_text/);
  });

  it('refuses an outbound fetch dressed as a SELECT', () => {
    expect(reason("SELECT * FROM read_csv_auto('http://169.254.169.254/latest/meta-data/')")).toMatch(/read_csv_auto/);
  });

  it('is not defeated by case or whitespace', () => {
    expect(reason("SELECT * FROM ReAd_TeXt ('/etc/passwd')")).toMatch(/read_text/);
    expect(reason("select * from GLOB('/**')")).toMatch(/glob/);
  });

  it('REFUSES a second statement after a leading SELECT — the multi-statement hole', () => {
    // Passed the prefix check and reached the read-only DB before this rule existed.
    expect(reason('SELECT 1; DROP TABLE nodes;')).toMatch(/single SELECT|second statement/i);
    expect(reason('SELECT 1; DELETE FROM edges')).toMatch(/single SELECT|second statement/i);
  });

  it('allows a bare trailing semicolon — one statement, terminated', () => {
    expect(reason('SELECT count(*) FROM nodes;')).toBeNull();
  });

  it('refuses a non-SELECT outright', () => {
    expect(reason('DELETE FROM nodes')).toMatch(/Only SELECT/);
    expect(reason('WITH x AS (SELECT 1) DELETE FROM nodes')).toMatch(/Only SELECT/);
  });

  it('still allows ordinary analysis of the vault', () => {
    expect(reason('SELECT type, count(*) FROM edges GROUP BY 1')).toBeNull();
    expect(reason("SELECT id FROM nodes WHERE id LIKE 'lib::%'")).toBeNull();
    expect(reason('SELECT n.id FROM nodes n JOIN edges e ON e.targetId = n.id')).toBeNull();
  });

  it('does not reject a column merely containing a forbidden word', () => {
    expect(reason('SELECT glob FROM nodes')).toBeNull();
  });
});
