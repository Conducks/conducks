package com.acme.model;

public record Point(int x, int y) {
    public double norm() { return Math.sqrt(x * x + y * y); }   // DEAD
}
