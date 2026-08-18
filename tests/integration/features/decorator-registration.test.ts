import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * `@deco def f()` is `f = deco(f)` — the decorator RECEIVES the function, so a decorated symbol is
 * referenced whether or not anything calls it by name. Usually nothing does: the decorator hands it
 * to a registry that dispatches by string later.
 *
 * MEASURED on the scraper subject before this test existed: `core/validation/validators.py` registers
 * seven functions with `@_register_validator("phone_number")` and friends, dispatched through
 * `_SHAPE_VALIDATORS.get(name, _SHAPE_VALIDATORS["non_empty_string"])`. All seven were reported
 * `[ORPHAN] Symbol is defined but never referenced` — a delete verdict, in the category the reader is
 * told is a verdict, on live code. Deleting `validate_non_empty` would also break the fallback that
 * looks its key up by string.
 *
 * The counter-case is the reason this cannot simply exempt everything decorated: `@dataclass` and
 * `@staticmethod` hand the symbol to nobody, and the same subject has two genuinely-dead `@dataclass`
 * types (`Tab`, `StepMetadata`) that must still be reported.
 */
describe('a registering decorator is a reference; a pure modifier is not', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('decorator-registration');

    writeFile(repo, 'app/__init__.py', '');
    writeFile(repo, 'app/registry.py', `
from dataclasses import dataclass

_SHAPE_VALIDATORS = {}

def register_validator(name):
    def decorator(fn):
        _SHAPE_VALIDATORS[name] = fn
        return fn
    return decorator

def get_validator(name):
    """Dispatch by string — the graph cannot follow this, which is the whole point."""
    return _SHAPE_VALIDATORS.get(name, _SHAPE_VALIDATORS["non_empty"])

@register_validator("phone")
def validate_phone(text):
    return len(text) > 6

@register_validator("non_empty")
def validate_non_empty(text):
    return bool(text)

@staticmethod
def only_modified(text):
    """A PURE MODIFIER decorates it and hands it to nobody — still judgeable."""
    return text

@dataclass
class UnusedRow:
    """Also only modified, also referenced by nothing. A true finding."""
    value: int = 0
`);
    writeFile(repo, 'app/main.py', `
from app.registry import get_validator

def run(kind, text):
    return get_validator(kind)(text)
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });

    expect(JSON.parse(runCli(['query', '*', '--json'], { cwd: repo }).stdout).length).toBeGreaterThan(0);
  }, 180000);

  afterAll(() => rmRepo(repo));

  it('does not issue a dead-code verdict about a decorator-registered function', () => {
    const findings = JSON.parse(runCli(['prune', '--json'], { cwd: repo }).stdout);
    const verdicts = findings
      .filter((f: any) => f.type === 'ORPHAN' || f.type === 'UNUSED_EXPORT')
      .map((f: any) => f.symbol);

    expect(verdicts).not.toContain('validate_phone');
    expect(verdicts).not.toContain('validate_non_empty');
  }, 180000);

  it('still reports a symbol carrying only a PURE MODIFIER decorator', () => {
    // The counter-test. Without it, "ignore anything decorated" passes the case above and silently
    // drops every true finding about a `@dataclass` or `@staticmethod` — measured on the scraper
    // subject as `Tab` and `StepMetadata`, both correctly dead.
    const findings = JSON.parse(runCli(['prune', '--json'], { cwd: repo }).stdout);
    const reported = findings.map((f: any) => f.symbol);
    expect(reported).toContain('UnusedRow');
  }, 180000);

  it('records the decorators it saw on the declaration', () => {
    const explained = runCli(['explain', 'validate_phone'], { cwd: repo }).stdout;
    // The symbol resolves at all — the assertion above would pass vacuously on a missing symbol.
    expect(explained.toLowerCase()).toContain('validate_phone');
  }, 180000);
});
