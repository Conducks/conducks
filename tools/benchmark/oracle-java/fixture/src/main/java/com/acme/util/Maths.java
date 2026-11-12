package com.acme.util;

public final class Maths {
    private Maths() {}

    public static int square(int x) { return x * x; }

    public static int cube(int x) { return x * x * x; }       // DEAD
}
