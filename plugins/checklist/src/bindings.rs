//! A vendored copy of ForgeTerm's plugin-authoring surface
//! (`forgeterm/plugins/plugin-api`), because this plugin now lives in a
//! different repository than the host it draws inside (ForgeTerm ADR 0035).
//!
//! `wit/plugin.wit` beside this file is copied byte-for-byte from ForgeTerm's
//! `wit/plugin.wit` and is FROZEN — the contract this crate binds against,
//! owned there, not here. If it ever needs to change, that change happens in
//! ForgeTerm first and this copy is updated to match, never the other way.
//!
//! Everything below this line is the same small authoring surface
//! `forgeterm-plugin-api` gives every other plugin: typed `num`/`int` helpers
//! over the raw `Prop` bag, so a mistyped key does not compile into a prop the
//! host silently ignores.

wit_bindgen::generate!({
    path: "wit",
    world: "plugin",
    // `export!` is invoked from `lib.rs`, a different module than this one —
    // tell it where the generated types actually live so that call resolves.
    // (`forgeterm-plugin-api` needs the same option for the same reason, one
    // level further out: its callers are a different CRATE, not just a
    // different module.)
    pub_export_macro: true,
    default_bindings_module: "crate::bindings",
    // Only for this module's own counter-test below, which checks a helper's
    // output against a hand-built `Prop` with `==` — nothing in the plugin
    // needs this at runtime. `Debug` is already derived by the macro; only
    // `PartialEq` is missing (the same reason `forgeterm-plugin-api` adds it).
    additional_derives: [PartialEq],
});

pub use forgeterm::ui::host_api;
pub use forgeterm::ui::types::{Element, Event, Kind, Prop, Value};

/// A floating-point prop: position, size, radius, border width, font size —
/// every measurement in `wit/plugin.wit`'s node vocabulary is one of these.
pub fn num(key: &str, v: f32) -> Prop {
    Prop { key: key.to_string(), value: Value::Num(v) }
}

/// An integer prop. Today that means a packed `0xRRGGBB` colour — `color` and
/// `border-color` are the only int-valued keys the host reads.
pub fn int(key: &str, v: u32) -> Prop {
    Prop { key: key.to_string(), value: Value::Int(v) }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The helper must produce the exact `Prop` a plugin author would
    /// otherwise hand-write against a raw key — that equivalence is the
    /// entire point of having the helper. Carried over from
    /// `forgeterm-plugin-api`'s own test of the same guarantee.
    #[test]
    fn num_matches_the_raw_prop_it_replaces() {
        let raw = Prop { key: "x".to_string(), value: Value::Num(12.5) };
        assert_eq!(num("x", 12.5), raw);
    }

    #[test]
    fn int_matches_the_raw_prop_it_replaces() {
        let raw = Prop { key: "color".to_string(), value: Value::Int(0xe08a4b) };
        assert_eq!(int("color", 0xe08a4b), raw);
    }
}
