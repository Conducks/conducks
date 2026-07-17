# Wave 6 — Agent 02: C4 extractDocs for 9 language plugins

## Task
Implement `extractDocs(sourceCode: string, node: any): string` on 9 language extractor classes.

## Files Modified

| File | Comment types handled |
|---|---|
| `src/lib/core/parsing/languages/go/extractor.ts` | `comment` |
| `src/lib/core/parsing/languages/rust/extractor.ts` | `line_comment`, `block_comment` |
| `src/lib/core/parsing/languages/java/extractor.ts` | `block_comment`, `line_comment` |
| `src/lib/core/parsing/languages/c/extractor.ts` | `comment` |
| `src/lib/core/parsing/languages/cpp/extractor.ts` | `comment` |
| `src/lib/core/parsing/languages/csharp/extractor.ts` | `comment`, `singleline_documentation_comment`, `multiline_documentation_comment` |
| `src/lib/core/parsing/languages/php/extractor.ts` | `comment` |
| `src/lib/core/parsing/languages/ruby/extractor.ts` | `comment` |
| `src/lib/core/parsing/languages/swift/extractor.ts` | `comment`, `multiline_comment` |

## Implementation

All 9 use the same AST sibling-walk pattern:
- Walk backwards from node's index in `node.parent.children`
- Skip `newline` / `*whitespace*` nodes
- On first matching comment node, strip markers and return trimmed text
- Stop (return `''`) on any other non-whitespace sibling

Language-specific notes:
- **C#**: also strips XML tags (`<summary>`, etc.) via `/<\/?[^>]+>/g`
- **Ruby**: only strips `#` prefix; no `//` or `/* */` style comments
- **Rust**: matches both `line_comment` (includes `///`) and `block_comment`

## TypeScript check
`npx tsc --noEmit` — clean, no errors.
