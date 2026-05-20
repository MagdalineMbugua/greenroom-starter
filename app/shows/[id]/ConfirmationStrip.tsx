"use client";

import { useState, useTransition } from "react";
import { Check, AlertTriangle, Clock, Mail, Plus, Send, RefreshCw, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendForConfirmation } from "./confirmationActions";
import type { DealConfirmation } from "@/db/schema";
import { format } from "date-fns";

interface ConfirmationStripProps {
  showId: string;
  dealId: string;
  agentName: string | null;
  agentEmail: string | null;
  agencyName: string | null;
  tmEmail: string | null;
  confirmations: DealConfirmation[];
  dealVersion: number;
}

type ConfState = "initial" | "pending" | "reviewed";

function getInitials(name: string | null, fallback: string): string {
  if (!name) return fallback.slice(0, 2).toUpperCase();
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function ReviewerCard({
  name,
  role,
  email,
  conf,
  confState,
}: {
  name: string | null;
  role: string;
  email: string | null;
  conf: DealConfirmation | null;
  confState: ConfState;
}) {
  const avatarText = getInitials(name, role);
  const isApproved = conf?.status === "confirmed";
  const isFlagged = conf?.status === "flagged";
  const isWaiting = conf?.status === "pending";

  const cardClass = isApproved
    ? "ring-1 ring-brand-200/80 bg-gradient-to-b from-brand-50/40 to-white"
    : isFlagged
      ? "ring-1 ring-amber-200/80 bg-gradient-to-b from-amber-50/40 to-white"
      : "ring-1 ring-ink-200/80 bg-white";

  const responseDate = conf?.confirmedAt ?? null;

  return (
    <div
      className={`flex items-start gap-2.5 p-3 rounded-lg shadow-[0_1px_2px_rgba(26,24,20,0.02)] ${cardClass}`}
    >
      {/* Avatar + status dot */}
      <div className="relative shrink-0">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-ink-500 to-ink-800 text-white flex items-center justify-center text-[11px] font-medium select-none">
          {avatarText}
        </div>
        {isApproved && (
          <span className="absolute -right-0.5 -bottom-0.5 w-3.5 h-3.5 rounded-full bg-brand-700 text-white flex items-center justify-center ring-[1.5px] ring-white">
            <Check className="h-2 w-2" strokeWidth={3} />
          </span>
        )}
        {isFlagged && (
          <span className="absolute -right-0.5 -bottom-0.5 w-3.5 h-3.5 rounded-full bg-amber-700 text-white flex items-center justify-center ring-[1.5px] ring-white">
            <AlertTriangle className="h-2 w-2" strokeWidth={3} />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-ink-900 truncate">{name ?? email ?? role}</div>
        <div className="text-[11.5px] text-ink-500">{role}</div>
        {email && (
          <div className="flex items-center gap-1 mt-0.5">
            <Mail className="h-2.5 w-2.5 text-ink-400 shrink-0" />
            <span className="font-mono text-[10.5px] text-ink-400 truncate">{email}</span>
          </div>
        )}
        <div
          className={`mt-2 text-[11.5px] flex items-center gap-1 ${
            isApproved
              ? "font-medium text-brand-700"
              : isFlagged
                ? "font-medium text-amber-800"
                : "italic text-ink-400"
          }`}
        >
          {isApproved && <Check className="h-3 w-3 shrink-0" />}
          {isFlagged && <AlertTriangle className="h-3 w-3 shrink-0" />}
          {isWaiting && <Clock className="h-3 w-3 shrink-0" />}
          <span>
            {!conf && "Not sent yet"}
            {isWaiting && "Awaiting response"}
            {isApproved &&
              `Approved${responseDate ? ` · ${format(new Date(responseDate), "MMM d, h:mm aaa")}` : ""}`}
            {isFlagged &&
              `Needs changes${responseDate ? ` · ${format(new Date(responseDate), "MMM d, h:mm aaa")}` : ""}`}
          </span>
        </div>
      </div>
    </div>
  );
}

function EmptyReviewerSlot() {
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-lg ring-1 ring-dashed ring-ink-200/60">
      <div className="w-8 h-8 rounded-full ring-[1.5px] ring-ink-200 flex items-center justify-center text-ink-300">
        <Plus className="h-3.5 w-3.5" />
      </div>
      <div>
        <div className="text-[13px] font-medium text-ink-500">Manager</div>
        <div className="text-[11.5px] text-ink-400">No tour manager added</div>
        <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-brand-700 mt-1.5 cursor-pointer hover:underline">
          <Plus className="h-3 w-3" />
          Add a manager
        </span>
      </div>
    </div>
  );
}

export function ConfirmationStrip({
  showId,
  agentName,
  agentEmail,
  agencyName,
  tmEmail,
  confirmations,
  dealVersion,
}: ConfirmationStripProps) {
  const [isPending, startTransition] = useTransition();
  const [showResendWarning, setShowResendWarning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentConfs = confirmations.filter((c) => c.dealVersion === dealVersion);
  const agentConf = currentConfs.find((c) => c.recipientType === "agent") ?? null;
  const tmConf = currentConfs.find((c) => c.recipientType === "tm") ?? null;
  const flaggedConf = currentConfs.find((c) => c.status === "flagged") ?? null;

  const confState: ConfState =
    currentConfs.length === 0
      ? "initial"
      : currentConfs.some((c) => c.status !== "pending")
        ? "reviewed"
        : "pending";

  const respondedCount = currentConfs.filter((c) => c.status !== "pending").length;
  const totalCount = currentConfs.length;

  function doSend() {
    setError(null);
    startTransition(async () => {
      const result = await sendForConfirmation(showId);
      if (result.error) setError(result.error);
      setShowResendWarning(false);
    });
  }

  const statusPill =
    confState === "initial" ? (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-ink-100 text-ink-700 ring-1 ring-ink-200/80 whitespace-nowrap">
        <Pencil className="h-3 w-3" />
        Draft · not sent
      </span>
    ) : confState === "pending" ? (
      <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-[11px] font-medium bg-sky-50 text-sky-800 ring-1 ring-sky-200/80 whitespace-nowrap">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-500 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-sky-600" />
        </span>
        Pending review
      </span>
    ) : flaggedConf ? (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-amber-50 text-amber-800 ring-1 ring-amber-200/80 whitespace-nowrap">
        <AlertTriangle className="h-3 w-3" />
        Changes requested
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-brand-50 text-brand-800 ring-1 ring-brand-200/80 whitespace-nowrap">
        <Check className="h-3 w-3" />
        All confirmed
      </span>
    );

  const desc =
    confState === "initial"
      ? `Send these terms to ${agentName ?? "the agent"}${tmEmail ? " and the tour manager" : ""} for sign-off before advancing the show.`
      : confState === "pending"
        ? "Awaiting sign-off. They received an email with the terms above."
        : flaggedConf
          ? "A reviewer flagged a change. Resolve the issue and resend."
          : "All reviewers have confirmed the deal terms.";

  return (
    <div
      className="px-6 py-5"
      style={{ background: "linear-gradient(180deg, var(--color-canvas-soft), white)" }}
    >
      {/* Section header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h4 className="text-[13px] font-semibold text-ink-900">Confirmation status</h4>
          <p className="text-[11.5px] text-ink-500 mt-0.5 leading-snug max-w-xs">{desc}</p>
        </div>
        {statusPill}
      </div>

      {/* Reviewer cards */}
      <div className="grid grid-cols-2 gap-2.5 mb-3">
        <ReviewerCard
          name={agentName}
          role={agencyName ? `Agent · ${agencyName}` : "Agent"}
          email={agentEmail}
          conf={agentConf}
          confState={confState}
        />
        {tmEmail ? (
          <ReviewerCard
            name={null}
            role="Tour manager"
            email={tmEmail}
            conf={tmConf}
            confState={confState}
          />
        ) : (
          <EmptyReviewerSlot />
        )}
      </div>

      {/* Sent timestamp */}
      {confState !== "initial" && agentConf && (
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-canvas-soft ring-1 ring-ink-200/40 text-[12px] text-ink-500 mb-3">
          <Mail className="h-3.5 w-3.5 text-ink-400 shrink-0" />
          <span>
            <span className="font-medium text-ink-800">
              Sent {format(new Date(agentConf.sentAt), "MMM d, yyyy · h:mm aaa")}
            </span>
            {respondedCount > 0 && (
              <span className="text-ink-400 ml-1.5">
                — {respondedCount} of {totalCount} responded
              </span>
            )}
          </span>
        </div>
      )}

      {/* Change request comment */}
      {flaggedConf?.flaggedNotes && (
        <div className="flex gap-3 px-3 py-3 rounded-lg bg-amber-50/50 ring-1 ring-amber-200/70 mb-3">
          <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <div className="text-[11px] font-semibold text-amber-800 uppercase tracking-wide mb-1">
              {flaggedConf.recipientType === "agent" ? (agentName ?? "Agent") : "Tour manager"} · change
              request
            </div>
            <p className="text-[12.5px] text-amber-800 leading-snug">
              &ldquo;{flaggedConf.flaggedNotes}&rdquo;
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && <p className="text-[12px] text-rose-600 mb-3">{error}</p>}

      {/* Resend warning */}
      {showResendWarning && (
        <div className="rounded-lg ring-1 ring-amber-200/60 bg-amber-50/40 p-3 space-y-2 mb-3">
          <p className="text-[12.5px] text-amber-800">
            Sending a new version will immediately invalidate existing links. The agent and manager will
            need to confirm again.
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowResendWarning(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button variant="brand" size="sm" onClick={doSend} disabled={isPending}>
              {isPending ? "Sending…" : "Send new version"}
            </Button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {!showResendWarning && (
        <div className="flex items-center gap-2 mt-1">
          {confState === "initial" && (
            <>
              <span className="flex-1" />
              <Button variant="ghost" size="sm" disabled>
                <Clock className="h-3.5 w-3.5" />
                Schedule for later
              </Button>
              <Button variant="brand" size="sm" onClick={doSend} disabled={isPending}>
                <Send className="h-3.5 w-3.5" />
                {isPending ? "Sending…" : "Send for confirmation"}
              </Button>
            </>
          )}
          {confState === "pending" && (
            <>
              <Button variant="ghost" size="sm" disabled>
                Withdraw
              </Button>
              <span className="flex-1" />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowResendWarning(true)}
                disabled={isPending}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Resend
              </Button>
            </>
          )}
          {confState === "reviewed" && flaggedConf && (
            <>
              <span className="flex-1" />
              <Button variant="ghost" size="sm" disabled>
                Reject changes
              </Button>
              <Button
                variant="brand"
                size="sm"
                onClick={() => setShowResendWarning(true)}
                disabled={isPending}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Apply changes & resend
              </Button>
            </>
          )}
          {confState === "reviewed" && !flaggedConf && (
            <>
              <span className="flex-1" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowResendWarning(true)}
                disabled={isPending}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Resend
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
