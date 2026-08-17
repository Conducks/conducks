#include <string>

namespace ledger {

constexpr int MAX_RETRIES = 3;

class Account {
public:
    explicit Account(long balance) : balance_(balance) {}
    void post(long amount) { balance_ += amount; }
    long balance() const { return balance_; }
private:
    long balance_;
};

struct AccountId {
    unsigned long raw;
};

enum class Status { Active, Frozen };

template <typename T>
T identity(T value) { return value; }

bool transfer(Account &from, Account &to, long amount) {
    if (amount <= 0) return false;
    from.post(-amount);
    to.post(amount);
    return true;
}

}  // namespace ledger
