import { calendarGuard } from "../../../lib/calendarGuard";
import { GeminiError } from "../../../lib/gemini";
import { analyzeSome, buildSelf, hideConcept } from "../../../lib/selfGraph";
import { SelfError, importPieces, readPieces, readSelf, wipeSelf } from "../../../lib/selfStore";
import { currentUser } from "../../../lib/workspaceScope";

export const runtime = "nodejs";
export const maxDuration = 180;

const calls = new Map<string, { count: number; until: number }>();
const GEMINI_CODES: Record<string, number> = { gemini_not_configured: 503, gemini_forbidden: 502, gemini_billing: 502, gemini_failed: 502, ai_quota: 429 };

/** The network, the portrait and how far the reading has got. Pieces themselves come back only for one concept at a time (`?node=`). */
export async function GET(request: Request) {
  const denied = await calendarGuard();
  if (denied) return denied;
  try {
    const [pieces, graph] = await Promise.all([readPieces(), readSelf()]);
    const node = new URL(request.url).searchParams.get("node");
    if (node) {
      const wanted = new Set(graph.nodes.find((item) => item.id === node)?.pieceIds ?? []);
      return Response.json({ pieces: pieces.filter((piece) => wanted.has(piece.id)).map((piece) => ({ id: piece.id, at: piece.at, title: piece.title, text: piece.text.slice(0, 1200), type: graph.analysis[piece.id]?.type })) }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const evidence = new Set(graph.portrait?.sections.flatMap((section) => section.evidence) ?? []);
    return Response.json({
      total: pieces.length, read: pieces.filter((piece) => graph.analysis[piece.id]).length,
      from: graph.from, to: graph.to, nodes: graph.nodes, edges: graph.edges, portrait: graph.portrait, dropped: graph.dropped, updatedAt: graph.updatedAt,
      // The portrait cites pieces by id; their dates and openings let the page show what it points at.
      cited: pieces.filter((piece) => evidence.has(piece.id)).map((piece) => ({ id: piece.id, at: piece.at, text: piece.text.slice(0, 160), type: graph.analysis[piece.id]?.type })),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "self_failed" }, { status: 502 });
  }
}

/** { action: "import", pieces } stores writing; "analyze" reads a few batches of it with Gemini; "build" makes the network and portrait; "hide" removes a concept; "wipe" deletes it all. */
export async function POST(request: Request) {
  const denied = await calendarGuard();
  if (denied) return denied;
  let body: { action?: unknown; pieces?: unknown; id?: unknown };
  try {
    if (Number(request.headers.get("content-length")) > 3_800_000) throw new Error("too large");
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const user = await currentUser();
  const now = Date.now();
  const previous = calls.get(user.id);
  const count = previous && previous.until > now ? previous.count : 0;
  if (count >= 120) return Response.json({ error: "rate_limited" }, { status: 429 });
  calls.set(user.id, { count: count + 1, until: previous && previous.until > now ? previous.until : now + 60_000 });
  try {
    if (body.action === "import") return Response.json(await importPieces(body.pieces));
    if (body.action === "analyze") return Response.json(await analyzeSome(4));
    if (body.action === "build") { const graph = await buildSelf(); return Response.json({ nodes: graph.nodes.length, edges: graph.edges.length }); }
    if (body.action === "hide" && typeof body.id === "string") { const graph = await hideConcept(body.id.slice(0, 80)); return Response.json({ nodes: graph.nodes.length }); }
    if (body.action === "wipe") { await wipeSelf(); return Response.json({ ok: true }); }
    return Response.json({ error: "invalid_request" }, { status: 400 });
  } catch (error) {
    if (error instanceof SelfError) return Response.json({ error: "invalid_self", message: error.message }, { status: 400 });
    if (error instanceof GeminiError) return Response.json({ error: error.code }, { status: GEMINI_CODES[error.code] ?? 502 });
    return Response.json({ error: "self_failed" }, { status: 502 });
  }
}
