# Deal Entry UI Spec

## Overview

The app has a read-only deal display on `/shows/[id]` and a settlement worksheet on `/shows/[id]/settle`. There is no deal entry or edit form. This spec defines the full UI for entering and editing a deal — all five deal types, all bonus structures, recoup entry, and every edge case that produces a warning or validation state.

All UI follows the existing Greenroom design system: Fraunces display font, Geist Sans/Mono body and numerals, `ink` / `brand` / `amber` / `rose` / `sky` color tokens, existing `Card` / `Field` / `Button` / `Badge` / `Tooltip` primitives, `eyebrow` labels, and `tabular` monospace numerals.

---

## 1. Route & surface

**Route**: `/shows/[id]/deal/edit`

A full-page form, not a modal. Deal entry has many conditional fields and a large free-text prose block — a modal is too cramped. The page is a React Server Component shell with a `"use client"` form component for interactivity.

**Entry points:**
- Show detail page → "Deal terms" card → "Add deal terms" button (when no deal exists)
- Show detail page → "Deal terms" card → "Edit" button (when deal already exists)

---

## 2. Page header

```
← Back to show

[StatusBadge]  [DealTypeBadge — updates live]

Artist Name                          (Fraunces, 48px, ink-900)
May 19, 2026                         (14px, ink-400)
```

The `DealTypeBadge` updates immediately as the user selects a deal type — no save required.

---

## 3. Page layout

Two-column layout at `md:` breakpoint: main form column (2/3 width) + sticky summary sidebar (1/3 width). On mobile: single column, sidebar below form.

```
┌─────────────────────────────┬───────────────────┐
│  Deal type selector          │  Live summary      │
│  Field group                 │  (what the engine  │
│  Bonuses section             │   will compute)    │
│  Deal notes                  │                    │
│  [Save]  [Cancel]            │                    │
└─────────────────────────────┴───────────────────┘
```

The sidebar shows a read-only preview of how the deal will be computed at settlement given current field values. Updates as the user types.

---

## 4. Deal type selector

First section. A segmented control (`role="radiogroup"`) with five options:

```
[ Flat ]  [ % of Gross ]  [ % of Net ]  [ Vs ]  [ Door ]
```

**Styling:** Selected option has `bg-brand-700 text-white`, unselected has `bg-white text-ink-600 ring-1 ring-ink-200/80`, hover `bg-canvas-soft`. Full-width on mobile, auto-width on desktop. Font: 13px, medium weight.

Below the selector, a one-line description updates to match the selected type:

| Type | Description |
|---|---|
| Flat | Artist earns a fixed guarantee. No percentage. |
| % of Gross | Artist earns a percentage of total ticket revenue. |
| % of Net | Artist earns a percentage of gross minus fees and pass-through expenses. |
| Vs | Artist earns whichever is higher: the guarantee or a percentage of box office. |
| Door | Artist takes gross revenue minus pass-through expenses. No percentage rate. |

Changing the type instantly shows/hides the relevant field groups and clears fields that don't apply.

---

## 5. Conditional field groups

Use a `grid-cols-2 sm:grid-cols-4 gap-4` grid for amount/percentage fields (matches existing show detail page pattern). All inputs follow the existing search input style: `rounded-lg border border-ink-200/80 px-3 py-2 text-[13px] focus:ring-2 focus:ring-brand-700/20 outline-none`.

### flat

```
[ Guarantee $       ]  [ Expense cap $   ]  [ Hospitality cap $ ]
  required                optional              optional
```

### percentage_of_gross

```
[ Percentage %      ]  [ Expense cap $   ]  [ Hospitality cap $ ]
  required                optional              optional
```

### percentage_of_net

```
[ Percentage %      ]  [ Expense cap $   ]  [ Hospitality cap $ ]
  required                optional              optional
```

Net-basis note (amber-tinted, 12px, appears below the field group):
> "Comps marked 'counts toward gross' on the show will inflate the net figure at settlement."

### vs

```
[ Guarantee $       ]  [ Percentage %  [of gross ▾] ]  [ Expense cap $ ]  [ Hospitality cap $ ]
  required               required + inline basis toggle   optional            optional
```

The percentage basis toggle (`of gross` / `of net`) sits inline adjacent to the percentage input — not a separate row. Implemented as two small pill buttons. Default: `of net`.

### door

```
[ Expense cap $     ]  [ Hospitality cap $ ]
  optional               optional
```

No required numeric fields. The expense cap still affects how pass-through expenses are deducted.

---

## 6. Expense cap field behaviour

When filled:
- Show inline helper below: "Recoups marked **in pool** share this cap with pass-through expenses."

When empty:
- Show inline helper: "No cap — all pass-through expenses deducted in full."

When hospitality cap is set and exceeds the expense cap:
- Field-level error on hospitality cap: "Hospitality cap cannot exceed the expense cap."

---

## 7. Percentage input auto-conversion

If the user types a value greater than 1 into a percentage field (e.g. `85`), show an inline prompt beneath the input:

```
[amber dot]  Did you mean 85%? The engine stores percentages as decimals (0.85).
             [Convert to 0.85 ↗]   [Keep as-is]
```

"Keep as-is" with a value > 1 blocks the Save button and shows a field-level error: "Must be between 0 and 1 (e.g. 0.85 for 85%)."

---

## 8. Bonuses section

Collapsible `Card` below the deal field group. Default: expanded if bonuses already exist, collapsed if none.

**Card header:**
```
[TrendingUp icon]  Bonuses & escalators       [+ Add bonus]  [▾ collapse]
```

Each bonus is its own sub-row within the card, separated by `divide-y divide-ink-100/60`. Add with the "+ Add bonus" button; remove with a trash icon on the right.

### 8a. gross_threshold bonus

```
Type:      [gross_threshold ▾]
Label:     [__________________________]   e.g. "Bonus: $1,000 over $40k gross"
Threshold: [$          ]
Amount:    [$          ]
           [☐] Walk pot — stacks on top of vs deal (stacks: true)
```

When the walk pot toggle is enabled (`stacks: true`):
- Show amber callout beneath:
  > ⚠ Walk pot detected. If the deal notes describe "100% of gross above $X," the stored amount is unreliable — the payout is variable and must be calculated from the actual overage. Verify terms against deal notes before settling.

### 8b. sellout bonus

```
Type:    [sellout ▾]
Label:   [__________________________]
Amount:  [$          ]
Note:    Triggers when tickets sold ≥ 95% of venue capacity.   (12px ink-400, non-editable)
```

### 8c. attendance_threshold bonus

```
Type:       [attendance_threshold ▾]
Label:      [__________________________]
Threshold:  [     tickets]
Amount:     [$          ]
```

### 8d. tier_ratchet bonus

```
Type:   [tier_ratchet ▾]
Label:  [__________________________]

Tiers:
  From         To              Rate
  [ 0    ]     [ 0.80  ]       [ 70  %]      [× remove]
  [ 0.80 ]     [and above]     [ 80  %]      [× remove]
  [+ Add tier]

Detection: If any To value > 1, tiers are dollar amounts (e.g. $34,000).
           Values 0–1 are sell-through ratios (e.g. 0.80 = 80% sold).
```

When a sell-through ratchet exists and venue capacity is not set:
- Amber callout beneath:
  > ⚠ Venue capacity not set. Sell-through ratchets cannot be evaluated at settlement — the base rate will be used. Set venue capacity to enable ratchet evaluation.

**"and above" sentinel:** The final tier always has `to: null`. Show a disabled greyed input labelled "and above" rather than a blank field.

---

## 9. Deal notes (free text)

Full-width `textarea` below the bonuses section. Min-height: 120px. Resizable vertically.

```
DEAL NOTES (FREE TEXT)
┌────────────────────────────────────────────────────────┐
│                                                        │
│                                                        │
└────────────────────────────────────────────────────────┘
This is what booker actually trusts. Bonuses that appear only here are
invisible to the settlement engine — enter them in structured form above
to include them in calculations.
```

Styling: `bg-canvas-soft rounded-lg ring-1 ring-ink-200/50 p-4 text-[13px] text-ink-800 leading-relaxed font-[450] italic` (matches existing read-only display).

---

## 10. Sticky live summary sidebar

A `Card` in the right column that previews what the settlement engine would produce given the current form values. Updates on every field change (debounced 300ms).

```
LIVE PREVIEW

Deal type         Vs deal (% of net)
Guarantee         $18,000
Percentage        85% of net
Expense cap       $10,000

Gross             $42,000   (from ticket sales)
Fees              – $3,150
Expenses          – $8,400
Net               $30,450
× 85%             $25,882
vs $18,000        $25,882 ← wins

Bonuses           + $0
Total to artist   $25,882.50

[Formula: max($18,000, net $30,450 × 85%) = $25,882.50]
```

When required fields are missing, replace the calculation with:
```
Fill in [missing field] to preview the calculation.
```

Sidebar also shows any active warnings (walkpot, capacity missing, net negative) so booker sees them before saving.

---

## 11. Form-level validation callouts (amber, top of form)

Appear as an amber `AlertCircle` callout block, same style as the existing "booker's notes" callout.

| Condition | Message |
|---|---|
| Walk pot (`stacks: true`) on a non-vs deal | "Walk pots only apply to vs deals. Change the deal type or remove the walk pot toggle." |
| Walk pot present but no guarantee on vs deal | "Walk pots require a guarantee amount on the vs deal." |
| Tier ratchet present but no percentage rate | "Ratchets require a base percentage rate." |
| Deal type that engine can't yet calculate | "Note: the in-app settlement engine doesn't yet support [type] deals. You can save the terms — booker will need to settle this in a spreadsheet." |

---

## 12. Save / cancel

```
[Cancel]          [Save deal terms]
(ghost variant)   (brand variant, lg)
                   Disabled until required fields are valid.
                   Shows spinner while saving.
```

On save: redirect to `/shows/[id]` with a brief toast: "Deal terms saved." (brand color, 3s auto-dismiss).

On cancel: return to `/shows/[id]` with no changes.

---

## 13. Recoup entry (settlement page — not deal form)

Recoups are entered on `/shows/[id]/settle` in the existing `RecoupsSection`. Add a "+ Add recoup" button at the bottom of that section.

New recoup row (inline form, expands inside the card):

```
Category:    [marketing ▾]
Label:       [__________________________]
Amount:      [$          ]
Treatment:   [In pool]  [Hard deduct]         ← toggle
Status:      [Agreed ▾]                        default: agreed

In pool:   "Counted with pass-through expenses. Subject to expense cap."
Hard deduct: "Reduces net before × percentage. Not subject to expense cap."
```

When `in_pool` is selected and an expense cap exists:
```
Expense pool: $8,400 of $10,000 cap used   (12px ink-500, tabular mono)
```
If adding this recoup would exceed the cap:
```
[amber dot]  Adding this recoup would push the pool to $11,200 — over the $10,000 cap.
             The combined total will be capped at $10,000.
```

When `hard_deduct` is selected on a gross-basis deal (`flat`, `percentage_of_gross`, or `vs` gross basis):
```
[amber dot]  Hard deducts are not applied to gross-basis deals. This recoup will appear
             in the settlement for transparency but will not reduce the payout.
```

---

## 14. Settlement page warnings (added when deal runs)

These appear on `/shows/[id]/settle` as callout blocks in the calculation area, not on the deal entry form.

### Net goes negative

```
[rose / AlertTriangle]
Net box office is negative ($–X,XXX)
Fees and expenses exceed gross revenue. The guarantee wins automatically.
Verify that expenses are correct before submitting.
```

### Capacity unknown (sell-through ratchet)

```
[amber / AlertCircle]
Sell-through ratchet cannot be evaluated
Venue capacity is not set. The base rate of X% is being used.
Set venue capacity in venue settings to enable ratchet evaluation.
```

### Walk pot flavor 1 (variable payout)

```
[amber / AlertCircle]
Walk pot payout is variable
The deal notes describe a 100%-of-overage walk pot. The structured bonus
stores a fixed amount ($X,XXX) which may not match the actual payout.
Verify the threshold and terms against the deal notes before submitting.
```

### Missing percentageBasis on vs deal (old data)

On show detail page "Deal terms" card:
```
[amber / AlertCircle]
Percentage basis not set
The settlement engine can't calculate this vs deal without knowing whether
the percentage applies to gross or net.  [Edit deal terms →]
```

### Multiple tier_ratchet bonuses

On settlement worksheet, beneath the second ratchet's step row:
```
Only one ratchet is evaluated per deal. This ratchet was skipped.
```

---

## 15. Empty and loading states

### No deal entered (show detail page)

"Deal terms" `Card` renders with a dashed `border-ink-200/60 border-dashed` border and:

```
No deal entered yet.
booker enters this from the email thread with the agent.
[Add deal terms]   (brand variant Button, size lg)
```

### Form loading (edit mode)

Skeleton `Field` components (grey `animate-pulse` rectangles) in place of inputs while existing deal data fetches.

### Save in flight

Save button shows a spinner icon (replacing the save icon), text stays "Saving…", button is disabled. Cancel is also disabled.

---

## 16. New UI primitives needed

The existing codebase has no form input primitive beyond the search bar in `shows-list.tsx`. The deal entry form needs:

| Primitive | Location | Notes |
|---|---|---|
| `Input` | `components/ui/input.tsx` | Text, number inputs. Same ring/focus style as search bar. |
| `Select` | `components/ui/select.tsx` | Styled `<select>` for deal type, bonus type, recoup category, recoup status. |
| `Textarea` | `components/ui/textarea.tsx` | For deal notes. Resizable vertically. |
| `Toggle` / segmented control | `components/ui/toggle.tsx` | For deal type selector, percentage basis, recoup treatment. |

All new primitives must use the same `ring-2 ring-brand-700/20` focus style, `border-ink-200/80` default border, `rounded-lg`, and `text-[13px]` size as the existing search input.
