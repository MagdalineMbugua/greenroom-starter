# Bonus Calculation PRD

## Overview

Bonuses are additive payments (or rate adjustments) on top of the base deal. They are stored in `deals.bonusesJson` as a JSON array. The settlement engine evaluates them **after** gross, fees, expenses, and net are known. This document covers every supported type, its calculation rules, and how the deal edit form should present it to the user.

---

## Supported Bonus Types

| Type | What it does | Applies to |
|---|---|---|
| `gross_threshold` | Flat $ bonus if gross exceeds a target | All deal types |
| `walk_pot` | Variable % of gross above a floor — vs-deal specific | `vs` only |
| `sellout` | Flat $ bonus when tickets sold ≥ threshold | All deal types |
| `attendance_threshold` | Flat $ bonus if ticket count exceeds a target | All deal types |
| `tier_ratchet` | Upgrades the artist's % rate when a threshold is crossed | `vs`, `percentage_of_gross`, `percentage_of_net` |

---

## Calculation Order

Bonuses are evaluated after the base deal math is complete. The sequence is:

```
1.  adjustedGross       — comps-toward-gross applied (if any)
2.  net                 = adjustedGross − fees − effectiveExpenses − hardDeducts
3.  effectivePercentage ← tier_ratchet evaluated here (replaces deals.percentage)
4.  percentagePayout    = basis × effectivePercentage
5.  totalToArtist base  = max(guarantee, percentagePayout)   [vs]
                        = percentagePayout                   [% of gross / % of net]
                        = guarantee                          [flat]
                        = adjustedGross − expenses           [door]
6.  walk_pot            — computed first, added on top of vs result
7.  flat bonuses        — gross_threshold, attendance_threshold, sellout added on top
8.  finalTotal          = totalToArtist base + walk pot + flat bonuses
```

Recoups (`in_pool` and `hard_deduct`) are already factored into step 2 before any bonus fires.

---

## Type-by-type Specification

---

### 1. `gross_threshold` — Flat Gross Bonus

A flat dollar amount paid to the artist if gross box office exceeds a target.

**Schema**
```json
{
  "type": "gross_threshold",
  "label": "+$1,000 if gross > $25,000",
  "threshold": 25000,
  "amount": 1000,
  "stacks": false
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `threshold` | number | yes | Gross dollar target (strict `>`) |
| `amount` | number | yes | Flat $ payout when triggered |
| `stacks` | boolean | no | If `true`, multiple `gross_threshold` bonuses are each evaluated independently and all triggered ones are summed |

**Calculation**
```
if gross > threshold:
  bonus = amount
else:
  bonus = 0
```

**Interaction with walk pot**: `stacks: true` on a `vs` deal triggers walk-pot logic — see `walk_pot` below. `stacks: true` on any other deal type is treated as a regular independent flat bonus.

---

### 2. `walk_pot` — Variable Overage Bonus (vs deals only)

The artist receives a percentage of every dollar of gross above a floor, on top of the standard vs result. Both legs see the full gross — the walk pot does not reduce the gross available to the vs calculation.

**Schema**
```json
{
  "type": "walk_pot",
  "label": "Walkout pot: 100% of gross above $3,200",
  "threshold": 3200,
  "percentage": 1.0
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `threshold` | number | yes | Gross dollar floor (strict `>`) |
| `percentage` | number | yes | Decimal share of overage (1.0 = 100%, 0.85 = 85%) |

**Calculation**
```
Step 1 — Walk pot
  if gross > threshold:
    walkPotPayout = (gross − threshold) × percentage
  else:
    walkPotPayout = 0

Step 2 — Standard vs calculation (full gross, unaffected)
  net      = gross − fees − effectiveExpenses
  pctPay   = basis × effectivePercentage
  vsWinner = max(guarantee, pctPay)

Step 3 — Total
  totalToArtist = walkPotPayout + vsWinner
```

**Walk pot on a non-vs deal**: treat it as a regular `gross_threshold` bonus (fixed payout equal to the amount if threshold is crossed). The additive vs-deal mechanic does not apply.

**Legacy data note**: Older records store walk pots as `gross_threshold` with `stacks: true`. The engine detects this when `stacks: true` is present on a `vs` deal and the label contains "100%". In that case, compute the payout as `gross − threshold` and display a data-quality warning asking the user to verify the terms against `dealNotesFreetext`.

**Worked example**
```
Walk pot:  100% of gross above $3,200
Guarantee: $2,685 vs 80% of net
Gross:     $6,600  |  Fees: $662  |  Expenses: $1,350

Walk pot:   $6,600 − $3,200 = $3,400 overage × 100% = $3,400
Net:        $6,600 − $662 − $1,350 = $4,588
80% of net: $4,588 × 0.80 = $3,670
vs winner:  max($2,685, $3,670) = $3,670
Total:      $3,400 + $3,670 = $7,070
```

---

### 3. `sellout` — Sellout Bonus

A flat bonus triggered when tickets sold reach a target fraction of venue capacity.

**Schema**
```json
{
  "type": "sellout",
  "label": "+$500 on sellout",
  "amount": 500,
  "selloutPct": 0.95
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `amount` | number | yes | Flat $ payout |
| `selloutPct` | number | no | Fraction of capacity that counts as sellout. Defaults to `0.95` (95%) |

**Calculation**
```
sellThrough = ticketsSold / venueCapacity
if sellThrough >= selloutPct:
  bonus = amount
else:
  bonus = 0
```

If `venueCapacity` is unknown, add to `bonusesNotTriggered` with reason "Capacity unknown — cannot evaluate sellout bonus".

---

### 4. `attendance_threshold` — Flat Attendance Bonus

A flat bonus triggered when the raw ticket count exceeds a target.

**Schema**
```json
{
  "type": "attendance_threshold",
  "label": "+$300 if attendance > 585",
  "threshold": 585,
  "amount": 300
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `threshold` | number | yes | Ticket count (strict `>`) |
| `amount` | number | yes | Flat $ payout |

**Calculation**
```
if ticketsSold > threshold:
  bonus = amount
else:
  bonus = 0
```

---

### 5. `tier_ratchet` — Tiered Rate Escalator

Upgrades the artist's percentage rate when a threshold is crossed. It changes **only the rate** — the basis (gross or net) is unchanged. Applies before the percentage payout is calculated.

**Not additive**: tier ratchets do not appear in `bonusesApplied`. They surface in the steps array and `finalFormula` string only.

**Two variants**

#### Sell-through ratio

`from`/`to` are values 0–1 (fraction of capacity sold).

```json
{
  "type": "tier_ratchet",
  "label": "Ratchet: 85% to 95% over 80% sold",
  "tiers": [
    { "from": 0.0, "to": 0.8,  "percentage": 0.85 },
    { "from": 0.8, "to": null, "percentage": 0.95 }
  ]
}
```

Evaluated against: `sellThrough = ticketsSold / venueCapacity`

#### Dollar threshold

`from`/`to` are dollar amounts evaluated against the deal's basis (gross or net).

```json
{
  "type": "tier_ratchet",
  "label": "Tiered net split: 60% / 70% over $34,000",
  "tiers": [
    { "from": 0,     "to": 34000, "percentage": 0.60 },
    { "from": 34000, "to": null,  "percentage": 0.70 }
  ]
}
```

Evaluated against: `deals.percentageBasis === "gross" ? grossBoxOffice : netBoxOffice`

**Detection rule**: if any tier's `to` value is `> 1`, the entire ratchet is dollar-threshold. All `to` ≤ 1 (or `null`) → sell-through.

**Tier selection**
```
for each tier (in order):
  if tier.to === null → applies if value >= tier.from
  else               → applies if tier.from <= value < tier.to
```

Exactly one tier applies at any value. If no tier matches (malformed data), fall back to `deals.percentage` and flag it.

**Effective percentage**
```
effectivePercentage = selectedTier.percentage   (ratchet evaluated)
effectivePercentage = deals.percentage          (no ratchet, or ratchet not applicable)
```

**Fallback when capacity is unknown** (sell-through only): use `deals.percentage` as the rate; add ratchet to `bonusesNotTriggered` with reason "Capacity unknown — cannot evaluate sell-through ratchet".

**Interaction with deal types**

| Deal type | Ratchet applies? |
|---|---|
| `flat` | No — no percentage rate |
| `percentage_of_gross` | Yes |
| `percentage_of_net` | Yes |
| `vs` | Yes — replaces the percentage leg; guarantee unchanged |
| `door` | No — no percentage rate |

**Worked example — sell-through, net basis**
```
Base rate: 85%  |  Ratchet: ≥80% sold → 95%
Sell-through: 420/500 = 84% → ≥80% tier → effectivePercentage = 95%
Net $30,450 × 95% = $28,927.50
```

**Worked example — dollar threshold, net basis**
```
Tiers: 0–$34,000 → 60%,  $34,000+ → 70%
Net $38,000 > $34,000 → effectivePercentage = 70%
Net $38,000 × 70% = $26,600
```

---

## Complete bonusesJson Template

```json
[
  {
    "type": "gross_threshold",
    "label": "+$1,000 if gross > $25,000",
    "threshold": 25000,
    "amount": 1000,
    "stacks": false
  },
  {
    "type": "walk_pot",
    "label": "Walkout pot: 100% of gross above $3,200",
    "threshold": 3200,
    "percentage": 1.0
  },
  {
    "type": "sellout",
    "label": "+$500 on sellout",
    "amount": 500,
    "selloutPct": 0.95
  },
  {
    "type": "attendance_threshold",
    "label": "+$300 if attendance > 585",
    "threshold": 585,
    "amount": 300
  },
  {
    "type": "tier_ratchet",
    "label": "Ratchet: 85% to 95% over 80% sold",
    "tiers": [
      { "from": 0.0, "to": 0.8,  "percentage": 0.85 },
      { "from": 0.8, "to": null, "percentage": 0.95 }
    ]
  },
  {
    "type": "tier_ratchet",
    "label": "Tiered net split: 60% / 70% over $34,000",
    "tiers": [
      { "from": 0,     "to": 34000, "percentage": 0.60 },
      { "from": 34000, "to": null,  "percentage": 0.70 }
    ]
  }
]
```

---

## Edit Form — Bonus Input UX

### General principles

- The label field is always user-written. It appears on the settlement sheet and in deal confirmation emails — write it as the agent would recognise it (e.g. "Walkout pot: 100% of gross above $3,200").
- Each bonus type shows only the fields it needs. Irrelevant fields are hidden.
- Percentages are entered as whole numbers (80 = 80%) and stored as decimals (0.80).
- Dollar fields always show a `$` prefix.

---

### Bonus type selector

A dropdown at the top of each bonus row. Options:

| Dropdown label | `type` stored | Available on |
|---|---|---|
| Gross threshold | `gross_threshold` | All deal types |
| Walk pot | `walk_pot` | `vs` only (hidden for other types) |
| Sellout bonus | `sellout` | All deal types |
| Attendance threshold | `attendance_threshold` | All deal types |
| Tier ratchet | `tier_ratchet` | `vs`, `% of gross`, `% of net` |

---

### `gross_threshold` fields

```
Label          [free text]
─────────────────────────────────────────────
Gross floor $  [number]   |  Bonus amount $  [number]
```

- **Gross floor**: the gross revenue the show must beat (strict `>`).
- **Bonus amount**: flat $ paid to the artist if triggered.
- No "stacks" checkbox needed for new entries — stacking is implied when multiple `gross_threshold` bonuses are present. Legacy data with `stacks` is handled automatically.

---

### `walk_pot` fields

```
Label          [free text]
─────────────────────────────────────────────
Gross floor $  [number]   |  Artist share %  [number, default 100]
```

- **Gross floor**: gross must exceed this (strict `>`).
- **Artist share %**: fraction of the overage paid to the artist. 100 means the artist keeps every dollar above the floor.
- Only shown when deal type is `vs`. If the user switches away from `vs`, the walk pot row shows a warning: "Walk pots only apply to vs deals."

---

### `sellout` fields

```
Label          [free text]
─────────────────────────────────────────────
Bonus amount $  [number]   |  Sellout at %  [number, default 95]
```

- **Bonus amount**: flat $ paid on sellout.
- **Sellout at %**: the sell-through threshold that triggers the bonus. Defaults to 95. Most deals use 95 — allow the user to override (e.g. 90 or 100).

---

### `attendance_threshold` fields

```
Label          [free text]
─────────────────────────────────────────────
Ticket count   [number]    |  Bonus amount $  [number]
```

- **Ticket count**: raw number of tickets sold required (strict `>`).
- **Bonus amount**: flat $ paid if triggered.

---

### `tier_ratchet` fields

A mode selector at the top of the ratchet editor switches between the two variants:

```
[ Sell-through % ]   [ Dollar threshold ]
```

**Sell-through % mode**

Column headers: `% sold from` / `% sold to` / `Rate %`

Each tier row:
```
% sold from  [number 0–100]  |  % sold to  [number 0–100, or "and above"]  |  Rate %  [number]
```

Inputs accept 0–100 and are stored as 0–1 (divided by 100 on save).

**Dollar threshold mode**

Column headers: `From $` / `To $` / `Rate %`

Each tier row:
```
From $  [number]  |  To $  [number, or "and above"]  |  Rate %  [number]
```

Values stored as raw dollar integers.

**Rules that apply to both modes**

- The top tier's `To` field is always locked to "and above" (`null` in storage) — this ensures the ratchet covers all values above the last breakpoint.
- When the user edits a tier's `To` value, the next tier's `From` automatically updates to match, preventing gaps.
- New ratchet rows default to sell-through % mode.
- On load, if any existing tier has `to > 1`, the editor opens in dollar threshold mode.
- Rate % column is always 0–100 input, stored as 0–1 decimal.
- Minimum of 2 tiers. Add tier button appends a new row above the final (unbounded) tier.

**Tier ratchet note shown to user**

> A ratchet replaces the deal's base percentage rate — it does not add to it. Only one ratchet is evaluated per deal.

---

## Validation Rules (form-level)

| Condition | Error |
|---|---|
| Walk pot on a non-vs deal | "Walk pots only apply to vs deals. Change the deal type or remove this bonus." |
| Tier ratchet on a flat or door deal | "Tier ratchets have no effect on flat or door deals." |
| Multiple tier ratchets | "Only the first tier ratchet is evaluated at settlement. Remove extras or merge into one." |
| Tier ratchet with no base percentage (deal type requires one) | "A tier ratchet requires a base percentage rate on the deal." |
| Sell-through tier — value outside 0–100 | "Sell-through values must be between 0 and 100." |
| Tiers out of order | "Tiers must be in ascending order of threshold." |

---

## Settlement Output Fields

| Field | Contains |
|---|---|
| `bonusesApplied` | `{ label, amount, reason }[]` — flat bonuses that triggered (`gross_threshold`, `walk_pot`, `sellout`, `attendance_threshold`) |
| `bonusesNotTriggered` | `{ label, amount, reason }[]` — bonuses that were evaluated but did not fire |
| Steps array | Includes walk pot block (before vs calc) and ratchet annotation (inline with percentage row) |
| `finalFormula` | Human-readable string summarising the full calculation including any ratchet and walk pot |

Tier ratchets do **not** appear in `bonusesApplied` — they are rate modifiers, not additive amounts. They appear in the steps array and `finalFormula` only.
