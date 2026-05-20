# vs Deal Calculation Spec

## What a vs deal is

The artist gets **whichever is higher** on the night: a guaranteed floor amount, or a percentage of box office. The percentage can be applied to **gross** or **net** depending on what was negotiated.

```
totalToArtist = max(guaranteeAmount, percentagePayout) + bonuses
```

The guarantee is always the floor — the artist never earns less than it. The percentage leg only wins when the show does well enough to exceed the guarantee.

---

## Inputs (from existing schema)

All fields already exist on `deals`:

| Field | Role |
|---|---|
| `guaranteeAmount` | The floor. Required. |
| `percentage` | Artist's share rate as a decimal (e.g. `0.85` for 85%). Required. |
| `percentageBasis` | `"gross"` or `"net"`. Determines which number the % applies to. Required. |
| `expenseCap` | Optional ceiling on the expenses that can be deducted when computing net. |
| `bonusesJson` | Optional structured bonuses, applied on top of whichever leg wins. |

---

## Step 1 — Gross box office

Sum of all `ticketSales.gross` rows for the show. No deductions.

```
grossBoxOffice = Σ ticketSales.gross
```

---

## Step 2 — Net box office

Net starts from gross, then deducts in order:

1. **Ticketing fees** — `Σ ticketSales.fees`
2. **Pass-through expenses** — `expenses.amount` where `absorbedByVenue = false`

An optional `expenseCap` on the deal limits how much pass-through expenses can reduce net. If set, only `min(passThrough, expenseCap)` is deducted for expenses.

```
totalFees         = Σ ticketSales.fees
passThrough       = Σ expenses.amount  where absorbedByVenue = false
effectiveExpenses = expenseCap != null ? min(passThrough, expenseCap) : passThrough

netBoxOffice = grossBoxOffice - totalFees - effectiveExpenses
```

Net can go negative if fees and expenses exceed gross — in that case the percentage leg produces a very low number and the guarantee wins automatically.

> **`totalExpenses` in the return value** is always the full un-capped `passThrough` amount. The cap affects net math only; the raw total is useful context for the booker.

---

## Step 3 — Percentage payout

```
basis           = percentageBasis === "gross" ? grossBoxOffice : netBoxOffice
percentagePayout = basis × percentage
```

---

## Step 4 — Pick the winner

```
totalToArtist = max(guaranteeAmount, percentagePayout)
```

Both legs should appear in the `steps` array so the booker and tour manager can see which won and by how much.

---

## Step 5 — Bonuses

Bonuses are applied **on top of** whichever leg wins. They are additive — not part of the vs comparison. Reuse the existing `applyBonuses()` helper unchanged.

```
totalToArtist += bonusesApplied.totalApplied
```

Tier ratchets (`type: "tier_ratchet"`) remain unsupported and continue to surface in `bonusesNotTriggered`.

---

## Validation — return `{ supported: false }` if

- `guaranteeAmount` is null
- `percentage` is null
- `percentageBasis` is null (can't compute the percentage leg without knowing gross vs net)

---

## Steps array shape

### Percentage wins (net basis)

```
Gross box office             $42,000.00
Ticketing fees             – $3,150.00
Pass-through expenses      – $8,400.00
Net box office               $30,450.00
× 85% (net)                  $25,882.50   ← wins
Guarantee (floor)            $18,000.00   ← did not win
Artist total                 $25,882.50
```

### Guarantee wins (net basis)

```
Gross box office             $18,000.00
Ticketing fees             – $1,350.00
Pass-through expenses      – $12,000.00
Net box office               $4,650.00
× 85% (net)                  $3,952.50    ← did not win
Guarantee (floor)            $18,000.00   ← wins
Artist total                 $18,000.00
```

### Gross basis (no fee/expense rows in steps)

When `percentageBasis === "gross"`, the net deduction rows are omitted from `steps`. Show gross, then the percentage applied to it, then the guarantee comparison.

---

## `finalFormula` string format

```
max($18,000 guarantee, $25,882.50 net × 85%) = $25,882.50
max($18,000 guarantee, $3,952.50 net × 85%) = $18,000
max($18,000 guarantee, $35,700 gross × 85%) = $35,700
```

---

## Out of scope for this pass

- **`percentage_of_net` as a standalone deal type** — structurally identical to the net leg above but without the vs comparison. Can reuse the same net calculation once vs is done.
- **`door` deals** — different input structure entirely.
- **Tier ratchets on the percentage leg** — the percentage itself changes based on attendance brackets.
- **Comps counting toward gross** — `comps.countsTowardGross` exists in the schema but the engine ignores it.
- **Recoups** — flow through `settlements.recoupsJson` and are applied downstream of this calculation, not inside it.
