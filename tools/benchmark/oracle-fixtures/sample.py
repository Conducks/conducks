import json
from dataclasses import dataclass

MAX_RETRIES = 3


class Entry:
    def label(self):
        return "entry"


@dataclass
class Account(Entry):
    identifier: str
    balance: int = 0

    def post(self, amount):
        self.balance += amount

    @staticmethod
    def build(identifier):
        return Account(identifier)

    @property
    def label(self):
        return self.identifier


def audit(entry):
    return len(entry.label) > 0


async def reconcile(a, b):
    return a.balance - b.balance


def summary():
    return json.dumps({"retries": MAX_RETRIES})
