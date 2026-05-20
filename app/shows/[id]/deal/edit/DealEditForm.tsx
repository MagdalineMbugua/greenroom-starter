"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { Trash2, Plus, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SegmentedControl } from "@/components/ui/toggle";
import { DealTypeBadge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import type { Bonus, Deal, DealRecoup } from "@/db/schema";
import { saveDeal } from "./actions";

// Local bonus rows carry a key for React rendering
// tier_ratchet also carries _ratchetMode for the form UI (stripped on save)
type BonusRow =
  | (Extract<Bonus, { type: "gross_threshold" }> & { _key: string })
  | (Extract<Bonus, { type: "walk_pot" }> & { _key: string })
  | (Extract<Bonus, { type: "sellout" }> & { _key: string })
  | (Extract<Bonus, { type: "attendance_threshold" }> & { _key: string })
  | (Extract<Bonus, { type: "tier_ratchet" }> & { _key: string; _ratchetMode: "sell_through" | "dollar" });

let _keyCounter = 0;
function nextKey() {
  return `b_${++_keyCounter}`;
}

function makeBonusRow(type: Bonus["type"]): BonusRow {
  const base = { _key: nextKey(), label: "" };
  switch (type) {
    case "gross_threshold":
      return { ...base, type, threshold: 0, amount: 0 };
    case "walk_pot":
      return { ...base, type, threshold: 0, percentage: 1.0 };
    case "sellout":
      return { ...base, type, amount: 0, selloutPct: 0.95 };
    case "attendance_threshold":
      return { ...base, type, threshold: 0, amount: 0 };
    case "tier_ratchet":
      return {
        ...base,
        type,
        tiers: [
          { from: 0, to: 0.8, percentage: 0.85 },
          { from: 0.8, to: null, percentage: 0.95 },
        ],
        _ratchetMode: "sell_through" as const,
      };
  }
}

function bonusToRow(b: Bonus): BonusRow {
  if (b.type === "tier_ratchet") {
    const mode = b.tiers.some(t => t.to != null && t.to > 1) ? "dollar" : "sell_through";
    return { ...b, _key: nextKey(), _ratchetMode: mode } as BonusRow;
  }
  return { ...b, _key: nextKey() } as BonusRow;
}

// ---------- props ----------

interface ShowData {
  grossBoxOffice: number;
  totalFees: number;
  totalExpenses: number;
  ticketsSold: number;
  venueCapacity?: number;
}

interface DealEditFormProps {
  showId: string;
  dealId: string | null;
  initialDeal: Deal | null;
  artistName: string;
  showData: ShowData;
}

// ---------- component ----------

const DEAL_TYPES = [
  { value: "flat" as const, label: "Flat" },
  { value: "percentage_of_gross" as const, label: "% of Gross" },
  { value: "percentage_of_net" as const, label: "% of Net" },
  { value: "vs" as const, label: "Vs" },
  { value: "door" as const, label: "Door" },
];

const DEAL_TYPE_DESCRIPTIONS: Record<Deal["dealType"], string> = {
  flat: "Artist earns a fixed guarantee. No percentage.",
  percentage_of_gross: "Artist earns a percentage of total ticket revenue.",
  percentage_of_net: "Artist earns a percentage of gross minus fees and pass-through expenses.",
  vs: "Artist earns whichever is higher: the guarantee or a percentage of box office.",
  door: "Artist takes gross revenue minus pass-through expenses. No percentage rate.",
};

function getBonusTypeOptions(dealType: Deal["dealType"]) {
  return [
    { value: "gross_threshold", label: "Gross threshold" },
    ...(dealType === "vs" ? [{ value: "walk_pot", label: "Walk pot" }] : []),
    { value: "sellout", label: "Sellout bonus" },
    { value: "attendance_threshold", label: "Attendance threshold" },
    ...(dealType !== "flat" && dealType !== "door" ? [{ value: "tier_ratchet", label: "Tier ratchet" }] : []),
  ];
}

export function DealEditForm({ showId, dealId, initialDeal, artistName, showData }: DealEditFormProps) {
  const [dealType, setDealType] = useState<Deal["dealType"]>(initialDeal?.dealType ?? "flat");
  const [guarantee, setGuarantee] = useState(initialDeal?.guaranteeAmount?.toString() ?? "");
  const [percentage, setPercentage] = useState(
    initialDeal?.percentage != null
      ? String(parseFloat((initialDeal.percentage * 100).toFixed(2)))
      : "",
  );
  const [percentageBasis, setPercentageBasis] = useState<"gross" | "net">(
    initialDeal?.percentageBasis ?? "net",
  );
  const [expenseCap, setExpenseCap] = useState(initialDeal?.expenseCap?.toString() ?? "");
  const [hospitalityCap, setHospitalityCap] = useState(initialDeal?.hospitalityCap?.toString() ?? "");
  const [recoupRows, setRecoupRows] = useState<(DealRecoup & { _key: string })[]>(() => {
    if (!initialDeal?.recoupsJson) return [];
    try {
      const parsed = JSON.parse(initialDeal.recoupsJson);
      return Array.isArray(parsed) ? parsed.map((r: DealRecoup) => ({ ...r, _key: nextKey() })) : [];
    } catch { return []; }
  });
  const [recoupsOpen, setRecoupsOpen] = useState(false);
  const [bonuses, setBonuses] = useState<BonusRow[]>(
    () => {
      if (!initialDeal?.bonusesJson) return [];
      try {
        const parsed = JSON.parse(initialDeal.bonusesJson);
        return Array.isArray(parsed) ? parsed.map(bonusToRow) : [];
      } catch { return []; }
    },
  );
  const [dealNotes, setDealNotes] = useState(initialDeal?.dealNotesFreetext ?? "");
  const [bonusesOpen, setBonusesOpen] = useState(bonuses.length > 0);
  const [isPending, startTransition] = useTransition();

  // Percentage parsing — input is always in % (e.g. 80 means 80%), stored as decimal (0.80)
  const pctRaw = parseFloat(percentage);
  const pctDecimal = !isNaN(pctRaw) ? parseFloat((pctRaw / 100).toFixed(4)) : null;

  // Hospitality cap validation
  const expCapVal = parseFloat(expenseCap);
  const hospCapVal = parseFloat(hospitalityCap);
  const hospCapError =
    !isNaN(expCapVal) && !isNaN(hospCapVal) && hospCapVal > expCapVal
      ? "Hospitality cap cannot exceed the expense cap."
      : null;

  // Walk pot detection
  const hasWalkPot = bonuses.some(b => b.type === "gross_threshold" && (b as { stacks?: boolean }).stacks);
  const walkPotOnNonVs = hasWalkPot && dealType !== "vs";
  const walkPotNoGuarantee = hasWalkPot && dealType === "vs" && !guarantee;

  const hasRatchetNoPercent =
    bonuses.some(b => b.type === "tier_ratchet") &&
    (dealType === "flat" || dealType === "door") === false &&
    !percentage;

  // Required field validation
  const needsGuarantee = dealType === "flat" || dealType === "vs";
  const needsPercentage = dealType === "percentage_of_gross" || dealType === "percentage_of_net" || dealType === "vs";
  const valid =
    (!needsGuarantee || guarantee !== "") &&
    (!needsPercentage || percentage !== "") &&
    !hospCapError;

  const showCaps = (["percentage_of_net", "vs", "door"] as Deal["dealType"][]).includes(dealType);

  function handleSave() {
    startTransition(async () => {
      const bonusesClean = bonuses.map(b => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _key, _ratchetMode, ...rest } = b as BonusRow & Record<string, unknown>;
        return rest;
      });
      await saveDeal(showId, dealId, {
        dealType,
        guaranteeAmount: guarantee ? parseFloat(guarantee) : null,
        percentage: pctDecimal,
        percentageBasis: dealType === "vs" ? percentageBasis : null,
        expenseCap: showCaps && expenseCap ? parseFloat(expenseCap) : null,
        hospitalityCap: showCaps && hospitalityCap ? parseFloat(hospitalityCap) : null,
        recoupsJson: true && recoupRows.length > 0
          ? JSON.stringify(recoupRows.map(({ _key: _k, ...r }) => r))
          : null,
        bonusesJson: bonusesClean.length > 0 ? JSON.stringify(bonusesClean) : null,
        dealNotesFreetext: dealNotes || null,
      });
    });
  }

  // Live preview calculation (inline, no engine import)
  const preview = computePreview({
    dealType,
    guarantee: guarantee ? parseFloat(guarantee) : null,
    pctDecimal,
    percentageBasis,
    expenseCap: showCaps && expenseCap ? parseFloat(expenseCap) : null,
    showData,
  });

  // ---------- render ----------

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Main form (2/3 width) */}
      <div className="md:col-span-2 space-y-6">

        {/* Form-level warnings */}
        {(walkPotOnNonVs || walkPotNoGuarantee || hasRatchetNoPercent) && (
          <div className="space-y-2">
            {walkPotOnNonVs && (
              <Callout>Walk pots only apply to vs deals. Change the deal type or remove the walk pot toggle.</Callout>
            )}
            {walkPotNoGuarantee && (
              <Callout>Walk pots require a guarantee amount on the vs deal.</Callout>
            )}
            {hasRatchetNoPercent && (
              <Callout>Ratchets require a base percentage rate.</Callout>
            )}
          </div>
        )}

        {/* Deal type selector */}
        <Card>
          <CardContent className="pt-5 space-y-3">
            <SegmentedControl
              options={DEAL_TYPES}
              value={dealType}
              onChange={(v) => {
                setDealType(v);
                if (v === "door") { setGuarantee(""); setPercentage(""); }
                if (v === "flat") { setPercentage(""); setExpenseCap(""); setHospitalityCap(""); setRecoupRows([]); }
                if (v === "percentage_of_gross") { setGuarantee(""); setExpenseCap(""); setHospitalityCap(""); setRecoupRows([]); }
                if (v === "percentage_of_net") setGuarantee("");
                if (v === "vs") setGuarantee("");
              }}
              className="w-full"
            />
            <p className="text-[12.5px] text-ink-500">{DEAL_TYPE_DESCRIPTIONS[dealType]}</p>
          </CardContent>
        </Card>

        {/* Field group */}
        <Card>
          <CardContent className="pt-5 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {/* Guarantee */}
              {(dealType === "flat" || dealType === "vs") && (
                <div className="sm:col-span-1">
                  <FieldLabel required>Guarantee</FieldLabel>
                  <Input
                    type="number"
                    prefix="$"
                    placeholder="18000"
                    value={guarantee}
                    onChange={e => setGuarantee(e.target.value)}
                    min={0}
                  />
                </div>
              )}

              {/* Percentage — for vs, spans 2 cols so number + basis dropdown both fit */}
              {(dealType === "percentage_of_gross" || dealType === "percentage_of_net" || dealType === "vs") && (
                <div className={dealType === "vs" ? "sm:col-span-2" : "sm:col-span-1"}>
                  <FieldLabel required>Percentage</FieldLabel>
                  {dealType === "vs" ? (
                    <div className="flex gap-2">
                      <div className="w-20 shrink-0">
                        <Input
                          type="number"
                          placeholder="85"
                          value={percentage}
                          onChange={e => setPercentage(e.target.value)}
                          min={0}
                          max={100}
                          step={0.01}
                        />
                      </div>
                      <Select
                        value={percentageBasis}
                        onChange={e => setPercentageBasis(e.target.value as "gross" | "net")}
                        className="flex-1"
                      >
                        <option value="gross">% of Gross</option>
                        <option value="net">% of Net</option>
                      </Select>
                    </div>
                  ) : (
                    <Input
                      type="number"
                      placeholder="85"
                      value={percentage}
                      onChange={e => setPercentage(e.target.value)}
                      min={0}
                      max={100}
                      step={0.01}
                    />
                  )}
                </div>
              )}

              {/* Expense cap — not shown for flat or % of gross */}
              {showCaps && (
                <div className="sm:col-span-1">
                  <FieldLabel>Expense cap</FieldLabel>
                  <Input
                    type="number"
                    prefix="$"
                    placeholder="optional"
                    value={expenseCap}
                    onChange={e => setExpenseCap(e.target.value)}
                    min={0}
                  />
                  <p className="text-[11px] text-ink-400 mt-1 leading-snug">
                    {expenseCap
                      ? "Pass-through expenses and any in-cap recoups share this ceiling."
                      : "No cap — all pass-through expenses deducted in full."}
                  </p>
                </div>
              )}

              {/* Hospitality cap — same visibility as expense cap */}
              {showCaps && (
                <div className="sm:col-span-1">
                  <FieldLabel>Hospitality cap</FieldLabel>
                  <Input
                    type="number"
                    prefix="$"
                    placeholder="optional"
                    value={hospitalityCap}
                    onChange={e => setHospitalityCap(e.target.value)}
                    min={0}
                  />
                  {hospCapError && (
                    <p className="text-[11px] text-rose-600 mt-1">{hospCapError}</p>
                  )}
                </div>
              )}
            </div>

            {/* Recoups — % of net, door, and vs-net only */}
            {true && (
              <div className="border-t border-ink-100/80 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="eyebrow text-[10px] text-ink-500">
                    Recoups{recoupRows.length > 0 && ` · ${recoupRows.length}`}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setRecoupRows(prev => [...prev, { _key: nextKey(), category: "marketing", label: "", amount: 0, treatment: "in_pool" }]);
                        setRecoupsOpen(true);
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" /> Add recoup
                    </Button>
                    {recoupRows.length > 0 && (
                      <button type="button" onClick={() => setRecoupsOpen(o => !o)} className="text-[12px] text-ink-400 hover:text-ink-700">
                        {recoupsOpen ? "▾" : "▸"}
                      </button>
                    )}
                  </div>
                </div>
                {recoupsOpen && recoupRows.length > 0 && (
                  <div className="space-y-3">
                    {recoupRows.map((row, i) => (
                      <RecoupRowEditor
                        key={row._key}
                        row={row}
                        onChange={updated => setRecoupRows(prev => prev.map((p, pi) => pi === i ? { ...updated, _key: row._key } : p))}
                        onRemove={() => setRecoupRows(prev => prev.filter((_, pi) => pi !== i))}
                      />
                    ))}
                  </div>
                )}
                {recoupRows.length === 0 && (
                  <p className="text-[12px] text-ink-400">No recoups added. Use &ldquo;Add recoup&rdquo; for pre-agreed venue costs (marketing, advances, etc.).</p>
                )}
              </div>
            )}

            {/* Net basis note */}
            {(dealType === "percentage_of_net" || (dealType === "vs" && percentageBasis === "net")) && (
              <p className="text-[12px] text-amber-700 leading-snug">
                Comps marked &lsquo;counts toward gross&rsquo; on the show will inflate the net figure at settlement.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Bonuses section */}
        <Card>
          <CardHeader>
            <CardTitle>Bonuses & escalators</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setBonuses(prev => [...prev, makeBonusRow("gross_threshold")]); setBonusesOpen(true); }}
              >
                <Plus className="h-3.5 w-3.5" /> Add bonus
              </Button>
              <button
                type="button"
                onClick={() => setBonusesOpen(o => !o)}
                className="text-[12px] text-ink-400 hover:text-ink-700"
              >
                {bonusesOpen ? "▾" : "▸"}
              </button>
            </div>
          </CardHeader>
          {bonusesOpen && (
            <CardContent className="space-y-4 divide-y divide-ink-100/60">
              {bonuses.length === 0 ? (
                <p className="text-[12.5px] text-ink-400 py-2">No bonuses added yet.</p>
              ) : (
                bonuses.map((b, i) => (
                  <BonusRowEditor
                    key={b._key}
                    bonus={b}
                    onChange={(updated) => setBonuses(prev => prev.map((p, pi) => pi === i ? { ...updated, _key: b._key } as BonusRow : p))}
                    onRemove={() => setBonuses(prev => prev.filter((_, pi) => pi !== i))}
                    dealType={dealType}
                  />
                ))
              )}
            </CardContent>
          )}
        </Card>

        {/* Deal notes */}
        <Card>
          <CardHeader>
            <CardTitle>Deal notes (free text)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Textarea
              placeholder="Enter deal notes exactly as agreed with the agent..."
              value={dealNotes}
              onChange={e => setDealNotes(e.target.value)}
              rows={5}
            />
            <p className="text-[12px] text-ink-400 leading-snug">
              This is what booker actually trusts. Bonuses that appear only here are invisible to the settlement engine — enter them in structured form above to include them in calculations.
            </p>
          </CardContent>
        </Card>

        {/* Save / Cancel */}
        <div className="flex items-center gap-3 pb-8">
          <Link href={`/shows/${showId}`}>
            <Button variant="ghost" size="lg" disabled={isPending}>Cancel</Button>
          </Link>
          <Button
            variant="brand"
            size="lg"
            disabled={!valid || isPending}
            onClick={handleSave}
          >
            {isPending ? "Saving…" : "Save deal terms"}
          </Button>
        </div>
      </div>

      {/* Sidebar: live preview */}
      <div className="md:col-span-1">
        <div className="sticky top-6">
          <LivePreview
            dealType={dealType}
            preview={preview}
            artistName={artistName}
          />
        </div>
      </div>
    </div>
  );
}

// ---------- sub-components ----------

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <div className="eyebrow text-[10px] text-ink-500 mb-1.5">
      {children}{required && <span className="text-rose-500 ml-0.5">*</span>}
    </div>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-200/60 bg-amber-50/40 p-3 flex gap-2.5">
      <AlertCircle className="h-3.5 w-3.5 text-amber-700 mt-0.5 shrink-0" />
      <p className="text-[12.5px] text-amber-800 leading-snug">{children}</p>
    </div>
  );
}

interface BonusRowEditorProps {
  bonus: BonusRow;
  onChange: (updated: Omit<BonusRow, "_key">) => void;
  onRemove: () => void;
  dealType: Deal["dealType"];
}

function BonusRowEditor({ bonus, onChange, onRemove, dealType }: BonusRowEditorProps) {
  return (
    <div className="pt-4 first:pt-0 space-y-3">
      {/* Type selector + remove */}
      <div className="flex items-center justify-between gap-2">
        <Select
          value={bonus.type}
          onChange={e => onChange({ ...makeBonusRow(e.target.value as Bonus["type"]), label: bonus.label } as Omit<BonusRow, "_key">)}
          className="w-44"
        >
          {getBonusTypeOptions(dealType).map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>
        <button type="button" onClick={onRemove} className="text-ink-300 hover:text-rose-600 transition-colors">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Label */}
      <div>
        <FieldLabel>Label</FieldLabel>
        <Input
          type="text"
          placeholder={bonus.type === "walk_pot" ? `e.g. "Walkout pot: 100% of gross above $3,200"` : `e.g. "Bonus: $1,000 over $40k gross"`}
          value={bonus.label}
          onChange={e => onChange({ ...bonus, label: e.target.value } as Omit<BonusRow, "_key">)}
        />
      </div>

      {/* ── gross_threshold ── */}
      {bonus.type === "gross_threshold" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Gross floor</FieldLabel>
            <Input
              type="number"
              prefix="$"
              placeholder="25000"
              value={bonus.threshold?.toString() ?? ""}
              onChange={e => onChange({ ...bonus, threshold: parseFloat(e.target.value) || 0 } as Omit<BonusRow, "_key">)}
            />
          </div>
          <div>
            <FieldLabel>Bonus amount</FieldLabel>
            <Input
              type="number"
              prefix="$"
              placeholder="1000"
              value={bonus.amount?.toString() ?? ""}
              onChange={e => onChange({ ...bonus, amount: parseFloat(e.target.value) || 0 } as Omit<BonusRow, "_key">)}
            />
          </div>
        </div>
      )}

      {/* ── walk_pot ── */}
      {bonus.type === "walk_pot" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Gross floor</FieldLabel>
              <Input
                type="number"
                prefix="$"
                placeholder="3200"
                value={bonus.threshold?.toString() ?? ""}
                onChange={e => onChange({ ...bonus, threshold: parseFloat(e.target.value) || 0 } as Omit<BonusRow, "_key">)}
              />
              <p className="text-[11px] text-ink-400 mt-1">Gross must exceed this (strict &gt;).</p>
            </div>
            <div>
              <FieldLabel>Artist share %</FieldLabel>
              <Input
                type="number"
                placeholder="100"
                value={((bonus.percentage ?? 1) * 100).toFixed(0)}
                min={0}
                max={100}
                step={1}
                onChange={e => onChange({ ...bonus, percentage: (parseFloat(e.target.value) || 0) / 100 } as Omit<BonusRow, "_key">)}
              />
              <p className="text-[11px] text-ink-400 mt-1">Payout = (gross − floor) × this %</p>
            </div>
          </div>
          {dealType !== "vs" && (
            <Callout>Walk pots only apply to vs deals. Change the deal type or remove this bonus.</Callout>
          )}
        </>
      )}

      {/* ── sellout ── */}
      {bonus.type === "sellout" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Bonus amount</FieldLabel>
            <Input
              type="number"
              prefix="$"
              placeholder="500"
              value={bonus.amount?.toString() ?? ""}
              onChange={e => onChange({ ...bonus, amount: parseFloat(e.target.value) || 0 } as Omit<BonusRow, "_key">)}
            />
          </div>
          <div>
            <FieldLabel>Sellout at %</FieldLabel>
            <Input
              type="number"
              placeholder="95"
              min={0}
              max={100}
              step={1}
              value={(((bonus.selloutPct ?? 0.95)) * 100).toFixed(0)}
              onChange={e => onChange({ ...bonus, selloutPct: (parseFloat(e.target.value) || 95) / 100 } as Omit<BonusRow, "_key">)}
            />
            <p className="text-[11px] text-ink-400 mt-1">Triggers when tickets sold ≥ this % of capacity.</p>
          </div>
        </div>
      )}

      {/* ── attendance_threshold ── */}
      {bonus.type === "attendance_threshold" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Ticket count</FieldLabel>
            <Input
              type="number"
              placeholder="500"
              value={bonus.threshold?.toString() ?? ""}
              onChange={e => onChange({ ...bonus, threshold: parseFloat(e.target.value) || 0 } as Omit<BonusRow, "_key">)}
            />
            <p className="text-[11px] text-ink-400 mt-1">Raw tickets sold (strict &gt;).</p>
          </div>
          <div>
            <FieldLabel>Bonus amount</FieldLabel>
            <Input
              type="number"
              prefix="$"
              placeholder="300"
              value={bonus.amount?.toString() ?? ""}
              onChange={e => onChange({ ...bonus, amount: parseFloat(e.target.value) || 0 } as Omit<BonusRow, "_key">)}
            />
          </div>
        </div>
      )}

      {/* ── tier_ratchet ── */}
      {bonus.type === "tier_ratchet" && (() => {
        const ratchetRow = bonus as Extract<BonusRow, { type: "tier_ratchet" }>;
        const isDollar = ratchetRow._ratchetMode === "dollar";

        function updateTiers(newTiers: { from: number; to: number | null; percentage: number }[]) {
          onChange({ ...ratchetRow, tiers: newTiers } as unknown as Omit<BonusRow, "_key">);
        }

        return (
          <div className="space-y-3">
            {/* Mode selector */}
            <div className="flex items-center justify-between">
              <FieldLabel>Tier basis</FieldLabel>
              <SegmentedControl
                options={[
                  { value: "sell_through", label: "Sell-through %" },
                  { value: "dollar", label: "Dollar threshold" },
                ]}
                value={ratchetRow._ratchetMode}
                onChange={v => onChange({ ...ratchetRow, _ratchetMode: v } as unknown as Omit<BonusRow, "_key">)}
              />
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-[1fr_1fr_5rem_1.5rem] gap-2 text-[11px] text-ink-400 px-0.5">
              <div>{isDollar ? "From $" : "% sold from"}</div>
              <div>{isDollar ? "To $" : "% sold to"}</div>
              <div>Rate %</div>
              <div />
            </div>

            {/* Tier rows */}
            {bonus.tiers.map((tier, ti) => {
              const isLast = ti === bonus.tiers.length - 1;
              const fromVal = isDollar ? tier.from.toString() : (tier.from * 100).toFixed(0);
              const toVal = tier.to === null ? null : (isDollar ? tier.to.toString() : (tier.to * 100).toFixed(0));

              return (
                <div key={ti} className="grid grid-cols-[1fr_1fr_5rem_1.5rem] gap-2 items-center">
                  {/* From */}
                  {isDollar ? (
                    <Input type="number" prefix="$" placeholder="0" value={fromVal}
                      onChange={e => {
                        const v = parseFloat(e.target.value) || 0;
                        updateTiers(bonus.tiers.map((t, i) => i === ti ? { ...t, from: v } : t));
                      }}
                    />
                  ) : (
                    <div className="flex items-center gap-1">
                      <Input type="number" placeholder="0" min={0} max={100} value={fromVal}
                        onChange={e => {
                          const v = (parseFloat(e.target.value) || 0) / 100;
                          updateTiers(bonus.tiers.map((t, i) => i === ti ? { ...t, from: v } : t));
                        }}
                      />
                      <span className="text-[12px] text-ink-400 shrink-0">%</span>
                    </div>
                  )}

                  {/* To */}
                  {tier.to === null ? (
                    <input disabled value="and above"
                      className="w-full px-3 py-2 rounded-lg border border-ink-200/80 bg-canvas-soft text-[13px] text-ink-400 cursor-not-allowed"
                    />
                  ) : isDollar ? (
                    <Input type="number" prefix="$" placeholder="34000" value={toVal ?? ""}
                      onChange={e => {
                        const v = parseFloat(e.target.value) || 0;
                        updateTiers(bonus.tiers.map((t, i) => {
                          if (i === ti) return { ...t, to: v };
                          if (i === ti + 1) return { ...t, from: v }; // auto-chain
                          return t;
                        }));
                      }}
                    />
                  ) : (
                    <div className="flex items-center gap-1">
                      <Input type="number" placeholder="80" min={0} max={100} value={toVal ?? ""}
                        onChange={e => {
                          const v = (parseFloat(e.target.value) || 0) / 100;
                          updateTiers(bonus.tiers.map((t, i) => {
                            if (i === ti) return { ...t, to: v };
                            if (i === ti + 1) return { ...t, from: v }; // auto-chain
                            return t;
                          }));
                        }}
                      />
                      <span className="text-[12px] text-ink-400 shrink-0">%</span>
                    </div>
                  )}

                  {/* Rate % */}
                  <div className="flex items-center gap-1">
                    <Input type="number" placeholder="85" min={0} max={100} step={0.01}
                      value={(tier.percentage * 100).toFixed(0)}
                      onChange={e => updateTiers(bonus.tiers.map((t, i) => i === ti ? { ...t, percentage: (parseFloat(e.target.value) || 0) / 100 } : t))}
                      className="w-full"
                    />
                    <span className="text-[12px] text-ink-400 shrink-0">%</span>
                  </div>

                  {/* Delete — not on last tier */}
                  {!isLast ? (
                    <button type="button"
                      onClick={() => updateTiers(bonus.tiers.filter((_, i) => i !== ti))}
                      className="text-ink-300 hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : <div />}
                </div>
              );
            })}

            <Button type="button" variant="ghost" size="sm" onClick={() => {
              const last = bonus.tiers[bonus.tiers.length - 1];
              const breakpoint = isDollar
                ? (last.from + 10000)
                : Math.min(last.from + 0.1, 0.95);
              updateTiers([
                ...bonus.tiers.slice(0, -1),
                { ...last, to: breakpoint },
                { from: breakpoint, to: null, percentage: Math.min(1, last.percentage + 0.05) },
              ]);
            }}>
              <Plus className="h-3.5 w-3.5" /> Add tier
            </Button>

            <p className="text-[11.5px] text-ink-500 leading-snug">
              A ratchet replaces the deal&apos;s base percentage — it does not add to it. Only one ratchet is evaluated per deal.
            </p>
          </div>
        );
      })()}
    </div>
  );
}

// ---------- recoup row editor ----------

const RECOUP_CATEGORY_OPTIONS: { value: DealRecoup["category"]; label: string }[] = [
  { value: "marketing", label: "Marketing" },
  { value: "hospitality_overage", label: "Hospitality overage" },
  { value: "production_overage", label: "Production overage" },
  { value: "prior_advance", label: "Prior advance" },
  { value: "damages", label: "Damages" },
  { value: "other", label: "Other" },
];

function RecoupRowEditor({
  row,
  onChange,
  onRemove,
}: {
  row: DealRecoup & { _key: string };
  onChange: (updated: DealRecoup) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_1.5fr_7rem_8rem_1.5rem] gap-2 items-center">
      <Select
        value={row.category}
        onChange={e => onChange({ ...row, category: e.target.value as DealRecoup["category"] })}
      >
        {RECOUP_CATEGORY_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </Select>
      <Input
        type="text"
        placeholder="Description"
        value={row.label}
        onChange={e => onChange({ ...row, label: e.target.value })}
      />
      <Input
        type="number"
        prefix="$"
        placeholder="0"
        min={0}
        value={row.amount > 0 ? row.amount.toString() : ""}
        onChange={e => onChange({ ...row, amount: parseFloat(e.target.value) || 0 })}
      />
      <Select
        value={row.treatment}
        onChange={e => onChange({ ...row, treatment: e.target.value as DealRecoup["treatment"] })}
      >
        <option value="in_pool">In expense cap</option>
        <option value="hard_deduct">Hard deduct</option>
      </Select>
      <button type="button" onClick={onRemove} className="text-ink-300 hover:text-rose-600 transition-colors">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

// ---------- live preview ----------

interface PreviewResult {
  gross: number;
  fees: number;
  expenses: number;
  net: number;
  percentagePayout: number | null;
  vsWinner: number | null;
  total: number | null;
  formula: string;
  missingField?: string;
}

function computePreview(params: {
  dealType: Deal["dealType"];
  guarantee: number | null;
  pctDecimal: number | null;
  percentageBasis: "gross" | "net";
  expenseCap: number | null;
  showData: ShowData;
}): PreviewResult {
  const { dealType, guarantee, pctDecimal, percentageBasis, expenseCap, showData } = params;
  const { grossBoxOffice: gross, totalFees: fees, totalExpenses: rawExpenses } = showData;
  const expenses = expenseCap != null ? Math.min(rawExpenses, expenseCap) : rawExpenses;
  const net = gross - fees - expenses;

  switch (dealType) {
    case "flat": {
      if (guarantee == null) return { gross, fees, expenses, net, percentagePayout: null, vsWinner: null, total: null, formula: "", missingField: "guarantee" };
      return { gross, fees, expenses, net, percentagePayout: null, vsWinner: null, total: guarantee, formula: `flat ${formatMoney(guarantee)}` };
    }
    case "percentage_of_gross": {
      if (pctDecimal == null) return { gross, fees, expenses, net, percentagePayout: null, vsWinner: null, total: null, formula: "", missingField: "percentage" };
      const payout = gross * pctDecimal;
      return { gross, fees, expenses, net, percentagePayout: payout, vsWinner: null, total: payout, formula: `gross ${formatMoney(gross)} × ${(pctDecimal * 100).toFixed(0)}% = ${formatMoney(payout)}` };
    }
    case "percentage_of_net": {
      if (pctDecimal == null) return { gross, fees, expenses, net, percentagePayout: null, vsWinner: null, total: null, formula: "", missingField: "percentage" };
      const payout = net * pctDecimal;
      return { gross, fees, expenses, net, percentagePayout: payout, vsWinner: null, total: payout, formula: `net ${formatMoney(net)} × ${(pctDecimal * 100).toFixed(0)}% = ${formatMoney(payout)}` };
    }
    case "vs": {
      if (guarantee == null) return { gross, fees, expenses, net, percentagePayout: null, vsWinner: null, total: null, formula: "", missingField: "guarantee" };
      if (pctDecimal == null) return { gross, fees, expenses, net, percentagePayout: null, vsWinner: null, total: null, formula: "", missingField: "percentage" };
      const basis = percentageBasis === "gross" ? gross : net;
      const pctPayout = basis * pctDecimal;
      const winner = Math.max(guarantee, pctPayout);
      const winsLabel = pctPayout >= guarantee ? "% wins" : "guarantee wins";
      return {
        gross, fees, expenses, net, percentagePayout: pctPayout, vsWinner: winner, total: winner,
        formula: `max(${formatMoney(guarantee)}, ${percentageBasis} ${formatMoney(basis)} × ${(pctDecimal * 100).toFixed(0)}%) = ${formatMoney(winner)} (${winsLabel})`,
      };
    }
    case "door": {
      const payout = gross - expenses;
      return { gross, fees, expenses, net, percentagePayout: null, vsWinner: null, total: payout, formula: `gross ${formatMoney(gross)} − expenses ${formatMoney(expenses)} = ${formatMoney(payout)}` };
    }
  }
}

function LivePreview({ dealType, preview, artistName }: { dealType: Deal["dealType"]; preview: PreviewResult; artistName: string }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Live preview</CardTitle>
          <div className="flex items-center gap-1.5 mt-1">
            <DealTypeBadge type={dealType} />
            <span className="text-[11px] text-ink-400">{artistName}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {preview.missingField ? (
          <p className="text-[12.5px] text-ink-400">
            Fill in {preview.missingField} to preview the calculation.
          </p>
        ) : (
          <>
            <PreviewRow label="Gross box office" value={formatMoney(preview.gross)} />
            <PreviewRow label="Fees" value={`– ${formatMoney(preview.fees)}`} muted />
            <PreviewRow label="Expenses" value={`– ${formatMoney(preview.expenses)}`} muted />
            {(dealType === "percentage_of_net" || dealType === "vs") && (
              <PreviewRow label="Net" value={formatMoney(preview.net)} strong />
            )}
            {preview.percentagePayout != null && (
              <PreviewRow label="× percentage" value={formatMoney(preview.percentagePayout)} />
            )}
            {preview.vsWinner != null && preview.percentagePayout != null && (
              <PreviewRow label="vs guarantee" value={formatMoney(preview.vsWinner)} strong />
            )}
            <div className="pt-3 mt-3 border-t border-ink-100/80">
              <PreviewRow label="Total to artist" value={preview.total != null ? formatMoney(preview.total) : "—"} strong accent />
            </div>
            <p className="text-[11px] font-mono text-ink-400 leading-snug pt-1 break-words">
              {preview.formula}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PreviewRow({ label, value, muted, strong, accent }: { label: string; value: string; muted?: boolean; strong?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-1">
      <span className={`text-[12.5px] ${muted ? "text-ink-400" : "text-ink-600"}`}>{label}</span>
      <span className={`font-mono tabular text-[13px] ${accent ? "text-brand-700 font-semibold" : strong ? "text-ink-900 font-medium" : "text-ink-700"}`}>{value}</span>
    </div>
  );
}
