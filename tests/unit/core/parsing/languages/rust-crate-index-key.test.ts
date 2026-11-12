import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RustResolver } from '@/lib/core/parsing/languages/rust/resolver.js';

/**
 * The crate index is rebuilt when the FILE LIST changes, and it must notice any change (state-machine
 * audit P-04-1). Its key was `length:first:last`, so two lists of the same length with the same first
 * and last path — a crate swapped out in the middle — shared one index: the second answered from the
 * first's crates.
 */
let root: string;
const write = (rel: string, body: string) => {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
};
const abs = (rel: string) => path.join(root, rel);

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-rust-key-'));
  for (const c of ['aaa', 'mid_one', 'mid_two', 'zzz']) {
    write(`${c}/Cargo.toml`, `[package]\nname = "${c}"\nversion = "0.1.0"\n`);
    write(`${c}/src/lib.rs`, '');
  }
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('the Rust crate index follows the file list', () => {
  it('sees a crate swapped in the middle of a list of the same length and endpoints', () => {
    const r = new RustResolver();
    const listOne = ['aaa/src/lib.rs', 'mid_one/src/lib.rs', 'zzz/src/lib.rs'].map(abs);
    const listTwo = ['aaa/src/lib.rs', 'mid_two/src/lib.rs', 'zzz/src/lib.rs'].map(abs);
    const from = abs('aaa/src/lib.rs');

    expect(r.resolve('mid_one::x', from, listOne)?.toLowerCase()).toBe(abs('mid_one/src/lib.rs').toLowerCase());
    expect(r.resolve('mid_two::x', from, listTwo)?.toLowerCase()).toBe(abs('mid_two/src/lib.rs').toLowerCase());
    expect(r.resolve('mid_one::x', from, listTwo)).toBeUndefined();
  });
});
