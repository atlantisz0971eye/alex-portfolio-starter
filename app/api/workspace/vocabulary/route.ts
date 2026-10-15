import { calendarGuard } from "../../../lib/calendarGuard";
import { noteFailure } from "../../../lib/notesHttp";
import { addVocabularyEntry } from "../../../lib/notesStore";

export const runtime = "nodejs";

/** Saves a looked-up word, with the sentence it came from, to the Vocabulary note. */
export async function POST(request: Request) {
  const denied = await calendarGuard();
  if (denied) return denied;
  let body: { word?: unknown; entry?: unknown; sentence?: unknown; source?: unknown };
  try {
    if (Number(request.headers.get("content-length")) > 6000) throw new Error("too large");
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const word = typeof body.word === "string" ? body.word.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  const entry = typeof body.entry === "string" ? body.entry.trim().slice(0, 1200) : "";
  if (word.length < 2 || !entry) return Response.json({ error: "invalid_request" }, { status: 400 });
  const sentence = typeof body.sentence === "string" ? body.sentence.replace(/\s+/g, " ").trim().slice(0, 260) : "";
  const source = typeof body.source === "string" ? body.source.replace(/[\r\n*_]+/g, " ").trim().slice(0, 160) : "";
  // The lookup answer already starts with the word in bold; make sure the entry always does.
  const lead = entry.toLowerCase().includes(`**${word.toLowerCase()}`) ? entry : `**${word}**\n${entry}`;
  const quote = sentence ? `\n> “${sentence}”${source ? ` — *${source}*` : ""}` : source ? `\n> *${source}*` : "";
  try {
    const result = await addVocabularyEntry(word, `${lead}${quote}`);
    return Response.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return noteFailure(error);
  }
}
