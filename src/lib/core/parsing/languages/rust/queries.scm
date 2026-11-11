  ;; --- Imports (L3-L4: Kinesis) ---
  (use_declaration
    argument: (scoped_identifier
      path: (_) @source)) @isImport
  (use_declaration
    argument: (identifier) @source) @isImport
  (use_declaration
    argument: (scoped_use_list
      path: (_) @source)) @isImport

  ;; mod helper;  --  a MODULE DECLARATION is this file's statement about which other file belongs
  ;; to it, and Rust guarantees where that file is: helper.rs or helper/mod.rs beside it. RustResolver
  ;; has always known how to walk both ("Maps Rust 'use' and 'mod' declarations to file paths"), but
  ;; nothing ever captured a mod_item, so half of the resolver was unreachable.
  ;;
  ;; Without the IMPORTS edge it produces, cross-file call resolution has nothing to walk: a call to
  ;; helper::alpha() stayed pinned to a PHANTOM node named for the module path (helper::alpha) while
  ;; the real declaration lived at helper.rs::alpha, so the two never met.
  ;;
  ;; MEASURED on a rustc-verified two-file crate where rustc reports only beta as never used:
  ;; conducks reported BOTH alpha and beta as ORPHAN, and impact alpha upstream found 0 callers.
  ;; This is a fact the source states, not an inference — mod helper; IS the declaration.
  ;;
  ;; Only the BODILESS form. `mod tests { ... }` declares its module inline and names no file; captured
  ;; as an import, the resolver rightly found nothing (lib.rs's child `tests` would be src/tests.rs)
  ;; and the generic fuzzy fallback then bound it by basename to util/tests.rs, an edge lib.rs never
  ;; states. Measured on the two-crate workspace fixture.
  (mod_item name: (identifier) @source !body) @isImport

  ;; --- Atoms (L6: Persistence & State) ---
  (let_declaration pattern: (identifier) @name) @isVariable
  (const_item name: (identifier) @name) @isVariable
  (static_item name: (identifier) @name) @isVariable
  (field_declaration name: (field_identifier) @name) @isProperty
  
  ;; --- Definitions (L4-L5: Structure & Behavior) ---
  ;; Signature capture (ADR 0086/0084): @params tags the whole 'parameters' node, which the frozen
  ;; reflector.ts helper reads by iterating its namedChildren — including a 'self_parameter'
  ;; ('&self' or bare 'self') when the function is a method, since it IS a namedChild of
  ;; 'parameters' in this grammar. That receiver has no 'pattern'/'name'/'type' field, so the
  ;; helper's text fallback records it verbatim as { name: '&self', type: null, optional: false }
  ;; (or 'self' for an owned receiver) — the honest answer, not a guess, and consistent with
  ;; keeping a rest/destructured parameter's literal text (ADR 0086). @return_type is a single
  ;; node under Rust's own 'return_type' field (never a list — a Rust function has exactly one
  ;; return type, even a tuple '-> (i32, i32)' is ONE tuple_type node), so a wildcard is safe here
  ;; and unlike Go there is no multi-value shape to refuse.
  (function_item name: (identifier) @name parameters: (parameters) @params return_type: (_)? @return_type) @isFunction
  (struct_item name: (type_identifier) @name) @isStruct
  (enum_item name: (type_identifier) @name) @isEnum
  (union_item name: (type_identifier) @name) @isStruct
  (trait_item name: (type_identifier) @name) @isInterface

  ;; A TYPE ALIAS is a declaration the project can be searched for, and none of these packs captured
  ;; one — found by oracle-packs.mjs, which walks the grammar exhaustively and asked why a
  ;; type_item the tree plainly holds minted no node. An alias names a type the code refers to by
  ;; that name, so impact on it reported nothing and query could not find it at all.
  ;; STRUCTURE rather than a rung of its own: an alias IS a type, and inventing a kind for it would
  ;; add a rung with one producer (ADR 0100).
  (type_item name: (type_identifier) @name) @isStruct
  
  ;; Modules
  (mod_item name: (identifier) @name) @isNamespace
  
  ;; Lifetime parameters
  (lifetime) @isProperty

  ;; Generic type parameters with bounds
  (type_parameters
    (type_parameter) @isProperty)

  ;; Trait implementations. "impl Base for Child" IS an IMPLEMENTS edge, and until now it produced
  ;; none: the old pattern captured the trait as @source and the type as @isHeritage with no @name
  ;; anywhere, so the reflector resolved no definition node and dropped it. The comment above it
  ;; said "creates IMPLEMENTS edge conceptually" — conceptually was the whole problem.
  ;;
  ;; @name is the implementing TYPE, which the struct_item pattern above already mints; re-capturing it here
  ;; resolves the same node rather than a second one, which is what lets the heritage capture land.
  (impl_item
    trait: (type_identifier) @heritage_implements
    type: (type_identifier) @name) @isStruct

  ;; Implementation Blocks
  (impl_item type: (type_identifier) @heritage)

  ;; Methods inside impl blocks — same signature capture as @isFunction above.
  (impl_item
    body: (declaration_list
      (function_item name: (identifier) @name parameters: (parameters) @params return_type: (_)? @return_type) @isMethod))
  
  ;; --- Type positions (todo10 Phase 4) ---
  ;; Probed against tree-sitter-rust 0.24.0 (node-types.json + a live parse, see docs/memory.md).
  ;; Every real type position (field, parameter, let-binding, return type, const/static) exposes a
  ;; `type:` (or `return_type:`) field, so each is anchored to its own node instead of a blanket
  ;; (type_identifier) capture — a blanket capture would also fire on the struct/trait/enum's OWN
  ;; name node (also a type_identifier), producing a self-referencing edge. generic_type's name and
  ;; type_arguments' members are matched independent of the parent that holds them, so Vec<HashMap
  ;; <K, Box<V>>> resolves at every nesting depth via the same two rules.
  (field_declaration type: (type_identifier) @pulse_type_target)
  (field_declaration type: (reference_type type: (type_identifier) @pulse_type_target))
  (parameter type: (type_identifier) @pulse_type_target)
  (parameter type: (reference_type type: (type_identifier) @pulse_type_target))
  (let_declaration type: (type_identifier) @pulse_type_target)
  (let_declaration type: (reference_type type: (type_identifier) @pulse_type_target))
  (function_item return_type: (type_identifier) @pulse_type_target)
  ;; A TYPE NAME USED AS A VALUE is a use of the type, and none of these left an edge: a struct literal
  ;; `BlobsImpl { .. }`, an enum path `ConflictKind::Referenced`, a unit struct handed on
  ;; (`Arc::new(HeaderJudge)`, `&StdHost`, `let h = StdHost;`, `Shown.to_string()`), and a path into
  ;; another module (`&cli::StdHost`). MEASURED on a 27-crate workspace: 76 of 262 ORPHAN verdicts were
  ;; struct/enum names, the four above all live. Upper case only — Rust's own convention for types,
  ;; variants, unit structs and consts — so a local `x` is never read as one. The whole-path form needs
  ;; a lower-case module prefix: `Kind::A` would otherwise leave a dangling `a`, and a dangling NAME
  ;; spares every symbol of that name.
  (struct_expression name: [(type_identifier) (scoped_type_identifier)] @pulse_type_target)
  (scoped_identifier path: (identifier) @pulse_type_target (#match? @pulse_type_target "^[A-Z]"))
  ((scoped_identifier path: (_) @_rust_mod name: (identifier) @_rust_item) @pulse_type_target
    (#match? @_rust_mod "^[a-z_][a-z0-9_:]*$") (#match? @_rust_item "^[A-Z]"))
  (arguments (identifier) @pulse_type_target (#match? @pulse_type_target "^[A-Z]"))
  (reference_expression value: (identifier) @pulse_type_target (#match? @pulse_type_target "^[A-Z]"))
  (let_declaration value: (identifier) @pulse_type_target (#match? @pulse_type_target "^[A-Z]"))
  (field_expression value: (identifier) @pulse_type_target (#match? @pulse_type_target "^[A-Z]"))
  (const_item type: (type_identifier) @pulse_type_target)
  (static_item type: (type_identifier) @pulse_type_target)
  (pointer_type type: (type_identifier) @pulse_type_target)
  (generic_type type: (type_identifier) @pulse_type_target)
  (type_arguments (type_identifier) @pulse_type_target)
  ;; Trait bounds: fn f<T: Clone + Shape>(...) — each bound is a real type dependency.
  (trait_bounds (type_identifier) @pulse_type_target)
  ;; dyn Trait: Box<dyn Shape>
  (dynamic_type trait: (type_identifier) @pulse_type_target)
  ;; Scoped type paths (std::fmt::Result) are their own node and NOT recursive the way Java's
  ;; scoped_type_identifier is — a blanket capture here does not double-count the partial prefix.
  (scoped_type_identifier) @pulse_type_target

  ;; --- Infrastructure (L3: Entry Points) ---
  ;; Route Attributes: #[get("/")]
  (attribute_item
    (attribute
      (identifier) @infra_method (#match? @infra_method "^(get|post|put|delete|patch|route)$")
      (token_tree (string_literal) @kinesis_route_path))) @isInfra
  
  ;; --- Pulse Flow (Assignments) ---
  (assignment_expression left: (identifier) @pulse_assignment_name right: (_) @pulse_assignment_value)
  
  ;; --- Kinesis (Execution Flow) ---
  (call_expression function: [(identifier) (field_identifier) (scoped_identifier)] @kinesis_target)

  ;; A FUNCTION HANDED ON AS A VALUE — `.map_err(views_err)`, `.and_then(epoch_ms)` — is a use with no
  ;; call. Any call's identifier argument is a reference-as-value candidate, whatever the callee or its
  ;; receiver looks like (`"1".parse::<i32>().map_err(to_err)` has a call as receiver). The reflector
  ;; keeps only names this file defines or binds, so a local variable passed along adds nothing.
  ;; MEASURED on a 27-crate workspace: 45 of 134 ORPHAN verdicts were functions used this way.
  (call_expression arguments: (arguments (identifier) @ref_value))

  ;; A METHOD CALL is a call_expression whose function is a field_expression, and nothing captured
  ;; it: `self.step()`, `e.run()` and `self.store.is_derived(h)` produced no edge at all. The receiver
  ;; goes in @kinesis_object so the call processor builds `receiver.method` exactly as for the other
  ;; languages, and the linker's receiver rules resolve it (`self.step` finds the same-file `step`
  ;; first, as `this.x` does). MEASURED on a 27-crate workspace: 157 of 685 ORPHAN
  ;; verdicts were methods called as `self.<name>(...)` in their own file.
  (call_expression function: (field_expression
    value: [(self) (identifier) (field_expression)] @kinesis_object
    field: (field_identifier) @kinesis_target))
  
  ;; --- Debt Markers ---
  [(line_comment) (block_comment)] @comment

  ;; --- Kinesis: the REQUEST half of a cross-service pair (todo22#P15) ---
  ;;
  ;; The RECEIVER is captured as well as the URL, because flow.ts uses it as the evidence that a
  ;; call is a network call — without it, a config lookup and an HTTP GET are the same shape.

  ;; client.get(url) — reqwest and friends
  (call_expression
    function: (field_expression
      value: (identifier) @kinesis_object
        (#match? @kinesis_object "^(client|http|reqwest|agent)$")
      field: (field_identifier) @req_method
        (#match? @req_method "^(get|post|put|patch|delete|head|request|send)$"))
    arguments: (arguments . (string_literal) @kinesis_request_url)) @kinesis_request
