# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server at http://localhost:3000
npm run build        # Production build
npm run lint         # ESLint
npm run db:push      # Apply schema changes to SQLite file
npm run db:seed      # Re-seed without dropping the file
npm run db:reset     # Drop data/greenroom.db, push schema, re-seed (deterministic)
npm run db:studio    # Open Drizzle Studio table browser
```

No test suite is configured.

## Architecture

**Next.js 16 App Router** with React 19 and TypeScript. All pages under `app/` are React Server Components by default; client components are opted in with `"use client"`. Data fetching happens server-side via `lib/queries.ts`.

**Database** is a local SQLite file at `data/greenroom.db`, accessed through Drizzle ORM + `@libsql/client`. The client is initialized in `db/index.ts` and reads `DATABASE_URL` (defaults to `file:./data/greenroom.db`). Schema is defined in `db/schema.ts`; seed logic is in `db/seed.ts`.

**Time-gating**: `lib/queries.ts` filters all shows to `date <= today`. Future shows exist in the DB but are invisible to the app until their date arrives. This is intentional — don't remove the `lte(shows.date, todayDateString())` filter.

**Settlement engine** (`lib/dealMath.ts`) is deliberately incomplete. It handles only `flat` and `percentage_of_gross` deal types. For all others (`vs`, `percentage_of_net`, `door`) it returns `{ supported: false }` and the UI shows an unsupported-state. Extending this engine to cover `vs` deals is the primary design challenge of the case study.

**Key data quirk**: The `deals.dealNotesFreetext` field is the source of truth Mariana actually trusts. Structured fields (`guaranteeAmount`, `percentage`, `bonusesJson`) are filled inconsistently — about half of deals with bonus structures put them only in prose. The settlement engine reads only structured fields; it cannot see prose-only bonuses.

**Settlement lifecycle** is a state machine managed in `lib/settlementStage.ts`:
`draft → submitted → in_review → signed → finalized → paid`
with a dispute branch: `in_review → disputed → revised → finalized`.

**Component structure**: `components/ui/` holds button/badge/card primitives (shadcn-style). `components/layout/` has the sidebar and nav. `components/command-palette/` powers ⌘K global search. Tailwind CSS 4 is used throughout.

**Fonts**: Fraunces (variable serif, via `next/font/google`) for display headings; Geist Sans/Mono (via the `geist` package) for body and code.
