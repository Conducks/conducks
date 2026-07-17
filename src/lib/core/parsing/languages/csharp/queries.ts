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
  
  (method_declaration (identifier) @name) @isFunction
  (constructor_declaration (identifier) @name) @isFunction
  (destructor_declaration (identifier) @name) @isFunction

  ;; Properties and Events (C# API surface)
  (property_declaration name: (identifier) @name) @isProperty
  (event_declaration name: (identifier) @name) @isProperty
  (indexer_declaration) @isProperty
  
  (namespace_declaration [(identifier) (qualified_name)] @name) @isPackage
  
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
`;
