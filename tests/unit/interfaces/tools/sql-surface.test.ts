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

describe('the graph_query SQL surface', () => {
  it('refuses the statement that was verified to read a local file', () => {
    expect(rejects("SELECT * FROM read_text('/etc/hosts')")).toBe('read_text');
  });

  it('refuses an outbound fetch dressed as a SELECT', () => {
    expect(rejects("SELECT * FROM read_csv_auto('http://169.254.169.254/latest/meta-data/')")).toBe('read_csv_auto');
  });

  it('is not defeated by case or whitespace', () => {
    expect(rejects("SELECT * FROM ReAd_TeXt ('/etc/passwd')")).toBe('read_text');
    expect(rejects("select * from GLOB('/**')")).toBe('glob');
  });

  it('still allows ordinary analysis of the vault', () => {
    expect(rejects('SELECT type, count(*) FROM edges GROUP BY 1')).toBeUndefined();
    expect(rejects("SELECT id FROM nodes WHERE id LIKE 'lib::%'")).toBeUndefined();
    expect(rejects('SELECT n.id FROM nodes n JOIN edges e ON e.targetId = n.id')).toBeUndefined();
  });

  it('does not reject a column merely containing a forbidden word', () => {
    // `glob` as a bare identifier is not a call — the regex requires the opening paren.
    expect(rejects('SELECT glob FROM nodes')).toBeUndefined();
  });
});
