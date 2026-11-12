package com.acme;

final class Registry {
    private Registry() {}

    static void register(Class<?> type) { System.out.println(type.getName()); }
}
