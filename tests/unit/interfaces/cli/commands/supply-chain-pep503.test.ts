/**
 * F-07a: `PY_DIST_NAMES` in supply-chain.ts is a hardcoded table of IRREGULAR import/distribution
 * pairs (yaml/pyyaml, cv2/opencv-python, sklearn/scikit-learn) — it has no generic PEP 503 rule, so
 * a REGULAR case misses. MEASURED on the sofie subject: `kokoro_onnx` and `faster_whisper` printed
 * `(undeclared)` even though `requirements.txt` declares `kokoro-onnx` and `faster-whisper`.
 *
 * PEP 503 normalization (lowercase; collapse runs of `-`/`_`/`.` to a single `-`) is the generic
 * rule. It is applied at both lookup sites via `resolveDeclaredVersion`, tested directly here.
 */
import { describe, it, expect } from '@jest/globals';
import { normalizePkgName, buildNormalizedVersions, resolveDeclaredVersion } from '@/interfaces/cli/commands/supply-chain.js';

describe('PEP 503 package name normalization', () => {
  it('normalizes case and collapses -/_/. runs to a single dash', () => {
    expect(normalizePkgName('kokoro_onnx')).toBe('kokoro-onnx');
    expect(normalizePkgName('kokoro-onnx')).toBe('kokoro-onnx');
    expect(normalizePkgName('Faster_Whisper')).toBe('faster-whisper');
    expect(normalizePkgName('a___b...c--d')).toBe('a-b-c-d');
  });
});

describe('resolveDeclaredVersion', () => {
  it('regular case: an import name bridges to its declared distribution name via normalization', () => {
    const versions = new Map([['kokoro-onnx', '0.4.9'], ['faster-whisper', '1.1.1']]);
    const normalized = buildNormalizedVersions(versions);

    expect(resolveDeclaredVersion('kokoro_onnx', versions, normalized)).toBe('0.4.9');
    expect(resolveDeclaredVersion('faster_whisper', versions, normalized)).toBe('1.1.1');
  });

  it('exact match still wins without needing normalization', () => {
    const versions = new Map([['requests', '2.31.0']]);
    const normalized = buildNormalizedVersions(versions);
    expect(resolveDeclaredVersion('requests', versions, normalized)).toBe('2.31.0');
  });

  it('irregular table still bridges pairs normalization cannot (yaml/pyyaml, cv2/opencv-python)', () => {
    const versions = new Map([['pyyaml', '6.0'], ['opencv-python', '4.9.0']]);
    const normalized = buildNormalizedVersions(versions);
    expect(resolveDeclaredVersion('yaml', versions, normalized)).toBe('6.0');
    expect(resolveDeclaredVersion('cv2', versions, normalized)).toBe('4.9.0');
    // Confirms normalization truly cannot bridge these on its own.
    expect(normalizePkgName('yaml')).not.toBe(normalizePkgName('pyyaml'));
    expect(normalizePkgName('cv2')).not.toBe(normalizePkgName('opencv-python'));
  });

  /** Counter-test: a genuinely undeclared package must still say undeclared, under any normalization. */
  it('a genuinely undeclared package resolves to undefined under every path', () => {
    const versions = new Map([['requests', '2.31.0'], ['kokoro-onnx', '0.4.9']]);
    const normalized = buildNormalizedVersions(versions);
    expect(resolveDeclaredVersion('totally_unrelated_package', versions, normalized)).toBeUndefined();
  });
});
