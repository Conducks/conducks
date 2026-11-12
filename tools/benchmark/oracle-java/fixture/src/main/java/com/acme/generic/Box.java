package com.acme.generic;

// Reached ONLY through a diamond: `new Box<>(1)`.
public class Box<T> {
    private final T value;
    public Box(T value) { this.value = value; }
    public T get() { return value; }
}
