/** A same-shaped list arrives as `{cols, rows}` (todo82); a client turns it back into objects. */
export function untable(v: any): any {
  if (Array.isArray(v)) return v.map(untable);
  if (v && typeof v === 'object') {
    if (Array.isArray(v.cols) && Array.isArray(v.rows) && Object.keys(v).length === 2) {
      return v.rows.map((r: unknown[]) => Object.fromEntries(v.cols.map((c: string, i: number) => [c, r[i]])));
    }
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, untable(x)]));
  }
  return v;
}
