import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Logger, setProcessQuiet } from '@/lib/core/utils/logger.js';

/**
 * ADR 0080 — a read-only command answers the question and says nothing else (todo02#P2).
 *
 * `conducks status` printed five boot lines to stderr before its report on every read-only command:
 * grammar engine starting, grammar engine ready, log sink anchored, synapse anchored, resonance flow
 * pushed. None of it is the answer the caller asked for.
 *
 * Two properties make quiet safe, and both are pinned here because getting either wrong is worse
 * than the noise:
 *
 *   1. a suppressed line still reaches the FILE sink — quiet must not cost diagnosability
 *   2. WARN and ERROR are never suppressed — a silent failure is a far worse defect than noise
 */
describe('quiet suppresses narration, not failures', () => {
  let dir: string;
  let logFile: string;
  let captured: string[];
  let restore: () => void;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-quiet-'));
    logFile = path.join(dir, 'mcp.log');
    captured = [];
    const original = process.stderr.write.bind(process.stderr);
    (process.stderr as unknown as { write: unknown }).write = (chunk: string) => {
      captured.push(String(chunk));
      return true;
    };
    restore = () => { (process.stderr as unknown as { write: unknown }).write = original; };
  });

  afterEach(() => {
    restore();
    setProcessQuiet(false);            // process-wide — must not leak into the next test
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const mk = () => {
    const l = new Logger('T');
    l.setLogFile(logFile);
    return l;
  };
  const fileText = () => (fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '');

  it('prints info to stderr when loud', () => {
    const l = mk();
    setProcessQuiet(false);
    l.info('narration');
    expect(captured.join('')).toContain('narration');
  });

  it('keeps info OFF stderr when quiet', () => {
    const l = mk();
    setProcessQuiet(true);
    captured.length = 0;
    l.info('narration');
    expect(captured.join('')).not.toContain('narration');
  });

  it('still writes the suppressed line to the file sink — quiet is not lossy', () => {
    const l = mk();
    setProcessQuiet(true);
    l.info('narration');
    expect(fileText()).toContain('narration');
  });

  /**
   * The dangerous case. Gating every level on quiet — the first version of this change — would have
   * made a real error silent on the CLI: non-zero exit, nothing printed.
   */
  it('NEVER suppresses an error, however quiet', () => {
    const l = mk();
    setProcessQuiet(true);
    captured.length = 0;
    l.error('the vault could not be opened');
    expect(captured.join('')).toContain('the vault could not be opened');
  });

  it('NEVER suppresses a warning', () => {
    const l = mk();
    setProcessQuiet(true);
    captured.length = 0;
    l.warn('anchoring by fallback');
    expect(captured.join('')).toContain('anchoring by fallback');
  });

  /**
   * Quiet is a property of the PROCESS, not of one logger. Modules build their own instances —
   * `new Logger("ConducksGraph")` is one — and a per-instance flag left that instance printing from
   * a handle nobody held. Four of five lines went quiet and the fifth did not.
   *
   * Which is why setting it is `setProcessQuiet` and not a method: the reach is the point, so the
   * call site should show it (ADR 0150 rule 4, todo71).
   */
  it('applies to every instance, including ones created afterwards', () => {
    setProcessQuiet(true);
    const later = new Logger('made-later');
    later.setLogFile(logFile);
    captured.length = 0;
    later.info('narration from another instance');
    expect(captured.join('')).not.toContain('narration from another instance');
  });

  it('announcing the log sink is itself gated', () => {
    setProcessQuiet(true);
    captured.length = 0;
    const l = new Logger('T');
    l.setLogFile(path.join(dir, 'other.log'));
    expect(captured.join('')).not.toContain('Structural Diagnostic Sink');
  });

  it('boot diagnostics follow the same rule: off stderr, on in the file', () => {
    const l = mk();
    setProcessQuiet(true);
    captured.length = 0;
    l.boot('Initializing Native Grammar Engine...');
    expect(captured.join('')).not.toContain('Initializing');
    expect(fileText()).toContain('Initializing');
  });
});
