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

/** The decorator's callee name: `@app.route("/x")` → `app.route`, `@wraps(fn)` → `wraps`. */
export function decoratorCallee(raw: string): string {
  const text = String(raw).trim().replace(/^@/, '');
  const paren = text.indexOf('(');
  const callee = (paren > -1 ? text.slice(0, paren) : text).trim();
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
  const last = callee.split('.').pop()!.toLowerCase();
  return !PURE_MODIFIER_DECORATORS.has(last);
}

/** True when any decorator on the symbol registers it somewhere the graph cannot see. */
export function hasRegisteringDecorator(decorators: readonly string[] | undefined): boolean {
  return Array.isArray(decorators) && decorators.some(isRegisteringDecorator);
}
