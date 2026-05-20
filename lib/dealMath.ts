/**
 * Deal calculation logic for the in-app settlement tool.
 *
 * Handles all five deal types end-to-end:
 *   1. flat                 — fixed guarantee, optional bonuses
 *   2. percentage_of_gross  — X% of gross, optional bonuses
 *   3. percentage_of_net    — X% of (gross - fees - expenses - recoups)
 *   4. vs                   — max(guarantee, X% of gross|net) + optional walkpot
 *   5. door                 — gross - pass-through expenses (no fees deducted)
 *
 * Also handles:
 *   - comps counting toward gross (adjustedGross)
 *   - recoups: in_pool (join expense pool, subject to cap; net-basis deals only) and
 *     hard_deduct (subtracted from final artist total for all deal types)
 *   - tier_ratchet bonuses: sell-through ratio and dollar-threshold variants
 *   - walkpot bonuses (gross_threshold with stacks:true) on vs deals
 */

import type { Deal, Expense, TicketSale, Bonus, Comp, Recoup } from "@/db/schema";

export type SettlementCalculation =
  | {
      supported: true;
      grossBoxOffice: number;
      adjustedGross: number;
      compCredit: number;
      netBoxOffice: number;
      totalExpenses: number;
      totalInPoolRecoups: number;
      totalHardDeducts: number;
      walkPotPayout: number;
      totalToArtist: number;
      steps: { label: string; value: number; note?: string }[];
      finalFormula: string;
      bonusesApplied: { label: string; amount: number; reason: string }[];
      bonusesNotTriggered: { label: string; amount: number; reason: string }[];
      warnings: { type: "net_negative" | "capacity_unknown" | "walkpot_flavor1" | "ratchet_skipped"; message: string }[];
    }
  | {
      supported: false;
      reason: string;
      dealType: Deal["dealType"];
    };

interface CalcInput {
  deal: Deal;
  ticketSales: TicketSale[];
  expenses: Expense[];
  comps?: Comp[];
  recoups?: Recoup[];
  venueCapacity?: number;
  ticketsSold?: number;
}

type Step = { label: string; value: number; note?: string };
type Warning = { type: "net_negative" | "capacity_unknown" | "walkpot_flavor1" | "ratchet_skipped"; message: string };

export function parseBonuses(deal: Deal): Bonus[] {
  if (!deal.bonusesJson) return [];
  try {
    const parsed = JSON.parse(deal.bonusesJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function parseDealRecoups(deal: Deal): Recoup[] {
  if (!deal.recoupsJson) return [];
  try {
    const parsed = JSON.parse(deal.recoupsJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((r, i) => ({
      id: `deal_${i}`,
      category: r.category ?? "other",
      label: r.label ?? "",
      amount: r.amount ?? 0,
      status: "agreed" as const,
      treatment: r.treatment ?? "hard_deduct",
    }));
  } catch {
    return [];
  }
}

// ---------- shared helpers ----------

function calcCompCredit(comps: Comp[]): number {
  return comps
    .filter(c => c.countsTowardGross)
    .reduce((s, c) => s + c.count * c.faceValue, 0);
}

function splitRecoups(recoups: Recoup[]): { inPoolTotal: number; hardDeductTotal: number } {
  const agreed = recoups.filter(r => r.status === "agreed");
  const inPoolTotal = agreed
    .filter(r => (r.treatment ?? "hard_deduct") === "in_pool")
    .reduce((s, r) => s + r.amount, 0);
  const hardDeductTotal = agreed
    .filter(r => (r.treatment ?? "hard_deduct") === "hard_deduct")
    .reduce((s, r) => s + r.amount, 0);
  return { inPoolTotal, hardDeductTotal };
}

function calcEffectivePool(rawPassThrough: number, inPoolTotal: number, expenseCap: number | null): number {
  const combined = rawPassThrough + inPoolTotal;
  return expenseCap != null ? Math.min(combined, expenseCap) : combined;
}

// ---------- ratchet evaluation ----------

type RatchetResult = {
  effectivePercentage: number;
  ratchetNote?: string;
  notTriggered?: { label: string; reason: string };
};

function evaluateRatchet(
  bonuses: Bonus[],
  ctx: { gross: number; net: number; tickets: number; capacity?: number; basePct: number; basis: "gross" | "net" | null },
): RatchetResult {
  const ratchet = bonuses.find(b => b.type === "tier_ratchet");
  if (!ratchet || ratchet.type !== "tier_ratchet") {
    return { effectivePercentage: ctx.basePct };
  }

  const tiers = ratchet.tiers;
  // Detection: dollar-threshold if any to > 1
  const isDollar = tiers.some(t => t.to != null && t.to > 1);

  if (isDollar) {
    const value = ctx.basis === "gross" ? ctx.gross : ctx.net;
    const matched = tiers.find(t =>
      t.to === null ? value >= t.from : value >= t.from && value < t.to,
    );
    if (matched) {
      const note = (t: { from: number; to: number | null }) => t.to === null ? `≥ $${t.from.toLocaleString()}` : `$${t.from.toLocaleString()}–$${t.to.toLocaleString()}`;
      return {
        effectivePercentage: matched.percentage,
        ratchetNote: `${ctx.basis ?? "box office"} $${value.toLocaleString()} → tier ${note(matched)} → ${(matched.percentage * 100).toFixed(0)}% (ratcheted from ${(ctx.basePct * 100).toFixed(0)}%)`,
      };
    }
    return { effectivePercentage: ctx.basePct, notTriggered: { label: ratchet.label, reason: `No dollar tier matched (value: $${value.toLocaleString()})` } };
  }

  // Sell-through ratchet
  if (ctx.capacity == null || ctx.capacity === 0) {
    return {
      effectivePercentage: ctx.basePct,
      notTriggered: {
        label: ratchet.label,
        reason: "Capacity unknown — cannot evaluate sell-through ratchet",
      },
    };
  }
  const sellThrough = ctx.tickets / ctx.capacity;
  const matched = tiers.find(t =>
    t.to === null ? sellThrough >= t.from : sellThrough >= t.from && sellThrough < t.to,
  );
  if (matched) {
    return {
      effectivePercentage: matched.percentage,
      ratchetNote: `${(sellThrough * 100).toFixed(0)}% sold → ${(matched.percentage * 100).toFixed(0)}% (ratcheted from ${(ctx.basePct * 100).toFixed(0)}%)`,
    };
  }
  return { effectivePercentage: ctx.basePct, notTriggered: { label: ratchet.label, reason: `Sell-through ${(sellThrough * 100).toFixed(0)}% matched no tier` } };
}

// ---------- walkpot evaluation ----------

type WalkPotResult = {
  payout: number;
  applied: { label: string; amount: number; reason: string } | null;
  isFlavorOne: boolean;
  warning: string | null;
};

function evaluateWalkPot(bonuses: Bonus[], gross: number): WalkPotResult {
  // New walk_pot type takes precedence over legacy gross_threshold + stacks
  const newWalkPot = bonuses.find(b => b.type === "walk_pot");
  if (newWalkPot && newWalkPot.type === "walk_pot") {
    if (gross <= newWalkPot.threshold) return { payout: 0, applied: null, isFlavorOne: false, warning: null };
    const payout = (gross - newWalkPot.threshold) * newWalkPot.percentage;
    const pct = (newWalkPot.percentage * 100).toFixed(0);
    const isFlavorOne = newWalkPot.percentage >= 1;
    return {
      payout,
      applied: {
        label: newWalkPot.label,
        amount: payout,
        reason: `${pct}% of overage: $${gross.toLocaleString()} – $${newWalkPot.threshold.toLocaleString()} = $${payout.toLocaleString()}`,
      },
      isFlavorOne,
      warning: isFlavorOne ? "Walk pot payout is variable (100% of overage). Verify terms against deal notes before submitting." : null,
    };
  }

  // Legacy: gross_threshold + stacks: true
  const walkPot = bonuses.find(b => b.type === "gross_threshold" && (b as { stacks?: boolean }).stacks === true);
  if (!walkPot || walkPot.type !== "gross_threshold") {
    return { payout: 0, applied: null, isFlavorOne: false, warning: null };
  }

  if (gross <= walkPot.threshold) {
    return { payout: 0, applied: null, isFlavorOne: false, warning: null };
  }

  const isFlavorOne = walkPot.label.toLowerCase().includes("100%");
  const payout = isFlavorOne ? gross - walkPot.threshold : walkPot.amount;
  const warning = isFlavorOne
    ? "Walk pot payout is variable (100% of overage). Verify terms against deal notes before submitting."
    : null;

  return {
    payout,
    applied: {
      label: walkPot.label,
      amount: payout,
      reason: isFlavorOne
        ? `100% of overage: $${gross.toLocaleString()} – $${walkPot.threshold.toLocaleString()} = $${payout.toLocaleString()}`
        : `Fixed walk pot: gross $${gross.toLocaleString()} > $${walkPot.threshold.toLocaleString()}`,
    },
    isFlavorOne,
    warning,
  };
}

// ---------- flat bonus application ----------

function applyBonuses(
  bonuses: Bonus[],
  ctx: { gross: number; tickets: number; capacity?: number },
  skipWalkPots = false,
): { applied: { label: string; amount: number; reason: string }[]; notTriggered: { label: string; amount: number; reason: string }[]; totalApplied: number } {
  const applied: { label: string; amount: number; reason: string }[] = [];
  const notTriggered: { label: string; amount: number; reason: string }[] = [];

  for (const b of bonuses) {
    if (b.type === "gross_threshold") {
      if (skipWalkPots && b.stacks) continue; // legacy walk pot — handled by evaluateWalkPot
      if (ctx.gross > b.threshold) {
        applied.push({ label: b.label, amount: b.amount, reason: `Gross $${ctx.gross.toLocaleString()} > $${b.threshold.toLocaleString()}` });
      } else {
        notTriggered.push({ label: b.label, amount: b.amount, reason: `Gross $${ctx.gross.toLocaleString()} ≤ $${b.threshold.toLocaleString()}` });
      }
    } else if (b.type === "walk_pot") {
      if (skipWalkPots) continue; // handled by evaluateWalkPot in vs path
      // On non-vs deals: compute variable overage payout
      if (ctx.gross > b.threshold) {
        const payout = (ctx.gross - b.threshold) * b.percentage;
        const pct = (b.percentage * 100).toFixed(0);
        applied.push({ label: b.label, amount: payout, reason: `${pct}% of overage: $${ctx.gross.toLocaleString()} – $${b.threshold.toLocaleString()} = $${payout.toFixed(2)}` });
      } else {
        notTriggered.push({ label: b.label, amount: 0, reason: `Gross $${ctx.gross.toLocaleString()} ≤ $${b.threshold.toLocaleString()}` });
      }
    } else if (b.type === "sellout") {
      const selloutPct = b.selloutPct ?? 0.95;
      if (ctx.capacity != null && ctx.tickets >= ctx.capacity * selloutPct) {
        applied.push({ label: b.label, amount: b.amount, reason: `${ctx.tickets} of ${ctx.capacity} sold (≥ ${(selloutPct * 100).toFixed(0)}%)` });
      } else {
        notTriggered.push({ label: b.label, amount: b.amount, reason: ctx.capacity != null ? `${ctx.tickets} of ${ctx.capacity} sold (sellout = ≥${(selloutPct * 100).toFixed(0)}%)` : "Capacity unknown — can't evaluate" });
      }
    } else if (b.type === "attendance_threshold") {
      if (ctx.tickets > b.threshold) {
        applied.push({ label: b.label, amount: b.amount, reason: `${ctx.tickets} > ${b.threshold}` });
      } else {
        notTriggered.push({ label: b.label, amount: b.amount, reason: `${ctx.tickets} ≤ ${b.threshold}` });
      }
    } else if (b.type === "tier_ratchet") {
      // Ratchets change the rate, not an additive amount — handled in evaluateRatchet
      notTriggered.push({ label: b.label, amount: 0, reason: "Tier ratchet: evaluated separately as rate modifier" });
    }
  }

  return { applied, notTriggered, totalApplied: applied.reduce((s, b) => s + b.amount, 0) };
}

// ---------- main export ----------

export function calculateSettlement(input: CalcInput): SettlementCalculation {
  const { deal, ticketSales, expenses, comps = [], recoups = [], venueCapacity, ticketsSold } = input;

  const grossBoxOffice = ticketSales.reduce((s, t) => s + t.gross, 0);
  const totalFees = ticketSales.reduce((s, t) => s + t.fees, 0);
  const totalExpenses = expenses.filter(e => !e.absorbedByVenue).reduce((s, e) => s + e.amount, 0);
  const tickets = ticketsSold ?? ticketSales.reduce((s, t) => s + (t.qty ?? 0), 0);

  const compCredit = calcCompCredit(comps);
  const adjustedGross = grossBoxOffice + compCredit;

  const mergedRecoups = [...recoups, ...parseDealRecoups(deal)];
  const { inPoolTotal, hardDeductTotal } = splitRecoups(mergedRecoups);
  const effectivePool = calcEffectivePool(totalExpenses, inPoolTotal, deal.expenseCap);
  const netBoxOffice = adjustedGross - totalFees - effectivePool - hardDeductTotal;

  const bonuses = parseBonuses(deal);

  // ---------- flat ----------
  if (deal.dealType === "flat") {
    if (deal.guaranteeAmount == null) {
      return { supported: false, reason: "Flat deal is missing a guarantee amount.", dealType: deal.dealType };
    }
    const agreedHardDeducts = mergedRecoups.filter(r => r.status === "agreed" && (r.treatment ?? "hard_deduct") === "hard_deduct");

    const bonusResult = applyBonuses(bonuses, { gross: adjustedGross, tickets, capacity: venueCapacity });
    const total = deal.guaranteeAmount + bonusResult.totalApplied - hardDeductTotal;
    const steps: Step[] = [
      { label: "Flat guarantee", value: deal.guaranteeAmount },
    ];
    if (compCredit > 0) steps.unshift({ label: "Comps toward gross", value: compCredit, note: "Shown for context; does not affect flat payout." });
    steps.push(...bonusResult.applied.map(b => ({ label: b.label, value: b.amount, note: b.reason })));
    agreedHardDeducts.forEach(r => steps.push({ label: `${r.label || r.category} (recoup)`, value: -r.amount }));

    const recoupNote = hardDeductTotal > 0 ? ` – recoups $${hardDeductTotal.toLocaleString()}` : "";
    const bonusNote = bonusResult.applied.length ? ` + bonuses $${bonusResult.totalApplied.toLocaleString()}` : "";
    return {
      supported: true,
      grossBoxOffice,
      adjustedGross,
      compCredit,
      netBoxOffice,
      totalExpenses,
      totalInPoolRecoups: 0,
      totalHardDeducts: hardDeductTotal,
      walkPotPayout: 0,
      totalToArtist: total,
      steps,
      finalFormula: `flat $${deal.guaranteeAmount.toLocaleString()}${bonusNote}${recoupNote} = $${total.toFixed(2)}`,
      bonusesApplied: bonusResult.applied,
      bonusesNotTriggered: bonusResult.notTriggered,
      warnings: [],
    };
  }

  // ---------- percentage_of_gross ----------
  if (deal.dealType === "percentage_of_gross") {
    if (deal.percentage == null) {
      return { supported: false, reason: "Percentage-of-gross deal is missing a percentage.", dealType: deal.dealType };
    }
    const agreedHardDeducts = mergedRecoups.filter(r => r.status === "agreed" && (r.treatment ?? "hard_deduct") === "hard_deduct");

    const ratchet = evaluateRatchet(bonuses, { gross: adjustedGross, net: netBoxOffice, tickets, capacity: venueCapacity, basePct: deal.percentage, basis: "gross" });
    const pct = ratchet.effectivePercentage;
    const payout = adjustedGross * pct;
    const bonusResult = applyBonuses(bonuses, { gross: adjustedGross, tickets, capacity: venueCapacity });
    const total = payout + bonusResult.totalApplied - hardDeductTotal;

    const steps: Step[] = [
      { label: "Gross box office", value: grossBoxOffice },
    ];
    if (compCredit > 0) steps.push({ label: "Comps toward gross", value: compCredit });
    if (compCredit > 0) steps.push({ label: "Adjusted gross", value: adjustedGross });
    if (ratchet.ratchetNote) steps.push({ label: "Ratchet", value: 0, note: ratchet.ratchetNote });
    steps.push({ label: `× ${(pct * 100).toFixed(0)}% (gross)`, value: payout });
    steps.push(...bonusResult.applied.map(b => ({ label: b.label, value: b.amount, note: b.reason })));
    agreedHardDeducts.forEach(r => steps.push({ label: `${r.label || r.category} (recoup)`, value: -r.amount }));

    const notTriggered = [...bonusResult.notTriggered];
    if (ratchet.notTriggered) notTriggered.push({ ...ratchet.notTriggered, amount: 0 });

    const recoupNote = hardDeductTotal > 0 ? ` – recoups $${hardDeductTotal.toLocaleString()}` : "";
    return {
      supported: true,
      grossBoxOffice,
      adjustedGross,
      compCredit,
      netBoxOffice,
      totalExpenses,
      totalInPoolRecoups: 0,
      totalHardDeducts: hardDeductTotal,
      walkPotPayout: 0,
      totalToArtist: total,
      steps,
      finalFormula: `gross $${adjustedGross.toLocaleString()} × ${(pct * 100).toFixed(0)}%${ratchet.ratchetNote ? " (ratcheted)" : ""}${recoupNote} = $${total.toFixed(2)}`,
      bonusesApplied: bonusResult.applied,
      bonusesNotTriggered: notTriggered,
      warnings: [],
    };
  }

  // ---------- percentage_of_net ----------
  if (deal.dealType === "percentage_of_net") {
    if (deal.percentage == null) {
      return { supported: false, reason: "Percentage-of-net deal is missing a percentage.", dealType: deal.dealType };
    }
    const ratchet = evaluateRatchet(bonuses, { gross: adjustedGross, net: netBoxOffice, tickets, capacity: venueCapacity, basePct: deal.percentage, basis: "net" });
    const pct = ratchet.effectivePercentage;
    const payout = netBoxOffice * pct;
    const bonusResult = applyBonuses(bonuses, { gross: adjustedGross, tickets, capacity: venueCapacity });
    const total = payout + bonusResult.totalApplied;

    const warns: Warning[] = [];
    if (netBoxOffice < 0) warns.push({ type: "net_negative", message: "Net is negative — fees and expenses exceed gross. Verify expenses before submitting." });
    if (ratchet.notTriggered?.reason.includes("Capacity")) warns.push({ type: "capacity_unknown", message: "Venue capacity not set — sell-through ratchet cannot be evaluated. Base rate applied." });

    const steps: Step[] = [
      { label: "Gross box office", value: grossBoxOffice },
    ];
    if (compCredit > 0) steps.push({ label: "Comps toward gross", value: compCredit });
    if (compCredit > 0) steps.push({ label: "Adjusted gross", value: adjustedGross });
    steps.push({ label: "Ticketing fees", value: -totalFees });
    if (inPoolTotal > 0) steps.push({ label: "Pass-through expenses + in-pool recoups", value: -effectivePool, note: deal.expenseCap != null && (totalExpenses + inPoolTotal) > deal.expenseCap ? `Capped at $${deal.expenseCap.toLocaleString()} (combined $${(totalExpenses + inPoolTotal).toLocaleString()})` : undefined });
    else steps.push({ label: "Pass-through expenses", value: -effectivePool, note: deal.expenseCap != null && totalExpenses > deal.expenseCap ? `Capped at $${deal.expenseCap.toLocaleString()} (actual $${totalExpenses.toLocaleString()})` : undefined });
    if (hardDeductTotal > 0) steps.push({ label: "Hard deducts", value: -hardDeductTotal, note: "Reduces net before × percentage. Not subject to expense cap." });
    steps.push({ label: "Net box office", value: netBoxOffice });
    if (ratchet.ratchetNote) steps.push({ label: "Ratchet applied", value: 0, note: ratchet.ratchetNote });
    steps.push({ label: `× ${(pct * 100).toFixed(0)}% (net${ratchet.ratchetNote ? ", ratcheted" : ""})`, value: payout });
    steps.push(...bonusResult.applied.map(b => ({ label: b.label, value: b.amount, note: b.reason })));

    const notTriggered = [...bonusResult.notTriggered];
    if (ratchet.notTriggered) notTriggered.push({ ...ratchet.notTriggered, amount: 0 });

    return {
      supported: true,
      grossBoxOffice,
      adjustedGross,
      compCredit,
      netBoxOffice,
      totalExpenses,
      totalInPoolRecoups: inPoolTotal,
      totalHardDeducts: hardDeductTotal,
      walkPotPayout: 0,
      totalToArtist: total,
      steps,
      finalFormula: `net $${netBoxOffice.toFixed(2)} × ${(pct * 100).toFixed(0)}%${ratchet.ratchetNote ? " (ratcheted)" : ""} = $${total.toFixed(2)}`,
      bonusesApplied: bonusResult.applied,
      bonusesNotTriggered: notTriggered,
      warnings: warns,
    };
  }

  // ---------- vs ----------
  if (deal.dealType === "vs") {
    if (deal.guaranteeAmount == null) return { supported: false, reason: "Vs deal is missing a guarantee amount.", dealType: deal.dealType };
    if (deal.percentage == null) return { supported: false, reason: "Vs deal is missing a percentage.", dealType: deal.dealType };
    if (deal.percentageBasis == null) return { supported: false, reason: "Vs deal is missing a percentage basis (gross or net).", dealType: deal.dealType };

    const isNetBasis = deal.percentageBasis === "net";
    // In-pool recoups join expense pool (net-basis only); hard deducts subtract from final total
    const appliedInPool = isNetBasis ? inPoolTotal : 0;
    const basisPool = isNetBasis ? calcEffectivePool(totalExpenses, appliedInPool, deal.expenseCap) : calcEffectivePool(totalExpenses, 0, deal.expenseCap);
    const vsNet = adjustedGross - totalFees - basisPool;
    const basis = isNetBasis ? vsNet : adjustedGross;

    const ratchet = evaluateRatchet(bonuses, { gross: adjustedGross, net: vsNet, tickets, capacity: venueCapacity, basePct: deal.percentage, basis: deal.percentageBasis });
    const pct = ratchet.effectivePercentage;
    const percentagePayout = basis * pct;

    const walkPot = evaluateWalkPot(bonuses, adjustedGross);
    const vsWinner = Math.max(deal.guaranteeAmount, percentagePayout);
    const percentageWins = percentagePayout >= deal.guaranteeAmount;

    // Flat bonuses (exclude walkpot stacks and ratchets)
    const bonusResult = applyBonuses(bonuses, { gross: adjustedGross, tickets, capacity: venueCapacity }, true);

    const total = vsWinner + walkPot.payout + bonusResult.totalApplied - hardDeductTotal;

    const warns: Warning[] = [];
    if (isNetBasis && vsNet < 0) warns.push({ type: "net_negative", message: "Net is negative — guarantee wins automatically. Verify expenses." });
    if (ratchet.notTriggered?.reason.includes("Capacity")) warns.push({ type: "capacity_unknown", message: "Venue capacity not set — sell-through ratchet cannot be evaluated. Base rate applied." });
    if (walkPot.warning) warns.push({ type: "walkpot_flavor1", message: walkPot.warning });

    const steps: Step[] = [];

    // Walk pot block first
    if (walkPot.payout > 0) {
      const wpBonus = bonuses.find(b => b.type === "walk_pot") ?? bonuses.find(b => b.type === "gross_threshold" && (b as { stacks?: boolean }).stacks);
      const wpThreshold = (wpBonus as { threshold?: number } | undefined)?.threshold ?? 0;
      steps.push({ label: "Walk pot threshold", value: -wpThreshold });
      steps.push({ label: "Walk pot payout", value: walkPot.payout, note: walkPot.applied?.reason });
    }

    steps.push({ label: "Gross box office", value: grossBoxOffice });
    if (compCredit > 0) steps.push({ label: "Comps toward gross", value: compCredit });
    if (compCredit > 0) steps.push({ label: "Adjusted gross", value: adjustedGross });

    if (isNetBasis) {
      steps.push({ label: "Ticketing fees", value: -totalFees });
      if (appliedInPool > 0) steps.push({ label: "Pass-through expenses + in-pool recoups", value: -basisPool, note: deal.expenseCap != null ? `Capped at $${deal.expenseCap.toLocaleString()}` : undefined });
      else steps.push({ label: "Pass-through expenses", value: -basisPool, note: deal.expenseCap != null && totalExpenses > deal.expenseCap ? `Capped at $${deal.expenseCap.toLocaleString()}` : undefined });
      steps.push({ label: "Net box office", value: vsNet });
    }

    if (ratchet.ratchetNote) steps.push({ label: "Ratchet applied", value: 0, note: ratchet.ratchetNote });
    steps.push({
      label: `× ${(pct * 100).toFixed(0)}% (${deal.percentageBasis}${ratchet.ratchetNote ? ", ratcheted" : ""})`,
      value: percentagePayout,
      note: percentageWins ? "← wins" : undefined,
    });
    steps.push({
      label: "Guarantee (floor)",
      value: deal.guaranteeAmount,
      note: percentageWins ? undefined : "← wins",
    });
    steps.push(...bonusResult.applied.map(b => ({ label: b.label, value: b.amount, note: b.reason })));

    const agreedHardDeducts = mergedRecoups.filter(r => r.status === "agreed" && (r.treatment ?? "hard_deduct") === "hard_deduct");
    agreedHardDeducts.forEach(r => steps.push({ label: `${r.label || r.category} (recoup)`, value: -r.amount }));

    const notTriggered = [...bonusResult.notTriggered];
    if (ratchet.notTriggered) notTriggered.push({ ...ratchet.notTriggered, amount: 0 });

    const basisLabel = isNetBasis ? `net $${vsNet.toFixed(2)}` : `gross $${adjustedGross.toLocaleString()}`;
    const pctLabel = `${basisLabel} × ${(pct * 100).toFixed(0)}%${ratchet.ratchetNote ? " (ratcheted)" : ""}`;
    const walkLabel = walkPot.payout > 0 ? ` + walk pot $${walkPot.payout.toFixed(2)}` : "";
    const recoupLabel = hardDeductTotal > 0 ? ` – recoups $${hardDeductTotal.toLocaleString()}` : "";
    const formula = `max($${deal.guaranteeAmount.toLocaleString()} guarantee, ${pctLabel})${walkLabel}${recoupLabel} = $${total.toFixed(2)}`;

    return {
      supported: true,
      grossBoxOffice,
      adjustedGross,
      compCredit,
      netBoxOffice: vsNet,
      totalExpenses,
      totalInPoolRecoups: appliedInPool,
      totalHardDeducts: hardDeductTotal,
      walkPotPayout: walkPot.payout,
      totalToArtist: total,
      steps,
      finalFormula: formula,
      bonusesApplied: walkPot.applied ? [walkPot.applied, ...bonusResult.applied] : bonusResult.applied,
      bonusesNotTriggered: notTriggered,
      warnings: warns,
    };
  }

  // ---------- door ----------
  if (deal.dealType === "door") {
    const rawPassThrough = totalExpenses;
    const appliedInPool = inPoolTotal;
    const appliedHardDeduct = hardDeductTotal;
    const doorPool = calcEffectivePool(rawPassThrough, appliedInPool, deal.expenseCap);
    const payout = adjustedGross - doorPool - appliedHardDeduct;
    const bonusResult = applyBonuses(bonuses, { gross: adjustedGross, tickets, capacity: venueCapacity });
    const total = payout + bonusResult.totalApplied;

    const capApplied = deal.expenseCap != null && (rawPassThrough + appliedInPool) > deal.expenseCap;

    const steps: Step[] = [
      { label: "Gross box office", value: grossBoxOffice },
    ];
    if (compCredit > 0) steps.push({ label: "Comps toward gross", value: compCredit }, { label: "Adjusted gross", value: adjustedGross });
    steps.push({
      label: appliedInPool > 0 ? "Pass-through expenses + in-pool recoups" : "Pass-through expenses",
      value: -doorPool,
      note: capApplied ? `Capped at $${deal.expenseCap!.toLocaleString()} (actual $${(rawPassThrough + appliedInPool).toLocaleString()})` : undefined,
    });
    if (appliedHardDeduct > 0) steps.push({ label: "Hard deducts", value: -appliedHardDeduct });
    steps.push(...bonusResult.applied.map(b => ({ label: b.label, value: b.amount, note: b.reason })));

    const capNote = capApplied ? ` (capped from $${(rawPassThrough + appliedInPool).toLocaleString()})` : "";
    return {
      supported: true,
      grossBoxOffice,
      adjustedGross,
      compCredit,
      netBoxOffice: adjustedGross - totalFees - doorPool,
      totalExpenses,
      totalInPoolRecoups: appliedInPool,
      totalHardDeducts: appliedHardDeduct,
      walkPotPayout: 0,
      totalToArtist: total,
      steps,
      finalFormula: `gross $${adjustedGross.toLocaleString()} – expenses $${doorPool.toLocaleString()}${capNote} = $${total.toFixed(2)}`,
      bonusesApplied: bonusResult.applied,
      bonusesNotTriggered: bonusResult.notTriggered,
      warnings: [],
    };
  }

  return { supported: false, dealType: deal.dealType, reason: `${deal.dealType} deals are not supported.` };
}
