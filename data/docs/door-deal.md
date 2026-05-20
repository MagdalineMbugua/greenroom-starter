# Door Deal Calculation Spec

## What a door deal is

The artist takes the ticket revenue (gross) and the venue deducts only its pass-through expenses before paying out. No guarantee, no percentage rate — the artist is effectively buying the room and keeping the door. It's the simplest deal structure: whatever walks in, minus what the venue actually spent on the show.

Ticketing fees are **not** deducted. The artist earns against gross, not net.

---

## Inputs (from existing schema)

| Field | Role |
|---|---|
| `expenseCap` | Optional ceiling on deductible pass-through expenses. If absent, all pass-through expenses are deducted. |
| `expenses.absorbedByVenue` | `false` = pass-through (deducted from payout); `true` = venue absorbs (not deducted). |
| `ticketSales.gross` | Revenue base. No fee reduction. |
| `ticketSales.fees` | Surfaced for context in `totalFees` / `netBoxOffice` but **not** subtracted from artist payout. |
| `bonusesJson` | Optional structured bonuses, applied on top of the payout. |

---

## Core formula

```
grossBoxOffice    = Σ ticketSales.gross
passThrough       = Σ expenses.amount  where absorbedByVenue = false
effectiveExpenses = expenseCap != null ? min(passThrough, expenseCap) : passThrough

totalToArtist = grossBoxOffice - effectiveExpenses + bonusesApplied
```

---

## `totalExpenses` in the return value

Always the full un-capped `passThrough` amount. The cap affects the payout math only; the raw total is useful context for the booker and tour manager.

---

## Steps array

### No cap, expenses within limit

```
Gross box office        $24,000.00
Pass-through expenses   – $4,200.00
Artist total            $19,800.00
```

### Cap applied (actual exceeds cap)

When `expenseCap` is set and `passThrough > expenseCap`, note the cap on the expense row:

```
Gross box office        $24,000.00
Pass-through expenses   – $5,000.00   (capped; actual $6,500)
Artist total            $19,000.00
```

---

## `finalFormula` string format

```
gross $24,000 – expenses $4,200 = $19,800
gross $24,000 – expenses $5,000 (capped from $6,500) = $19,000
```

---

## Validation

Door deals have no required numeric fields (no guarantee, no percentage). A door deal is always computable. A missing `expenseCap` means uncapped — not an error.

The only guard needed: if `deal.dealType !== "door"` this branch should never run.

---

## Bonuses

Applied on top of the payout, same as all other deal types. Reuse `applyBonuses()` unchanged. Bonuses do not interact with the expense cap or gross calculation.

---

## Out of scope for this spec

- **Ticketing fees reducing artist payout** — door deals are gross-only by convention.
- **Comps counting toward gross** — `comps.countsTowardGross` exists in the schema but the engine ignores it across all deal types.
- **Recoups** — flow through `settlements.recoupsJson` and are applied downstream of this calculation, not inside it.
