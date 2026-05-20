"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { confirmDeal, flagDeal } from "./actions";

interface DealConfirmActionsProps {
  token: string;
  venueName: string;
}

export function DealConfirmActions({ token, venueName }: DealConfirmActionsProps) {
  const [state, setState] = useState<"idle" | "flagging" | "confirmed" | "flagged">("idle");
  const [flagNotes, setFlagNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await confirmDeal(token);
      if (result.error) {
        setError(result.error);
      } else {
        setState("confirmed");
      }
    });
  }

  function handleFlag() {
    setError(null);
    startTransition(async () => {
      const result = await flagDeal(token, flagNotes);
      if (result.error) {
        setError(result.error);
      } else {
        setState("flagged");
      }
    });
  }

  if (state === "confirmed") {
    return (
      <div className="text-center py-12 space-y-4">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 ring-1 ring-brand-200/80">
          <Check className="h-8 w-8 text-brand-700" />
        </div>
        <h2 className="font-display text-[28px] font-medium text-ink-900" style={{ letterSpacing: "-0.02em" }}>
          Confirmed
        </h2>
        <p className="text-[14px] text-ink-500 max-w-sm mx-auto leading-relaxed">
          Thanks — {venueName} has been notified.
        </p>
      </div>
    );
  }

  if (state === "flagged") {
    return (
      <div className="rounded-lg bg-canvas-soft ring-1 ring-ink-200/50 p-6 text-center">
        <p className="text-[14px] text-ink-700">
          Your note has been sent to {venueName}. They will be in touch to resolve it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          variant="brand"
          size="lg"
          className="flex-1"
          onClick={handleConfirm}
          disabled={isPending}
        >
          <Check className="h-4 w-4" />
          {isPending && state === "idle" ? "Confirming…" : "Confirm these terms"}
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="flex-1"
          onClick={() => setState("flagging")}
          disabled={isPending}
        >
          Flag an issue
        </Button>
      </div>

      {state === "flagging" && (
        <div className="space-y-3 rounded-lg border border-ink-200/80 p-4">
          <div className="eyebrow text-[10px] text-ink-500">Describe the issue</div>
          <Textarea
            placeholder="Describe the issue with these deal terms..."
            value={flagNotes}
            onChange={e => setFlagNotes(e.target.value)}
            rows={4}
          />
          <div className="flex items-center gap-2">
            <Button
              variant="brand"
              size="sm"
              onClick={handleFlag}
              disabled={isPending || !flagNotes.trim()}
            >
              {isPending ? "Submitting…" : "Submit"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setState("idle")}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-[12px] text-rose-600">{error}</p>}
    </div>
  );
}
