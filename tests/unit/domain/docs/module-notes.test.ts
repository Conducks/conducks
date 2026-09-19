import { describe, it, expect } from '@jest/globals';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectModuleNotes } from '@/lib/domain/docs/module-notes.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('collectModuleNotes — the walk both computed views are built on', () => {
  it('derives a feature path from the note path, containers elided by the filename itself', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'notes-'));
    mkdirSync(path.join(root, 'docs', 'visuals', 'modules', 'core'), { recursive: true });
    writeFileSync(path.join(root, 'docs', 'visuals', 'modules', 'contracts.md'), '# contracts\n');
    writeFileSync(path.join(root, 'docs', 'visuals', 'modules', 'core', 'graph.md'), '# core/graph\n');
    const notes = collectModuleNotes(root);
    expect(notes.map(n => n.feature).sort()).toEqual(['contracts', 'core/graph']);
    rmSync(root, { recursive: true, force: true });
  });

  it('walks nested subfolders, not just the top level', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'notes-'));
    mkdirSync(path.join(root, 'docs', 'visuals', 'modules', 'core', 'graph', 'linkers'), { recursive: true });
    writeFileSync(path.join(root, 'docs', 'visuals', 'modules', 'core', 'graph', 'linkers', 'part.md'), '# part\n');
    const notes = collectModuleNotes(root);
    expect(notes.map(n => n.feature)).toEqual(['core/graph/linkers/part']);
    rmSync(root, { recursive: true, force: true });
  });

  it('skips non-.md renders (e.g. the .html beside a note) and README.md', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'notes-'));
    mkdirSync(path.join(root, 'docs', 'visuals', 'modules'), { recursive: true });
    writeFileSync(path.join(root, 'docs', 'visuals', 'modules', 'a.md'), '# a\n');
    writeFileSync(path.join(root, 'docs', 'visuals', 'modules', 'a.html'), '<html></html>');
    writeFileSync(path.join(root, 'docs', 'visuals', 'modules', 'README.md'), 'not a note');
    expect(collectModuleNotes(root).map(n => n.feature)).toEqual(['a']);
    rmSync(root, { recursive: true, force: true });
  });

  it('a repo with no modules/ folder yet is empty, not an error', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'notes-'));
    expect(collectModuleNotes(root)).toEqual([]);
    rmSync(root, { recursive: true, force: true });
  });
});

describe('the real tree, measured 2026-09-18', () => {
  it('the 28 real notes today carry neither a `## Features` nor a `## Glossary` section — the ADR 0124 condition these commands exist to report', () => {
    // Not a regression test in the usual sense: this documents the measured state of THIS repo before
    // Phase 6 migrates the notes, so a later run that finds the sections already filled in is a signal
    // Phase 6 landed, not a broken test.
    const notes = collectModuleNotes(ROOT);
    expect(notes.length).toBeGreaterThanOrEqual(28);
  });
});
