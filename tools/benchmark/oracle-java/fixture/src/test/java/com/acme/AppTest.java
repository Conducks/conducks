package com.acme;

import com.acme.util.TestHelpers;

class AppTest {
    void usesHelper() {
        if (TestHelpers.help() != 42) throw new AssertionError();
    }

    void usesWorkflow() {
        if (new Workflow().forTests().isEmpty()) throw new AssertionError();
    }
}
