<!-- @format -->

# Architecture — [Service Name]

## Path choice

**[ ] Pragmatic Path** — flat `src/` layout, no extraction layers
**[ ] Scale Path** — `lib/core` + `lib/product` + `src/` shell

**Reason:** [Why this path was chosen for this service]

---

## Module map

[Describe how the main modules connect. Show dependency direction with arrows.
Example: `routes → handlers → services → repositories → db`
Update this whenever a module is added, removed, or its connections change.]

---

## File tree

```
[service-root]/
├── src/
│   ├── [file or folder]        — [what it does, one line]
│   └── [file or folder]        — [what it does, one line]
└── [file]                      — [what it does, one line]
```

Every file and folder must appear here. If a file exists that is not listed, this document is out of date.

---

## Module responsibilities

### [Module name]

**Owns:** [What data, logic, or UI this module is responsible for]
**Imports from:** [Other modules or packages it depends on]
**Imported by:** [Other modules that depend on it]

---
