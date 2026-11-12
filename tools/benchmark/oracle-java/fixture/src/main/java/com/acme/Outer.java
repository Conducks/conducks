package com.acme;

class Outer {
    static class Inner {
        static void ping() {}
    }

    static class Unused {                          // DEAD
        void nothing() {}
    }
}
