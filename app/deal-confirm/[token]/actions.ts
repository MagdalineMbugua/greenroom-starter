"use server";

import { db } from "@/db";
import { dealConfirmations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function confirmDeal(token: string): Promise<{ error?: string }> {
  const rows = await db.select().from(dealConfirmations).where(eq(dealConfirmations.token, token));
  if (rows.length === 0) return { error: "Token not found." };
  const conf = rows[0];
  if (conf.status !== "pending") return { error: "This confirmation is no longer pending." };

  await db
    .update(dealConfirmations)
    .set({ status: "confirmed", confirmedAt: new Date() })
    .where(eq(dealConfirmations.token, token));

  revalidatePath(`/deal-confirm/${token}`);
  return {};
}

export async function flagDeal(token: string, notes: string): Promise<{ error?: string }> {
  if (!notes.trim()) return { error: "Please describe the issue before submitting." };
  const rows = await db.select().from(dealConfirmations).where(eq(dealConfirmations.token, token));
  if (rows.length === 0) return { error: "Token not found." };
  const conf = rows[0];
  if (conf.status !== "pending") return { error: "This confirmation is no longer pending." };

  await db
    .update(dealConfirmations)
    .set({ status: "flagged", flaggedNotes: notes })
    .where(eq(dealConfirmations.token, token));

  revalidatePath(`/deal-confirm/${token}`);
  return {};
}
