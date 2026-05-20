import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  FileSpreadsheet,
  AlertCircle,
  Clock,
  TrendingUp,
  Pencil,
} from "lucide-react";
import { getShowById, getConfirmationsForDeal } from "@/lib/queries";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Field,
} from "@/components/ui/card";
import { StatusBadge, DealTypeBadge, PlainBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { parseBonuses } from "@/lib/dealMath";
import {
  formatMoney,
  formatMoneyCompact,
  formatShowDateFull,
  relativeShowDate,
} from "@/lib/format";
import type { Bonus, Deal, DealRecoup } from "@/db/schema";
import { ConfirmationStrip } from "./ConfirmationStrip";
import { RecoupDetailButton } from "./RecoupDetailButton";

const COMP_LABELS: Record<string, string> = {
  artist_gl: "Artist guest list",
  label: "Label / management",
  press: "Press",
  venue_staff: "Venue staff",
  sponsor: "Sponsor",
  promo: "Promo / radio",
  other: "Other",
};

export default async function ShowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getShowById(id);
  if (!data) notFound();

  const {
    show,
    artist,
    agent,
    agency,
    deal,
    settlement,
    ticketSales,
    expenses,
    comps,
  } = data;

  const confirmations = deal ? await getConfirmationsForDeal(deal.id) : [];

  const grossSoFar = ticketSales.reduce((sum, t) => sum + t.gross, 0);
  const totalFees = ticketSales.reduce((sum, t) => sum + t.fees, 0);
  const totalTickets = ticketSales.reduce((sum, t) => sum + (t.qty ?? 0), 0);
  const totalExpenses = expenses
    .filter((e) => !e.absorbedByVenue)
    .reduce((sum, e) => sum + e.amount, 0);
  const absorbedTotal = expenses
    .filter((e) => e.absorbedByVenue)
    .reduce((sum, e) => sum + e.amount, 0);

  const totalCompCount = comps.reduce((s, c) => s + c.count, 0);
  const compsCountingTowardGross = comps
    .filter((c) => c.countsTowardGross)
    .reduce((s, c) => s + c.count, 0);

  const bonuses = deal ? parseBonuses(deal) : [];

  const dealRecoups: DealRecoup[] = (() => {
    if (!deal?.recoupsJson) return [];
    try {
      const parsed = JSON.parse(deal.recoupsJson);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  })();
  const dealRecoupTotal = dealRecoups.reduce((s, r) => s + r.amount, 0);

  const isDisputed = settlement?.status === "disputed";

  return (
    <div className="max-w-7xl">
      {/* Poster header */}
      <div className={`px-12 pt-10 pb-14 ${isDisputed ? "bg-gradient-to-b from-rose-50/40 to-canvas" : "bg-gradient-to-b from-brand-50/30 to-canvas"}`}>
        <Link
          href="/shows"
          className="inline-flex items-center gap-1 text-[12px] text-ink-400 hover:text-ink-900 mb-8 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All shows
        </Link>

        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-1.5 mb-4">
              <StatusBadge status={show.status} />
              {deal && <DealTypeBadge type={deal.dealType} />}
              {isDisputed && (
                <PlainBadge variant="rose">Disputed</PlainBadge>
              )}
              {bonuses.length > 0 && (
                <PlainBadge variant="brand">
                  {bonuses.length} bonus{bonuses.length === 1 ? "" : "es"}
                </PlainBadge>
              )}
            </div>
            <h1
              className="font-display text-[56px] font-medium text-ink-900 leading-[1.02]"
              style={{ letterSpacing: "-0.025em", fontOpticalSizing: "auto" }}
            >
              {artist?.name ?? "—"}
            </h1>
            <div className="text-[14px] text-ink-400 mt-3 flex items-center gap-2">
              <span className="text-ink-600 font-medium">{formatShowDateFull(show.date)}</span>
              <span className="text-ink-300">·</span>
              <span>{relativeShowDate(show.date)}</span>
              <span className="text-ink-200">·</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                doors {show.doorsTime} · set {show.setTime}
              </span>
            </div>
          </div>
          <Link href={`/shows/${show.id}/settle`} className="mt-6 shrink-0">
            <Button variant="brand" size="lg">
              <FileSpreadsheet className="h-4 w-4" />
              {settlement ? "View settlement" : "Settle show"}
            </Button>
          </Link>
        </div>

        {/* Key numbers strip */}
        <div className="flex items-baseline gap-10 mt-8 pt-5 border-t border-ink-200/40">
          <MiniStat label="Gross" value={formatMoneyCompact(grossSoFar)} />
          <MiniStat label="Tickets" value={String(totalTickets)} />
          <MiniStat label="Expenses" value={formatMoneyCompact(totalExpenses)} />
          {settlement?.totalToArtist != null && (
            <MiniStat label="To artist" value={formatMoneyCompact(settlement.totalToArtist)} accent />
          )}
        </div>
      </div>

      <div className="px-12 pb-12">
        {show.internalNotes && (
          <div className="mb-8 mt-1 rounded-lg bg-amber-50/50 ring-1 ring-amber-200/60 p-5 flex gap-3">
            <AlertCircle className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
            <div>
              <div className="eyebrow text-[10px] text-amber-800 mb-1.5">
                Booker&apos;s notes
              </div>
              <div className="text-[13px] text-ink-800 leading-relaxed">
                {show.internalNotes}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-2">
          {/* Deal terms */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Deal terms</CardTitle>
              <Link href={`/shows/${show.id}/deal/edit`}>
                <Button variant="ghost" size="sm">
                  <Pencil className="h-3.5 w-3.5" />
                  {deal ? "Edit" : "Add deal terms"}
                </Button>
              </Link>
            </CardHeader>

            {deal ? (
              <>
                {/* MARQUEE — at-a-glance deal summary */}
                <div className="border-b border-ink-100/80">
                  <div className="px-6 pt-5 pb-4 border-b border-ink-100/80">
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="eyebrow text-[10px] text-ink-400">The deal</span>
                      <DealTypeChip type={deal.dealType} />
                    </div>
                    <DealHeadline deal={deal} />
                    <p className="text-[12px] text-ink-500 mt-1.5 leading-snug">
                      {dealOneLiner(deal.dealType)}
                    </p>
                  </div>

                  {/* Caps row — only for deal types with expense structure */}
                  {dealHasCaps(deal) && (
                    <div
                      className={`grid divide-x divide-ink-100/80 ${
                        [deal.expenseCap, deal.hospitalityCap].filter((v) => v != null).length === 1
                          ? "grid-cols-1"
                          : "grid-cols-2"
                      }`}
                    >
                      {deal.expenseCap != null && (
                        <div className="px-5 py-4">
                          <div className="eyebrow text-[10px] text-ink-400 mb-1.5">Expense cap</div>
                          <div className="font-mono tabular text-[18px] font-semibold text-ink-900 leading-none">
                            {formatMoney(deal.expenseCap)}
                          </div>
                          <div className="text-[11px] text-ink-500 mt-1.5">Pass-through ceiling.</div>
                        </div>
                      )}
                      {deal.hospitalityCap != null && (
                        <div className="px-5 py-4">
                          <div className="eyebrow text-[10px] text-ink-400 mb-1.5">Hospitality cap</div>
                          <div className="font-mono tabular text-[18px] font-semibold text-ink-900 leading-none">
                            {formatMoney(deal.hospitalityCap)}
                          </div>
                          <div className="text-[11px] text-ink-500 mt-1.5">Within expense cap.</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* BONUSES — only shown when bonuses exist on this deal */}
                {bonuses.length > 0 && (
                  <div className="px-6 py-5 border-b border-ink-100/80">
                    <div className="eyebrow text-[10px] text-ink-400 mb-3 flex items-center gap-1.5">
                      <TrendingUp className="h-[11px] w-[11px]" />
                      Bonuses & escalators
                    </div>
                    <div className="flex flex-col gap-2.5">
                      {bonuses.map((b, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2.5 px-3 py-2.5 bg-canvas-soft ring-1 ring-ink-200/40 rounded-lg"
                        >
                          <BonusBadge type={b.type} />
                          <p className="text-[13px] text-ink-800 leading-snug">
                            {bonusPlainEnglish(b, artist?.name ?? "Artist")}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* RECOUPS — shown when deal has any recoups */}
                {dealRecoups.length > 0 && (
                  <div className="px-6 py-4 border-b border-ink-100/80 flex items-center justify-between gap-4">
                    <div>
                      <div className="eyebrow text-[10px] text-ink-400 mb-1">Recoup</div>
                      <div className="font-mono tabular text-[18px] font-semibold text-ink-900 leading-none">
                        {formatMoney(dealRecoupTotal)}
                      </div>
                    </div>
                    <RecoupDetailButton recoups={dealRecoups} />
                  </div>
                )}

                {/* DEAL NOTES — italic prose, source of truth Mariana actually trusts */}
                {deal.dealNotesFreetext && (
                  <div className="px-6 py-5 border-b border-ink-100/80 bg-canvas-soft">
                    <div className="eyebrow text-[10px] text-ink-500 mb-2">Deal notes</div>
                    <p
                      className="text-[13.5px] text-ink-800 leading-relaxed"
                      style={{ fontStyle: "italic", fontWeight: 450 }}
                    >
                      {deal.dealNotesFreetext}
                    </p>
                  </div>
                )}

                {/* CONFIRMATION STATUS */}
                <ConfirmationStrip
                  showId={show.id}
                  dealId={deal.id}
                  agentName={agent?.name ?? null}
                  agentEmail={agent?.email ?? null}
                  agencyName={agency?.name ?? null}
                  tmEmail={artist?.managerEmail ?? null}
                  confirmations={confirmations}
                  dealVersion={deal.dealVersion}
                />
              </>
            ) : (
              <div className="px-5 py-10 text-center">
                <p className="text-[13px] text-ink-400 mb-1">No deal entered yet.</p>
                <p className="text-[12px] text-ink-300 mb-4">
                  Booker enters this from the email thread with the agent.
                </p>
                <Link href={`/shows/${show.id}/deal/edit`}>
                  <Button variant="brand" size="lg">Add deal terms</Button>
                </Link>
              </div>
            )}
          </Card>

          {/* Artist & agent */}
          <Card>
            <CardHeader>
              <CardTitle>Artist & agent</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Artist" value={artist?.name ?? "—"} />
              <Field
                label="Genre"
                value={
                  <span className="capitalize">{artist?.genre ?? "—"}</span>
                }
              />
              <Field
                label="Prior shows here"
                value={String(artist?.priorShowCount ?? 0)}
                mono
              />
              <Field
                label="Agent"
                value={
                  agent
                    ? `${agent.name}${agency ? ` · ${agency.name}` : ""}`
                    : "—"
                }
              />
              {agent?.preferencesNotes && (
                <div>
                  <div className="eyebrow text-[10px] text-ink-500 mb-2">
                    Agent notes
                  </div>
                  <div className="text-[12.5px] text-ink-800 bg-amber-50/50 ring-1 ring-amber-200/50 rounded-lg p-3 leading-relaxed">
                    {agent.preferencesNotes}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Box office */}
          <Card>
            <CardHeader>
              <CardTitle>Box office</CardTitle>
              <CardDescription>From integrated ticketing.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <div className="eyebrow text-[10px] text-ink-400">Gross</div>
                  <div className="text-[28px] font-mono tabular font-semibold text-ink-900 mt-1 leading-none">
                    {formatMoneyCompact(grossSoFar)}
                  </div>
                </div>
                {totalTickets > 0 ? (
                  <div className="text-[12px] text-ink-500 pt-4 border-t border-ink-100/80 leading-relaxed">
                    <span className="font-mono tabular font-medium text-ink-700">
                      {totalTickets}
                    </span>{" "}
                    tickets ·{" "}
                    <span className="font-mono tabular">
                      {formatMoney(totalFees)}
                    </span>{" "}
                    in fees
                    <div className="mt-1.5 text-ink-400">
                      Net{" "}
                      <span className="font-mono tabular text-ink-700">
                        {formatMoneyCompact(grossSoFar - totalFees)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[12px] text-ink-400 pt-3 border-t border-ink-100/80">
                    No sales yet.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Comps */}
          <Card className="md:col-span-2">
            <CardHeader>
              <div>
                <CardTitle>Comps</CardTitle>
                <CardDescription>
                  {totalCompCount} comp tickets across {comps.length}{" "}
                  categor{comps.length === 1 ? "y" : "ies"}.
                  {compsCountingTowardGross > 0 && (
                    <>
                      {" "}
                      <span className="text-amber-700 font-medium">
                        {compsCountingTowardGross} count toward gross.
                      </span>
                    </>
                  )}
                </CardDescription>
              </div>
              <PlainBadge variant="default">
                {totalCompCount} total
              </PlainBadge>
            </CardHeader>
            <CardContent>
              {comps.length === 0 ? (
                <div className="text-[13px] text-ink-400">
                  No comps recorded for this show.
                </div>
              ) : (
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left border-b border-ink-100/80">
                      <th className="py-2 eyebrow text-[10px] text-ink-400 font-semibold">Category</th>
                      <th className="py-2 eyebrow text-[10px] text-ink-400 font-semibold text-right">Count</th>
                      <th className="py-2 eyebrow text-[10px] text-ink-400 font-semibold text-right">Face value</th>
                      <th className="py-2 eyebrow text-[10px] text-ink-400 font-semibold text-right">Counts toward gross?</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100/60">
                    {comps.map((c) => (
                      <tr key={c.id}>
                        <td className="py-2.5">
                          {COMP_LABELS[c.category] ?? c.category}
                          {c.notes && (
                            <span className="text-ink-400 ml-1">· {c.notes}</span>
                          )}
                        </td>
                        <td className="py-2.5 text-right font-mono tabular">{c.count}</td>
                        <td className="py-2.5 text-right font-mono tabular text-ink-500">
                          {formatMoney(c.faceValue * c.count)}
                        </td>
                        <td className="py-2.5 text-right">
                          {c.countsTowardGross ? (
                            <span className="text-amber-700 font-medium">Yes</span>
                          ) : (
                            <span className="text-ink-400">No</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {/* Expenses */}
          <Card className="md:col-span-3">
            <CardHeader>
              <div>
                <CardTitle>Expenses</CardTitle>
                <CardDescription>
                  Entered during the week, often incompletely.
                </CardDescription>
              </div>
              {absorbedTotal > 0 && (
                <PlainBadge variant="amber">
                  {formatMoney(absorbedTotal)} absorbed
                </PlainBadge>
              )}
            </CardHeader>
            <CardContent>
              {expenses.length === 0 ? (
                <div className="text-[13px] text-ink-400">
                  No expenses entered yet.
                </div>
              ) : (
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left border-b border-ink-100/80">
                      <th className="py-2 eyebrow text-[10px] text-ink-400 font-semibold">Category</th>
                      <th className="py-2 eyebrow text-[10px] text-ink-400 font-semibold">Description</th>
                      <th className="py-2 eyebrow text-[10px] text-ink-400 font-semibold text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100/60">
                    {expenses.map((e) => (
                      <tr key={e.id}>
                        <td className="py-2.5 capitalize">
                          {e.category}
                          {e.absorbedByVenue && (
                            <PlainBadge variant="amber" className="ml-2">absorbed</PlainBadge>
                          )}
                        </td>
                        <td className="py-2.5 text-ink-500">{e.description ?? "—"}</td>
                        <td className="py-2.5 text-right font-mono tabular">{formatMoney(e.amount)}</td>
                      </tr>
                    ))}
                    <tr className="font-medium">
                      <td className="py-3" colSpan={2}>Total (passed through)</td>
                      <td className="py-3 text-right font-mono tabular">{formatMoney(totalExpenses)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="eyebrow text-[9px] text-ink-400">{label}</div>
      <div className={`text-[18px] font-mono tabular font-semibold mt-0.5 leading-none ${accent ? "text-brand-700" : "text-ink-900"}`}>
        {value}
      </div>
    </div>
  );
}

function dealOneLiner(type: Deal["dealType"]): string {
  switch (type) {
    case "flat": return "Guaranteed amount — does not depend on ticket sales.";
    case "percentage_of_gross": return "Artist earns a percentage of total ticket revenue before any deductions.";
    case "percentage_of_net": return "Artist earns a percentage of revenue after platform fees and expenses are deducted.";
    case "vs": return "Artist earns whichever is higher on the night: the guarantee or a percentage of box office.";
    case "door": return "Artist takes all ticket revenue after pass-through expenses are deducted.";
  }
}

function DealHeadline({ deal }: { deal: Deal }) {
  const pct = deal.percentage != null ? `${(deal.percentage * 100).toFixed(0)}%` : "?%";
  const basis = deal.percentageBasis ?? "net";
  const guarantee = deal.guaranteeAmount != null ? formatMoney(deal.guaranteeAmount) : null;
  const displayStyle = { letterSpacing: "-0.02em", fontOpticalSizing: "auto" } as React.CSSProperties;
  const cls = "font-display text-[28px] font-medium text-ink-900 leading-tight flex items-baseline gap-2 flex-wrap";
  const mutedStyle = { fontFamily: "var(--font-sans)", fontWeight: 400, fontStyle: "normal" } as React.CSSProperties;

  switch (deal.dealType) {
    case "flat":
      return (
        <div className={cls} style={displayStyle}>
          <span className="font-mono tabular font-semibold">{guarantee ?? "—"}</span>
          <span className="text-ink-400 text-[18px]" style={mutedStyle}>guaranteed</span>
        </div>
      );
    case "vs":
      return (
        <div className={cls} style={displayStyle}>
          <span className="font-mono tabular font-semibold">{guarantee ?? "—"}</span>
          <span className="text-ink-400 italic font-normal text-[20px]">vs</span>
          <span>{pct} of {basis}</span>
        </div>
      );
    case "percentage_of_gross":
      return (
        <div className={cls} style={displayStyle}>
          <span className="font-mono tabular font-semibold">{pct}</span>
          <span className="text-ink-400 text-[18px]" style={mutedStyle}>of gross</span>
        </div>
      );
    case "percentage_of_net":
      return (
        <div className={cls} style={displayStyle}>
          <span className="font-mono tabular font-semibold">{pct}</span>
          <span className="text-ink-400 text-[18px]" style={mutedStyle}>of net</span>
        </div>
      );
    case "door":
      return (
        <div className={cls} style={displayStyle}>
          Door deal
        </div>
      );
  }
}

function DealTypeChip({ type }: { type: Deal["dealType"] }) {
  const configs: Record<Deal["dealType"], { label: string; cls: string }> = {
    flat: { label: "Flat guarantee", cls: "bg-brand-50 text-brand-800 ring-1 ring-brand-200/80" },
    percentage_of_gross: { label: "% of gross", cls: "bg-ink-100 text-ink-700 ring-1 ring-ink-200/80" },
    percentage_of_net: { label: "% of net", cls: "bg-ink-100 text-ink-700 ring-1 ring-ink-200/80" },
    vs: { label: "Vs deal", cls: "bg-amber-50 text-amber-800 ring-1 ring-amber-200/80" },
    door: { label: "Door deal", cls: "bg-ink-100 text-ink-700 ring-1 ring-ink-200/80" },
  };
  const { label, cls } = configs[type];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

function dealHasCaps(deal: Deal): boolean {
  return (["vs", "percentage_of_net", "door"] as Deal["dealType"][]).includes(deal.dealType) &&
    (deal.expenseCap != null || deal.hospitalityCap != null);
}

function bonusPlainEnglish(b: Bonus, artistName: string): string {
  switch (b.type) {
    case "gross_threshold":
      if (b.stacks) {
        return b.label.toLowerCase().includes("100%")
          ? `Walk pot: ${artistName} also earns 100% of revenue above ${formatMoney(b.threshold)} — on top of the main deal.`
          : `Walk pot: ${artistName} also earns ${formatMoney(b.amount)} if gross exceeds ${formatMoney(b.threshold)} — on top of the main deal.`;
      }
      return `Extra ${formatMoney(b.amount)} if the show grosses over ${formatMoney(b.threshold)} in tickets.`;
    case "walk_pot":
      return `Walk pot: ${artistName} earns ${(b.percentage * 100).toFixed(0)}% of every dollar of gross above ${formatMoney(b.threshold)} — on top of the main deal.`;
    case "sellout": {
      const pct = ((b.selloutPct ?? 0.95) * 100).toFixed(0);
      return `Extra ${formatMoney(b.amount)} if the show sells out (≥ ${pct}% of capacity).`;
    }
    case "attendance_threshold":
      return `Extra ${formatMoney(b.amount)} if more than ${b.threshold.toLocaleString()} tickets are sold.`;
    case "tier_ratchet": {
      const isDollar = b.tiers.some(t => t.to != null && t.to > 1);
      const upgradeTiers = b.tiers.filter(t => t.from > 0);
      if (upgradeTiers.length === 0) return b.label;
      return upgradeTiers.map(t => isDollar
        ? `Rate increases to ${(t.percentage * 100).toFixed(0)}% once box office exceeds ${formatMoney(t.from)}.`
        : `Rate increases to ${(t.percentage * 100).toFixed(0)}% once the show reaches ${(t.from * 100).toFixed(0)}% capacity.`
      ).join(" ");
    }
  }
}

function BonusBadge({ type }: { type: Bonus["type"] }) {
  const labels: Record<Bonus["type"], string> = {
    gross_threshold: "gross",
    walk_pot: "walk pot",
    sellout: "sellout",
    attendance_threshold: "attend",
    tier_ratchet: "ratchet",
  };
  return (
    <span className="inline-flex shrink-0 items-center px-1.5 py-px rounded text-[9px] font-mono uppercase tracking-wider bg-white ring-1 ring-brand-200/50 text-brand-800">
      {labels[type]}
    </span>
  );
}
