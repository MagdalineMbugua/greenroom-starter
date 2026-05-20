import { notFound } from "next/navigation";
import { getConfirmationByToken } from "@/lib/queries";
import { parseBonuses } from "@/lib/dealMath";
import { formatMoney, formatShowDateFull } from "@/lib/format";
import { Logomark } from "@/components/brand/logo";
import { DealConfirmActions } from "./DealConfirmActions";
import type { Bonus, Deal } from "@/db/schema";

export default async function DealConfirmPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getConfirmationByToken(token);

  if (!data) notFound();

  const { confirmation, deal, show, artist, agent, venue } = data;

  // Check expiry
  const now = new Date();
  const isExpired = now > confirmation.tokenExpiresAt;

  // Resolve state
  const status = confirmation.status;

  if (status === "invalidated") {
    return (
      <TokenState
        heading="Link superseded"
        body="A new version of this deal has been sent. Check your email for the updated link."
        venueName={venue.name}
      />
    );
  }

  if (isExpired || status === "expired") {
    return (
      <TokenState
        heading="Link expired"
        body={`This confirmation link has expired. Contact ${venue.name} for an updated link.`}
        venueName={venue.name}
      />
    );
  }

  if (status === "confirmed") {
    const confirmedDate = confirmation.confirmedAt
      ? new Date(confirmation.confirmedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : "";
    return (
      <TokenState
        heading="Already confirmed"
        body={`You've already confirmed these terms${confirmedDate ? ` on ${confirmedDate}` : ""}.`}
        venueName={venue.name}
      />
    );
  }

  if (status === "flagged") {
    return (
      <TokenState
        heading="Issue flagged"
        body={`You've flagged an issue on these terms. ${venue.name} has been notified.`}
        venueName={venue.name}
      />
    );
  }

  // Valid + pending — show deal summary
  const bonuses = parseBonuses(deal);
  const recipientRole = confirmation.recipientType === "agent" ? "Agent" : "Tour Manager";

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-2xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <Logomark size={32} className="mb-8" />
          <p className="text-[13px] text-ink-500 mb-4">Deal confirmation request from {venue.name}</p>
          <h1
            className="font-display text-[36px] font-medium text-ink-900 leading-[1.05] mb-3"
            style={{ letterSpacing: "-0.02em", fontOpticalSizing: "auto" }}
          >
            {artist.name} at {venue.name}
          </h1>
          <p className="text-[14px] text-ink-500">
            {formatShowDateFull(show.date)}
            {show.doorsTime && ` · Doors ${show.doorsTime}`}
            {show.setTime && ` · Set ${show.setTime}`}
          </p>
          <p className="text-[13px] text-ink-400 mt-2">
            Sent to you as {recipientRole} — please review and confirm below.
          </p>
        </div>

        {/* Deal summary */}
        <div className="rounded-xl bg-white ring-1 ring-ink-200/60 p-6 mb-6 space-y-5">
          <h2 className="text-[16px] font-semibold text-ink-900">What was agreed</h2>

          {/* Deal type plain English */}
          <p className="text-[14px] text-ink-700 leading-relaxed">
            {dealSummaryProse(deal, artist.name)}
          </p>

          {/* Bonus summary */}
          {bonuses.length > 0 && (
            <div className="pt-4 border-t border-ink-100/80">
              <p className="text-[13px] text-ink-700 leading-relaxed">
                Additionally:{" "}
                {bonuses.map((b, i) => (
                  <span key={i}>
                    {bonusProseSentence(b)}
                    {i < bonuses.length - 1 ? " " : ""}
                  </span>
                ))}
              </p>
            </div>
          )}

          {/* Prose bonuses note */}
          {bonuses.length === 0 && deal.dealNotesFreetext && (
            <div className="pt-4 border-t border-ink-100/80">
              <p className="text-[12.5px] text-ink-500">
                Additional bonus terms are described in the deal notes below. They are not visible to the settlement engine.
              </p>
            </div>
          )}

          {/* Deal notes */}
          {deal.dealNotesFreetext && (
            <div className="pt-4 border-t border-ink-100/80">
              <p className="text-[12px] text-ink-500 mb-2">The agreed deal notes are included below for reference.</p>
              <p className="text-[13px] text-ink-700 leading-relaxed italic bg-canvas-soft rounded-lg p-4 ring-1 ring-ink-200/40">
                {deal.dealNotesFreetext}
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <DealConfirmActions token={token} venueName={venue.name} />

        <p className="text-[11px] text-ink-400 text-center mt-8">
          This link expires {confirmation.tokenExpiresAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.
        </p>
      </div>
    </div>
  );
}

function TokenState({ heading, body, venueName: _ }: { heading: string; body: string; venueName: string }) {
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center">
      <div className="max-w-md text-center px-6 py-12 space-y-4">
        <Logomark size={32} className="mx-auto mb-6" />
        <h1 className="font-display text-[28px] font-medium text-ink-900" style={{ letterSpacing: "-0.02em" }}>
          {heading}
        </h1>
        <p className="text-[14px] text-ink-500 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

function dealSummaryProse(deal: Deal, artistName: string): string {
  const pct = deal.percentage != null ? `${(deal.percentage * 100).toFixed(0)}%` : null;
  const guarantee = deal.guaranteeAmount != null ? formatMoney(deal.guaranteeAmount) : null;
  const basis = deal.percentageBasis;
  const cap = deal.expenseCap != null ? `, which are capped at ${formatMoney(deal.expenseCap)}` : "";

  switch (deal.dealType) {
    case "flat":
      return `${artistName} earns a guaranteed ${guarantee ?? "?"} regardless of ticket sales.`;

    case "percentage_of_gross":
      return `${artistName} earns ${pct ?? "?%"} of total ticket revenue before any deductions.`;

    case "percentage_of_net":
      return `${artistName} earns ${pct ?? "?%"} of net box office. Net box office is the total ticket revenue minus platform fees and pass-through venue expenses${cap}.`;

    case "vs":
      if (basis === "net") {
        return `${artistName} earns whichever is higher on the night: a ${guarantee ?? "?"} guarantee, or ${pct ?? "?%"} of net box office. Net box office is the total ticket revenue minus platform fees and pass-through venue expenses${cap}.`;
      }
      return `${artistName} earns whichever is higher on the night: a ${guarantee ?? "?"} guarantee, or ${pct ?? "?%"} of gross box office.`;

    case "door":
      return `${artistName} takes all ticket revenue after pass-through venue expenses are deducted${cap}.`;
  }
}

function bonusProseSentence(b: Bonus): string {
  switch (b.type) {
    case "gross_threshold":
      if (b.stacks) {
        return b.label.toLowerCase().includes("100%")
          ? `The artist earns 100% of revenue above ${formatMoney(b.threshold)} as a walk pot — on top of the main deal.`
          : `An extra ${formatMoney(b.amount)} is paid as a walk pot if gross exceeds ${formatMoney(b.threshold)}.`;
      }
      return `An extra ${formatMoney(b.amount)} is paid if the show grosses over ${formatMoney(b.threshold)} in tickets.`;
    case "sellout":
      return `A sellout bonus of ${formatMoney(b.amount)} is paid if 95% or more of capacity is sold.`;
    case "attendance_threshold":
      return `An extra ${formatMoney(b.amount)} is paid if more than ${b.threshold.toLocaleString()} tickets are sold.`;
    case "tier_ratchet": {
      const isDollar = b.tiers.some(t => t.to != null && t.to > 1);
      const upgradeTiers = b.tiers.filter(t => t.from > 0);
      return upgradeTiers.map(t => isDollar
        ? `The percentage rate increases to ${(t.percentage * 100).toFixed(0)}% once box office exceeds ${formatMoney(t.from)}.`
        : `The percentage rate increases to ${(t.percentage * 100).toFixed(0)}% once the show reaches ${(t.from * 100).toFixed(0)}% capacity.`
      ).join(" ");
    }
    case "walk_pot":
      return `The artist earns ${(b.percentage * 100).toFixed(0)}% of all revenue above ${formatMoney(b.threshold)} as a walk pot.`;
  }
}
