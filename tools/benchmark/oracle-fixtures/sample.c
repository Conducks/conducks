#include <stdio.h>

#define MAX_RETRIES 3

typedef unsigned long AccountId;

struct Account {
    AccountId id;
    long balance;
};

enum Status { ACTIVE, FROZEN };

union Raw {
    unsigned int int_value;
    float float_value;
};

static long default_balance = 0;

void post(struct Account *account, long amount) {
    account->balance += amount;
}

int transfer(struct Account *from, struct Account *to, long amount) {
    if (amount <= 0) return 0;
    post(from, -amount);
    post(to, amount);
    return 1;
}
