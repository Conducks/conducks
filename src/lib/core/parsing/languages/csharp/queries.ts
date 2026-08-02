/**
 * Conducks — High-Fidelity C# SCM Query 🏺 🟦 (Omni-Detail)
 */
export const CSHARP_QUERIES = `
  ;; --- Imports (L3-L4: Kinesis) ---
  (using_directive
    [(identifier) (qualified_name) (alias_qualified_name)] @source) @isImport

  ;; --- Atoms (L6: Persistence & State) ---
  (field_declaration (variable_declaration (variable_declarator (identifier) @name))) @isProperty
  (variable_declaration (variable_declarator (identifier) @name)) @isVariable
  
  ;; --- Definitions (L4-L5: Structure & Behavior) ---
  (class_declaration (identifier) @name) @isStruct
  (record_declaration (identifier) @name) @isStruct
  (interface_declaration (identifier) @name) @isInterface
  (enum_declaration (identifier) @name) @isEnum
  
  ;; Probed against tree-sitter-c-sharp (node-types.json + a live parse): method_declaration names its
  ;; return type field \`returns\`, not \`return_type\` or \`type\` — both \`returns\` and \`parameters\` are
  ;; REQUIRED there. constructor_declaration and destructor_declaration have no \`returns\` field at
  ;; all (ADR 0086: "a constructor has no return type; do not invent one"), so only \`parameters\` is
  ;; added for those two. \`parameter\`'s own \`name\` field matches reflector.ts's paramsOf() fallback
  ;; directly — C# is one of the languages that fallback chain was already written for.
  ;;
  ;; Field order in the pattern must follow the grammar's OWN field order (\`returns\` before \`name\`),
  ;; not node-types.json's alphabetical listing — \`name ... returns\` compiled but threw
  ;; TSQueryErrorStructure at match time on this grammar version, while \`returns ... name\` did not.
  ;; Measured by isolating each field pair against the built grammar; not documented anywhere else.
  (method_declaration returns: (_) @return_type name: (identifier) @name parameters: (parameter_list) @params) @isFunction
  (constructor_declaration name: (identifier) @name parameters: (parameter_list) @params) @isFunction
  (destructor_declaration name: (identifier) @name parameters: (parameter_list) @params) @isFunction

  ;; Properties and Events (C# API surface)
  (property_declaration name: (identifier) @name) @isProperty
  (event_declaration name: (identifier) @name) @isProperty
  (indexer_declaration) @isProperty
  
  (namespace_declaration [(identifier) (qualified_name)] @name) @isNamespace
  
  ;; --- Type positions (todo10 Phase 4) ---
  ;; Probed against tree-sitter-c-sharp 0.23.1 (node-types.json + a live parse, see docs/memory.md).
  ;; C#'s grammar has no concrete \`type\` wrapper node (it's a hidden supertype) — the \`type:\` field
  ;; on variable_declaration/parameter/method_declaration(returns)/property_declaration points
  ;; DIRECTLY at the identifier/generic_name/qualified_name, so each position is anchored to its own
  ;; field like Rust/Java rather than Python's uniform wrapper. qualified_name (System.Nullable<int>)
  ;; is captured whole, matching how @source already treats dotted names in this file.
  (variable_declaration type: (identifier) @pulse_type_target)
  (variable_declaration type: (generic_name (identifier) @pulse_type_target))
  (variable_declaration type: (qualified_name) @pulse_type_target)
  (parameter type: (identifier) @pulse_type_target)
  (parameter type: (generic_name (identifier) @pulse_type_target))
  (method_declaration returns: (identifier) @pulse_type_target)
  (method_declaration returns: (generic_name (identifier) @pulse_type_target))
  (property_declaration type: (identifier) @pulse_type_target)
  (property_declaration type: (generic_name (identifier) @pulse_type_target))
  (type_argument_list (identifier) @pulse_type_target)
  (type_argument_list (generic_name (identifier) @pulse_type_target))
  (type_argument_list (qualified_name) @pulse_type_target)
  ;; Generic constraints: class Repo<T> where T : IComparable<T>
  (type_parameter_constraint type: (identifier) @pulse_type_target)
  (type_parameter_constraint type: (generic_name (identifier) @pulse_type_target))
  ;; Nullable value types: int? -> only meaningful for a named (non-primitive) type
  (nullable_type type: (identifier) @pulse_type_target)

  ;; --- Infrastructure (L3: Entry Points) ---
  ;; ASP.NET / Web API Attribute Routes: [HttpGet("/")]
  (attribute
    (identifier) @infra_method (#match? @infra_method "^(HttpGet|HttpPost|HttpPut|HttpDelete|HttpPatch|Route)$")
    (_) @kinesis_route_path) @isInfra

  ;; Dependency Injection / Service Registration
  (attribute
    (identifier) @infra_method (#match? @infra_method "^(Dependency|Service|Component|Repository|Controller|RestController|Inject)$")) @isInfra
  
  ;; --- Pulse Flow (Assignments) ---
  (assignment_expression (identifier) @pulse_assignment_name (_) @pulse_assignment_value) @isPulse
  
  ;; --- Kinesis (Execution Flow) ---
  (invocation_expression [(identifier) (member_access_expression)] @kinesis_target)
  (object_creation_expression (_) @kinesis_target)
  
  ;; --- Delegate Declarations ---
  (delegate_declaration
    name: (identifier) @isFunction) @isInfra

  ;; --- LINQ Query Expressions ---
  (query_expression) @isInfra

  ;; --- Anonymous Method / Lambda in Event Handler ---
  (event_field_declaration
    (variable_declaration
      (variable_declarator
        name: (identifier) @isProperty))) @isProperty

  ;; --- Debt Markers ---
  (comment) @comment

  ;; --- Kinesis: the REQUEST half of a cross-service pair (todo22#P15) ---
  ;;
  ;; The RECEIVER is captured as well as the URL, because flow.ts uses it as the evidence that a
  ;; call is a network call — without it, a config lookup and an HTTP GET are the same shape.

  ;; httpClient.GetAsync(url) · client.PostAsync(url, ...)
  (invocation_expression
    (member_access_expression
      (identifier) @kinesis_object
        (#match? @kinesis_object "^(httpClient|client|http|_httpClient|_client|restClient)$")
      (identifier) @req_method
        (#match? @req_method "^(GetAsync|PostAsync|PutAsync|PatchAsync|DeleteAsync|SendAsync|GetStringAsync|GetFromJsonAsync|PostAsJsonAsync)$"))
    (argument_list (argument (string_literal) @kinesis_request_url))) @kinesis_request
`;
