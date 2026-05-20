"use server";

import { db } from "@/db";
import { deals, dealConfirmations, artists, agents, shows } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export async function sendForConfirmation(showId: string): Promise<{ error?: string }> {
  // Load deal, show, artist, agent
  const rows = await db
    .select({ deal: deals, show: shows, artist: artists, agent: agents })
    .from(shows)
    .innerJoin(deals, eq(deals.showId, shows.id))
    .innerJoin(artists, eq(shows.artistId, artists.id))
    .leftJoin(agents, eq(artists.agentId, agents.id))
    .where(eq(shows.id, showId));

  if (rows.length === 0) return { error: "Show or deal not found." };

  const { deal, show, artist, agent } = rows[0];

  const agentEmail = agent?.email;
  if (!agentEmail) return { error: "Agent email is required to send confirmation." };

  const tmEmail = artist.managerEmail;

  // Increment dealVersion
  const newVersion = deal.dealVersion + 1;
  await db.update(deals).set({ dealVersion: newVersion }).where(eq(deals.id, deal.id));

  // Invalidate existing confirmations for this deal
  const now = new Date();
  await db
    .update(dealConfirmations)
    .set({ status: "invalidated", invalidatedAt: now })
    .where(and(eq(dealConfirmations.dealId, deal.id)));

  // tokenExpiresAt = show date + 7 days
  const showDate = new Date(show.date);
  showDate.setDate(showDate.getDate() + 7);
  const tokenExpiresAt = showDate;

  const randomId = () => randomBytes(16).toString("hex");

  // Insert agent confirmation
  const agentToken = generateToken();
  await db.insert(dealConfirmations).values({
    id: randomId(),
    dealId: deal.id,
    dealVersion: newVersion,
    recipientType: "agent",
    email: agentEmail,
    token: agentToken,
    tokenExpiresAt,
    status: "pending",
    sentAt: now,
  });

  // Insert TM confirmation if email exists
  let tmToken: string | null = null;
  if (tmEmail) {
    tmToken = generateToken();
    await db.insert(dealConfirmations).values({
      id: randomId(),
      dealId: deal.id,
      dealVersion: newVersion,
      recipientType: "tm",
      email: tmEmail,
      token: tmToken,
      tokenExpiresAt,
      status: "pending",
      sentAt: now,
    });
  }

  // Stub: log token URLs (email sending not implemented)
  console.log(`[Confirmation] Agent (${agentEmail}): /deal-confirm/${agentToken}`);
  if (tmToken && tmEmail) {
    console.log(`[Confirmation] TM (${tmEmail}): /deal-confirm/${tmToken}`);
  }

  revalidatePath(`/shows/${showId}`);
  revalidatePath("/shows");
  return {};
}
