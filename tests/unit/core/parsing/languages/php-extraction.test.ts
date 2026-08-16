import { describe, it, expect, beforeAll } from '@jest/globals';
import { ConducksReflector } from "@/lib/core/parsing/index.js";
import { AnalyzeContext } from "@/lib/core/parsing/index.js";
import { PHPProvider } from "@/lib/core/parsing/index.js";
import { PHP_QUERIES } from '@/lib/core/parsing/languages/php/queries.js';
import { grammars } from "@/lib/core/parsing/index.js";

/**
 * todo13 — the PHP query used to fail tree-sitter compilation (TSQueryErrorNodeType at offset 199)
 * because tree-sitter-php 0.24 deleted `namespace_aliasing_clause`, so every .php file silently
 * produced a file node and nothing else. These tests fail LOUDLY on the next grammar bump: one
 * compiles the whole query, the rest prove real symbols come out of a real pulse.
 */
describe('PHP extraction', () => {
  const reflector = new ConducksReflector();
  const provider = new PHPProvider();

  const SOURCE = `<?php
namespace App\\Services;

use App\\Contracts\\Repo;
use App\\Support\\Helper as H;

trait Loggable {
    public function log(string $msg): void {}
}

interface Runner {
    public function run(): int;
}

class OrderService implements Runner {
    private string $name = 'x';
    public int $count = 0;

    use Loggable;

    public function run(): int {
        $total = $this->count;
        return helperFn($total);
    }
}

enum Status {
    case Draft;
    case Sent;
}

function helperFn(int $n): int {
    return $n * 2;
}
`;

  let spectrum: any;

  beforeAll(async () => {
    await grammars.loadLanguage('php');
    const file = { path: '/repo/OrderService.php', source: SOURCE };
    spectrum = await reflector.reflect(file, provider as any, new AnalyzeContext(), [file.path]);
  });

  it('compiles the full PHP query against the installed grammar', async () => {
    await grammars.loadLanguage('php');
    const lang = grammars.getLanguage('php');
    expect(lang).toBeDefined();
    expect(() => grammars.createQuery(lang, PHP_QUERIES)).not.toThrow();
  });

  it('extracts real symbols, not just a file node', () => {
    const named = spectrum.nodes.filter((n: any) => n.kind !== 'file' && n.kind !== 'unit');
    expect(named.length).toBeGreaterThanOrEqual(8);
  });

  const hasNode = (name: string) => spectrum.nodes.some((n: any) => n.name === name);

  it.each([
    ['OrderService'],   // class     -> isStruct
    ['Runner'],         // interface -> isInterface
    ['Loggable'],       // trait     -> isStruct
    ['Status'],         // enum      -> isEnum
    ['run'],            // method    -> isMethod
    ['log'],            // method    -> isMethod
    ['helperFn'],       // function  -> isFunction
    ['$name'],          // property  -> isProperty (variable_name keeps the $ sigil)
    ['$count'],
  ])('extracts the symbol %s', (name) => {
    expect(hasNode(name as string)).toBe(true);
  });

  it('extracts properties through property_element — the 0.24 node shape', () => {
    // The old query asked for (property_declaration (variable_name)), a shape that has not existed
    // since properties gained a (property_element) wrapper. It raised TSQueryErrorStructure.
    const props = spectrum.nodes.filter((n: any) => n.name === '$name' || n.name === '$count');
    expect(props).toHaveLength(2);
  });

  it('keeps the class a STRUCTURE, not a variable', () => {
    const cls = spectrum.nodes.find((n: any) => n.name === 'OrderService');
    expect(cls.kind).toBe('struct');
  });

  it('records the namespace as a package node', () => {
    expect(hasNode('App\\Services')).toBe(true);
  });

  it('records the use-import specifiers, plain and aliased', () => {
    // `use X as Y` is the pattern that used to kill the query: 0.24 flattened
    // (namespace_aliasing_clause) into an `alias:` field on (namespace_use_clause).
    const imports = spectrum.relationships
      .filter((r: any) => r.type === 'IMPORTS')
      .map((r: any) => r.metadata?.specifier);
    expect(imports).toContain('App\\Contracts\\Repo');
    expect(imports).toContain('App\\Support\\Helper');
  });
});
