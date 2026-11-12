package com.acme.shapes;

public class Circle implements Shape {
    private final double r;

    public Circle(double r) { this.r = r; }

    @Override
    public double area() { return Math.PI * r * r; }

    public double radius() { return r; }           // DEAD
}
