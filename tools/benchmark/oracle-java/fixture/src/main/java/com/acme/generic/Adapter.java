package com.acme.generic;

// Reached ONLY as a generic superclass: `extends Adapter<String>`.
public abstract class Adapter<T> {
    public abstract T read();
}
