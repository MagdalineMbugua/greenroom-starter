"use server";

import { db } from "@/db";
import { deals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { randomUUID } from "crypto";

export interface DealFormPayload {
  dealType: "flat" | "percentage_of_gross" | "percentage_of_net" | "vs" | "door";
  guaranteeAmount: number | null;
  percentage: number | null;
  percentageBasis: "gross" | "net" | null;
  expenseCap: number | null;
  hospitalityCap: number | null;
  recoupsJson: string | null;
  bonusesJson: string | null;
  dealNotesFreetext: string | null;
}

export async function saveDeal(showId: string, dealId: string | null, payload: DealFormPayload) {
  if (dealId) {
    await db
      .update(deals)
      .set({
        dealType: payload.dealType,
        guaranteeAmount: payload.guaranteeAmount,
        percentage: payload.percentage,
        percentageBasis: payload.percentageBasis,
        expenseCap: payload.expenseCap,
        hospitalityCap: payload.hospitalityCap,
        marketingRecoup: null,
        marketingRecoupTreatment: null,
        recoupsJson: payload.recoupsJson,
        bonusesJson: payload.bonusesJson,
        dealNotesFreetext: payload.dealNotesFreetext,
      })
      .where(eq(deals.id, dealId));
  } else {
    await db.insert(deals).values({
      id: randomUUID(),
      showId,
      dealType: payload.dealType,
      guaranteeAmount: payload.guaranteeAmount,
      percentage: payload.percentage,
      percentageBasis: payload.percentageBasis,
      expenseCap: payload.expenseCap,
      hospitalityCap: payload.hospitalityCap,
      recoupsJson: payload.recoupsJson,
      bonusesJson: payload.bonusesJson,
      dealNotesFreetext: payload.dealNotesFreetext,
      createdAt: new Date(),
    });
  }
  redirect(`/shows/${showId}`);
}
