<!-- description: Debugging and Cerebral Circuit tracing rules. How to follow execution flow, trace errors, and use Kinetic Resonance. -->

# Debugging Guidance

> Debugging is not a guessing game. It is a systematic tracing of the Cerebral Circuit. If you don't know where the data started, you don't know why it failed.

---

## The Cerebral Circuit Protocol

When a bug is reported or an error is thrown, follow this three-step protocol:

### 1. Resonance Discovery
Use **`kinetic_wave`** to search for the error signature or behavioral pattern. This finds similar logic across the entire Synapse, identifying if the bug is a systemic pattern or an isolated defect.

### 2. Path Tracing
Identify the entry point (the "trigger neuron") and run **`kinetic_circuit`**.
- Follow the data mutation at every step.
- Verify if the `lib/core` primitives are being used correctly by the `lib/product` service.
- Flag any step that violates the downward dependency rule.

### 3. Root Cause Isolation
Once the broken neuron is found:
- Check its **`synapse_context`**.
- Identify its callers (upstream) to see if the input was already corrupted.
- Identify its callees (downstream) to see the extent of the corruption blast radius.

---

## Rules

**DEBUG-1 — No Silent Swallowing** `[severity: critical]`
Never use empty `catch` blocks. All errors must be logged to `stderr` with a traceable context prefix or re-thrown after augmentation.

**DEBUG-2 — Trace Parity** `[severity: high]`
A bug fix is not complete until a unit test reproduces the failure state. The test must follow the same "circuit path" identified during the trace.

**DEBUG-3 — Use the Tools** `[severity: medium]`
Do not start grepping the codebase until you have used `synapse_query` and `kinetic_wave`. The graph knows more than the text search.