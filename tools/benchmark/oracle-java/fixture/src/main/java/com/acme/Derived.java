package com.acme;

class Derived extends Base {
    @Override
    String describe() { return "derived"; }       // live through dispatch
}
