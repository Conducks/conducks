  ;; --- Type positions, ADR 0016 (shared, ecmascript-positions.ts) ---
  (type_annotation (type_identifier) @pulse_type_target)
  (type_annotation (generic_type name: (type_identifier) @pulse_type_target))
  (type_arguments (type_identifier) @pulse_type_target)
  (type_arguments (generic_type name: (type_identifier) @pulse_type_target))
  (constraint (type_identifier) @pulse_type_target)
  (array_type (type_identifier) @pulse_type_target)
  (array_type (generic_type name: (type_identifier) @pulse_type_target))
  (parenthesized_type (type_identifier) @pulse_type_target)
  (as_expression (type_identifier) @pulse_type_target)
  ;; The VALUE half of the same node, which had no pattern while the TYPE half did.
  ;;
  ;; `for (const { id } of TOOL_REGISTRARS as Array<{ id: string }>)` — the identifier is READ, and
  ;; wrapping it in `as` hid that from every value position: `for_in_statement right:` expects an
  ;; identifier and gets an `as_expression`. Measured on subject-c, this was the last of todo66's six
  ;; symbols still reported after the build layout and the binding registration were fixed.
  ;;
  ;; TS/TSX ONLY, and that is why it lives here rather than in the shared value block: the JavaScript
  ;; grammar has no `as_expression`, and naming a node a grammar does not have invalidates the WHOLE
  ;; query and silently drops the language to the regex fallback (ADR 0089).
  (as_expression (identifier) @ref_value)
  (type_predicate type: (type_identifier) @pulse_type_target)
  (union_type (type_identifier) @pulse_type_target)
  (intersection_type (type_identifier) @pulse_type_target)
  (conditional_type (type_identifier) @pulse_type_target)

  ;; A FUNCTION-TYPE's RETURN POSITION had no pattern. `(x: number) => Report` never captured
  ;; `Report` — every OTHER return-type shape (`function f(): Report`, `(): Report` in a type
  ;; annotation) already matched via `type_annotation` above, because the grammar puts THOSE under
  ;; `type_annotation` while a `function_type` node's return sits under its own `return_type` field.
  ;;
  ;; MEASURED on the sofie subject: `ExecutionReport`, used only via
  ;; `toReport?: (result: R) => ExecutionReport`, produced zero TYPE_REFERENCE edges and was one
  ;; calibration change away from a false STALE_IMPORT finding (todo — see dead-code.ts's
  ;; import-site calibration comment for the guard this was caught behind).
  (function_type return_type: (type_identifier) @pulse_type_target)
  (function_type return_type: (generic_type name: (type_identifier) @pulse_type_target))
  (function_type return_type: (union_type (type_identifier) @pulse_type_target))
