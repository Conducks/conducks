<!-- description: Copy writing standards — tone, voice, microcopy, button labels, error messages, empty states, and what generic startup language is banned. -->

# Presentation — Copy Standards

> Every word is a UI decision. Unclear copy is a bug.

---

## Voice and tone

**Direct over diplomatic.** Say what the action does. Do not soften it with hedging language.

| Wrong | Correct |
|---|---|
| "You may want to consider saving your changes" | "Save your changes" |
| "It seems like something went wrong" | "Something went wrong. Try again." |
| "We were unable to process your request at this time" | "Request failed. Check your connection and try again." |
| "Are you sure you want to delete this?" | "Delete this item? This can't be undone." |

**Specific over vague.**

| Wrong | Correct |
|---|---|
| "An error occurred" | "Couldn't connect to the server" |
| "Invalid input" | "Email address is not valid" |
| "Something went wrong" | "Payment failed — your card was declined" |

---

## Button and action labels

Button labels are verbs that describe the action, not the outcome.

| Wrong | Correct |
|---|---|
| "Yes" / "No" | "Delete project" / "Keep project" |
| "OK" | Specific to the action: "Save", "Confirm", "Continue" |
| "Submit" | "Create account", "Send message", "Place order" |
| "Click here" | The label describes the destination or action |

**Destructive actions** must name what is being destroyed: "Delete invoice", not "Delete". The user must know what they are confirming.

---

## Error messages

Every error message answers three questions:
1. What happened?
2. Why did it happen (if known)?
3. What should the user do?

```
// Wrong
"Error: 422"
"Something went wrong."
"Invalid."

// Correct
"Payment failed — your card was declined. Check the card number or try a different card."
"Couldn't send the message. Check your connection and try again."
"Email is already in use. Sign in instead, or use a different email."
```

Error messages live next to the field that caused them. Not in a toast three seconds after the user has looked away.

---

## Empty states

An empty state is not a blank screen. It tells the user:
1. What this space is for
2. Why it is empty
3. What to do to fill it

```
// Wrong
[blank div]

// Correct
[Icon]
No invoices yet
Create your first invoice to start tracking payments.
[Create invoice →]
```

Every data-driven view has a designed empty state. This is not optional.

---

## Banned copy patterns

These patterns are banned in all interfaces:

**Generic startup language:**
- "Operational clarity without the clutter"
- "Your all-in-one solution for…"
- "Streamline your workflow"
- "Unlock the power of…"
- "Take your [X] to the next level"
- "We're on a mission to…"

**Condescending confirmations:**
- "Are you sure?" (use a specific confirmation instead)
- "This action cannot be undone" as a standalone sentence (include what the action is)

**Vague system messages:**
- "An error occurred"
- "Something went wrong"
- "Invalid input"
- "Please try again" with no context on why or what to try

**Hollow loading states:**
- "Loading…" with no skeleton
- "Please wait…"
- "Fetching data…"

**Marketing language inside the product:**
- Eyebrow labels: `MARCH SNAPSHOT`, `NEW`, `PRO`
- Decorative section descriptions that explain what the UI does in selling language
- Tooltips that market features instead of explaining them

---

## Microcopy rules

- Placeholder text in inputs is supplemental, never a label replacement
- Tooltips are for genuinely non-obvious actions — not everything needs one
- Help text lives below the field, in a smaller size, muted color
- Destructive confirmations use the word "delete", "remove", or "cancel" — not "clear" or "reset" as euphemisms
- Success messages confirm what happened: "Invoice sent" not "Success!"