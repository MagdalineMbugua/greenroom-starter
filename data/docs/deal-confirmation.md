# Deal Confirmation Spec

## Overview

Deals are entered by booker but currently never formally confirmed by the agent or tour manager. There is no paper trail showing the artist's team agreed to the terms before the show. This spec defines a lightweight tokenised confirmation workflow and an improved deal view that surfaces every term in plain English.

---

## 1. Schema additions

### `deals` table — new field

```ts
dealVersion: integer("deal_version").notNull().default(1)
```

Incremented each time booker re-sends confirmation. Tokens are scoped to `dealId + dealVersion` so a new send immediately invalidates the previous link.

### New table: `dealConfirmations`

```ts
export const dealConfirmations = sqliteTable("deal_confirmations", {
  id:              text("id").primaryKey(),
  dealId:          text("deal_id").notNull().references(() => deals.id),
  dealVersion:     integer("deal_version").notNull(),
  recipientType:   text("recipient_type", { enum: ["agent", "tm"] }).notNull(),
  email:           text("email").notNull(),
  token:           text("token").notNull().unique(),
  tokenExpiresAt:  integer("token_expires_at", { mode: "timestamp" }).notNull(),
  status:          text("status", {
    enum: ["pending", "confirmed", "flagged", "expired", "invalidated"],
  }).notNull().default("pending"),
  confirmedAt:     integer("confirmed_at",     { mode: "timestamp" }),
  flaggedNotes:    text("flagged_notes"),
  reminderSentAt:  integer("reminder_sent_at", { mode: "timestamp" }),
  invalidatedAt:   integer("invalidated_at",   { mode: "timestamp" }),
  sentAt:          integer("sent_at",           { mode: "timestamp" }).notNull(),
});
```

**Email sources** (already in schema):
- Agent → `agents.email`
- Tour manager → `artists.managerEmail`

---

## 2. Improved deal view — show detail page (`/shows/[id]`)

The current "Deal terms" card shows only a 4-field grid. The improved view shows every field itemised and explains how the deal will be calculated in plain English readable by a TM who is not an accountant.

### 2a. Deal type plain-English one-liner

Shown immediately below the `DealTypeBadge`:

| Deal type | One-liner |
|---|---|
| `flat` | "Guaranteed amount — does not depend on ticket sales." |
| `percentage_of_gross` | "Artist earns a percentage of total ticket revenue before any deductions." |
| `percentage_of_net` | "Artist earns a percentage of revenue after platform fees and expenses are deducted." |
| `vs` | "Artist earns whichever is higher on the night: the guarantee or a percentage of box office." |
| `door` | "Artist takes all ticket revenue after pass-through expenses are deducted." |

### 2b. Structured field grid

Full field display — no `—` for missing optional fields; omit the row entirely if null.

```
GUARANTEE          PERCENTAGE         BASIS           EXPENSE CAP      HOSPITALITY CAP
$18,000            85%                of net          $10,000          $1,500
```

If `expenseCap` is set: show an inline note below the grid:
> "Pass-through expenses are capped at $10,000. If the venue's actual expenses exceed this, only $10,000 reduces the artist's share."

If `hospitalityCap` is set:
> "Hospitality expenses are capped at $1,500 within the overall expense cap."

### 2c. Plain-English calculation preview

A step-by-step preview of how settlement will run, using the deal terms (not live ticket data). Shown in a subtle `bg-canvas-soft rounded-lg p-4 ring-1 ring-ink-200/50` block with the heading "How this deal calculates":

**vs deal, net basis:**
```
1. Add up all ticket revenue                →  gross box office
2. Subtract platform / ticketing fees       →  net step 1
3. Subtract pass-through expenses           →  net box office
   (capped at $10,000 if exceeded)
4. Multiply net by 85%                      →  percentage payout
5. Compare with $18,000 guarantee           →  whichever is higher wins
6. Add any triggered bonuses                →  total to artist
```

**flat deal:**
```
1. Artist earns $18,000 regardless of ticket sales
2. Add any triggered bonuses                →  total to artist
```

**% of gross:**
```
1. Add up all ticket revenue                →  gross box office
2. Multiply by 85%                          →  artist payout
3. Add any triggered bonuses                →  total to artist
```

**door deal:**
```
1. Add up all ticket revenue                →  gross box office
2. Subtract pass-through expenses           →  artist payout
   (capped at $X if set)
```

### 2d. Bonuses — itemised in plain English

Each bonus in a `BonusList` component. Show type badge + plain-English description:

| Bonus type | Plain-English label |
|---|---|
| `gross_threshold` | "Extra $X if the show grosses over $Y in tickets." |
| `gross_threshold` + `stacks: true` | "Walk pot: [Artist] also earns $X / 100% of revenue above $Y — on top of the main deal." |
| `sellout` | "Extra $X if the show sells out (≥ 95% of capacity)." |
| `attendance_threshold` | "Extra $X if more than N tickets are sold." |
| `tier_ratchet` (sell-through) | "Rate increases to X% once the show reaches Y% capacity." |
| `tier_ratchet` (dollar) | "Rate increases to X% once box office exceeds $Y." |

If bonuses exist only in free-text prose (not in `bonusesJson`):
> "Additional bonus terms are described in the deal notes below. They are not visible to the settlement engine."

### 2e. Comps toward gross

If any `comps.countsTowardGross = true` on the show, show an amber note below the bonus list:
> "Some comp tickets count toward gross on this deal. They will inflate the box office figure the artist's percentage is applied to at settlement."

### 2f. Deal notes

Verbatim `dealNotesFreetext`, italic, `canvas-soft` background. Eyebrow: "Deal notes (what booker actually trusts)". Omit section if empty.

### 2g. Confirmation status strip

Shown at the bottom of the "Deal terms" card, separated by a `border-t border-ink-100/80`:

```
CONFIRMATION STATUS

Agent   [agent name · agency name]   [email]      [badge]
TM      [manager email]                            [badge]

[Send for Confirmation]           or           [Re-send (new version)]
```

Badge states:

| Status | Badge | Color |
|---|---|---|
| Not sent yet | — | — |
| `pending` | Awaiting | `sky` |
| `confirmed` | Confirmed [date] | `brand` |
| `flagged` | Issue flagged | `rose` |
| `expired` | Expired | `default` |
| `invalidated` | Superseded | `default` |

If `flaggedNotes` is present, show them in an amber callout below the status strip:
```
[AlertTriangle]  Issue raised by [agent/TM]:
"[flaggedNotes text]"
```

If TM email (`artists.managerEmail`) is null, show TM row as:
```
TM   No tour manager email on file   [—]
```
And after sending: "Only the agent was notified — no tour manager email is recorded for this artist."

---

## 3. "Send for Confirmation" action

**Trigger:** "Send for Confirmation" button on the deal terms card.

**Flow:**
1. Increment `deals.dealVersion`
2. Mark all existing `dealConfirmations` for this `dealId` as `status: "invalidated"`, set `invalidatedAt: now()`
3. Generate two cryptographically random 32-byte hex tokens (one per recipient)
4. Insert two `dealConfirmations` rows with `status: "pending"`, `tokenExpiresAt: showDate + 7 days`
5. Send confirmation email to each recipient with their unique link
6. Show success state in the card: "Sent to [agent email] and [TM email]." with timestamps

**Re-send:** Shows "Re-send (new version)" if a prior send exists. Clicking shows a confirmation warning:
> "Sending a new version will immediately invalidate the existing links. The agent and TM will need to confirm again using the new link."

[Cancel]   [Send new version]

---

## 4. Token mechanics

- **Format:** cryptographically random 32-byte value, hex-encoded (64 characters)
- **URL:** `/deal-confirm/[token]`
- **Scope:** token is bound to exactly one `dealConfirmation` row → one `dealId` + `dealVersion` + `recipientType` combination. Cannot access any other data in Greenroom.
- **Expiry:** `tokenExpiresAt = showDate + 7 days`. Checked at request time — no cron needed. If `now() > tokenExpiresAt`, serve the expired state.
- **Invalidation:** When a new version is sent, all previous tokens for that `dealId` are set to `invalidated` immediately, regardless of whether they were confirmed or pending.

---

## 5. Deal Summary page (`/deal-confirm/[token]`)

No login. No session. Token in the URL is the only authentication. The page is a Next.js Server Component that fetches the `dealConfirmation` row by token, then resolves the associated deal, show, artist, venue, and bonuses.

### 5a. Token validation states

Shown before any deal content:

| State | UI |
|---|---|
| `invalidated` | "A new version of this deal has been sent. Check your email for the updated link." |
| Expired (`now() > tokenExpiresAt`) | "This confirmation link has expired. Contact [venue name] for an updated link." |
| `confirmed` | "You've already confirmed these terms on [date]." (read-only, no action buttons) |
| `flagged` | "You've flagged an issue on these terms. [Venue name] has been notified." (read-only) |
| Valid + `pending` | Render deal summary with action buttons |

### 5b. Page header

```
[Greenroom Wordmark]

Deal confirmation request from [Venue Name]

[Artist Name] at [Venue Name]
[Day, Month DD, YYYY]  ·  Doors [doorsTime]  ·  Set [setTime]

Sent to you as [Agent / Tour Manager] — please review and confirm below.
```

### 5c. What was agreed

Plain-English deal description, same content as §2a–2f but without internal field labels, badge components, or eyebrow typography. Written as sentences a non-accountant can read.

**vs deal example:**
> "[Artist] earns whichever is higher on the night: a $18,000 guarantee, or 85% of net box office. Net box office is the total ticket revenue minus platform fees and pass-through venue expenses, which are capped at $10,000."

**Bonus example:**
> "Additionally: an extra $1,000 is paid if the show grosses over $40,000 in tickets. The artist also earns a sellout bonus of $500 if 95% or more of capacity is sold."

**Deal notes:**
> "The agreed deal notes are included below for reference."
> *[dealNotesFreetext]*

### 5d. Action buttons

```
[ ✓ Confirm these terms ]         [ ⚑ Flag an issue ]
  brand variant, lg                 outline variant, lg
```

Both buttons are full-width on mobile, side-by-side on desktop.

### 5e. Flag flow

Clicking "Flag an issue" reveals a textarea inline below the buttons:

```
Describe the issue
┌────────────────────────────────────────────┐
│                                            │
└────────────────────────────────────────────┘
[Submit]  [Cancel]
```

On submit: `status → "flagged"`, `flaggedNotes` stored. Page transitions to:
> "Your note has been sent to [Venue Name]. They will be in touch to resolve it."

---

## 6. Confirm action

On clicking "Confirm these terms":
- `status → "confirmed"`, `confirmedAt → now()`
- No email sent back to booker (in-app notification only)
- Page transitions to confirmed state:

```
[Large green checkmark]

Confirmed

Thanks — you've confirmed the deal for [Artist] at [Venue] on [date].
[Venue Name] has been notified.
```

---

## 7. Automated reminder email

**Trigger condition:** A `dealConfirmation` row where:
- `status = "pending"`
- `reminderSentAt` is null
- Show date is 72 hours from now (± a reasonable window to avoid re-checking too tightly)

**On send:**
- Send reminder email with same link
- Set `reminderSentAt: now()`

**Email subject:** `Reminder: please confirm deal terms for [Artist] — show in 3 days`

**Email body:**
> Hi [agent/TM name],
>
> This is a reminder to confirm the deal terms for [Artist] at [Venue] on [date].
>
> You can confirm or flag any issues using the link below — it takes less than a minute.
>
> [Confirm deal terms →]
>
> This link expires [tokenExpiresAt date].

Infrastructure for the scheduled send (cron job, queue, etc.) is outside the scope of this spec.

---

## 8. Confirmation status on `/shows` list

Each `ShowListRow` gains a confirmation badge in the rightmost column, stacked below the settlement pill.

**Aggregate status logic** (across agent + TM rows for the deal's current version):

| Condition | Badge | Variant |
|---|---|---|
| No confirmations sent | — | — |
| Any row `flagged` | "Issue flagged" | `rose` |
| Any row `pending` (none flagged) | "Awaiting confirmation" | `sky` |
| All rows `confirmed` | "Deal confirmed" | `brand` |
| All rows `expired` or `invalidated` (none confirmed) | "Confirmation expired" | `default` |

The `ShowRow` type in `shows-list.tsx` needs a `confirmation` field:
```ts
confirmation: {
  status: "not_sent" | "pending" | "confirmed" | "flagged" | "expired";
} | null;
```

---

## 9. Edge cases

| Scenario | Handling |
|---|---|
| TM email is null | Send only to agent. Show "No TM email on file" in status strip. |
| Agent email is null | Surface error before send: "Agent email is required to send confirmation." Block the action. |
| Deal has no bonusesJson but has prose bonuses | Prose shown verbatim on Deal Summary page with note: "Additional bonus terms in deal notes." |
| Token accessed after show date + 7 days | Serve expired state. |
| Recipient tries to confirm after flagging | "You've already flagged an issue — [Venue] has been notified." No re-confirm allowed without booker resending. |
| booker re-sends before anyone confirms | Old tokens invalidated immediately; new pending rows created. |
| Walk pot on deal — flavor 1 detected | Deal Summary page shows amber note: "Walk pot terms: please verify this matches the agreed terms as described in the deal notes." |
| Multiple ratchet tiers | Each tier listed as a separate sentence: "Rate increases to X% once the show reaches Y%." |
| No deal entered yet | "Send for Confirmation" button is disabled with tooltip: "Enter deal terms before sending for confirmation." |
