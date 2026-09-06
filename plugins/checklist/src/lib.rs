//! The testing checklist, as a pane rather than a browser page.
//!
//! Moved here from ForgeTerm's `plugins/checklist` (ForgeTerm ADR 0035, this
//! repository's ADR 0154, todo74#P3). The drawing, wrapping, hit-testing,
//! notes and build-stamped run file below are carried over from that crate
//! largely unchanged — they already worked. What changed is the one thing
//! that had to: `FEATURES`, the ten compiled-in tasks, is gone. This plugin
//! now reads the real, 54-feature, 405-task source through `load` and parses
//! it with `parser::parse_testing` — the SAME grammar, tested against the
//! SAME fixture, that `scripts/visuals/testing.mjs` (the browser page's
//! renderer) is tested against. Two implementations, one owner, one fixture:
//! that agreement is the entire point of the move (ADR 0154).
//!
//! **It saves, through the host, into the project** (ForgeTerm ADR 0033,
//! amended by 0034). The ticks and the notes go into one file under `docs/`,
//! written by the host after it has judged the path. The plugin cannot open
//! a file itself and does not want to: it names the file, the host decides
//! whether that name is one it will accept, and a refusal is an answer
//! rather than a crash.

mod parser;

// The authoring surface comes from ForgeTerm itself now, not from a copy of it
// kept here. `src/bindings.rs` used to be that copy; see the comment on the
// dependency in `Cargo.toml` for why the path to it is absolute, and why the
// copy is what kept this pane off the theme for a release (ForgeTerm ADR 0058).
use forgeterm_plugin_api::{
    export, host_api, num, str, Context, Element, Event, Frame, Guest, Kind, Prop,
};
use forgeterm_text::keys::{Command, Erase};
use forgeterm_text::{edit, keys};
use parser::{Feature, Task};
use serde::{Deserialize, Serialize};

struct Checklist;

/// The authored source, relative to the project — the same path
/// `scripts/visuals/testing.mjs` reads at the top of that file
/// (`const src = 'docs/visuals/testing.md'`). Reusing that exact path is the
/// whole reason to choose it: this plugin and the browser renderer read the
/// same file at the same address, so there is one place to look when either
/// disagrees with the other. It satisfies the host's own rule (ADR 0033/0034)
/// on its own merits too — relative to the project, no `..`, and its
/// `docs` path component is present.
const TESTING_SOURCE: &str = "docs/visuals/testing.md";

/// The file the run is kept in, relative to the project.
///
/// The host judges this path and nothing more — it never learns why this name
/// rather than another. **That naming rule lives HERE, in the plugin, not in
/// the host** — ForgeTerm's ADR 0033 decided that from the start ("the host
/// judges a path and never learns the grammar behind it"), and moving the
/// plugin does not move that decision anywhere else.
const RUN_FILE: &str = "docs/checklist-run.json";

/// **What survives the window, and only that.** The scroll position, the
/// cursor and the editing mode are all state the NEXT session should not
/// inherit — reopening on row 84 in the middle of a half-typed note is not
/// resuming, it is being dropped somewhere. Splitting them here is what keeps
/// the file to the two things a reader of the repository cares about.
#[derive(Serialize, Deserialize, Default)]
#[serde(default)]
struct Persisted {
    /// The build this record was last written against — `ctx.build`, host
    /// knowledge the plugin cannot get any other way.
    ///
    /// A tick recorded against a different build looks like proof and is not
    /// (`conducks-visuals` §6). It used to be DROPPED for that reason, and the
    /// reason was right while the instrument was far too coarse: the build id
    /// is a git hash, so every commit voided the whole pass — including a
    /// commit that touched nothing but markdown. Measured: eight commits in one
    /// afternoon, each one clearing a tester's work.
    ///
    /// So a tick now survives and carries the build it was made under. Nothing
    /// is lost, and nothing claims to be current: `stale` is what the reader
    /// and the report both read.
    build: String,
    /// Ticks made against `build` — this pass, on this binary.
    ticked: Vec<String>,
    /// Ticks carried over from an earlier build, each with the build it was
    /// made under. Absent from files written before this existed, which is
    /// exactly what `#[serde(default)]` is for: an old file still parses, and
    /// its ticks migrate here the first time it is read on a newer build.
    stale: Vec<(String, String)>,
    notes: Vec<(String, String)>,
}

/// What a loaded run file hands back for `current_build`: the ticks and notes
/// to restore, or a refusal naming the build they actually came from.
///
/// Pure and free of `host_api`, so it is testable without a running host —
/// `render` is the only caller, and it supplies exactly what this needs:
/// whatever `load` answered, and `ctx.build`.
///
/// Unparseable or missing text (a fresh project, or a file this build cannot
/// read at all) is treated as "nothing to restore, and no build to report" —
/// an absence is not a mismatch, and reporting one would tell a first-time
/// user their ticks were dropped when none ever existed.
fn restore_for_build(
    text: &str,
    current_build: &str,
) -> (Vec<String>, Vec<(String, String)>, Vec<(String, String)>) {
    let Ok(mut saved) = serde_json::from_str::<Persisted>(text) else {
        return (Vec::new(), Vec::new(), Vec::new());
    };
    // Ticks already carried from an older build stay carried — the build they
    // name is the one they were MADE under, not the one they were last read on,
    // so it must never be overwritten with something more recent.
    let mut stale = saved.stale;
    if saved.build != current_build {
        // This file's own ticks were made on that build. They are kept and
        // marked, not dropped.
        stale.extend(saved.ticked.drain(..).map(|id| (id, saved.build.clone())));
    }
    // Sorted on the way in, because `ticked` is binary-searched. A file
    // written before that rule existed — or edited by hand — would
    // otherwise answer "not ticked" for most of what it actually holds,
    // and it would look like the ticks were lost rather than misread.
    saved.ticked.sort();
    saved.ticked.dedup();
    // A task ticked again on this build is CURRENT, so its stale entry goes:
    // one task never holds two answers, and the fresher one wins.
    stale.retain(|(id, _)| saved.ticked.binary_search(id).is_err());
    stale.sort();
    stale.dedup_by(|a, b| a.0 == b.0);
    (saved.ticked, saved.notes, stale)
}

#[derive(Serialize, Deserialize, Default)]
#[serde(default)]
struct State {
    /// Ticked task ids. A list rather than a set because the state blob is
    /// JSON, and a set would only be a list wearing a hat.
    ticked: Vec<String>,
    /// How far down the list is, in pixels, the same shape `plugins/runner`
    /// uses. There is no scroll primitive and none is needed.
    scroll: f32,
    /// The row the keyboard is on. Drawn as a wash so the two ways in, mouse
    /// and keys, are never in different places.
    /// **The id of the row the cursor is on, not its position in the list.**
    ///
    /// A feature id for a heading, a task id for a task — they cannot collide,
    /// since a task id always carries its feature's and a `.`. It was an index,
    /// and an index is a name for "wherever row 37 happens to be": marking a
    /// section above the cursor collapses it, every row below shifts up, and
    /// the cursor silently comes to rest on something else. Empty means the
    /// first row.
    cursor: String,
    /// A note against a task id — what the browser page calls the comment box.
    /// A tick says "I tried this". A note says what happened, and that is the
    /// half worth reading. Pairs rather than a map for the same reason
    /// `ticked` is a list: the state blob is JSON.
    notes: Vec<(String, String)>,
    /// Feature ids the reader opened even though they are finished.
    ///
    /// A finished feature collapses, because 405 tasks of which 300 are done is
    /// a list you cannot find your place in. Opening one must NOT mean unticking
    /// it, so "open" is its own small piece of state rather than a side effect
    /// of the ticks. It holds only the exceptions, so the common case — nothing
    /// opened — costs nothing.
    expanded: Vec<String>,
    /// Whether keys go INTO the note on the cursor row instead of moving
    /// between rows. Without a mode, the letters could never be typed.
    editing: bool,
    /// Exactly what the RUN file held when it was last read or written.
    ///
    /// It is the comparison that decides whether to write at all. Without it
    /// every frame writes the same bytes back, and `None` is also how the first
    /// frame of a window is told apart from every frame after it — the blob
    /// survives a hot reload, so loading happens once per WINDOW rather than
    /// once per build.
    on_disk: Option<String>,
    /// Set when the host refused the last write. Shown in the header, because
    /// a checklist that silently stopped saving is worse than one that never
    /// saved at all.
    refused: bool,
    /// Ticks carried over from an earlier build, each with the build it was
    /// made under.
    ///
    /// They are KEPT and marked rather than dropped. The build id is a git
    /// hash, so dropping on any mismatch voided a tester's whole pass every
    /// time anyone committed — including a commit that touched only markdown.
    /// A stale tick still says something ("I tried this, on that binary"); what
    /// it must never do is read as current, which is what the mark is for.
    stale: Vec<(String, String)>,
    /// Exactly what `load(TESTING_SOURCE)` answered, the first time this
    /// window asked. Loaded once per window for the same reason `on_disk`
    /// is — the source does not change under a running pane, and re-reading
    /// it every frame would be re-parsing 405 tasks on every keystroke for no
    /// reason. `None` is "not loaded yet"; `Some(String::new())` is "loaded,
    /// and either the file was empty or `load` refused/found nothing" — both
    /// of those are handled the same way `restore_for_build` handles an
    /// absent run file: as nothing to show, not as an error.
    source: Option<String>,
}

/// Every row on screen, in order, so the click hit test and the drawing walk
/// the SAME list. Two walks that each work out what row three is would be two
/// places to get it wrong, which is the mistake this file's host already made
/// once with the explorer.
enum Row<'a> {
    Heading(&'a Feature),
    Task(&'a Task),
}

fn rows<'a>(features: &[&'a Feature], state: &State) -> Vec<Row<'a>> {
    let mut out = Vec::new();
    for feature in features {
        out.push(Row::Heading(feature));
        // A collapsed feature contributes its heading and nothing else. Skipping
        // here rather than at the drawing is what makes the hit test, the
        // keyboard and the picture agree — a row that is not in this list cannot
        // be clicked, cannot be stepped onto, and cannot be drawn.
        if collapsed(state, feature) {
            continue;
        }
        for task in &feature.tasks {
            out.push(Row::Task(task));
        }
    }
    out
}

/// Row metrics in logical pixels, before scaling.
const HEAD_H: f32 = 34.;
const LINE_H: f32 = 18.;
const PASS_H: f32 = 16.;
const ROW_PAD: f32 = 12.;
const PAD: f32 = 14.;
const NOTE_H: f32 = 16.;
const NOTE_PAD: f32 = 10.;

// **Measured, and it is why the pane was not smooth.** `wrap` asks the host to
// measure once per WORD, and the source holds 6,802 words across 405 tasks — so
// a frame crossed the wasm boundary and shaped a string with the real font
// about 6,800 times, before any drawing. Parsing the 622-line source ran every
// frame as well. Both answers are identical from one frame to the next.
//
// So both are cached here. This is legitimate rather than a leak of state: the
// host keeps the instance alive between render calls, and everything in these
// caches is DERIVED from the source and the pane width. Losing them on a hot
// reload costs a recompute and nothing else, which is exactly the property that
// separates a cache from state the blob has to carry (ADR 0006).
thread_local! {
    /// Wrapped lines, keyed by the text, the size and the width they were
    /// wrapped to. A resize changes the width and misses every entry, which is
    /// correct — those lines really do have to be measured again.
    /// Keyed by a HASH of the text rather than the text: a lookup that first
    /// copies the whole task string allocates 810 times a frame to ask a
    /// question it then answers in nanoseconds.
    static WRAPPED: std::cell::RefCell<std::collections::HashMap<(u64, u32, u32), Vec<String>>> =
        std::cell::RefCell::new(std::collections::HashMap::new());
    /// The parsed source, kept for as long as the source text is unchanged.
    /// Leaked deliberately: it must outlive the borrow the row list takes, and
    /// the source changes only when the FILE changes, which is rare enough that
    /// the leak is bounded by how often a person edits it.
    /// Keyed by a HASH of the source, not its length. Length was the first
    /// attempt and it is wrong: two sources that happen to be the same size hit
    /// each other's entry, and the pane draws the previous file's tasks with
    /// nothing to show it is stale. Editing a task in place without changing
    /// the character count is exactly that case, and it is the ordinary way a
    /// person edits one.
    static PARSED: std::cell::RefCell<Option<(u64, &'static parser::ParsedTesting)>> =
        const { std::cell::RefCell::new(None) };
}

/// The parse, done once per distinct source rather than once per frame.
fn parsed_once(src: &str) -> Result<&'static parser::ParsedTesting, String> {
    let fingerprint = {
        use std::hash::{Hash, Hasher};
        let mut h = std::collections::hash_map::DefaultHasher::new();
        src.hash(&mut h);
        h.finish()
    };
    let cached = PARSED.with(|c| {
        let slot = c.borrow();
        slot.filter(|(seen, _)| *seen == fingerprint).map(|(_, p)| p)
    });
    if let Some(hit) = cached {
        return Ok(hit);
    }
    let parsed: &'static parser::ParsedTesting = Box::leak(Box::new(parser::parse_testing(src)?));
    PARSED.with(|c| *c.borrow_mut() = Some((fingerprint, parsed)));
    Ok(parsed)
}

/// **Text does not wrap, so the plugin wraps it.**
///
/// There is no text box and no wrapping primitive, only a string drawn at a
/// point. A checklist is long sentences, so without this the right-hand end of
/// every task is simply missing, which the first capture showed plainly. The
/// host knows the font and answers `measure-text`, so the plugin can ask where
/// a line stops fitting and break there.
///
/// Greedy by word. A word longer than the whole width goes on its own line
/// rather than looping forever looking for a break that is not there.
fn wrap(text: &str, size: f32, width: f32) -> Vec<String> {
    if width <= 0. {
        return vec![text.to_string()];
    }
    let key = {
        use std::hash::{Hash, Hasher};
        let mut h = std::collections::hash_map::DefaultHasher::new();
        text.hash(&mut h);
        (h.finish(), size.to_bits(), width.to_bits())
    };
    if let Some(hit) = WRAPPED.with(|c| c.borrow().get(&key).cloned()) {
        return hit;
    }
    let out = wrap_uncached(text, size, width);
    WRAPPED.with(|c| c.borrow_mut().insert(key, out.clone()));
    out
}

fn wrap_uncached(text: &str, size: f32, width: f32) -> Vec<String> {
    let mut lines = Vec::new();
    let mut line = String::new();
    for word in text.split_whitespace() {
        let candidate = if line.is_empty() { word.to_string() } else { format!("{line} {word}") };
        if host_api::measure_text(&candidate, size) <= width || line.is_empty() {
            line = candidate;
        } else {
            lines.push(std::mem::take(&mut line));
            line = word.to_string();
        }
    }
    if !line.is_empty() {
        lines.push(line);
    }
    if lines.is_empty() {
        lines.push(String::new());
    }
    lines
}

/// One row, already measured. **Laid out once per frame and used by BOTH the
/// hit test and the drawing**, because two walks that each work out where row
/// three is are two places to get it wrong. The host made exactly that mistake
/// with its own explorer, and the fix there was the same: one function.
struct Laid<'a> {
    row: &'a Row<'a>,
    y: f32,
    height: f32,
    doing: Vec<String>,
    pass: Vec<String>,
    /// The note, already wrapped. Empty when there is none AND the row is not
    /// being written into, which is what keeps an untouched list tight.
    note: Vec<String>,
}

fn lay_out<'a>(
    rows: &'a [Row<'a>],
    top: f32,
    text_w: f32,
    px: impl Fn(f32) -> f32,
    state: &State,
) -> Vec<Laid<'a>> {
    let mut out = Vec::new();
    let mut y = top;
    for row in rows {
        let (height, doing, pass, note) = match row {
            Row::Heading(_) => (px(HEAD_H), Vec::new(), Vec::new(), Vec::new()),
            Row::Task(task) => {
                let doing = wrap(&task.text, px(13.), text_w);
                // Real tasks do not all carry an explicit `— Pass:` clause —
                // for many the task's own wording IS the pass condition
                // (testing.mjs's own DEVIATION 2, documented at its top). The
                // compiled-in fixture the old plugin drew always had one, so
                // this optionality did not exist there; it is the one shape
                // reading the real source adds to the drawing.
                let pass = match &task.pass {
                    Some(p) => wrap(&format!("Pass: {p}"), px(11.5), text_w),
                    None => Vec::new(),
                };
                // Compared by ID, not position: this runs BEFORE the cursor has
                // a position this frame, which the index version quietly depended
                // on being able to do.
                let writing = state.editing && state.cursor == task.id;
                let text = note_of(state, &task.id);
                let note = if text.is_empty() && !writing {
                    Vec::new()
                } else {
                    // The caret is part of the STRING, so it wraps with the
                    // text. Placing it at a computed point would be a second
                    // answer to "where does this line end", and the wrapper
                    // already owns that one.
                    let shown = if writing { format!("{text}\u{2588}") } else { text.to_string() };
                    wrap(&shown, px(12.), (text_w - px(14.)).max(px(40.)))
                };
                let mut h = px(ROW_PAD)
                    + doing.len() as f32 * px(LINE_H)
                    + pass.len() as f32 * px(PASS_H)
                    + px(6.);
                if !note.is_empty() {
                    h += px(NOTE_PAD) + note.len() as f32 * px(NOTE_H);
                }
                (h, doing, pass, note)
            },
        };
        out.push(Laid { row, y, height, doing, pass, note });
        y += height;
    }
    out
}

/// What a row's HEIGHT depends on besides the tasks themselves.
///
/// The layout is built BEFORE events, because a click must be tested against
/// the picture the user actually clicked, not the one their click creates.
/// Opening a note changes heights, so when one of these changes the layout is
/// built a second time for the drawing — and only then, because building it
/// asks the host to measure every line.
/// Where the view must scroll to so the cursor is on screen — and NOTHING when
/// the cursor did not move.
///
/// **That last clause is the whole function.** This used to run every frame, and
/// the cursor starts on row 0 at y=0, so every frame it computed "row 0 is above
/// the view, scroll back to 0" and undid the scroll the reader had just made.
/// The wheel worked and the list snapped back before it was ever drawn. Ten
/// stub tasks fitted on screen, so scroll was always 0 and it never showed; the
/// real 405-task source made it immediate.
///
/// Pure, so the case that was broken is a test rather than a thing to try.
fn follow_cursor(scroll: f32, moved: bool, cursor_y: f32, cursor_h: f32, view: f32) -> f32 {
    if !moved {
        return scroll;
    }
    if cursor_y < scroll {
        return cursor_y;
    }
    let bottom = cursor_y + cursor_h;
    if bottom > scroll + view {
        return bottom - view;
    }
    scroll
}

fn layout_key(state: &State) -> (bool, String, usize, usize, usize) {
    (
        state.editing,
        state.cursor.clone(),
        state.notes.iter().map(|(_, n)| n.len()).sum(),
        // A tick can collapse or open a whole feature, so the ROW LIST changes,
        // not merely a row's height. Both counts are here because either one
        // moving changes what is on screen.
        state.ticked.len(),
        state.expanded.len(),
    )
}

/// **Every colour in this pane is the NAME of a host role, never a hex.**
///
/// ForgeTerm ADR 0058: a plugin sends the name of a colour role and the host
/// resolves it against its own `Theme` at draw time. Before this the checklist
/// carried thirty-six hand-copied hexes — each one correct on the day it was
/// written and frozen there — so this was the one pane that did not follow the
/// user's theme, and it sat on screen visibly brighter than the explorer beside
/// it. The names below are the twelve ADR 0058 defines and nothing else; a name
/// the host does not know resolves to the caller's default and paints wrong
/// SILENTLY (ADR 0005's open prop bag), which is why `colour_tests` pins the
/// list rather than trusting this comment.
///
/// Where the old hex had no role, the nearest is used and the loss is named on
/// the const. There are no new roles: a role this pane invented would be a role
/// the host cannot paint.
const PANEL: &str = "panel";
/// The card's border, the rule under the header, the hairline between tasks and
/// the key cap's edge — every line that says "two things, not one".
const EDGE: &str = "separator";
/// A surface sitting ON the card: the row under the cursor, a key cap, the note
/// box. `raised` is the host's own word for exactly that.
///
/// The note box loses something here. Its old `0x1c1519` was a WARM dark, so a
/// note read as the exception in a wall of grey; no ADR 0058 token is a warm
/// dark, and `raised` is the nearest by role. The warm signal is not gone — it
/// moved to the box's border, which is `ALARM`.
const WELL: &str = "raised";
/// What still needs doing: an unfinished feature's name, and the border of a
/// note being typed.
const ACCENT: &str = "accent";
/// What the eye should read first: the count, the task itself, a key cap's
/// letter, the text of a note.
const INK: &str = "ink.primary";
/// Beside a name rather than instead of it: a hint, a `Pass:` line, a task
/// already ticked, a shut feature's marker.
const DIM: &str = "ink.tertiary";
/// Present and deliberately not read first: a task id, an empty tick box's
/// border.
const FAINT: &str = "ink.quaternary";
/// Answered on THIS build. The host's `ok`, which is the same `0x8fc78f` this
/// pane used to spell out.
const DONE: &str = "ok";
/// Answered on an EARLIER build — the amber, hollow tick and the build id
/// beside it. `warn` is the role: it is not a failure, it is an answer that
/// cannot be trusted to be about what is running now.
const CARRIED: &str = "warn";
/// Something is wrong and the tester needs to know inside the pane: the run
/// file was refused, or `testing.md` did not parse. Also the resting border of
/// a note, which is the one thing here that is a finding rather than a fact.
const ALARM: &str = "danger";

struct Builder {
    elements: Vec<Element>,
}

impl Builder {
    fn push(&mut self, kind: Kind, parent: u32, props: Vec<Prop>, text: Option<&str>) -> u32 {
        let index = self.elements.len() as u32;
        self.elements.push(Element {
            kind,
            parent: if parent == u32::MAX { index } else { parent },
            props,
            text: text.map(str::to_string),
        });
        index
    }
}

/// One key drawn as a CAP with its meaning beside it, answering with the x to
/// carry on from.
///
/// The hint was a grey sentence, and a grey sentence is the one line a reader's
/// eye skips. A key that looks like a key is read, and the two halves — what to
/// press, what it does — stop being separated only by a space.
#[allow(clippy::too_many_arguments)]
fn key_hint(
    b: &mut Builder,
    parent: u32,
    x: f32,
    y: f32,
    scale: f32,
    key: &str,
    what: &str,
) -> f32 {
    let px = |v: f32| v * scale;
    let key_w = host_api::measure_text(key, px(10.5));
    let cap_w = key_w + px(11.);
    b.push(
        Kind::Rect,
        parent,
        vec![
            num("x", x),
            num("y", y),
            num("w", cap_w),
            num("h", px(15.)),
            str("color", WELL),
            num("radius", px(3.)),
            num("border", px(1.)),
            str("border-color", EDGE),
        ],
        None,
    );
    b.push(
        Kind::Text,
        parent,
        vec![
            num("x", x + px(5.5)),
            num("y", y + px(2.)),
            num("font-size", px(10.5)),
            str("color", INK),
        ],
        Some(key),
    );
    b.push(
        Kind::Text,
        parent,
        vec![
            num("x", x + cap_w + px(5.)),
            num("y", y + px(2.5)),
            num("font-size", px(10.5)),
            str("color", DIM),
        ],
        Some(what),
    );
    x + cap_w + px(5.) + host_api::measure_text(what, px(10.5)) + px(13.)
}

/// **`ticked` is kept SORTED, and every read is a binary search.**
///
/// It was a plain scan, which is fine for the ten tasks this began with and
/// quadratic for the 405 it holds. Measured on the real source with everything
/// ticked: `rows()` asks `feature_done` for all 54 features, each walks its own
/// tasks, and each of those was a linear scan of the ticked list — 164,025
/// string comparisons per call, up to twice a frame. Sorted, the same work is
/// 405 binary searches.
///
/// Nothing that reads the file cares about the order, so sorting costs nothing
/// anyone can observe.
fn toggle(state: &mut State, id: &str) {
    // **Touching a task settles it on THIS build**, whichever way it goes.
    // Re-ticking something carried over is the tester saying "I have tried it
    // again, here"; unticking it is them saying it is not done — and either way
    // the old build's answer has been superseded and must not linger beside the
    // new one.
    state.stale.retain(|(stale_id, _)| stale_id != id);
    match state.ticked.binary_search_by(|t| t.as_str().cmp(id)) {
        Ok(at) => {
            state.ticked.remove(at);
        },
        Err(at) => state.ticked.insert(at, id.to_string()),
    }
}

fn ticked(state: &State, id: &str) -> bool {
    state.ticked.binary_search_by(|t| t.as_str().cmp(id)).is_ok()
}

/// The build a task was ticked under, when that was not this one.
fn stale_build<'a>(state: &'a State, id: &str) -> Option<&'a str> {
    state.stale.iter().find(|(stale_id, _)| stale_id == id).map(|(_, build)| build.as_str())
}

/// **A feature is marked exactly when every one of its tasks is.** Derived, and
/// deliberately not stored.
///
/// Both directions the reader asked for fall out of this one rule: ticking the
/// last task marks the feature because there is nothing else to check, and
/// marking the feature ticks every task because that is the only way to make
/// this true. A stored flag beside the ticks would be a second answer to one
/// question, and the two would disagree the first time a task was ticked
/// individually.
///
/// A feature with no tasks is NOT complete. Otherwise an empty one would draw
/// as finished and collapse to nothing, which reads as work done.
fn feature_done(state: &State, feature: &Feature) -> bool {
    !feature.tasks.is_empty() && feature.tasks.iter().all(|t| ticked(state, &t.id))
}

/// Ticks or unticks every task in a feature. The one write that "mark the whole
/// section" means.
fn set_feature(state: &mut State, feature: &Feature, on: bool) {
    for task in &feature.tasks {
        let is = ticked(state, &task.id);
        if is != on {
            toggle(state, &task.id);
        }
    }
}

/// A finished feature hides its tasks unless the reader opened it.
fn collapsed(state: &State, feature: &Feature) -> bool {
    feature_done(state, feature) && !state.expanded.iter().any(|f| f == &feature.id)
}

fn toggle_expanded(state: &mut State, feature: &Feature) {
    match state.expanded.iter().position(|f| f == &feature.id) {
        Some(at) => {
            state.expanded.remove(at);
        },
        None => state.expanded.push(feature.id.clone()),
    }
}

fn note_of<'a>(state: &'a State, id: &str) -> &'a str {
    state.notes.iter().find(|(t, _)| t == id).map_or("", |(_, n)| n.as_str())
}

/// An empty note is no note. Dropping it here rather than at every reader is
/// what lets the issue count be `notes.len()` and stay true after a backspace.
fn edit_note(state: &mut State, id: &str, edit: impl FnOnce(&mut String)) {
    match state.notes.iter_mut().find(|(t, _)| t == id) {
        Some((_, text)) => edit(text),
        None => {
            let mut text = String::new();
            edit(&mut text);
            state.notes.push((id.to_string(), text));
        },
    }
    state.notes.retain(|(_, text)| !text.is_empty());
}

/// The id of the task the cursor is on, or nothing when it is on a heading.
/// The id a row answers to, which is what the cursor remembers.
fn row_id<'a>(row: &Row<'a>) -> &'a str {
    match row {
        Row::Heading(feature) => &feature.id,
        Row::Task(task) => &task.id,
    }
}

/// Where the cursor's row sits in THIS frame's list.
///
/// The row it named may have gone — a feature collapsed and took its tasks with
/// it. Falling back to the feature that owned the task keeps the cursor near
/// where the reader left it rather than throwing them back to the top, which is
/// what an index did when the list shortened under it.
fn cursor_index(laid: &[Laid<'_>], cursor: &str) -> usize {
    if let Some(at) = laid.iter().position(|l| row_id(&l.row) == cursor) {
        return at;
    }
    if let Some((owner, _)) = cursor.split_once('.') {
        if let Some(at) = laid.iter().position(|l| row_id(&l.row) == owner) {
            return at;
        }
    }
    0
}

fn cursor_task<'a>(laid: &[Laid<'a>], cursor: usize) -> Option<&'a str> {
    match laid.get(cursor).map(|l| l.row) {
        Some(Row::Task(task)) => Some(task.id.as_str()),
        _ => None,
    }
}

impl Guest for Checklist {
    fn render(ctx: Context) -> Frame {
        let mut state: State = serde_json::from_slice(&ctx.state).unwrap_or_default();
        if state.source.is_none() {
            // The first frame of this window. `load` answering `none` (a
            // refusal, or simply no file at that path yet) is treated the
            // same as an empty source: nothing to draw, not an error — the
            // same rule `restore_for_build` already applies to a missing
            // run file, applied here to a missing source.
            state.source = Some(host_api::load(TESTING_SOURCE).unwrap_or_default());
        }
        if state.on_disk.is_none() {
            let text = host_api::load(RUN_FILE).unwrap_or_default();
            let (ticked, notes, stale) = restore_for_build(&text, &ctx.build);
            state.ticked = ticked;
            state.notes = notes;
            state.stale = stale;
            state.on_disk = Some(text);
        }

        // Parsed fresh every frame from the loaded (and load-once-per-window)
        // source text — cheap next to a frame that already re-measures every
        // line of every visible row, and it keeps this function free of a
        // second cached copy of the same 405 tasks to keep in sync with the
        // one in `state.source`.
        let parsed_source = parsed_once(state.source.as_deref().unwrap_or(""));
        let (features, parse_error): (Vec<&Feature>, Option<&str>) = match &parsed_source {
            Ok(p) => (parser::flatten_features(p), None),
            Err(e) => (Vec::new(), Some(e.as_str())),
        };

        let px = |v: f32| v * ctx.scale;
        let rows = rows(&features, &state);

        // A notice line adds one row to the header: a parse error takes
        // priority (there is nothing sensible to draw until the source
        // parses), and a dropped-ticks refusal is the fallback otherwise. It
        // never changes mid-frame, so it is safe to fold into `top` before
        // the hit test runs — the row a click lands on is the same row it is
        // drawn on.
        let notice: Option<String> = parse_error.map(|e| format!("testing.md: {e}")).or_else(|| {
            (!state.stale.is_empty()).then(|| {
                format!(
                    "{} tick(s) carried from an earlier build — marked, not counted as this build's. This is {}.",
                    state.stale.len(),
                    ctx.build
                )
            })
        });
        let dropped_h = if notice.is_some() { px(16.) } else { 0. };

        // The header does not scroll. Everything below it does.
        let top = ctx.y + px(56.) + dropped_h;
        let text_x = ctx.x + px(PAD + 22.);
        let text_w = (ctx.x + ctx.width - px(PAD) - text_x).max(px(40.));
        let laid = lay_out(&rows, 0., text_w, px, &state);
        // The cursor is an ID in the state and a POSITION for one frame. Resolved
        // here, written back at the end — so the list may change shape underneath
        // it without the cursor quietly moving to a different row.
        let mut cursor = cursor_index(&laid, &state.cursor);

        // EVERY row is a stop, headings included. A heading you cannot land on
        // is a heading you cannot mark or open from the keyboard, and with a
        // finished feature collapsed to one line it may be the only row there.
        let nav_rows: Vec<usize> = (0..laid.len()).collect();

        let before = layout_key(&state);
        // Set only by a key that steps the cursor. See `follow_cursor`.
        let mut moved = false;
        for event in &ctx.events {
            match event {
                // **Added, not subtracted, and not rescaled.** The host has
                // already turned the gesture into "pixels, negated so that a
                // push forward moves the content up" (crates/shell/src/input.rs
                // sends `Scroll(-amount)` with a line already worth 20). This
                // line negated it a second time and multiplied by 20 again, so
                // the wheel ran backwards and about forty times too fast. The
                // runner plugin, which scrolls correctly, is just
                // `scroll + delta`; the only thing added here is the scale,
                // because this layout is in device pixels and the delta is not.
                Event::Scroll(delta) => {
                    state.scroll = (state.scroll + delta * ctx.scale).max(0.)
                },
                // The checklist does not ask for hover in its manifest, so the
                // host never sends one. Matched rather than left to a wildcard:
                // a wildcard would also swallow the next event this plugin
                // ought to handle, silently.
                Event::Hover(_) => {},
                // Not asked for either; the host selects whole elements here.
                Event::Drag(_) => {},
                Event::Click(point) => {
                    // **A click arrives in the PANE's coordinates; everything
                    // drawn is in the WINDOW's.** `ctx.x`/`ctx.y` are the pane's
                    // position in the window and every element is placed at
                    // `ctx.x + …`, while the host reports a click as
                    // `pointer - pane_rect`, zero at the pane's own corner —
                    // deliberately, and pinned by a test in the host
                    // (`crates/shell/src/input.rs`,
                    // `a_click_reaches_the_plugin_in_its_own_coordinates`).
                    //
                    // Without this line the hit test was off by exactly the
                    // pane's distance from the top of the window, so a plugin
                    // pane below the tab bar ticked the wrong row or no row at
                    // all. It read as "the tick does not work".
                    let (click_x, click_y) = (point.x + ctx.x, point.y + ctx.y);
                    // The same layout the drawing uses, offset by the same
                    // scroll. One list, one answer.
                    let hit = laid
                        .iter()
                        .position(|l| {
                            let y = top + l.y - state.scroll;
                            click_y >= y && click_y < y + l.height
                        });
                    if let Some(index) = hit {
                        cursor = index;
                        // A click is about the tick. Ticking a row while a note
                        // on ANOTHER row was open would leave the caret
                        // somewhere the user is no longer looking.
                        state.editing = false;
                        match laid[index].row {
                            Row::Task(task) => toggle(&mut state, &task.id.clone()),
                            Row::Heading(feature) => {
                                // Two targets on one row, split by x. The box at
                                // the left OPENS a finished feature without
                                // touching a tick; anywhere else marks or
                                // unmarks the whole thing. Opening had to be
                                // separable: if the only way in were unticking,
                                // looking at what you already did would destroy
                                // the record of having done it.
                                // The split is at PAD+12, and the heading's
                                // text starts at PAD+14. It used to be PAD+18,
                                // which put the first few pixels of the title
                                // inside the OPEN zone — so clicking the left
                                // edge of "F1" opened the feature instead of
                                // marking it, which is a different action, not
                                // a near miss. The gap between the two numbers
                                // is deliberate: no pixel belongs to both.
                                if click_x < ctx.x + px(PAD + 12.) {
                                    toggle_expanded(&mut state, feature);
                                } else {
                                    let on = !feature_done(&state, feature);
                                    set_feature(&mut state, feature, on);
                                }
                            },
                        }
                    }
                },
                Event::Key(key) => {
                    // Writing a note takes EVERY key, so it is answered before
                    // the movement keys rather than beside them. `j` typed into
                    // a note must be a letter, not a step down the list.
                    if state.editing {
                        let Some(id) = cursor_task(&laid, cursor) else {
                            state.editing = false;
                            continue;
                        };
                        // Enter FINISHES a note, and is answered before the
                        // shared command table: this is a one-line field, so
                        // Enter submits where in a document it would insert a
                        // newline (ADR 0065). The host sends a carriage return
                        // for it (crates/shell/src/input.rs), never the word,
                        // which is also why the tick below takes "\r".
                        if matches!(key.as_str(), "Escape" | "\r" | "\n") {
                            state.editing = false;
                            continue;
                        }
                        // **Every other key goes through the one table** (ADR
                        // 0065). The guard this replaces asked only whether the
                        // string held a control character, so a chord arrived
                        // as its own NAME and was typed: `⌃K` put the five
                        // characters `Ctrl+k` into the note.
                        //
                        // The caret is always at the end of this field, so the
                        // forward deletes have nothing to do and say so.
                        match keys::command(key) {
                            Some(Command::Erase(Erase::Back)) => edit_note(&mut state, id, |text| {
                                text.pop();
                            }),
                            Some(Command::Erase(Erase::WordBack)) => {
                                edit_note(&mut state, id, |text| {
                                    text.truncate(edit::word_left(text, text.len()));
                                })
                            },
                            Some(Command::Type(typed)) => {
                                let typed: String = keys::printable(&typed).collect();
                                if !typed.is_empty() {
                                    edit_note(&mut state, id, |text| text.push_str(&typed));
                                }
                            },
                            _ => {},
                        }
                        continue;
                    }
                    let at = nav_rows.iter().position(|i| *i == cursor).unwrap_or(0);
                    match key.as_str() {
                        " " | "\r" => match laid.get(cursor).map(|l| l.row) {
                            Some(Row::Task(task)) => toggle(&mut state, &task.id.clone()),
                            // Space means the same thing everywhere: mark what
                            // the cursor is on. On a heading, what it is on is
                            // the whole feature.
                            Some(Row::Heading(feature)) => {
                                let on = !feature_done(&state, feature);
                                set_feature(&mut state, feature, on);
                            },
                            None => {},
                        },
                        // Open or close a feature without touching a tick.
                        //
                        // NOT Tab. The host answers a bare Tab itself — complete,
                        // or focus the next pane — and no pane ever sees it
                        // (crates/shell/src/input.rs). Binding it here would be
                        // a key this plugin documents and the window swallows.
                        "ArrowRight" | "ArrowLeft" => {
                            if let Some(Row::Heading(feature)) = laid.get(cursor).map(|l| l.row) {
                                toggle_expanded(&mut state, feature);
                            }
                        },
                        // A note is the reason anyone reads a finished run, so
                        // it gets a key rather than only a mouse.
                        "i" => state.editing = cursor_task(&laid, cursor).is_some(),
                        // The arrows, and ONLY the arrows. `j` and `k` were a
                        // second way to do a thing that already had one, and a
                        // key that means "down" in one mode and "the letter j"
                        // in the other is a key nobody can trust.
                        "ArrowDown" => {
                            let next = (at + 1).min(nav_rows.len().saturating_sub(1));
                            cursor = nav_rows.get(next).copied().unwrap_or(0);
                            moved = true;
                        },
                        "ArrowUp" => {
                            let prev = at.saturating_sub(1);
                            cursor = nav_rows.get(prev).copied().unwrap_or(0);
                            moved = true;
                        },
                        _ => {},
                    }
                },
            }
        }

        // Heights change when a note opens, closes or wraps to a new line, and
        // the drawing must use the CURRENT picture even though the hit test
        // used the previous one.
        // **The ROW LIST is rebuilt too, not only the heights.** Ticking the last
        // task of a feature collapses it, which removes rows — and `rows` was
        // built before the events, so reusing it would draw the tasks of a
        // feature that just closed. The shell renders on damage, so "it fixes
        // itself next frame" is not true: there may be no next frame until the
        // reader does something else.
        let changed = layout_key(&state) != before;
        // Held rather than moved: the pre-event layout still borrows the first
        // list, and it is that layout the drawing falls back to when nothing
        // changed. Rebuilding unconditionally would be simpler and would ask the
        // host to measure every one of 405 rows a second time on every frame.
        let rebuilt = changed.then(|| self::rows(&features, &state));
        let rows: &[Row] = rebuilt.as_deref().unwrap_or(&rows);
        let laid = if changed { lay_out(rows, 0., text_w, px, &state) } else { laid };

        // A cursor below the fold is a cursor nobody can see moving, so the view
        // follows it — but only when a KEY moved it, never on a plain redraw.
        let view = (ctx.height - px(56.) - dropped_h).max(px(60.));
        // The list may have been rebuilt since the events ran, so find the row
        // again by name rather than trusting the position it had before.
        let cursor = if changed { cursor_index(&laid, &state.cursor) } else { cursor };
        if let Some(current) = laid.get(cursor) {
            state.scroll = follow_cursor(state.scroll, moved, current.y, current.height, view);
        }
        // Collapsing a feature shortens the list under the cursor, and a cursor
        // past the end indexes nothing — the view would then never follow it
        // again.
        // Written back as an id. Nothing downstream needs the position, and
        // storing one is what made the cursor drift when the list changed.
        state.cursor = laid.get(cursor).map(|l| row_id(&l.row).to_string()).unwrap_or_default();
        // The same shortening can leave the whole list above the viewport, with
        // nothing drawn and no way back.
        let content = laid.last().map_or(0., |l| l.y + l.height);
        state.scroll = state.scroll.min((content - view).max(0.)).max(0.);

        let mut b = Builder { elements: Vec::new() };
        let root = b.push(
            Kind::Clip,
            u32::MAX,
            vec![num("x", ctx.x), num("y", ctx.y), num("w", ctx.width), num("h", ctx.height)],
            None,
        );
        b.push(
            Kind::Rect,
            root,
            vec![
                num("x", ctx.x),
                num("y", ctx.y),
                num("w", ctx.width),
                num("h", ctx.height),
                str("color", PANEL),
                num("radius", px(12.)),
                num("border", px(1.)),
                str("border-color", EDGE),
            ],
            None,
        );

        let total: usize = features.iter().map(|f| f.tasks.len()).sum();
        let done = state.ticked.len().min(total);
        // The browser page counts notes beside ticks, because a run that is
        // "12 of 12" with four notes is not a pass and must not read as one.
        let issues = state.notes.len();
        let count = if issues > 0 {
            format!("Testing   {done} of {total} tried   {issues} with a note")
        } else {
            format!("Testing   {done} of {total} tried")
        };
        b.push(
            Kind::Text,
            root,
            vec![
                num("x", ctx.x + px(PAD)),
                num("y", ctx.y + px(16.)),
                num("font-size", px(13.5)),
                str("color", INK),
            ],
            Some(&count),
        );
        // A checklist that quietly stopped saving looks exactly like one that
        // is saving. Say which it is, where the count is already being read.
        if state.refused {
            let w = host_api::measure_text("not saved", px(11.));
            b.push(
                Kind::Text,
                root,
                vec![
                    num("x", ctx.x + ctx.width - px(PAD) - w),
                    num("y", ctx.y + px(17.)),
                    num("font-size", px(11.)),
                    str("color", ALARM),
                ],
                Some("not saved"),
            );
        }
        // The hint row, under the count. Right-aligning it beside the count put
        // the two on top of each other the moment the pane was narrow, which
        // the first capture showed.
        //
        // It says something DIFFERENT while a note is open, because the keys
        // mean something different there — that is the whole reason the mode
        // exists, and a hint that did not change would be lying about it.
        let hint_y = ctx.y + px(31.);
        let mut hint_x = ctx.x + px(PAD);
        if state.editing {
            b.push(
                Kind::Text,
                root,
                vec![
                    num("x", hint_x),
                    num("y", hint_y + px(2.5)),
                    num("font-size", px(10.5)),
                    str("color", ACCENT),
                ],
                Some("writing a note"),
            );
            hint_x += host_api::measure_text("writing a note", px(10.5)) + px(13.);
            hint_x = key_hint(&mut b, root, hint_x, hint_y, ctx.scale, "esc", "done");
            key_hint(&mut b, root, hint_x, hint_y, ctx.scale, "\u{232b}", "rub out");
        } else {
            hint_x = key_hint(&mut b, root, hint_x, hint_y, ctx.scale, "space", "tick this");
            hint_x = key_hint(&mut b, root, hint_x, hint_y, ctx.scale, "i", "write a note");
            key_hint(&mut b, root, hint_x, hint_y, ctx.scale, "\u{2191} \u{2193}", "move");
        }
        // The refusal or parse error, visible rather than a log line: either
        // the run file on disk was written against a different build (its
        // ticks were dropped rather than restored), or `testing.md` itself
        // did not parse. Sits between the hint row and the rule, and is what
        // `dropped_h` above reserved the room for.
        if let Some(msg) = &notice {
            b.push(
                Kind::Text,
                root,
                vec![
                    num("x", ctx.x + px(PAD)),
                    num("y", ctx.y + px(50.) + px(2.5)),
                    num("font-size", px(11.)),
                    str("color", ALARM),
                ],
                Some(msg),
            );
        }
        // A rule under the header, so the fixed part and the part that scrolls
        // under it are visibly two things.
        b.push(
            Kind::Rect,
            root,
            vec![
                num("x", ctx.x + px(PAD)),
                num("y", ctx.y + px(50.) + dropped_h),
                num("w", (ctx.width - px(PAD * 2.)).max(0.)),
                num("h", px(1.)),
                str("color", EDGE),
            ],
            None,
        );

        // **The list gets its own clip, and the header is not inside it.**
        //
        // Every row used to hang off the whole-pane clip and be drawn AFTER the
        // header, so a row scrolled up painted straight over the count and the
        // hint. `clip_for` in the host intersects every ancestor clip, so one
        // nested here is the whole fix — the rows cannot leave this rectangle
        // no matter how far the list is scrolled.
        let list = b.push(
            Kind::Clip,
            root,
            vec![
                num("x", ctx.x),
                num("y", top),
                num("w", ctx.width),
                num("h", (ctx.y + ctx.height - top).max(0.)),
            ],
            None,
        );

        for (index, l) in laid.iter().enumerate() {
            let y = top + l.y - state.scroll;
            // Off the top or off the bottom is not built at all. A list that
            // builds every row it has gets slower as it grows, and this one is
            // meant to hold four hundred. The top is the LIST's top, not the
            // pane's — a row between the header and here is clipped away, so
            // building it is work nobody sees.
            if y + l.height < top || y > ctx.y + ctx.height {
                continue;
            }
            match l.row {
                Row::Heading(feature) => {
                    let done = feature_done(&state, feature);
                    let shut = collapsed(&state, feature);
                    if index == cursor {
                        b.push(
                            Kind::Rect,
                            list,
                            vec![
                                num("x", ctx.x + px(4.)),
                                num("y", y),
                                num("w", ctx.width - px(8.)),
                                num("h", l.height),
                                str("color", WELL),
                                num("radius", px(5.)),
                            ],
                            None,
                        );
                    }
                    // The open/shut marker, and the LEFT HALF of this row's hit
                    // test — the click handler splits on the same x. A finished
                    // feature can be opened from here without losing a tick.
                    b.push(
                        Kind::Text,
                        list,
                        vec![
                            num("x", ctx.x + px(PAD)),
                            num("y", y + px(13.)),
                            num("font-size", px(11.)),
                            str("color", if done { DONE } else { DIM }),
                        ],
                        Some(if shut { "\u{25b8}" } else { "\u{25be}" }),
                    );
                    b.push(
                        Kind::Text,
                        list,
                        vec![
                            num("x", ctx.x + px(PAD + 14.)),
                            num("y", y + px(14.)),
                            num("font-size", px(12.5)),
                            // A finished feature goes quiet. The accent is for
                            // what still needs doing, and on a list of 54 the
                            // colour is the only thing that finds them.
                            // A finished feature goes quiet: the muted green
                            // this was is not a role, and the reason it was
                            // chosen was quietness, not hue. `DIM` keeps the
                            // reason; the green is still on the marker beside
                            // it, which is where it reads from.
                            str("color", if done { DIM } else { ACCENT }),
                        ],
                        Some(&format!("{}   {}", feature.id, feature.name)),
                    );
                    // Its own tally, right-aligned. Scrolling past a feature
                    // otherwise says nothing about whether it was finished.
                    let d = feature.tasks.iter().filter(|t| ticked(&state, &t.id)).count();
                    let n = feature.tasks.len();
                    let tally = if d == n { format!("all {n}") } else { format!("{d}/{n}") };
                    let w = host_api::measure_text(&tally, px(11.));
                    b.push(
                        Kind::Text,
                        list,
                        vec![
                            num("x", ctx.x + ctx.width - px(PAD) - w),
                            num("y", y + px(15.)),
                            num("font-size", px(11.)),
                            str("color", if d == n { DONE } else { DIM }),
                        ],
                        Some(&tally),
                    );
                },
                Row::Task(task) => {
                    let on = ticked(&state, &task.id);
                    // A tick carried from an earlier build. Drawn, and drawn
                    // DIFFERENTLY: it still says "I tried this", and it must
                    // never be read as "I tried this on what is running now".
                    let carried = stale_build(&state, &task.id);
                    let writing = state.editing && index == cursor;
                    // A hairline between tasks. Four hundred rows with nothing
                    // between them is one wall of text, and the eye has to
                    // count indents to find where a task starts.
                    b.push(
                        Kind::Rect,
                        list,
                        vec![
                            num("x", ctx.x + px(PAD)),
                            num("y", y),
                            num("w", (ctx.width - px(PAD * 2.)).max(0.)),
                            num("h", px(1.)),
                            str("color", EDGE),
                        ],
                        None,
                    );
                    if index == cursor {
                        b.push(
                            Kind::Rect,
                            list,
                            vec![
                                num("x", ctx.x + px(4.)),
                                num("y", y),
                                num("w", ctx.width - px(8.)),
                                num("h", l.height),
                                str("color", WELL),
                                num("radius", px(5.)),
                            ],
                            None,
                        );
                    }
                    // The tick box: a rect, filled when it is on. There is no
                    // checkbox primitive and none is needed.
                    b.push(
                        Kind::Rect,
                        list,
                        vec![
                            num("x", ctx.x + px(PAD)),
                            num("y", y + px(8.)),
                            num("w", px(13.)),
                            num("h", px(13.)),
                            // Green is this build. Amber and hollow is an
                            // older one — the colour says "answered" and the
                            // hollowness says "not here".
                            str("color", if on { DONE } else { PANEL }),
                            num("radius", px(3.)),
                            num("border", px(1.)),
                            str(
                                "border-color",
                                match (on, carried.is_some()) {
                                    (true, _) => DONE,
                                    (false, true) => CARRIED,
                                    (false, false) => FAINT,
                                },
                            ),
                        ],
                        None,
                    );
                    // A filled square and a ticked square look the same at a
                    // glance in a long list. The mark is what separates them.
                    if on || carried.is_some() {
                        b.push(
                            Kind::Text,
                            list,
                            vec![
                                num("x", ctx.x + px(PAD + 2.)),
                                num("y", y + px(7.)),
                                num("font-size", px(11.)),
                                str("color", if on { PANEL } else { CARRIED }),
                            ],
                            Some(if on { "\u{2713}" } else { "\u{2013}" }),
                        );
                    }
                    // The id, right-aligned and dim. It is what a tester types
                    // when they report one of these back, so it has to be on
                    // screen — but it is never what they read first.
                    let id_w = host_api::measure_text(&task.id, px(10.5));
                    b.push(
                        Kind::Text,
                        list,
                        vec![
                            num("x", ctx.x + ctx.width - px(PAD) - id_w),
                            num("y", y + px(6.)),
                            num("font-size", px(10.5)),
                            str("color", FAINT),
                        ],
                        Some(&task.id),
                    );
                    // WHICH build answered it, beside the id. A mark saying
                    // "not this build" and not saying which one is a question
                    // the reader cannot answer without leaving the pane.
                    if let Some(build) = carried {
                        let short: String = build.chars().take(8).collect();
                        let w = host_api::measure_text(&short, px(10.5));
                        b.push(
                            Kind::Text,
                            list,
                            vec![
                                num("x", ctx.x + ctx.width - px(PAD) - id_w - w - px(8.)),
                                num("y", y + px(6.)),
                                num("font-size", px(10.5)),
                                str("color", CARRIED),
                            ],
                            Some(&short),
                        );
                    }
                    let mut line_y = y + px(5.);
                    for line in &l.doing {
                        b.push(
                            Kind::Text,
                            list,
                            vec![
                                num("x", text_x),
                                num("y", line_y),
                                num("font-size", px(13.)),
                                str("color", if on { DIM } else { INK }),
                            ],
                            Some(line),
                        );
                        line_y += px(LINE_H);
                    }
                    for line in &l.pass {
                        b.push(
                            Kind::Text,
                            list,
                            vec![
                                num("x", text_x),
                                num("y", line_y),
                                num("font-size", px(11.5)),
                                str("color", DIM),
                            ],
                            Some(line),
                        );
                        line_y += px(PASS_H);
                    }
                    // The note. It is drawn in a warm colour rather than the
                    // grey of everything else BECAUSE it is the exception —
                    // scrolling a finished run, the notes are the only rows
                    // worth stopping on.
                    if !l.note.is_empty() {
                        let box_y = line_y + px(2.);
                        let box_h = px(5.) + l.note.len() as f32 * px(NOTE_H);
                        b.push(
                            Kind::Rect,
                            list,
                            vec![
                                num("x", text_x - px(6.)),
                                num("y", box_y),
                                num("w", (text_w + px(6.)).max(0.)),
                                num("h", box_h),
                                str("color", WELL),
                                num("radius", px(4.)),
                                num("border", px(1.)),
                                str("border-color", if writing { ACCENT } else { ALARM }),
                            ],
                            None,
                        );
                        let mut note_y = box_y + px(2.);
                        for line in &l.note {
                            b.push(
                                Kind::Text,
                                list,
                                vec![
                                    num("x", text_x),
                                    num("y", note_y),
                                    num("font-size", px(12.)),
                                    str("color", INK),
                                ],
                                Some(line),
                            );
                            note_y += px(NOTE_H);
                        }
                    }
                },
            }
        }

        // Written at the END of the frame, after every event has been applied,
        // so one write carries whatever this frame did rather than one write
        // per event. A refusal leaves `on_disk` alone, so the next frame tries
        // again — and frames only happen when something changed, so that is a
        // retry rather than a spin.
        let current = serde_json::to_string(&Persisted {
            build: ctx.build.clone(),
            ticked: state.ticked.clone(),
            stale: state.stale.clone(),
            notes: state.notes.clone(),
        })
        .unwrap_or_default();
        if state.on_disk.as_deref() != Some(current.as_str()) {
            if host_api::save(RUN_FILE, &current) {
                state.on_disk = Some(current);
                state.refused = false;
            } else {
                state.refused = true;
            }
        }

        Frame { elements: b.elements, state: serde_json::to_vec(&state).unwrap_or_default() }
    }
}

export!(Checklist);

#[cfg(test)]
mod colour_tests {
    use super::*;

    /// The twelve role names ForgeTerm ADR 0058 defines, copied here on purpose.
    ///
    /// A copy of a list is normally the thing that drifts, and that is exactly
    /// what this test is for: this plugin builds in a DIFFERENT repository from
    /// the host, so nothing else here can fail when the host's list changes.
    /// `forgeterm/plugins/plugin-api/src/lib.rs` documents the same twelve on
    /// `str`, and `crates/shell/src/render/mod.rs::Theme::token` answers them —
    /// when those move, this array is the line that has to move with them, and
    /// a name that is no longer a role fails here instead of painting the
    /// caller's fallback in silence (ADR 0005's prop bag never refuses).
    const ROLES: &[&str] = &[
        "bg",
        "panel",
        "raised",
        "separator",
        "accent",
        "ink.primary",
        "ink.secondary",
        "ink.tertiary",
        "ink.quaternary",
        "danger",
        "warn",
        "ok",
    ];

    /// Every colour this pane names is one the host can paint.
    ///
    /// **Mutation:** change any const above `Builder` to a name that reads fine
    /// and is not a role — `WELL` to `"surface"`, `DIM` to `"ink.dim"` — and
    /// this fails. Nothing else in this crate would: the host resolves an
    /// unknown name to the caller's default, so the pane would draw, and draw
    /// in the wrong colour, with no error anywhere.
    #[test]
    fn every_colour_const_names_a_role_the_host_paints() {
        for role in [PANEL, EDGE, WELL, ACCENT, INK, DIM, FAINT, DONE, CARRIED, ALARM] {
            assert!(ROLES.contains(&role), "{role} is not one of ADR 0058's twelve roles");
        }
    }

    /// **No colour in this file is a number or a hex string.**
    ///
    /// A test that only checked the consts above would pass while a new call
    /// site handed `int` a packed number straight past them — which is how the
    /// thirty-six literals this change removed got here in the first place, one
    /// reasonable call site at a time. So this reads the source itself, the same
    /// check `docs/conventions.md` FORGETERM-13 states in words.
    ///
    /// Neither forbidden form is spelled out anywhere in this module, comments
    /// included: the scan reads the whole file, so an example of the thing it
    /// bans would fail it.
    ///
    /// The needles are built at runtime rather than written out, so this test's
    /// own body is not a match for itself.
    ///
    /// **Mutation:** put any one of the old literals back — the card's packed
    /// panel colour, or the note box's warm dark as a hex string — and this
    /// fails. Removing the `str` import instead does not reach here; it fails to
    /// compile, which is the same wall one step earlier.
    #[test]
    fn no_call_site_paints_its_own_colour() {
        let source = include_str!("lib.rs");

        for key in ["color", "border-color"] {
            let packed = format!("int({key:?}");
            assert!(
                !source.contains(&packed),
                "{packed}…) sends a packed integer: a colour this pane owns and \
                 the user's theme cannot reach. Send a role with `str` instead."
            );
        }

        // A `"#rrggbb"` literal — the escape hatch ADR 0058 keeps for a wash no
        // token names. `notes` has three and has earned them; this pane has
        // none, and every colour it draws had a nearest role. Six hex digits
        // after the `#` is what tells a colour from a raw string's `"#`
        // terminator, which is the only other place those two characters meet
        // in this file.
        let bytes: Vec<char> = source.chars().collect();
        for i in 1..bytes.len() {
            if bytes[i] != '#' || bytes[i - 1] != '"' {
                continue;
            }
            let six = &bytes[i + 1..(i + 7).min(bytes.len())];
            assert!(
                !(six.len() == 6 && six.iter().all(|c| c.is_ascii_hexdigit())),
                "a hex colour literal is back at byte {i}: {}",
                six.iter().collect::<String>()
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The ordinary case: the run on disk was written against the SAME build
    /// that is asking for it, so it is restored exactly, and nothing is carried.
    #[test]
    fn same_build_restores_ticks() {
        let text = serde_json::to_string(&Persisted {
            build: "abc123".to_string(),
            ticked: vec!["F53.T1".to_string()],
            stale: Vec::new(),
            notes: vec![("F53.T2".to_string(), "worked".to_string())],
        })
        .unwrap();

        let (ticked, notes, stale) = restore_for_build(&text, "abc123");
        assert_eq!(ticked, vec!["F53.T1".to_string()]);
        assert_eq!(notes, vec![("F53.T2".to_string(), "worked".to_string())]);
        assert!(stale.is_empty(), "a matching build carries nothing");
    }

    /// **A tick from another build is KEPT and MARKED, not dropped.**
    ///
    /// It used to be dropped, on the reasoning in `conducks-visuals` §6 — a
    /// tick carried across a build looks like proof and is not. The reasoning
    /// holds; the instrument did not. The build id is a git hash, so every
    /// commit voided the whole pass, including a commit that touched only
    /// markdown: measured at eight commits in one afternoon, each one clearing
    /// a tester's work. Marking answers the same worry and loses nothing.
    ///
    /// **Mutation proof:** make the mismatch branch return empty vectors again
    /// and `stale` comes back empty, so the first assertion fails.
    #[test]
    fn a_tick_from_another_build_is_carried_and_named() {
        let text = serde_json::to_string(&Persisted {
            build: "old-build".to_string(),
            ticked: vec!["F53.T1".to_string()],
            stale: Vec::new(),
            notes: vec![("F53.T2".to_string(), "worked".to_string())],
        })
        .unwrap();

        let (ticked, notes, stale) = restore_for_build(&text, "new-build");
        assert_eq!(
            stale,
            vec![("F53.T1".to_string(), "old-build".to_string())],
            "the tick survives, carrying the build it was made under"
        );
        assert!(ticked.is_empty(), "and it is NOT this build's — that is the whole distinction");
        assert_eq!(
            notes,
            vec![("F53.T2".to_string(), "worked".to_string())],
            "a note is what the tester WROTE and is never build-specific"
        );
    }

    /// A tick carried twice keeps naming the build it was MADE under, not the
    /// one it was last read on. Otherwise every rebuild rewrites its own hash
    /// over the answer and the mark becomes "carried from the build before
    /// this one", which is true of everything and says nothing.
    #[test]
    fn a_carried_tick_keeps_the_build_it_was_made_under() {
        let text = serde_json::to_string(&Persisted {
            build: "second".to_string(),
            ticked: Vec::new(),
            stale: vec![("F1.T1".to_string(), "first".to_string())],
            notes: Vec::new(),
        })
        .unwrap();

        let (_, _, stale) = restore_for_build(&text, "third");
        assert_eq!(stale, vec![("F1.T1".to_string(), "first".to_string())]);
    }

    /// Ticked again on this build, so it is no longer carried: one task never
    /// holds two answers, and the fresher one wins.
    #[test]
    fn ticking_again_on_this_build_settles_it() {
        let text = serde_json::to_string(&Persisted {
            build: "now".to_string(),
            ticked: vec!["F1.T1".to_string()],
            stale: vec![("F1.T1".to_string(), "before".to_string())],
            notes: Vec::new(),
        })
        .unwrap();

        let (ticked, _, stale) = restore_for_build(&text, "now");
        assert_eq!(ticked, vec!["F1.T1".to_string()]);
        assert!(stale.is_empty(), "the current answer supersedes the carried one");
    }

    /// **Touching a carried tick settles it, both ways.** Unticking is the
    /// tester saying it is NOT done — leaving the old build's yes beside that
    /// would put two answers on one task.
    #[test]
    fn untick_removes_a_carried_answer_too() {
        let mut state = State {
            ticked: Vec::new(),
            stale: vec![("F1.T1".to_string(), "before".to_string())],
            ..State::default()
        };
        toggle(&mut state, "F1.T1");
        assert!(ticked(&state, "F1.T1"), "it is now this build's yes");
        assert!(stale_build(&state, "F1.T1").is_none(), "and no longer carried");

        toggle(&mut state, "F1.T1");
        assert!(!ticked(&state, "F1.T1"), "off again");
        assert!(stale_build(&state, "F1.T1").is_none(), "and the old yes did not come back");
    }

    /// An OLD run file — written before `stale` existed — still parses, and its
    /// ticks migrate rather than vanishing. `#[serde(default)]` is what makes
    /// this true, and a format change that silently discarded a tester's file
    /// would be the same defect this whole change exists to remove.
    #[test]
    fn a_file_written_before_this_existed_still_carries_its_ticks() {
        let old = r#"{"build":"old","ticked":["F1.T1","F1.T2"],"notes":[]}"#;
        let (ticked, _, stale) = restore_for_build(old, "new");
        assert!(ticked.is_empty());
        assert_eq!(
            stale,
            vec![
                ("F1.T1".to_string(), "old".to_string()),
                ("F1.T2".to_string(), "old".to_string()),
            ]
        );
    }

    /// The counter-case a build-comparison bug could hide behind: no run file
    /// exists yet (a fresh project, or `load` answering nothing). That is an
    /// ABSENCE, not a mismatch — reporting one here would tell a first-time
    /// user their ticks were carried when none ever existed.
    #[test]
    fn a_missing_run_carries_nothing() {
        let (ticked, notes, stale) = restore_for_build("", "new-build");
        assert!(ticked.is_empty());
        assert!(notes.is_empty());
        assert!(stale.is_empty(), "absence of a run file is not a carry");
    }

    // `lay_out`'s new "no Pass: clause -> no pass line" branch (the one
    // change reading the real source makes to the drawing, see its own
    // comment above) is NOT unit tested here: `lay_out` calls `wrap`, which
    // calls `host_api::measure_text` — a wasm import with no native
    // implementation, so invoking it under a plain `cargo test` on this
    // machine aborts the whole test binary (SIGABRT, "unreachable code"),
    // exactly the way it did when tried. `rows()`/`Feature`/`Task` are
    // exercised instead through `parser.rs`'s own tests, which cover the
    // data this branch reads without needing the host. Verifying the drawn
    // pixels themselves needs the running ForgeTerm host — named as a gap
    // for the orchestrator, not silently skipped.
}

#[cfg(test)]
mod view_tests {
    use super::*;

    fn feature_with(id: &str, tasks: &[&str]) -> Feature {
        Feature {
            id: id.to_string(),
            name: format!("feature {id}"),
            how: String::new(),
            note: String::new(),
            tasks: tasks
                .iter()
                .map(|t| Task { id: t.to_string(), text: "do it".into(), pass: None })
                .collect(),
        }
    }

    /// **The bug this whole change started from.** A wheel event moves `scroll`;
    /// the frame that follows must leave it alone. It did not: the follow ran
    /// every frame, the cursor sits on row 0 at y=0, so every frame decided the
    /// cursor was above the view and put `scroll` back to 0.
    ///
    /// **Mutation proof:** delete the `if !moved { return scroll }` guard and
    /// this fails, returning 0.
    #[test]
    fn a_redraw_does_not_undo_a_scroll() {
        assert_eq!(follow_cursor(900., false, 0., 30., 400.), 900.);
    }

    /// The other half: when a KEY moved the cursor, the view must follow, or the
    /// cursor walks off screen and nobody can see where they are.
    ///
    /// **Mutation proof:** make the function always return `scroll` and both of
    /// these fail.
    #[test]
    fn a_moved_cursor_pulls_the_view_to_it() {
        assert_eq!(follow_cursor(900., true, 0., 30., 400.), 0., "above the view");
        assert_eq!(follow_cursor(0., true, 500., 30., 400.), 130., "below the view");
        assert_eq!(follow_cursor(100., true, 200., 30., 400.), 100., "already visible, unchanged");
    }

    /// A feature is marked exactly when all its tasks are, and an EMPTY feature
    /// is not marked — otherwise it would draw as finished and collapse to
    /// nothing, which reads as work someone did.
    ///
    /// **Mutation proof:** drop the `!feature.tasks.is_empty()` clause and the
    /// last assertion fails.
    #[test]
    fn a_feature_is_marked_exactly_when_every_task_is() {
        let f = feature_with("F1", &["F1.T1", "F1.T2"]);
        let mut state = State::default();
        assert!(!feature_done(&state, &f), "nothing ticked");
        toggle(&mut state, "F1.T1");
        assert!(!feature_done(&state, &f), "half ticked is not marked");
        toggle(&mut state, "F1.T2");
        assert!(feature_done(&state, &f), "all ticked marks it, with nothing else stored");
        assert!(!feature_done(&state, &feature_with("F9", &[])), "an empty feature is not done");
    }

    /// Marking the section marks every task, and unmarking clears them — the
    /// direction the reader asked for that does not fall out for free.
    ///
    /// **Mutation proof:** make `set_feature` skip tasks already in the wanted
    /// state incorrectly (e.g. always toggle) and the second half fails, because
    /// a half-ticked feature would end up inverted rather than uniform.
    #[test]
    fn marking_a_section_marks_all_of_it_from_any_starting_point() {
        let f = feature_with("F1", &["F1.T1", "F1.T2", "F1.T3"]);
        let mut state = State::default();
        toggle(&mut state, "F1.T2"); // start half-done, the case that catches a blind toggle
        set_feature(&mut state, &f, true);
        assert!(f.tasks.iter().all(|t| ticked(&state, &t.id)), "all on");
        set_feature(&mut state, &f, false);
        assert!(f.tasks.iter().all(|t| !ticked(&state, &t.id)), "all off");
    }

    /// A finished feature hides its tasks, and opening it does NOT untick it.
    /// That separation is the point: if the only way to look were to unmark,
    /// looking at what you did would destroy the record of having done it.
    ///
    /// **Mutation proof:** make `collapsed` ignore `expanded` and the third
    /// assertion fails.
    #[test]
    fn a_finished_feature_collapses_and_can_be_opened_without_unticking() {
        let f = feature_with("F1", &["F1.T1"]);
        let mut state = State::default();
        assert!(!collapsed(&state, &f), "unfinished stays open");
        toggle(&mut state, "F1.T1");
        assert!(collapsed(&state, &f), "finished collapses");
        toggle_expanded(&mut state, &f);
        assert!(!collapsed(&state, &f), "opened");
        assert!(feature_done(&state, &f), "and still marked — opening touched no tick");
    }

    /// The row list is what the hit test, the keyboard and the drawing all walk,
    /// so a collapsed feature must vanish from IT rather than merely be skipped
    /// when drawing. A row that is drawn nowhere but still in the list is a row
    /// a click can land on.
    ///
    /// **Mutation proof:** remove the `continue` in `rows` and the count is 4.
    #[test]
    fn a_collapsed_feature_contributes_one_row() {
        let f = feature_with("F1", &["F1.T1", "F1.T2", "F1.T3"]);
        let list = [&f];
        let mut state = State::default();
        assert_eq!(rows(&list, &state).len(), 4, "heading plus three tasks");
        set_feature(&mut state, &f, true);
        assert_eq!(rows(&list, &state).len(), 1, "collapsed: the heading alone");
    }
}

#[cfg(test)]
mod invariant_tests {
    use super::*;

    /// `ticked` is binary-searched, so it must be SORTED at all times. Toggling
    /// in a scrambled order is the case that catches an insert that assumes
    /// arrival order.
    ///
    /// **Mutation proof:** change `toggle`'s `Err(at) => insert(at, ..)` to
    /// `push(..)` and this fails — the list stops being sorted and the lookups
    /// below start missing.
    #[test]
    fn the_ticked_list_stays_sorted_however_it_is_built() {
        let mut state = State::default();
        for id in ["F9.T2", "F1.T1", "F54.T7", "F1.T10", "F2.T1"] {
            toggle(&mut state, id);
        }
        let mut expected = state.ticked.clone();
        expected.sort();
        assert_eq!(state.ticked, expected, "sorted");
        for id in ["F9.T2", "F1.T1", "F54.T7", "F1.T10", "F2.T1"] {
            assert!(ticked(&state, id), "{id} must be found after an out-of-order build");
        }
        toggle(&mut state, "F1.T1");
        assert!(!ticked(&state, "F1.T1"), "and untoggling still removes the right one");
    }

    /// A run file written before the sorted rule — or edited by hand — arrives
    /// in whatever order it was in. Restoring it unsorted makes a binary search
    /// answer "not ticked" for most of what the file holds, which reads as the
    /// ticks having been lost rather than misread.
    ///
    /// **Mutation proof:** drop the `saved.ticked.sort()` in `restore_for_build`
    /// and this fails on the entries that fall out of order.
    #[test]
    fn a_run_file_in_any_order_restores_every_tick() {
        let text = r#"{"build":"b1","ticked":["F9.T2","F1.T1","F54.T7","F2.T1"],"notes":[]}"#;
        let (ticks, _, carried) = restore_for_build(text, "b1");
        assert!(carried.is_empty(), "same build carries nothing");
        let mut state = State::default();
        state.ticked = ticks;
        for id in ["F9.T2", "F1.T1", "F54.T7", "F2.T1"] {
            assert!(ticked(&state, id), "{id} was in the file and must be found");
        }
    }
}

#[cfg(test)]
mod cursor_tests {
    use super::*;

    fn feature_with(id: &str, tasks: &[&str]) -> Feature {
        Feature {
            id: id.to_string(),
            name: format!("feature {id}"),
            how: String::new(),
            note: String::new(),
            tasks: tasks
                .iter()
                .map(|t| Task { id: t.to_string(), text: "do it".into(), pass: None })
                .collect(),
        }
    }

    /// Rows carry no y or height here — `cursor_index` only reads the row's id,
    /// so a hand-built list is a fair stand-in for a measured one.
    fn laid_from<'a>(rows: &'a [Row<'a>]) -> Vec<Laid<'a>> {
        rows.iter()
            .map(|row| Laid {
                row,
                y: 0.,
                height: 0.,
                doing: Vec::new(),
                pass: Vec::new(),
                note: Vec::new(),
            })
            .collect()
    }

    /// **The wart this replaced an index to fix.** Mark a section ABOVE where
    /// you are working: it collapses, every row below shifts up, and an index
    /// cursor is now pointing at a different task than the one it was on.
    ///
    /// **Mutation proof:** have `cursor_index` return its argument parsed as a
    /// number, or simply 0, and this fails — the cursor lands on the wrong row.
    #[test]
    fn the_cursor_stays_on_its_row_when_the_list_shortens_above_it() {
        let a = feature_with("F1", &["F1.T1", "F1.T2"]);
        let b = feature_with("F2", &["F2.T1", "F2.T2"]);
        let features = [&a, &b];
        let mut state = State::default();
        state.cursor = "F2.T2".to_string();

        let open = rows(&features, &state);
        let laid = laid_from(&open);
        assert_eq!(cursor_index(&laid, &state.cursor), 5, "last row of six");

        // Finish the feature ABOVE it. F1 collapses and takes two rows away.
        set_feature(&mut state, &a, true);
        let shorter = rows(&features, &state);
        let laid = laid_from(&shorter);
        assert_eq!(shorter.len(), 4, "F1 is one row now, F2 still three");
        let at = cursor_index(&laid, &state.cursor);
        assert_eq!(row_id(&laid[at].row), "F2.T2", "still on the row it was on");
    }

    /// When the row itself goes — its own feature collapsed — the cursor falls
    /// back to that feature rather than to the top of the list. Being thrown to
    /// row 0 in a 405-row document loses your place completely.
    ///
    /// **Mutation proof:** delete the `split_once('.')` fallback and this
    /// returns 0, landing on F1's heading instead of F2's.
    #[test]
    fn a_cursor_whose_row_vanished_falls_back_to_its_feature() {
        let a = feature_with("F1", &["F1.T1"]);
        let b = feature_with("F2", &["F2.T1"]);
        let features = [&a, &b];
        let mut state = State::default();
        state.cursor = "F2.T1".to_string();

        set_feature(&mut state, &b, true); // the cursor's OWN feature closes
        let shorter = rows(&features, &state);
        let laid = laid_from(&shorter);
        let at = cursor_index(&laid, &state.cursor);
        assert_eq!(row_id(&laid[at].row), "F2", "fell back to the feature, not to the top");
    }
}

