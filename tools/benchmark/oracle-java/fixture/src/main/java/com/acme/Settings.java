package com.acme;

import java.util.List;

// Field-level bait for UNUSED_MEMBER: every field is used except `stale` and `orphanList`.
class Settings {
    private final String name;                 // written in the constructor through a shadowing param
    private int hits;                          // only `this.hits++`
    private String secret = "s";               // read only by the nested class
    @Deprecated private int legacy;            // annotated: a framework may set it
    private int stale;                         // DEAD
    private List<String> orphanList;           // DEAD (object-typed)
    private static final long serialVersionUID = 1L;

    Settings(String name) { this.name = name; }

    void hit() { this.hits++; }

    String describe() { return name + hits + new Peek().look(this); }

    class Peek {
        String look(Settings s) { return s.secret; }
    }
}
