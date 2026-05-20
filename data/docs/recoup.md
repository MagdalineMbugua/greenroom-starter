# Recoup Calculation Spec

## What a recoup is

A recoup is a venue cost deducted from the artist's settlement — things like prior tour advances, marketing overages, production overages, hospitality overages, or damages. They are distinct from regular pass-through expenses in two ways:

1. They have their own dispute lifecycle independent of the rest of the settlement.
2. Their relationship to `deals.expenseCap` depends on how the deal was negotiated.

Recoups are stored in `settlements.recoupsJson` as a JSON array.

---

## Recoup categories

The `category` field classifies what the recoup covers. It determines the display label in the UI but does not affect the calculation — only `treatment` and `status` affect the math.

| Category | Display label | Typical use |
|---|---|---|
| `marketing` | Marketing | Co-op marketing spend, radio buys, print |
| `hospitality_overage` | Hospitality overage | Rider costs that exceeded the agreed hospitality cap |
| `production_overage` | Production overage | Backline, lighting, sound beyond the production budget |
| `prior_advance` | Prior advance | Tour advance paid before the show that is being recouped at settlement |
| `damages` | Damages | Venue damage, equipment damage |
| `other` | Other | Anything that doesn't fit the above |

---

## Two treatments: `in_pool` vs `hard_deduct`

The `treatment` field on each recoup determines how it interacts with the expense cap.

### `in_pool`

The recoup is added into the regular pass-through expense pool and the **combined** total is subject to `expenseCap`.

```
expenseCap    = 1000
expenses      =  700   (pass-through)
recoup        =  500   (treatment: "in_pool")

combinedPool  = 700 + 500 = 1200
effectivePool = min(1200, 1000) = 1000   ← cap applies to the whole pool
```

The recoup and regular expenses share the cap. The artist absorbs the capped combined total, not two separate numbers.

### `hard_deduct`

The recoup is deducted from net **before** the percentage multiplier is applied. It bypasses `expenseCap` — the cap only applies to the regular expense pool, not to hard deducts.

```
expenseCap      = 1000
expenses        = 1200   (pass-through)
effectivePool   = min(1200, 1000) = 1000   ← cap applies to expenses only

recoup          =  500   (treatment: "hard_deduct")
net             = gross - fees - 1000 - 500 = net after all deductions
payout          = net × 85%                ← % applied to the already-reduced net
```

The hard deduct reduces the base the percentage multiplies against — it is part of the net calculation, not a subtraction from the final payout.

Use `hard_deduct` when the deal language specifies the recoup is a firm, unconditional deduction not subject to the expense cap.

---

## Recoup type

The `Recoup` type in `db/schema.ts` gains a `treatment` field:

```ts
export type Recoup = {
  id: string;
  category:
    | "marketing"
    | "hospitality_overage"
    | "production_overage"
    | "prior_advance"
    | "damages"
    | "other";
  label: string;
  amount: number;
  status: "agreed" | "disputed" | "withdrawn";
  treatment: "in_pool" | "hard_deduct";
};
```

**Default for existing records missing `treatment`**: `"hard_deduct"`. This is the safe default — it never silently subjects a recoup to the expense cap when the original deal language didn't authorize it.

---

## Which deal types apply recoups

`in_pool` recoups only make sense on **net-basis** deals where there is an expense pool. `hard_deduct` recoups apply to **all deal types** — they are subtracted directly from whatever the artist would otherwise receive.

| Deal type | `in_pool` | `hard_deduct` |
|---|---|---|
| `flat` | Not applied — no expense pool | **Yes** — subtracted from the flat guarantee |
| `percentage_of_gross` | Not applied — no expense pool | **Yes** — subtracted from gross × % payout |
| `vs` (gross basis) | Not applied — no expense pool | **Yes** — subtracted from the vs winner amount |
| `vs` (net basis) | Joins expense pool, subject to cap | **Yes** — reduces net before `× %` |
| `percentage_of_net` | Joins expense pool, subject to cap | **Yes** — reduces net before `× %` |
| `door` | Joins expense pool, subject to cap | **Yes** — subtracted from the door payout |

For gross-basis deals, `hard_deduct` recoups are **subtracted from the final payout**, not from the expense pool. The deal language should explicitly state they are "not subject to the expense cap" or are a "direct deduction from artist payment" for this treatment to apply.

---

## Core formula

Both treatments reduce net **before** the percentage multiplier. Neither is subtracted from the final payout after the fact.

```
-- Only "agreed" recoups are applied; disputed/withdrawn are shown but not deducted
-- Recoups are skipped entirely for gross-basis deal types (flat, % of gross, vs gross)
inPoolRecoups = Σ recoup.amount  where status="agreed" AND treatment="in_pool"
hardDeducts   = Σ recoup.amount  where status="agreed" AND treatment="hard_deduct"

-- Step 1: in_pool recoups join the pass-through expense pool (subject to expenseCap)
rawPassThrough   = Σ expenses.amount  where absorbedByVenue = false
combinedPool     = rawPassThrough + inPoolRecoups
effectivePool    = expenseCap != null ? min(combinedPool, expenseCap) : combinedPool

-- Step 2: hard_deduct recoups reduce net outside the cap
netBoxOffice     = adjustedGross - totalFees - effectivePool - hardDeducts

-- Step 3: percentage is applied to the fully-reduced net
percentagePayout = netBoxOffice × percentage

-- Step 4: vs deal compares against guarantee; % of net uses percentagePayout directly
totalToArtist = max(guarantee, percentagePayout)   -- vs (net basis)
totalToArtist = percentagePayout                   -- percentage_of_net
totalToArtist = adjustedGross - effectivePool - hardDeducts  -- door (no % multiplier)
```

---

## How treatment interacts with each deal type

| Deal type | `in_pool` effect | `hard_deduct` effect |
|---|---|---|
| `flat` | **Not applied** — shown only | **Not applied** — flat is flat |
| `percentage_of_gross` | **Not applied** — shown only | **Not applied** — gross × % is the payout |
| `vs` (gross basis) | **Not applied** — shown only | **Not applied** — gross leg is not reduced |
| `vs` (net basis) | Joins expense pool (subject to cap) → reduces net before `× %` | Reduces net before `× %`, outside cap → may shift which leg wins |
| `percentage_of_net` | Joins expense pool (subject to cap) → reduces net before `× %` | Reduces net before `× %`, outside cap |
| `door` | Joins expense pool (subject to cap) → reduces artist take | Reduces take directly, outside cap |

---

## Steps array

### in_pool recoups — shown inside the expense deduction block

```
Pass-through expenses           – $700.00
Marketing recoup (in pool)      – $300.00
  Combined vs cap                 $1,000.00  (capped from $1,200)
Net box office                   $28,600.00
```

If no cap is set, omit the "Combined vs cap" note.

### hard_deduct recoups — shown inside the net calculation, after the expense pool

Hard deducts reduce net before the percentage is applied, so they appear between the expense lines and the `× %` line:

```
Gross box office                 $42,000.00
Ticketing fees                 – $3,150.00
Pass-through expenses          – $8,400.00
Prior advance (hard deduct)    – $3,000.00   [agreed]
Production overage (hard deduct)– $1,200.00  [agreed]
Net box office                   $26,250.00
× 85%                            $22,312.50
Guarantee (floor)                $18,000.00   ← did not win
Artist total                     $22,312.50
```

### Disputed and withdrawn — always shown, never applied

```
Hospitality overage            – $800.00   [disputed — not applied]
Damages                        – $500.00   [withdrawn — not applied]
```

Both types should appear with their status label so the tour manager can see what's on the table even if it isn't affecting the number yet.

---

## `finalFormula` string

Hard deducts are shown inside the net figure, not subtracted from the result:

```
-- vs (net basis) with hard deducts
max($18,000 guarantee, ($25,882.50 – $4,200 hard deducts) net × 85%) = $18,429.63

-- % of net with hard deducts
($28,600 – $3,000 hard deducts) net × 85% = $21,760

-- door with hard deducts
gross $42,000 – expenses $8,400 – $3,000 hard deducts = $30,600
```

Gross-basis deals never include recoups in the formula:

```
flat $18,000
gross $42,000 × 85% = $35,700
```

When only in_pool recoups, note it on the net line rather than in the formula itself:

```
net $28,600 × 85% = $24,310
```

Add a note on the net box office step: `"Net includes $300 in-pool recoup (capped with expenses)"`.

---

## Return value fields

The existing `SettlementCalculation` return type should distinguish recoups from expenses:

- `totalExpenses` — raw pass-through expenses only, same as today (no recoups included)
- `totalInPoolRecoups` — sum of agreed in_pool recoups (before cap is applied)
- `totalHardDeducts` — sum of agreed hard_deduct recoups (applied after deal math)

This lets the UI surface recoups as their own line items rather than burying them in the expense total.

---

## Validation and edge cases

- `status: "disputed"` or `"withdrawn"` → shown in steps, $0 applied to the calculation
- Missing `treatment` field → default to `"hard_deduct"`
- Empty or absent recoups array → output is identical to a settlement with no recoups
- `in_pool` recoups on a deal with no `expenseCap` → join the pool, but no cap is enforced (same as regular expenses with no cap)
- Multiple recoups of different treatments → split into their respective pools; process independently
- Recoups on a gross-basis deal (`flat`, `percentage_of_gross`, `vs` gross) → shown in steps for transparency, never applied to the payout number
