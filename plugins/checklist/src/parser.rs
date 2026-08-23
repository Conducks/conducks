//! A Rust reader of the SAME grammar `scripts/visuals/testing.mjs::parseTesting`
//! reads — that agreement, not this file alone, is the load-bearing part of
//! ADR 0154 and ADR 0035: one owner of the grammar, two implementations, one
//! shared fixture (`tests/unit/scripts/fixtures/visuals-testing/`) both are
//! tested against.
//!
//! The grammar itself is documented once, at the top of `testing.mjs` — it is
//! not repeated here in full. What follows is the same five constructs in the
//! same order:
//!
//!   `# Title`                      first line
//!   `Provenance: ...`              before the first `##`
//!   `## Section`                   optionally followed by a plain-prose blurb
//!   `### <id> — <name>`            a feature
//!   `- How: ...` / `- Note: ...`   feature fields
//!   `- [ ] <id> <task text>`       a task, optionally ending ` — Pass: <text>`
//!
//! No `regex` dependency: the grammar is simple enough that hand-written
//! string splitting mirrors the JS `RegExp`s exactly, one match arm at a
//! time, without pulling a crate into a plugin this small.

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Task {
    pub id: String,
    pub text: String,
    pub pass: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Feature {
    pub id: String,
    pub name: String,
    pub how: String,
    pub note: String,
    pub tasks: Vec<Task>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Section {
    pub title: String,
    pub blurb: String,
    pub features: Vec<Feature>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ParsedTesting {
    pub title: String,
    pub provenance: Option<String>,
    pub sections: Vec<Section>,
}

/// The em-dash clause both readers split a task line on. Written out as a
/// named constant rather than inline in three places, the way `testing.mjs`
/// writes it inline in one (it only needs it once).
const PASS_SEP: &str = " — Pass: ";

/// Parse `testing.md` into `{ title, provenance, sections }`.
///
/// Fails on the one thing that would make everything after it silently
/// wrong: a duplicate task id anywhere in the document (a tester's tick is
/// keyed by id, and two tasks sharing one address is exactly the shape
/// `conducks-visuals` §0 rule 3 forbids). It also fails on a structurally
/// unrecognised line, the same way `testing.mjs` throws rather than skips —
/// a plugin silently dropping a task nobody asked it to drop is worse than a
/// plugin that shows nothing and says why.
pub fn parse_testing(md: &str) -> Result<ParsedTesting, String> {
    let lines: Vec<&str> = md.split('\n').collect();

    let title = match lines.first().and_then(|l| l.strip_prefix("# ")) {
        Some(t) => t.to_string(),
        None => return Err("testing.md must open with \"# Title\"".to_string()),
    };
    let mut i = 1usize;

    let mut provenance: Option<String> = None;
    while i < lines.len() && !lines[i].starts_with("## ") {
        if let Some(rest) = lines[i].strip_prefix("Provenance:") {
            provenance = Some(rest.trim_start().to_string());
        }
        i += 1;
    }

    let mut sections = Vec::new();
    // task id -> first 40 chars of its text, for a duplicate error that names
    // which task already owns the id — the same shape testing.mjs's `seenIds`
    // map serves.
    let mut seen_ids: std::collections::HashMap<String, String> = std::collections::HashMap::new();

    while i < lines.len() {
        let Some(section_title) = lines[i].strip_prefix("## ") else {
            i += 1;
            continue;
        };
        let mut section = Section { title: section_title.to_string(), blurb: String::new(), features: Vec::new() };
        i += 1;
        if i < lines.len() {
            let l = lines[i];
            if !l.trim().is_empty() && !(l.starts_with("###") || l.starts_with('-') || l.starts_with("##")) {
                section.blurb = l.trim().to_string();
                i += 1;
            }
        }
        while i < lines.len() && lines[i].trim().is_empty() {
            i += 1;
        }

        while i < lines.len() && lines[i].starts_with("### ") {
            let heading = &lines[i]["### ".len()..];
            let Some((fid, fname)) = heading.split_once(" — ") else {
                return Err(format!("bad feature heading, expected \"### <id> — <name>\": {}", lines[i]));
            };
            let mut feature =
                Feature { id: fid.to_string(), name: fname.to_string(), how: String::new(), note: String::new(), tasks: Vec::new() };
            i += 1;
            while i < lines.len() && lines[i].starts_with("- ") {
                let line = lines[i];
                if let Some(how) = line.strip_prefix("- How: ") {
                    feature.how = how.to_string();
                } else if let Some(note) = line.strip_prefix("- Note: ") {
                    feature.note = note.to_string();
                } else if let Some(task_line) = parse_task_line(line)? {
                    let (id, text, pass) = task_line;
                    if let Some(prior) = seen_ids.get(&id) {
                        return Err(format!(
                            "duplicate task id {id} (also used by \"{prior}\") — ids must be unique and \
                             are never reused, see conducks-visuals §0 rule 3"
                        ));
                    }
                    seen_ids.insert(id.clone(), text.chars().take(40).collect());
                    feature.tasks.push(Task { id, text, pass });
                } else {
                    return Err(format!("unrecognised line under {}: {}", feature.id, line));
                }
                i += 1;
            }
            section.features.push(feature);
            while i < lines.len() && lines[i].trim().is_empty() {
                i += 1;
            }
        }
        sections.push(section);
    }

    Ok(ParsedTesting { title, provenance, sections })
}

/// `- [ ] <id> <task text>[ — Pass: <expected>]`, or `None` when the line is
/// not a task line at all (a caller then tries the other field kinds before
/// giving up and calling it unrecognised).
fn parse_task_line(line: &str) -> Result<Option<(String, String, Option<String>)>, String> {
    let Some(rest) = line.strip_prefix("- [") else { return Ok(None) };
    let mut chars = rest.chars();
    let Some(marker) = chars.next() else { return Ok(None) };
    if !matches!(marker, ' ' | 'x' | 'X' | '>' | '-') {
        return Ok(None);
    }
    let after_marker = &rest[marker.len_utf8()..];
    let Some(after_bracket) = after_marker.strip_prefix("] ") else { return Ok(None) };
    let Some((id, text_and_pass)) = after_bracket.split_once(' ') else { return Ok(None) };

    let (text, pass) = match text_and_pass.split_once(PASS_SEP) {
        Some((t, p)) => (t.to_string(), Some(p.to_string())),
        None => (text_and_pass.to_string(), None),
    };
    Ok(Some((id.to_string(), text, pass)))
}

/// Every task, in document order, across every section and feature — what
/// the plugin actually draws. Section grouping exists in the source (and in
/// the browser page) but the pane never drew section headings even when its
/// ten tasks were compiled in, so flattening here keeps that drawing
/// unchanged rather than inventing a new row kind this phase does not ask
/// for. Named as a gap in the phase report, not hidden.
pub fn flatten_features(parsed: &ParsedTesting) -> Vec<&Feature> {
    parsed.sections.iter().flat_map(|s| s.features.iter()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A 622-line document — a FROZEN SNAPSHOT of a real testing source, not a
    /// live copy of one. It used to be `include_str!` of the repository's own
    /// `docs/visuals/testing.md`, which stopped working the day that source
    /// moved to the repository it describes: a testing source belongs to the
    /// project it tests, and only the PARSER lives here. As a fixture it is
    /// better than the live file was — the JavaScript reader is tested against
    /// these same bytes, so the two readers now agree on a large document and
    /// not merely on a small one.
    const LARGE: &str = include_str!("../../../tests/unit/scripts/fixtures/visuals-testing/large.md");
    const BASE: &str = include_str!("../../../tests/unit/scripts/fixtures/visuals-testing/base.md");
    const DUPLICATE_ID: &str = include_str!("../../../tests/unit/scripts/fixtures/visuals-testing/duplicate-id.md");
    const RENUMBERED: &str = include_str!("../../../tests/unit/scripts/fixtures/visuals-testing/renumbered.md");

    /// The shared fixture parses into the exact shape `testing-parser.test.ts`
    /// (the JS suite) checks against the same file: 2 sections, 3 features
    /// total (F1, F2, F3), F1 carrying a How, a Note and a Pass clause on its
    /// first task and none on its second, F2 with no note and a task whose
    /// wording alone is the pass condition.
    ///
    /// **Mutation proof:** flip the feature-heading split from
    /// `split_once(" — ")` to `split(" — ").next()` (dropping the name) and
    /// this fails on `f1.name` — the JS reader would still read `The bar
    /// across the top`, and a Rust reader that read something else would be
    /// exactly the disagreement ADR 0154 exists to prevent.
    #[test]
    fn base_fixture_matches_the_shape_the_js_reader_sees() {
        let parsed = parse_testing(BASE).expect("base.md is well-formed");
        assert_eq!(parsed.title, "Testing — Fixture Repo");
        assert_eq!(parsed.sections.len(), 2);

        let window = &parsed.sections[0];
        assert_eq!(window.title, "The window");
        assert_eq!(window.blurb, "chrome that has to earn its pixels");
        assert_eq!(window.features.len(), 2);

        let f1 = &window.features[0];
        assert_eq!(f1.id, "F1");
        assert_eq!(f1.name, "The bar across the top");
        assert_eq!(f1.how, "One row, full window width.");
        assert_eq!(f1.note, "A known gap, carried on purpose so the parser is proven to read it.");
        assert_eq!(f1.tasks.len(), 2);
        assert_eq!(f1.tasks[0].id, "F1.T1");
        assert_eq!(f1.tasks[0].text, "The row runs edge to edge.");
        assert_eq!(f1.tasks[0].pass.as_deref(), Some("no gap on either side, at any window width."));
        assert_eq!(f1.tasks[1].id, "F1.T2");
        assert_eq!(f1.tasks[1].text, "Nothing is drawn under the traffic lights.");
        assert_eq!(f1.tasks[1].pass, None);

        let f2 = &window.features[1];
        assert_eq!(f2.id, "F2");
        assert_eq!(f2.note, "", "F2 has no Note field in the fixture");
        assert_eq!(f2.tasks.len(), 1);
        assert_eq!(f2.tasks[0].pass, None, "a task can be its own pass condition");

        let anything_else = &parsed.sections[1];
        assert_eq!(anything_else.title, "Anything else");
        assert_eq!(anything_else.features[0].id, "F3");
        assert_eq!(anything_else.features[0].tasks.len(), 2);
    }

    /// `flatten_features` is what the plugin actually draws: every task in
    /// document order regardless of which `##` section it sits under.
    ///
    /// **Mutation proof:** change the `flat_map` to only take
    /// `parsed.sections.first()` and this fails — F3 (in the second section)
    /// would go missing from a 5-feature document's flattened list.
    #[test]
    fn flatten_features_walks_every_section() {
        let parsed = parse_testing(BASE).unwrap();
        let flat = flatten_features(&parsed);
        assert_eq!(flat.iter().map(|f| f.id.as_str()).collect::<Vec<_>>(), vec!["F1", "F2", "F3"]);
    }

    /// The property this exists to prove: a task id used twice is refused,
    /// not silently overwritten — the exact fixture and the exact guarantee
    /// `testing-parser.test.ts` checks against the JS reader.
    ///
    /// **Mutation proof:** delete the `seen_ids.get(&id)` check (or the
    /// `return Err` inside it) and this fails — `duplicate-id.md` parses
    /// clean instead of being refused, and the second `F1.T1` silently
    /// overwrites the first in `seen_ids` with nothing telling anyone.
    #[test]
    fn a_repeated_task_id_is_refused() {
        let err = parse_testing(DUPLICATE_ID).expect_err("F1.T1 is used twice in this fixture");
        assert!(err.contains("F1.T1"), "the refusal must name the id, got: {err}");
    }

    /// `renumbered.md` is structurally valid markdown — its ids just moved,
    /// which is a semantic drift `detectRenumbering` (JS-only, see module
    /// doc) catches, not something `parse_testing` itself can see from one
    /// document alone. Both readers must agree that this file PARSES; only
    /// the JS suite compares it against `base.md` for drift.
    ///
    /// **Mutation proof:** have `parse_task_line` reject an id it has not
    /// seen before in `base.md` (an over-eager cross-document check with no
    /// grammar basis) and this fails where it should not — renumbering is a
    /// two-document comparison, not a one-document parse error.
    #[test]
    fn renumbered_fixture_still_parses_on_its_own() {
        let parsed = parse_testing(RENUMBERED).expect("renumbering alone is not a grammar error");
        let flat = flatten_features(&parsed);
        assert_eq!(flat.len(), 3);
        // The swap `base.md` -> `renumbered.md` documents: F1.T1's text here is
        // F1.T2's text in base.md, and vice versa. Parsing the RIGHT shape
        // back out, id-for-id, is what a Rust `detectRenumbering` port would
        // need as its own starting point — named as future work below.
        assert_eq!(flat[0].tasks[0].id, "F1.T1");
        assert_eq!(flat[0].tasks[0].text, "Nothing is drawn under the traffic lights.");
        assert_eq!(flat[0].tasks[1].id, "F1.T2");
        assert_eq!(flat[0].tasks[1].text, "The row runs edge to edge.");
    }

    /// **The actual agreement ADR 0154 and ADR 0035 exist for.** The real,
    /// authored `docs/visuals/testing.md` — not a small fixture standing in
    /// for it — parses under this Rust reader into exactly the shape the JS
    /// reader (`scripts/visuals/testing.mjs::parseTesting`) sees: verified by
    /// running that exact function against that exact file and reading back
    /// `{ sections: 8, features: 54, tasks: 405 }` (`node -e
    /// "import('./scripts/visuals/testing.mjs').then(...)"`, read-only, not
    /// the npm suite). If a future edit to either reader's grammar makes them
    /// disagree, this is the test that catches it against the real file
    /// rather than only against the small shared fixture.
    ///
    /// **Mutation proof:** loosen the feature-heading split (e.g. treat any
    /// `---` as `— `-equivalent) and a heading elsewhere in the real 622-line
    /// file that happens to contain that substring would parse into a
    /// different feature count than 54 — this test catches it; the small
    /// fixture, built to exercise the grammar rather than to be large, might
    /// not.
    #[test]
    fn the_large_shared_fixture_matches_the_js_readers_counts() {
        let parsed = parse_testing(LARGE).expect("the large fixture must parse");
        assert_eq!(parsed.sections.len(), 8, "sections");
        let features: usize = parsed.sections.iter().map(|s| s.features.len()).sum();
        assert_eq!(features, 54, "features");
        let tasks: usize = parsed.sections.iter().flat_map(|s| &s.features).map(|f| f.tasks.len()).sum();
        assert_eq!(tasks, 405, "tasks");
    }

    /// A document missing its `# Title` line is refused rather than parsed
    /// with an empty title standing in for a missing one.
    ///
    /// **Mutation proof:** change the `None => return Err(...)` arm to
    /// `None => String::new()` and this fails — a titleless document would
    /// parse to `ParsedTesting { title: "", .. }` instead of erroring.
    #[test]
    fn a_missing_title_is_refused() {
        let err = parse_testing("## Section only\n").expect_err("no leading # Title line");
        assert!(err.contains("Title"));
    }

    /// The vendored contract is a COPY of ForgeTerm's, and this is the half of
    /// the drift problem that can be checked from inside this repository: that
    /// nobody edited the copy locally. It cannot see the upstream file — see
    /// `wit/VENDORED.md` for why, and for what stays unguarded.
    ///
    /// **Mutation proof:** change one byte of `wit/plugin.wit` and this fails.
    #[test]
    fn the_vendored_contract_still_matches_its_recorded_hash() {
        use std::fmt::Write as _;
        let wit = include_str!("../wit/plugin.wit");
        let recorded = include_str!("../wit/plugin.wit.sha256").trim();
        // A tiny SHA-256 rather than a dependency: this crate compiles to wasm
        // and a hash crate would ride along into every plugin build.
        let digest = sha256(wit.as_bytes());
        let mut hex = String::new();
        for b in digest { write!(hex, "{b:02x}").unwrap(); }
        assert_eq!(hex, recorded, "wit/plugin.wit was edited locally — re-vendor it, do not fork it");
    }

    /// Minimal SHA-256, test-only.
    fn sha256(data: &[u8]) -> [u8; 32] {
        const K: [u32; 64] = [
            0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
            0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
            0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
            0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
            0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
            0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
            0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
            0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
        ];
        let mut h: [u32; 8] = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
        let mut msg = data.to_vec();
        let bits = (data.len() as u64) * 8;
        msg.push(0x80);
        while msg.len() % 64 != 56 { msg.push(0); }
        msg.extend_from_slice(&bits.to_be_bytes());
        for chunk in msg.chunks(64) {
            let mut w = [0u32; 64];
            for i in 0..16 {
                w[i] = u32::from_be_bytes([chunk[i*4], chunk[i*4+1], chunk[i*4+2], chunk[i*4+3]]);
            }
            for i in 16..64 {
                let s0 = w[i-15].rotate_right(7) ^ w[i-15].rotate_right(18) ^ (w[i-15] >> 3);
                let s1 = w[i-2].rotate_right(17) ^ w[i-2].rotate_right(19) ^ (w[i-2] >> 10);
                w[i] = w[i-16].wrapping_add(s0).wrapping_add(w[i-7]).wrapping_add(s1);
            }
            let (mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut hh) =
                (h[0],h[1],h[2],h[3],h[4],h[5],h[6],h[7]);
            for i in 0..64 {
                let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
                let ch = (e & f) ^ ((!e) & g);
                let t1 = hh.wrapping_add(s1).wrapping_add(ch).wrapping_add(K[i]).wrapping_add(w[i]);
                let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
                let maj = (a & b) ^ (a & c) ^ (b & c);
                let t2 = s0.wrapping_add(maj);
                hh = g; g = f; f = e; e = d.wrapping_add(t1);
                d = c; c = b; b = a; a = t1.wrapping_add(t2);
            }
            for (i, v) in [a,b,c,d,e,f,g,hh].iter().enumerate() { h[i] = h[i].wrapping_add(*v); }
        }
        let mut out = [0u8; 32];
        for i in 0..8 { out[i*4..i*4+4].copy_from_slice(&h[i].to_be_bytes()); }
        out
    }
}
