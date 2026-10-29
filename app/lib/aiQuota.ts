import { get, put } from "@vercel/blob";
import { currentUser } from "./workspaceScope";

/**
 * The AI keys are the owner's, so each member gets a daily allowance of AI calls. The count is kept in memory per
 * server instance and saved to storage, so it survives restarts; several instances can undercount slightly, which is
 * fine for a cost guard. The owner is never limited, and code running outside a signed-in context (public pages) is
 * not counted here.
 */
export class QuotaError extends Error {
  constructor() { super("The daily AI allowance is used up."); }
}

type Usage = { date: string; ai: number };
const counts = new Map<string, Usage>();
const today = () => new Date().toISOString().slice(0, 10);
const usagePath = (id: string) => `system/usage/${id}.json`;

export async function readUsage(id: string): Promise<Usage> {
  const key = id;
  const known = counts.get(key);
  if (known && known.date === today()) return known;
  let usage: Usage = { date: today(), ai: 0 };
  try {
    const result = await get(usagePath(id), { access: "private", useCache: false });
    if (result && result.statusCode === 200) {
      const saved = JSON.parse(await new Response(result.stream).text()) as Usage;
      if (saved.date === today()) usage = saved;
    }
  } catch { /* start from zero rather than block the person */ }
  counts.set(key, usage);
  return usage;
}

/** Counts one AI call for the signed-in member, or throws QuotaError when today's allowance is gone. */
export async function chargeAi(units = 1) {
  let user;
  try { user = await currentUser(); } catch { return; }
  if (user.role === "owner") return;
  const usage = await readUsage(user.id);
  if (usage.ai + units > user.limits.aiPerDay) throw new QuotaError();
  usage.ai += units;
  await put(usagePath(user.id), JSON.stringify(usage), { access: "private", allowOverwrite: true, contentType: "application/json" }).catch(() => undefined);
}
