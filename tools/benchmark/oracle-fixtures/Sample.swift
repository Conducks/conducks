import Foundation

let maxRetries = 3

protocol Ledger {
    func post(amount: Int64)
}

struct AccountID {
    let raw: UInt64
}

enum Status {
    case active
    case frozen
}

class Account: Ledger {
    var balance: Int64

    init(balance: Int64) {
        self.balance = balance
    }

    func post(amount: Int64) {
        balance += amount
    }
}

extension Account {
    func describe() -> String {
        return "account"
    }
}

func transfer(from: Account, to: Account, amount: Int64) -> Bool {
    if amount <= 0 { return false }
    from.post(amount: -amount)
    to.post(amount: amount)
    return true
}
