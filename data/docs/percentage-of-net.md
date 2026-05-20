# percentage_of_net Deal Calculation Spec

## What it is

The artist earns a percentage of the net box office — gross after ticketing fees and pass-through expenses are deducted. No guarantee floor. If the show underperforms, the artist earns less.

```
totalToArtist = netBoxOffice × percentage + bonuses
```

---

## Inputs (from existing schema)

| Field | Role |
|---|---|
| `percentage` | Artist's share rate as a decimal (e.g. `0.85` for 85%). Required. |
| `expenseCap` | Optional ceiling on the expenses that can be deducted. |
| `bonusesJson` | Optional structured bonuses, applied on top of the payout. |

`guaranteeAmount` and `percentageBasis` are not used — net is always the basis, and there is no floor.

---

## Step 1 — Gross box office

```
grossBoxOffice = Σ ticketSales.gross
```

---

## Step 2 — Net box office

Deduct in order:

1. **Ticketing fees** — `Σ ticketSales.fees` (platform/service fees passed through to the artist)
2. **Pass-through expenses** — `expenses.amount` where `absorbedByVenue = false`, optionally capped by `expenseCap`

```
totalFees         = Σ ticketSales.fees
passThrough       = Σ expenses.amount  where absorbedByVenue = false
effectiveExpenses = expenseCap != null ? min(passThrough, expenseCap) : passThrough

netBoxOffice = grossBoxOffice - totalFees - effectiveExpenses
```

Net can go negative. The payout would then also be negative (or zero if floored elsewhere in the settlement). There is no built-in floor in this deal type.

> **`totalExpenses` in the return value** is always the full un-capped `passThrough`. The cap affects net math only.

---

## Step 3 — Payout

```
payout = netBoxOffice × percentage
```

---

## Step 4 — Bonuses

Applied on top of the payout, using the existing `applyBonuses()` helper unchanged.

```
totalToArtist = payout + bonusesApplied.totalApplied
```

---

## Validation — return `{ supported: false }` if

- `percentage` is null

---

## Steps array shape

```
Gross box office             $42,000.00
Ticketing fees             – $3,150.00
Pass-through expenses      – $8,400.00
Net box office               $30,450.00
× 85% (net)                  $25,882.50
Artist total                 $25,882.50
```

If `expenseCap` is active and lower than `passThrough`, add a note on the expenses line:

```
Pass-through expenses      – $6,000.00   (capped; actual $8,400)
```

---

## `finalFormula` string format

```
net $30,450 × 85% = $25,882.50
```

With bonus:

```
net $30,450 × 85% + $1,000 sellout bonus = $26,882.50
```

---

## Relationship to vs deals

The net calculation here is identical to the net leg in a `vs` deal — same fee deduction, same expense filter, same cap logic. Once `percentage_of_net` is implemented, the vs deal engine should call the same underlying helper rather than duplicating the math.

---

## Out of scope

- **Guarantee floor** — use `vs` deal type if a floor is needed.
- **Gross basis** — use `percentage_of_gross` if expenses should not be deducted.
- **Tier ratchets** — percentage changes by attendance bracket; needs a separate pass.
- **Comps counting toward gross** — `comps.countsTowardGross` exists in schema but the engine ignores it.
- **Recoups** — applied downstream via `settlements.recoupsJson`, not inside this calculation.
