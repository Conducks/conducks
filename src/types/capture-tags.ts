export const CaptureTags = {
  // Definition captures (triggers node creation)
  IS_FUNCTION:  'isFunction',
  IS_METHOD:    'isMethod',
  IS_CLASS:     'isClass',
  IS_STRUCT:    'isStruct',
  IS_INTERFACE: 'isInterface',
  IS_ENUM:      'isEnum',
  IS_PROPERTY:  'isProperty',
  IS_VARIABLE:  'isVariable',
  IS_INFRA:     'isInfra',
  IS_PACKAGE:   'isPackage',
  // A NAMESPACE is not a PACKAGE. C++ `namespace`, C# `namespace`, PHP `namespace` and Rust `mod`
  // are language scoping constructs; Go `package foo` and Java `package com.x` name a deployable
  // unit. All six were tagged `@isPackage`, which is why PACKAGE's only nodes on this repository
  // were a C# and a PHP namespace, and why NAMESPACE — a rung four consumers already read
  // (cluster-rule, http-service-linker, mirror.engine, dead-code) — had none at all (ADR 0100).
  IS_NAMESPACE: 'isNamespace',
  IS_MACRO:     'isMacro',
  IS_FIELD:     'isField',
  IS_TRAIT:     'isTrait',
  IS_GENERIC:   'isGeneric',
  IS_HERITAGE:  'isHeritage',
  IS_BINDING:   'isBinding',
  // Modifier captures
  IS_ASYNC:     'isAsync',
  IS_EXPORTED:  'isExported',
  IS_ABSTRACT:  'isAbstract',
  IS_STATIC:    'isStatic',
  // Special captures
  IS_IMPORT:    'isImport',
  SOURCE:       'source',
  COMMENT:      'comment',
  NAME:         'name',
} as const;

export type CaptureTag = typeof CaptureTags[keyof typeof CaptureTags];

export const DEFINITION_CAPTURES = new Set<CaptureTag>([
  CaptureTags.IS_FUNCTION, CaptureTags.IS_METHOD, CaptureTags.IS_CLASS,
  CaptureTags.IS_STRUCT, CaptureTags.IS_INTERFACE, CaptureTags.IS_ENUM,
  CaptureTags.IS_PROPERTY, CaptureTags.IS_VARIABLE, CaptureTags.IS_INFRA,
  CaptureTags.IS_PACKAGE, CaptureTags.IS_NAMESPACE, CaptureTags.IS_MACRO, CaptureTags.IS_FIELD,
  CaptureTags.IS_TRAIT, CaptureTags.IS_GENERIC, CaptureTags.IS_HERITAGE,
  CaptureTags.IS_BINDING,
]);
