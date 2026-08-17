import { readFileSync } from 'node:fs';

export const MAX_RETRIES = 3;

export type AccountId = string;

export interface Ledger {
  balance: number;
  post(amount: number): void;
}

export enum Currency {
  Eur = 'EUR',
  Usd = 'USD',
}

export abstract class Entry {
  abstract label(): string;
}

export class Account extends Entry implements Ledger {
  public balance = 0;
  private readonly id: AccountId;

  constructor(id: AccountId) {
    super();
    this.id = id;
  }

  label(): string {
    return this.id;
  }

  post(amount: number): void {
    this.balance += amount;
  }

  static build(id: AccountId): Account {
    return new Account(id);
  }
}

export function audit(entry: Entry): boolean {
  return entry.label().length > 0;
}

export const reconcile = (a: Account, b: Account): number => a.balance - b.balance;

export namespace Reports {
  export function summary(): string {
    return readFileSync('/dev/null', 'utf8');
  }
}
