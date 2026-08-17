package com.conducks.ledger;

import java.util.List;

public interface Ledger {
    void post(long amount);
}

class Account implements Ledger {
    private long balance;
    public static final int MAX_RETRIES = 3;

    public Account(long balance) { this.balance = balance; }

    public void post(long amount) { this.balance += amount; }

    public long getBalance() { return balance; }

    enum Status { ACTIVE, FROZEN }
}

class Transfer {
    static boolean run(Account from, Account to, long amount) {
        if (amount <= 0) return false;
        from.post(-amount);
        to.post(amount);
        return true;
    }
}
