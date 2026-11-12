package com.acme;

import java.util.function.Supplier;

// Member-level bait for UNUSED_MEMBER: every method here is live except `spin` and `unused`.
class Workflow {
    abstract static class Step {
        abstract String go();
        String twice() { return go() + go(); }      // template method: the base calls its own hook
    }

    static class Fetch extends Step {
        String go() { return "fetch"; }            // override, called only through Step
    }

    static class Inner {
        String call(Workflow w) { return w.secret(); }
    }

    private String secret() { return "s"; }      // private, called only by the nested class

    String viaLambda() {
        Supplier<String> s = () -> lambdaOnly();
        return s.get();
    }

    private String lambdaOnly() { return "l"; }  // called only inside a lambda

    String forTests() { return "t"; }            // called only from AppTest

    Step anonymous() {
        return new Step() {
            String go() { return "anon"; }         // anonymous override
        };
    }

    int spin(int n) { return n <= 0 ? 0 : spin(n - 1); }   // DEAD: recursion only

    void unused() { }                            // DEAD

    String run() {
        Step step = new Fetch();
        return step.twice() + new Inner().call(this) + viaLambda() + anonymous().twice();
    }
}
