package com.acme.util;

public final class Strings {
    private Strings() {}

    public static String trimAll(String s) { return s.trim(); }

    public static String upper(String s) { return s.toUpperCase(); }

    public static String neverCalled(String s) { return s; }   // DEAD
}
