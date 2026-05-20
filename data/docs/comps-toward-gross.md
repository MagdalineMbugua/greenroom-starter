# Comps Toward Gross Spec

## What this covers

Some comp tickets are negotiated to count toward the gross box office figure that settlement math is based on — typically artist guest list or label comps where the deal language says something like "comps count at face value." The `comps.countsTowardGross` boolean on each comp row flags this.

When `countsTowardGross = true`, the comp's face value is added to gross before any deal math runs. The adjusted gross then flows through the rest of the calculation exactly as raw gross does.

---

## Core formula

```
compCredit    = Σ (comp.count × comp.faceValue)  where comp.countsTowardGross = true
adjustedGross = grossBoxOffice + compCredit
```

`grossBoxOffice` is always the raw ticket-sales sum (`Σ ticketSales.gross`). The engine derives `adjustedGross` at the top of the calculation and uses it everywhere gross is referenced downstream.

If no comps have `countsTowardGross = true` — the common case — then `compCredit = 0` and `adjustedGross === grossBoxOffice`. The output is identical to what the engine produces today.

---

## How adjustedGross flows through each deal type

| Deal type | Effect of compCredit |
|---|---|
| `flat` | None — payout is a fixed guarantee. `adjustedGross` is shown for context in steps but does not change the payout. |
| `percentage_of_gross` | Payout = `adjustedGross × percentage`. Comps directly inflate the base the artist earns from. |
| `vs` (gross basis) | Percentage leg = `adjustedGross × percentage`. The guarantee leg is unchanged. |
| `vs` (net basis) | Net = `adjustedGross – fees – expenses`. Comps inflate net before the percentage is applied. |
| `percentage_of_net` | Same as vs net basis — net starts from `adjustedGross`. |
| `door` | Payout = `adjustedGross – expenses`. Comps increase the artist's take. |

---

## CalcInput

Add `comps` as an optional field so existing call sites don't break:

```ts
interface CalcInput {
  deal: Deal;
  ticketSales: TicketSale[];
  expenses: Expense[];
  comps?: Comp[];          // NEW — default []
  venueCapacity?: number;
  ticketsSold?: number;
}
```

---

## Steps array

When `compCredit > 0`, insert comp lines immediately after "Gross box office". Each comp category that counts toward gross gets its own line, then a combined "Adjusted gross" line.

```
Gross box office (tickets)      $40,000.00
  Artist GL  60 × $40           + $2,400.00
  Label       10 × $40          +   $400.00
Adjusted gross                  $42,800.00
```

If only one category counts, you can collapse it:

```
Gross box office (tickets)      $40,000.00
Comps toward gross  70 × $40   + $2,800.00
Adjusted gross                  $42,800.00
```

If no comps count toward gross, omit all comp lines entirely — the steps array must be identical to the pre-comps output.

---

## `finalFormula` string

When `compCredit > 0`, reference the adjusted gross so the number is traceable back to what went into it:

```
adjusted gross $42,800 × 85% = $36,380
max($18,000 guarantee, $36,380 adjusted gross × 85%) = $36,380
adjusted gross $42,800 – expenses $8,400 = $34,400
```

When `compCredit === 0`, the formula is unchanged from the non-comps path.

---

## `totalExpenses` and `netBoxOffice` in the return value

- `grossBoxOffice` in the return value should be the **adjusted** gross (i.e. `adjustedGross`), not the raw ticket-sales sum. This is the number both parties are settling against.
- `netBoxOffice` derives from `adjustedGross`, so it also reflects the comp credit automatically.
- `totalExpenses` is unchanged — still the full un-capped pass-through expense total. Comps don't affect expense accounting.

---

## Validation / edge cases

- Missing or empty `comps` array → treat as zero comp credit. No error.
- `countsTowardGross = false` rows are ignored. Only `true` rows contribute.
- `faceValue = 0` on a qualifying comp → contributes $0 to `compCredit`. Valid; no error.
- Negative `faceValue` should not occur in practice but would reduce gross if it did — the engine should not special-case it.

---

## Relationship to other specs

- The `adjustedGross` produced here is the starting point for all net calculations described in `percentage-of-net.md` and `vs-deals-spec.md`.
- `door-deal.md` similarly uses `adjustedGross` as its payout base before expense deductions.
- Recoups (via `settlements.recoupsJson`) are applied downstream of this engine and are not affected.
