# 2026-10-10 skill-header-yaml

- Problem: installed conducks SKILL.md headers failed strict YAML parsers (js-yaml, PyYAML, Claude API upload).
- Cause: `getDynamicSkillTemplates()` wrote `description:` unquoted; all four descriptions contain ": ".
- Fix: `JSON.stringify(description)` (a JSON string is a valid YAML double-quoted scalar). One line.
- Test: tests/unit/domain/federation/installer-skill-header.test.ts parses every installed header with js-yaml; red before, green after, red again with fix reverted.
- js-yaml added to devDependencies (was only transitive).
- Not run: whole suite, `npm run build` (tsc --noEmit on tsconfig.build.json passed instead). No installer module note with `## Traps` exists, so no trap line added.
- Next time: quote any free text written into a YAML header.
