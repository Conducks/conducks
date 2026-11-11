/**
 * Conducks — Decorators and what they say about reachability
 *
 * `@deco def f(): ...` is `f = deco(f)`. The decorator RECEIVES the function, so a decorated symbol
 * is referenced by definition — and very often it is referenced by nothing else, because the point
 * of the decorator is to hand the symbol to a registry, a router or a framework that will call it
 * later, by string or by table lookup.
 *
 * MEASURED on the scraper subject: `src/core/validation/validators.py` registers seven functions with
 * `@_register_validator("phone_number")` and dispatches them through
 * `_SHAPE_VALIDATORS.get(name, ...)`. All seven were reported `[ORPHAN] defined but never referenced`
 * — a delete verdict on live code, and deleting `validate_non_empty` would also break the fallback
 * that looks its key up by string. On the orchestrator subject the same shape appears as NextAuth's
 * `authorize` callback.
 *
 * The split below is the whole idea:
 *
 *   - A PURE MODIFIER changes how the symbol behaves and hands it to nobody. `@staticmethod`,
 *     `@property`, `@dataclass`. A symbol carrying only these is exactly as reachable as an
 *     undecorated one, so it stays judgeable — that is how `Tab` and `StepMetadata` (both
 *     `@dataclass`, both genuinely unreferenced) remain true findings.
 *
 *   - ANY OTHER decorator is a REGISTRATION as far as this graph can tell. `@app.route`, `@mcp.tool`,
 *     `@pytest.fixture`, `@celery.task`, `@_register_validator` — and the unknown project-local one,
 *     which is the case that matters, because a tool cannot enumerate the decorators a codebase will
 *     invent. Unknown means "something else holds a reference", and the honest answer is to stop
 *     claiming the symbol is dead.
 *
 * Erring toward under-reporting, which is the documented bias of every rule in the prune path: a
 * missed dead function costs a little clutter, a wrong delete verdict costs working software.
 */

/**
 * Decorators that modify a symbol in place and pass it to nothing that outlives the expression.
 *
 * Compared case-insensitively against the LAST dotted segment, so `functools.wraps` matches `wraps`
 * and `abc.abstractmethod` matches `abstractmethod`.
 */
const PURE_MODIFIER_DECORATORS: ReadonlySet<string> = new Set([
  // Python
  'staticmethod', 'classmethod', 'property', 'setter', 'getter', 'deleter',
  'abstractmethod', 'abstractproperty', 'override', 'overload', 'final',
  'dataclass', 'total_ordering', 'wraps', 'cached_property', 'singledispatch',
  'contextmanager', 'asynccontextmanager', 'runtime_checkable',
  // TypeScript / JavaScript (ECMAScript decorators and the common Angular-style modifiers that
  // change a member rather than register it)
  'readonly', 'enumerable', 'configurable', 'memoize', 'debounce', 'throttle', 'bound', 'autobind',
  // Java / Kotlin annotations that assert rather than register
  'override', 'suppresswarnings', 'deprecated', 'safevarargs', 'functionalinterface', 'nonnull',
  'nullable',
]);

/**
 * Rust's built-in attributes that change codegen, lints or docs and hand the item to nobody. rustc
 * still reports a function carrying only these as never used, so they must not excuse it. `cfg` is
 * here because a `#[cfg(test)] fn` is compiled out of the build rustc judges, not registered.
 *
 * Kept apart from the list above and matched on the WHOLE path: a Rust attribute is a path into a
 * crate (`tokio::test`), and its last segment means nothing on its own (`rustfmt::skip` is a
 * formatter hint, while Python's `@unittest.skip` is a test-runner registration). Tool attributes
 * (`rustfmt::`, `clippy::`) are lint and format hints by definition.
 */
const RUST_PURE_ATTRIBUTES: ReadonlySet<string> = new Set([
  'inline', 'cold', 'must_use', 'track_caller', 'allow', 'warn', 'deny', 'forbid', 'expect',
  'doc', 'cfg', 'cfg_attr', 'derive', 'repr', 'non_exhaustive', 'deprecated', 'automatically_derived',
]);
const RUST_TOOL_ATTRIBUTE = /^(rustfmt|clippy)\./;

const RUST_ATTRIBUTE = /^#!?\[([\s\S]*)\]$/;

/**
 * The decorator's callee name: `@app.route("/x")` → `app.route`, `@wraps(fn)` → `wraps`, and a Rust
 * attribute `#[tokio::test]` → `tokio.test`, `#[doc = "x"]` → `doc` (the `::` path is spelled with
 * the same dot separator as every other language's callee).
 */
export function decoratorCallee(raw: string): string {
  let text = String(raw).trim().replace(/^@/, '');
  const rust = RUST_ATTRIBUTE.exec(text);
  if (rust) text = rust[1].trim().replace(/::/g, '.');
  const cut = text.search(rust ? /[(=]/ : /\(/);
  const callee = (cut > -1 ? text.slice(0, cut) : text).trim();
  return callee.split(/\s/)[0] ?? '';
}

/**
 * True when this decorator hands the symbol to something that may invoke it later — i.e. when the
 * graph can no longer claim the symbol is unreferenced.
 *
 * Unknown decorators answer TRUE deliberately. A project's own `@_register_validator` is exactly the
 * case a hard-coded framework list cannot cover, and guessing "modifier" there is what produced the
 * seven wrong verdicts this module exists to prevent.
 */
export function isRegisteringDecorator(raw: string): boolean {
  const callee = decoratorCallee(raw);
  if (!callee) return false;
  if (RUST_ATTRIBUTE.test(String(raw).trim())) {
    const p = callee.toLowerCase();
    return !(RUST_PURE_ATTRIBUTES.has(p) || RUST_TOOL_ATTRIBUTE.test(p));
  }
  const last = callee.split('.').pop()!.toLowerCase();
  return !PURE_MODIFIER_DECORATORS.has(last);
}

/** True when any decorator on the symbol registers it somewhere the graph cannot see. */
export function hasRegisteringDecorator(decorators: readonly string[] | undefined): boolean {
  return Array.isArray(decorators) && decorators.some(isRegisteringDecorator);
}
