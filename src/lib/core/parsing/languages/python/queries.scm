  ;; --- Imports (L3-L4: Kinesis) ---
  (import_statement (dotted_name) @source) @isImport
  (import_from_statement
    module_name: [(dotted_name) (relative_import)] @source
    name: [
      (dotted_name) @named_import
      (aliased_import (dotted_name) @named_import (identifier) @metadata)
      (wildcard_import) @metadata
    ]) @isImport

  ;; --- Definitions (L4-L5: Structure & Behavior) ---
  (class_definition name: (identifier) @name) @isStruct
  ;; --- Signature (ADR 0086/0087): parameters and declared return type. ---
  ;; 'parameters' is a required field (always present, even "()"). 'return_type' is a required
  ;; FIELD on the grammar but only present in source when written, so it is wrapped optional here.
  ;; Both point at the SAME (function_definition) node the existing @isFunction pattern already
  ;; matches — added to that one pattern rather than a second, to avoid the node-creation race
  ;; ADR 0086 already names (two patterns matching the same node race to create it).
  ;;
  ;; KNOWN GAP, reported rather than fixed (reflector.ts's paramsOf is frozen): a typed_parameter
  ;; (a: str) has no 'pattern' or 'name' field, so paramsOf falls back to the node's own text and
  ;; records the WHOLE "a: str" as the name, not "a". See agent-dynamic.md handover for detail.
  (function_definition name: (identifier) @name parameters: (parameters) @params return_type: (type)? @return_type) @isFunction
  
  ;; Heritage: class Child(Parent):
  ;;
  ;; @name IS REQUIRED HERE and was missing. reflector.ts gates the heritage branch on there being a
  ;; co-captured node (the 'else if ((cName === heritage ...) && node)' guard), so a heritage capture
  ;; with no @name beside it is DROPPED — Python produced no EXTENDS edge for any class, ever.
  ;; The TypeScript, TSX and JavaScript grammars all co-capture @name for exactly this reason, and
  ;; the JavaScript one carries a comment saying so.
  ;;
  ;; MEASURED on the Python subject: 17 of 27 STALE_IMPORT findings were base classes being
  ;; inherited from — BaseExtractor in 11 files, plus BaseSpecialist, BaseMapper, BaseWriter and
  ;; BaseLevel. 63% of the category was wrong, and each one told the reader to delete an import
  ;; whose class the next line inherits from, which breaks the module on import.
  (class_definition
    name: (identifier) @name
    superclasses: (argument_list [(identifier) (attribute)] @heritage)) @isStruct

  ;; --- Type positions (todo10 Phase 4) ---
  ;; Every annotation position (typed_parameter, typed_default_parameter, variable annotation,
  ;; return_type) is wrapped in a single grammar node: (type ...). That wrapper is uniform across
  ;; every position, unlike TypeScript where each position is its own node shape — so one small set
  ;; of patterns anchored on (type ...) covers parameters, return types, and variable annotations
  ;; at once. Probed against tree-sitter-python 0.25.0 node-types.json + a live parse (see
  ;; docs/memory.md): a bare name is (type (identifier)); a dotted name (pkg.Mod) is
  ;; (type (attribute)); List[str]/Dict[str,int] is (type (generic_type name: (identifier))) with
  ;; the args reached because each arg is ITSELF wrapped in (type ...), so the same patterns match
  ;; recursively at every nesting depth without extra rules.
  (type (identifier) @pulse_type_target)
  (type (attribute) @pulse_type_target)
  (type (generic_type (identifier) @pulse_type_target))
  ;; A FORWARD REFERENCE is a string: 'def handle(o: "Order")'. Quoting is not a style choice here
  ;; — it is what a name imported under 'if TYPE_CHECKING:' requires, since the name does not exist
  ;; at runtime, so the type-only imports this most needs to see were exactly the ones it could not
  ;; (todo48#P3). (string_content) is captured rather than (string) so the quotes never reach the
  ;; target name.
  (type (string (string_content) @pulse_type_target))
  ;; PEP 604 unions (int | str): the grammar has NO union node for this syntax, it's a plain
  ;; binary_operator, so only depth-1 operands are captured — 'A | B | C' chains lose the innermost
  ;; operand (nested binary_operator isn't itself wrapped in 'type'). Documented limit, not a lie:
  ;; the common 'X | None' / 'X | Y' cases resolve; deep chains under-capture rather than error.
  (type (binary_operator left: (identifier) @pulse_type_target right: (identifier) @pulse_type_target))
  (type (binary_operator left: (attribute) @pulse_type_target right: (identifier) @pulse_type_target))
  (type (binary_operator left: (identifier) @pulse_type_target right: (attribute) @pulse_type_target))

  ;; Flask/FastAPI @app.get('/path') — the verb is the ATTRIBUTE, so it is captured directly rather
  ;; than regex-matched against the dotted text app.get. The pattern below only matched a bare
  ;; @get('/path'), which is not how either framework is written, so Python routes were never
  ;; captured (todo22#P15). Probed against the real grammar before being added.
  (decorator
    (call
      function: (attribute attribute: (identifier) @infra_method
        (#match? @infra_method "^(get|post|put|delete|patch|route)$"))
      arguments: (argument_list . (string) @kinesis_route_path))) @isInfra

  ;; --- Infrastructure (L4: Entry Points & Metadata) ---
  (decorator
    [(call
        function: [(identifier) (attribute)] @infra_method (#match? @infra_method "^(get|post|put|delete|patch|route|task|job|consume|produce|subscribe|publish)$")
        arguments: (argument_list (string) @kinesis_route_path))
     (identifier) @infra_method (#match? @infra_method "^(classmethod|staticmethod|property|abstractmethod|wrapper|wraps|cached_property|lru_cache|retry)$")
     (attribute attribute: (identifier) @infra_method (#match? @infra_method "^(get|post|put|delete|patch|route)$"))]) @isInfra

  ;; --- Atoms (L7: State & Persistence) ---
  ;; typed_parameter: x: str
  (typed_parameter (identifier) @name (_) @metadata) @isVariable
  (typed_default_parameter (identifier) @name (_) @metadata) @isVariable

  ;; assignment: self.x = 10
  (assignment
    left: [
      (identifier) @name
      (attribute (identifier) (identifier) @name)
      (expression_list (attribute (identifier) (identifier) @name))
    ]) @isVariable

  ;; --- Pulse Flow (Assignments) ---
  (assignment
    left: [
      (identifier) @pulse_assignment_name
      (attribute (identifier) (identifier) @pulse_assignment_name)
    ]
    right: (_) @pulse_assignment_value)

  ;; --- Value positions: a name READ is a use (the @ref_value machinery) ---
  ;;
  ;; Python had NO value-position captures at all, so a binding reached in any of these ways looked
  ;; entirely unreferenced. MEASURED on the Python subject: 3 of its 10 STALE_IMPORT findings were
  ;; enums used only as EntryPoint.LEVEL_1_ONLY / InputType.URL_LIST — the import was called stale
  ;; while the module branches on its members.
  ;;
  ;; The member READ is the one that mattered; a member CALL was already visible through the call
  ;; pattern. The list and conditional forms are the same fact written two other ways, and mirror
  ;; what the TypeScript grammar captures.
  (attribute object: (identifier) @ref_value)
  (list (identifier) @ref_value)
  (conditional_expression (identifier) @ref_value)
  ;; A DICT VALUE is the dispatch table Python is written with:
  ;;     levels = {"level1": Level1, "level2": Level2}
  ;;     return levels.get(name, Level1)
  ;; The name is READ there and nowhere else, so without this capture the import looked unreferenced.
  ;; MEASURED on the scraper subject: `Level1`, `Level3`, `NameExtractor`, `RatingExtractor` and
  ;; `ReviewCountExtractor` in `specialists/google_maps/specialist.py` are all used exactly this way,
  ;; and every one of them was invisible — which is why widening the stale-import calibration without
  ;; this produced 23 findings Python's own parser contradicts.
  (dictionary (pair value: (identifier) @ref_value))
  ;; The same name handed to a call: `levels.get(level_name, Level1)`, `register(HANDLERS)`.
  (call arguments: (argument_list (identifier) @ref_value))
  ;; An EXCEPTION TYPE is a read of the class: `except SpecialistNotFound:` is the only place
  ;; `mapper_runner.py` names the exception it imports, and without this it read as an unused import.
  ;; Both plain and `as` forms, and the tuple form `except (A, B):`.
  (except_clause (identifier) @ref_value)
  (except_clause (as_pattern (identifier) @ref_value))
  (except_clause (tuple (identifier) @ref_value))

  ;; --- Kinetic Flow (L6: Behavior & Logic) ---
  ;; (_)* NOT (_). A bare (_) requires the argument_list to contain at least ONE node, so a
  ;; ZERO-ARGUMENT call did not match this pattern at all and produced NO CALLS edge — start(),
  ;; run(), self.close() were invisible to the whole graph, not merely to one analyzer. Python was
  ;; the only grammar with this shape: TypeScript, TSX and JavaScript already quantify with (_)*,
  ;; and every other language captures the call target without constraining arguments.
  ;;
  ;; MEASURED on a two-file fixture: main.py calls used_fn() and prune reported the import as
  ;; STALE_IMPORT — telling the reader to delete an import whose function is called on the next
  ;; line. trace on the calling function returned zero steps.
  (call
    function: [(identifier) (attribute)] @kinesis_target
    arguments: (argument_list (_)* @kinesis_arg))
  (raise_statement) @isKinetic
  (try_statement) @isKinetic
  (assert_statement) @isKinetic
  (global_statement (identifier) @name) @isKinetic
  (nonlocal_statement (identifier) @name) @isKinetic

  ;; --- Async Transitions ---
  ((function_definition) @isAsync (#match? @isAsync "^async"))
  (await) @isAsync

  ;; --- Metadata & Debt ---
  (expression_statement (string) @comment) ; Docstrings
  (comment) @comment

  ;; --- Kinesis: the REQUEST half of a cross-service pair (todo22#P15) ---
  ;;
  ;; requests.get(url) · httpx.post(url) · session.put(url) · aiohttp client calls.
  ;; The receiver is captured because flow.ts uses it as the evidence that this is a network call
  ;; — .get() on its own is far more often a dict lookup.
  (call
    function: (attribute
      object: (identifier) @kinesis_object
        (#match? @kinesis_object "^(requests|httpx|aiohttp|session|client|http|urllib)$")
      attribute: (identifier) @req_method
        (#match? @req_method "^(get|post|put|patch|delete|head|options|request|urlopen)$"))
    arguments: (argument_list . (string) @kinesis_request_url)) @kinesis_request
