use std::collections::HashMap;

pub const MAX_RETRIES: u32 = 3;
static DEFAULT_NAME: &str = "conducks";

pub struct Account { pub id: u64, balance: i64 }

pub enum Status { Active, Frozen }

pub union Raw { int_value: u32, float_value: f32 }

pub trait Ledger { fn post(&self, amount: i64); }

impl Ledger for Account {
    fn post(&self, amount: i64) { let _ = amount; }
}

impl Account {
    pub fn new(id: u64) -> Self { Account { id, balance: 0 } }
    pub fn balance(&self) -> i64 { self.balance }
}

pub mod audit {
    pub fn record(entry: &str) -> bool { !entry.is_empty() }
}

pub fn transfer(from: &mut Account, to: &mut Account, amount: i64) -> bool {
    if amount <= 0 { return false; }
    let _index: HashMap<String, u64> = HashMap::new();
    from.post(-amount);
    to.post(amount);
    true
}

pub type AccountId = u64;
