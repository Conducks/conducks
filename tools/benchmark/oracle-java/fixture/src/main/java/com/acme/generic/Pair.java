package com.acme.generic;

// Reached ONLY through a diamond `new Pair<>(…)`, nothing called on it.
public class Pair<A, B> {
    public Pair(A a, B b) { }
}
