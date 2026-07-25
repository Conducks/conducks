import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

/**
 * ADR 0018 §1/§4 — skills are the guidance surface, MCP is the tool surface.
 *
 * Every `conducks_*` name written in a skill must exist in the registered MCP surface. A skill that
 * names a dead tool is a broken skill: the failure only shows up when an agent tries the call, and
 * then it looks like an agent error rather than a stale doc. This test moves that failure to CI.
 *
 * Both sides are read off disk at runtime — skills from `resources/skills/`, tool names from the
 * `name:` fields in the tool definition files (ADR 0018 §3: derive, never restate). Neither list is
 * hardcoded, so renaming a tool or adding a skill cannot silently bypass the check.
 *
 * Deliberately NOT importing the tool modules: importing them boots the registry singletons
 * (grammar registry, persistence), which raced with the parsing suites and made the whole gate
 * flaky — `type-only-imports` failed intermittently with `isTypeOnly: undefined`. A gate that fails
 * at random is worse than no gate, so this reads text and touches no runtime state. See
 * `docs/memory.md`.
 */
describe('ADR 0018 — skills may name only live MCP tools', () => {
  const skillsDir = path.resolve('src/resources/skills');
  const toolsDir = path.resolve('src/interfaces/tools/tools');

  // The registered surface, derived from the tool definitions server.ts assembles.
  const registeredTools = new Set<string>();
  for (const toolFile of fs.readdirSync(toolsDir).filter(f => f.endsWith('.ts'))) {
    const src = fs.readFileSync(path.join(toolsDir, toolFile), 'utf8');
    for (const match of src.matchAll(/name:\s*"(conducks_[a-z0-9_]+)"/g)) {
      registeredTools.add(match[1]);
    }
  }

  const skillFiles = fs
    .readdirSync(skillsDir)
    .filter(f => f.endsWith('.md'))
    .sort();

  it('finds skill files and a non-empty tool surface to compare', () => {
    expect(skillFiles.length).toBeGreaterThan(0);
    expect(registeredTools.size).toBeGreaterThan(0);
  });

  it.each(skillFiles)('%s names only registered conducks_* tools', file => {
    const content = fs.readFileSync(path.join(skillsDir, file), 'utf8');

    // Every conducks_* token in the prose, with the line it sits on for an actionable failure.
    const referenced = new Map<string, number[]>();
    content.split('\n').forEach((line, i) => {
      for (const match of line.matchAll(/\bconducks_[a-z0-9_]+/g)) {
        const name = match[0];
        if (!referenced.has(name)) referenced.set(name, []);
        referenced.get(name)!.push(i + 1);
      }
    });

    const dead = [...referenced.entries()]
      .filter(([name]) => !registeredTools.has(name))
      .map(([name, lines]) => `${name} (${file}:${lines.join(',')})`);

    expect(dead).toEqual([]);
  });
});
