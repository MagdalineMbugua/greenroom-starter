import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getShowById } from "@/lib/queries";
import { StatusBadge } from "@/components/ui/badge";
import { formatShowDateFull } from "@/lib/format";
import { DealEditForm } from "./DealEditForm";

export default async function DealEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getShowById(id);
  if (!data) notFound();

  const { show, artist, deal, ticketSales, expenses, venue } = data;

  const grossBoxOffice = ticketSales.reduce((s, t) => s + t.gross, 0);
  const totalFees = ticketSales.reduce((s, t) => s + t.fees, 0);
  const totalExpenses = expenses.filter(e => !e.absorbedByVenue).reduce((s, e) => s + e.amount, 0);
  const ticketsSold = ticketSales.reduce((s, t) => s + (t.qty ?? 0), 0);

  return (
    <div className="max-w-6xl px-12 py-10">
      <Link
        href={`/shows/${show.id}`}
        className="inline-flex items-center gap-1 text-[12px] text-ink-400 hover:text-ink-900 mb-8 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to show
      </Link>

      <div className="mb-8">
        <div className="flex items-center gap-1.5 mb-3">
          <StatusBadge status={show.status} />
        </div>
        <h1
          className="font-display text-[48px] font-medium text-ink-900 leading-[1.05]"
          style={{ letterSpacing: "-0.02em", fontOpticalSizing: "auto" }}
        >
          {artist?.name ?? "—"}
        </h1>
        <p className="text-[14px] text-ink-400 mt-2">
          {formatShowDateFull(show.date)}
        </p>
        <p className="text-[13px] text-ink-500 mt-1">
          {deal ? "Editing deal terms" : "Adding deal terms"}
        </p>
      </div>

      <DealEditForm
        showId={show.id}
        dealId={deal?.id ?? null}
        initialDeal={deal ?? null}
        artistName={artist?.name ?? "Artist"}
        showData={{
          grossBoxOffice,
          totalFees,
          totalExpenses,
          ticketsSold,
          venueCapacity: venue?.capacity ?? undefined,
        }}
      />
    </div>
  );
}
