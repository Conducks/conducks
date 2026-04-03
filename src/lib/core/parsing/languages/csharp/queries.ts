/**
 * Conducks — High-Fidelity C# SCM Query 🏺 🟦 (Omni-Detail)
 */
export const CSHARP_QUERIES = `
  ;; --- Atoms (L6: Persistence & State) ---
  (field_declaration (variable_declaration (variable_declarator (identifier) @name))) @isProperty
  (variable_declaration (variable_declarator (identifier) @name)) @isVariable
  
  ;; --- Definitions (L4-L5: Structure & Behavior) ---
  (class_declaration (identifier) @name) @isStruct
  (record_declaration (identifier) @name) @isStruct
  (interface_declaration (identifier) @name) @isInterface
  (enum_declaration (identifier) @name) @isStruct
  
  (method_declaration (identifier) @name) @isFunction
  (constructor_declaration (identifier) @name) @isFunction
  (destructor_declaration (identifier) @name) @isFunction
  
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
  
  ;; --- Debt Markers ---
  (comment) @comment
`;
