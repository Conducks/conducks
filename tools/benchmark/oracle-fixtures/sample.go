package ledger

import "fmt"

const MaxRetries = 3

var DefaultName = "conducks"

type Account struct {
	ID      uint64
	Balance int64
}

type Ledger interface {
	Post(amount int64) error
}

type AccountID = uint64

func NewAccount(id uint64) *Account {
	return &Account{ID: id}
}

func (a *Account) Post(amount int64) error {
	a.Balance += amount
	return nil
}

func Transfer(from *Account, to *Account, amount int64) bool {
	if amount <= 0 {
		return false
	}
	fmt.Println("transfer")
	return true
}
