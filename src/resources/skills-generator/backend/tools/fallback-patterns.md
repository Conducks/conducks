<!-- description: Fallback pattern analysis — differentiate between legitimate design fallbacks and legacy technical debt. Use conducks_audit(mode: 'fallback') to identify candidates. -->

# Backend — Fallback Patterns

> Not all fallbacks are legacy. Some are design choices, others are technical debt. Know the difference.

---

## Fallback Pattern Types

**Design Fallbacks** (keep these):
- **Feature Toggles**: New code paths that can be disabled if unstable
- **Graceful Degradation**: Reduced functionality when dependencies fail
- **Progressive Enhancement**: Basic functionality that can be upgraded
- **Safety Nets**: Error boundaries and recovery mechanisms

**Legacy Fallbacks** (consider removing):
- **Dead Code Paths**: Fallbacks never executed in production
- **Outdated Implementations**: Replaced by newer patterns but kept "just in case"
- **Technical Debt**: Complex workarounds that should have been properly implemented
- **Abandoned Experiments**: Failed attempts left in codebase

---

## Detection with Conducks

Use `conducks_audit(mode: 'fallback')` to analyze fallback patterns:

```javascript
// AI Agent usage
await callTool("conducks_audit", {
  mode: "fallback"
});
```

**Signals to check:**
- **Usage Ratio**: Primary vs fallback call distribution (< 20% = suspicious)
- **Pipeline Position**: Late execution in call chains
- **Naming Patterns**: Keywords like "fallback", "legacy", "old"
- **Tenure**: How long the code has existed (> 1 year + low usage = risk)
- **Complexity**: High complexity fallbacks are harder to maintain

---

## Fallback Pattern Rules

**BKD-FB1 — Intentional Fallbacks** `[severity: high]`
Every fallback must have a documented business reason. Add comments explaining why the fallback exists and when it should be removed.

**BKD-FB2 — Fallback Testing** `[severity: high]`
Fallback code paths must be tested. Use feature flags or dependency injection to force fallback execution in tests.

**BKD-FB3 — Fallback Monitoring** `[severity: medium]`
Monitor fallback usage in production. Alert if fallbacks are used more than expected.

**BKD-FB4 — Fallback Removal Plan** `[severity: medium]`
Legacy fallbacks should have a removal plan. Document the migration path and success criteria.

**BKD-FB5 — Fallback Complexity Limit** `[severity: medium]`
Fallback implementations should be simpler than primary implementations. Complex fallbacks indicate the primary path should be fixed, not worked around.

---

## Common Fallback Anti-Patterns

**❌ Try/Catch as Primary Logic**
```typescript
// BAD: Exception-driven control flow
try {
  result = await complexPrimaryLogic();
} catch {
  result = simpleFallback(); // Called more often than expected
}
```

**❌ Optional Dependencies Without Fallbacks**
```typescript
// BAD: Silent failures
const optionalLib = require('optional-lib'); // May not exist
optionalLib.doSomething(); // Runtime error if missing
```

**✅ Graceful Degradation with Monitoring**
```typescript
// GOOD: Intentional fallback with monitoring
let result;
try {
  result = await primaryLogic();
  metrics.increment('primary_logic.success');
} catch (error) {
  result = fallbackLogic();
  metrics.increment('fallback_logic.used');
  logger.warn('Primary logic failed, using fallback', { error });
}
```

---

## Migration Strategies

**Phase 1: Discovery**
- Run `conducks_audit(mode: 'fallback')` to identify candidates
- Document business impact of each fallback

**Phase 2: Assessment**
- Check test coverage for fallback paths
- Measure performance impact
- Assess maintenance burden

**Phase 3: Migration**
- Implement proper primary logic
- Add feature flags for gradual rollout
- Monitor error rates and performance

**Phase 4: Cleanup**
- Remove fallback code after successful migration
- Update documentation
- Run regression tests

---

## Fallback vs Alternative Implementation

**Fallbacks** are temporary solutions used when primary logic fails:
- Error recovery mechanisms
- Reduced functionality modes
- Compatibility layers

**Alternative Implementations** are equally valid approaches:
- Strategy pattern variants
- Different algorithms for different use cases
- Platform-specific optimizations

Use fallbacks sparingly. Most "fallbacks" are actually alternative implementations that should be properly designed and tested.