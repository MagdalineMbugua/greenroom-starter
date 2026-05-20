"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { DealRecoup } from "@/db/schema";
import { formatMoney } from "@/lib/format";

const CATEGORY_LABELS: Record<string, string> = {
  marketing: "Marketing",
  hospitality_overage: "Hospitality overage",
  production_overage: "Production overage",
  prior_advance: "Prior advance",
  damages: "Damages",
  other: "Other",
};

export function RecoupDetailButton({ recoups }: { recoups: DealRecoup[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-[11px] text-brand-700 hover:text-brand-900 underline underline-offset-2 transition-colors"
      >
        View details
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100/80">
              <h2 className="text-[15px] font-semibold text-ink-900">Recoup breakdown</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-ink-400 hover:text-ink-700 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-6 py-5">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left border-b border-ink-100/80">
                    <th className="pb-2 eyebrow text-[10px] text-ink-400 font-semibold">Type</th>
                    <th className="pb-2 eyebrow text-[10px] text-ink-400 font-semibold">Label</th>
                    <th className="pb-2 eyebrow text-[10px] text-ink-400 font-semibold text-right">Amount</th>
                    <th className="pb-2 eyebrow text-[10px] text-ink-400 font-semibold text-right">Treatment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100/60">
                  {recoups.map((r, i) => (
                    <tr key={i}>
                      <td className="py-2.5 text-ink-800">
                        {CATEGORY_LABELS[r.category] ?? r.category}
                      </td>
                      <td className="py-2.5 text-ink-500">{r.label || "—"}</td>
                      <td className="py-2.5 text-right font-mono tabular text-ink-900">
                        {formatMoney(r.amount)}
                      </td>
                      <td className="py-2.5 text-right">
                        {r.treatment === "in_pool" ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 ring-1 ring-amber-200/80 whitespace-nowrap">
                            In expense cap
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-rose-50 text-rose-700 ring-1 ring-rose-200/80 whitespace-nowrap">
                            Hard deduct
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-medium border-t-2 border-ink-200/80">
                    <td className="pt-3 pb-1 text-ink-900" colSpan={2}>Total</td>
                    <td className="pt-3 pb-1 text-right font-mono tabular text-ink-900">
                      {formatMoney(recoups.reduce((s, r) => s + r.amount, 0))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
