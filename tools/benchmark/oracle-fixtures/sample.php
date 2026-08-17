<?php

namespace Conducks\Ledger;

const MAX_RETRIES = 3;

interface Ledger
{
    public function post(int $amount): void;
}

trait Auditable
{
    public function record(string $entry): bool
    {
        return $entry !== '';
    }
}

class Account implements Ledger
{
    use Auditable;

    private int $balance;

    public function __construct(int $balance)
    {
        $this->balance = $balance;
    }

    public function post(int $amount): void
    {
        $this->balance += $amount;
    }

    public function balance(): int
    {
        return $this->balance;
    }
}

class SavingsAccount extends Account
{
    public function rate(): float
    {
        return 0.05;
    }
}

function transfer(Account $from, Account $to, int $amount): bool
{
    if ($amount <= 0) {
        return false;
    }
    $from->post(-$amount);
    $to->post($amount);
    return true;
}
