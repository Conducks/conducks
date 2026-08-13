/**
 * `doctor` must not promise a parse path that does not exist.
 *
 * MEASURED on alpine/musl, where the `tree-sitter` binding cannot build: doctor printed
 * "Parse path: Gnosis regex fallback — Analysis still works, at lower fidelity" and the very next
 * `conducks analyze` refused with "no file can be read structurally". ADR 0089 had deleted that
 * fallback nine days earlier; the message outlived the capability because deleting a feature leaves
 * no failing test behind.
 *
 * This is the check that would have caught it, so it asserts the two halves that were wrong: that an
 * absent binding is reported as a FAILURE rather than a warning, and that nothing in the output
 * claims analysis still works.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { DoctorCommand } from '@/interfaces/cli/commands/doctor.js';

type Line = string;

/** A registry stub carrying only what doctor reads, with the parse path under our control. */
function registryWith(nativeAvailable: boolean) {
  return {
    infrastructure: {
      isNativeGrammarAvailable: () => nativeAvailable,
      loadGrammar: async () => undefined,
      isGrammarUnavailable: () => false,
    },
    federation: { createUpdateCheck: () => ({ check: async () => null }) },
  } as any;
}

describe('doctor — the parse path it reports is the one that exists', () => {
  let lines: Line[];
  let spy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    lines = [];
    spy = jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.join(' '));
    });
  });
  afterEach(() => spy.mockRestore());

  it('reports NO parse path as a failure when the native binding did not load', async () => {
    await new DoctorCommand().execute([], registryWith(false));
    const parse = lines.filter(l => /parse path/i.test(l));

    expect(parse).toHaveLength(1);
    expect(parse[0]).toContain('[✗]');            // a failure, not a [!] warning
    expect(parse[0]).toMatch(/NONE/);

    // The specific sentence that was false. Absence of the whole claim, not of one phrasing.
    const all = lines.join('\n');
    expect(all).not.toMatch(/analysis still works/i);
    expect(all).not.toMatch(/lower fidelity/i);
    expect(all).not.toMatch(/regex fallback\s*(—|-)\s*the native/i);
    expect(all).toMatch(/analyze` cannot run|cannot run/i);
  });

  it('reports the native path as OK when the binding loaded', async () => {
    await new DoctorCommand().execute([], registryWith(true));
    const parse = lines.filter(l => /parse path/i.test(l));

    expect(parse).toHaveLength(1);
    expect(parse[0]).toContain('[✓]');
    expect(parse[0]).toMatch(/native tree-sitter/);
  });
});
