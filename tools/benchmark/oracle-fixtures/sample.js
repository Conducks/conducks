const fs = require('node:fs');

const MAX_RETRIES = 3;

class Entry {
  label() {
    return 'entry';
  }
}

class Account extends Entry {
  constructor(id) {
    super();
    this.id = id;
    this.balance = 0;
  }

  post(amount) {
    this.balance += amount;
  }

  static build(id) {
    return new Account(id);
  }
}

function audit(entry) {
  return entry.label().length > 0;
}

const reconcile = function (a, b) {
  return a.balance - b.balance;
};

const summary = () => fs.existsSync('/dev/null');

module.exports = { Account, Entry, audit, reconcile, summary, MAX_RETRIES };
