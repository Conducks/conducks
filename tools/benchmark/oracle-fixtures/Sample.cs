using System;

namespace Conducks.Ledger
{
    public interface ILedger
    {
        void Post(long amount);
    }

    public enum Status { Active, Frozen }

    public struct AccountId
    {
        public ulong Raw;
    }

    public class Account : ILedger
    {
        public const int MaxRetries = 3;
        private long balance;

        public Account(long balance) { this.balance = balance; }

        public long Balance { get { return balance; } }

        public void Post(long amount) { balance += amount; }
    }

    public static class Transfer
    {
        public static bool Run(Account from, Account to, long amount)
        {
            if (amount <= 0) return false;
            from.Post(-amount);
            to.Post(amount);
            return true;
        }
    }
}
