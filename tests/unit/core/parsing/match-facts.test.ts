import { describe, it, expect } from '@jest/globals';
import { stripQuotes, normalizeHttpMethod, scopedVarKey, kindFromCapture } from '@/lib/core/parsing/match-facts.js';

/**
 * The pure half of the reflector, now testable because it is no longer inside a 1,696-line file.
 *
 * These nine functions were the first 337 lines of `reflector.ts`. None of them touches the spectrum,
 * the graph or a processor — a node or a match goes in, a plain value comes out — which is exactly
 * what makes them worth testing directly and what made them safe to move first.
 *
 * The cases below are the ones each function's own comment names as the reason it looks that way.
 */
describe('normalizeHttpMethod — an unknown framework keeps its own word', () => {
  it('strips the framework suffixes and uppercases', () => {
    expect(normalizeHttpMethod('GetMapping')).toBe('GET');
    expect(normalizeHttpMethod('HttpPostAttribute')).toBe('HTTPPOST');
    expect(normalizeHttpMethod('post')).toBe('POST');
  });

  it('folds the generic verbs onto GET', () => {
    // `route`, `request`, `handle`, `HandleFunc` name a handler rather than a method. They are the
    // ones a framework uses when it means "any", and GET is what that answers as.
    for (const v of ['request', 'route', 'HandleFunc', 'handle']) {
      expect(normalizeHttpMethod(v)).toBe('GET');
    }
  });

  it('defaults to GET when nothing was captured', () => {
    expect(normalizeHttpMethod(undefined)).toBe('GET');
  });

  it('keeps a verb it does not recognise rather than inventing GET', () => {
    // The stated failure direction: an unknown framework should match ITSELF, not silently become a
    // GET route that a reader then cannot find in the source.
    expect(normalizeHttpMethod('PURGE')).toBe('PURGE');
    expect(normalizeHttpMethod('SUBSCRIBE')).toBe('SUBSCRIBE');
  });
});

describe('scopedVarKey — the prefix is what makes an id unique', () => {
  it('prefixes with the scope, lowercased', () => {
    expect(scopedVarKey('MyClass', 'Value')).toBe('myclass.value');
  });

  it('omits the prefix when there is no scope', () => {
    expect(scopedVarKey(null, 'Value')).toBe('value');
    expect(scopedVarKey(undefined, 'Value')).toBe('value');
    expect(scopedVarKey('', 'Value')).toBe('value');
  });

  it('keeps two same-named variables in different scopes apart', () => {
    // Without the prefix these collide, and one local silently becomes the other — which is the
    // whole reason the key carries a scope.
    expect(scopedVarKey('a', 'x')).not.toBe(scopedVarKey('b', 'x'));
  });

  it('trims the name, because a captured node can carry surrounding space', () => {
    expect(scopedVarKey('s', '  value  ')).toBe('s.value');
  });
});

describe('stripQuotes — a tree-sitter string node includes its delimiters', () => {
  it('removes every quote form', () => {
    expect(stripQuotes('"a"')).toBe('a');
    expect(stripQuotes("'a'")).toBe('a');
    expect(stripQuotes('`a`')).toBe('a');
  });

  it('leaves an unquoted value alone', () => {
    expect(stripQuotes('a')).toBe('a');
  });

  it('does not strip a quote from the MIDDLE of a value', () => {
    expect(stripQuotes(`it's`)).toBe(`it's`);
  });
});

describe('kindFromCapture — a function bound to a name is still a function', () => {
  const withParams = { captures: [{ name: 'params' }] };
  const noParams = { captures: [] };

  it('reads the kind off the capture name', () => {
    expect(kindFromCapture('isFunction', noParams)).toBe('function');
    expect(kindFromCapture('isStruct', noParams)).toBe('struct');
  });

  it('promotes a VARIABLE that captured a parameter list to a function', () => {
    // `export const Button = (props) => {...}` is how most of a React codebase declares its
    // functions, and the grammar tags it `@isVariable` because syntactically it IS a declarator.
    // Measured on the frozen subjects: 123 PascalCase atoms against 128 BEHAVIOR nodes, and
    // `impact`, `prune`, `coverage` and `flows` all select on BEHAVIOR.
    expect(kindFromCapture('isVariable', withParams)).toBe('function');
  });

  it('leaves a plain variable a variable', () => {
    // The counter-test. The evidence is the grammar's own — a declarator whose value is an arrow
    // function captures a parameter LIST, and a plain value captures none.
    expect(kindFromCapture('isVariable', noParams)).toBe('variable');
  });

  it('accepts the inline parameter form too', () => {
    expect(kindFromCapture('isVariable', { captures: [{ name: 'params_inline' }] })).toBe('function');
  });

  it('promotes nothing else — only a variable is ambiguous', () => {
    expect(kindFromCapture('isProperty', withParams)).toBe('property');
  });
});
