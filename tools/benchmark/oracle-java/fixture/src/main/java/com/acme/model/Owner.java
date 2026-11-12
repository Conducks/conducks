package com.acme.model;

public class Owner {
    private final String name;

    public Owner(String name) { this.name = name; }

    public String getName() { return name; }

    int helper() { return name.length(); }        // DEAD
}
