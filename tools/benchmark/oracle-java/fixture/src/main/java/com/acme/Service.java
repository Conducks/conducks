package com.acme;

class Service {
    private int count;
    private int unusedField;                       // DEAD

    void run() { count++; }

    void deadMethod() { count--; }                 // DEAD
}
