import { NextResponse } from "next/server";
import { getOrbitCategories } from "../../../data/orbit";
import { buildEntanglementNarrativePrompt } from "../../../lib/entanglementNarrativePrompt";
import { sortEntanglementPoints, type EntanglementPoint, type EntanglementSelection } from "../../../lib/entanglement";
import { NarrativeRateLimiter } from "../../../lib/narrativeRateLimit";
import type { Language } from "../../../types/project";

export const runtime = "nodejs";

const CACHE_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { text: string; expiresAt: number }>();
const inFlight = new Map<string, Promise<string>>();
const limiter = new NarrativeRateLimiter();

type NarrativeRequest = { lang: Language; selections: EntanglementPoint[] };
type DeepSeekResponse = {
  choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
};

class ProviderError extends Error {
  constructor(readonly status: number) {
    super("Narrative provider request failed");
  }
}

function isNarrativeRequest(value: unknown): value is NarrativeRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  if (body.lang !== "en" && body.lang !== "zh") return false;
  if (!Array.isArray(body.selections) || body.selections.length !== 3) return false;
  const categories = getOrbitCategories(body.lang);
  const seen = new Set<string>();
  return body.selections.every((value) => {
    if (!value || typeof value !== "object") return false;
    const selection = value as Record<string, unknown>;
    const category = categories.find((item) => item.id === selection.category);
    if (!category || !Number.isInteger(selection.point)) return false;
    const point = selection.point as number;
    if (point < 0 || point >= category.works.length) return false;
    const key = `${category.id}:${point}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function generateNarrative(body: NarrativeRequest, apiKey: string): Promise<string> {
  const categories = getOrbitCategories(body.lang);
  const selections = body.selections.map(({ category, point }) => ({
    category,
    point,
    work: categories.find((item) => item.id === category)!.works[point],
  })) as [EntanglementSelection, EntanglementSelection, EntanglementSelection];
  const prompt = buildEntanglementNarrativePrompt(selections, body.lang);
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-flash",
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      thinking: { type: "disabled" },
      temperature: 0.8,
      max_tokens: 320,
      stream: false,
    }),
    signal: AbortSignal.timeout(35_000),
    cache: "no-store",
  });

  if (!response.ok) throw new ProviderError(response.status);
  const result = await response.json() as DeepSeekResponse;
  const choice = result.choices?.[0];
  const text = choice?.message?.content?.trim();
  if (!text || text.length > 1200 || choice?.finish_reason === "length") {
    throw new Error("Invalid narrative response");
  }
  return text;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 256) return NextResponse.json({ error: "invalid_request" }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (!isNarrativeRequest(body)) {
    return NextResponse.json({ error: "invalid_selection" }, { status: 400 });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const ordered = sortEntanglementPoints(body.selections);
  const key = `${body.lang}:${ordered.map(({ category, point }) => `${category}-${point}`).join("|")}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return NextResponse.json({ narrative: cached.text });
  }

  let generation = inFlight.get(key);
  const ownsGeneration = !generation;
  if (!generation) {
    // Vercel sets this header from the visitor IP. The limiter is a local
    // backstop; a Vercel Firewall rule is still needed across instances.
    const clientId = request.headers.get("x-vercel-forwarded-for") ?? "unknown";
    const limit = limiter.check(clientId, now);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "rate_limited" },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }
    generation = generateNarrative({ ...body, selections: ordered }, apiKey);
    inFlight.set(key, generation);
  }

  try {
    const narrative = await generation;
    cache.set(key, { text: narrative, expiresAt: Date.now() + CACHE_MS });
    return NextResponse.json({ narrative });
  } catch (error) {
    const status = error instanceof ProviderError && error.status === 429 ? 429 : 502;
    return NextResponse.json({ error: status === 429 ? "rate_limited" : "generation_failed" }, { status });
  } finally {
    if (ownsGeneration) inFlight.delete(key);
  }
}
