package com.acme.model;

public enum Color {
    RED, GREEN;

    public Color dark() { return this; }           // DEAD
}
