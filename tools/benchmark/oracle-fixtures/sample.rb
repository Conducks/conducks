require 'json'

MAX_RETRIES = 3

module Audit
  def self.record(entry)
    !entry.empty?
  end
end

class Account
  include Audit

  attr_reader :balance

  def initialize(balance)
    @balance = balance
  end

  def post(amount)
    @balance += amount
  end

  def self.build(balance)
    new(balance)
  end
end

class SavingsAccount < Account
  def rate
    0.05
  end
end

def transfer(from, to, amount)
  return false if amount <= 0
  from.post(-amount)
  to.post(amount)
  true
end
