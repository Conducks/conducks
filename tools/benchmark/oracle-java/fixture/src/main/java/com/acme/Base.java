package com.acme;

class Base {
    String describe() { return "base"; }

    String template() { return "<" + describe() + ">"; }
}
