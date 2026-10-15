import { buildFields, CalendarInputError, fieldsOf, listOccurrences, readCalendar } from "./calendarStore";
import { expand, toInstant, validZone, type Occurrence } from "./calendarTime";
import { getMessage, listMessages, MailAuthError } from "./gmail";
import { mailConfigured } from "./mailGuard";
import { readAccounts } from "./mailStore";
import type { ToolSpec } from "./workspaceDeepSeek";
import { listNotes, readNote, searchNotes, validNoteId } from "./notesStore";
import { jsonToText } from "./notesText";
import { queryTerms, retrieveContext } from "./workspaceRetrieval";
import { listDocuments, readDocument, readDocumentText } from "./workspaceStore";

const RESULT_LIMIT = 6000;

const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []): ToolSpec => ({
  type: "function",
  function: { name, description, parameters: { type: "object", properties, required } },
});

const eventProps = {
  title: { type: "string" },
  start: { type: "string", description: 'Local time "YYYY-MM-DDTHH:mm" (no offset), or "YYYY-MM-DD" for all-day events.' },
  end: { type: "string", description: "Same format as start. For all-day events this is the day after the last day. Optional; defaults to one hour or one day." },
  allDay: { type: "boolean" },
  category: { type: "string", description: "One of the category ids listed in the system prompt." },
  location: { type: "string" },
  notes: { type: "string" },
  repeat: { type: "object", description: 'Recurrence: {"freq":"daily|weekly|monthly|yearly","interval":1,"byDay":[0-6, Sunday=0],"until":"YYYY-MM-DD","count":n}' },
};

export const TOOLS: ToolSpec[] = [
  fn("calendar_list", "List calendar events between two local times. The next 30 days are already in the system prompt; use this for other ranges.", { from: { type: "string", description: 'Local "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm"' }, to: { type: "string" } }, ["from", "to"]),
  fn("calendar_create", "Propose a new calendar event. Nothing is saved until the user confirms.", eventProps, ["title", "start"]),
  fn("calendar_update", "Propose changes to an existing event. Only include the fields to change. Nothing is saved until the user confirms.", { id: { type: "string" }, scope: { type: "string", enum: ["this", "all"] }, occurrenceDate: { type: "string", description: "YYYY-MM-DD, required for repeating events" }, event: { type: "object", properties: eventProps } }, ["id", "event"]),
  fn("calendar_delete", "Propose deleting an event. Nothing is deleted until the user confirms.", { id: { type: "string" }, scope: { type: "string", enum: ["this", "all"] }, occurrenceDate: { type: "string" } }, ["id"]),
  fn("mail_search", "Search the user's Gmail (read-only). Supports Gmail search syntax such as from:, subject:, newer_than:7d, is:unread. Returns sender, subject, date and a snippet.", { query: { type: "string" }, account: { type: "string", description: "Optional account id to limit the search" }, max: { type: "number" } }, ["query"]),
  fn("mail_read", "Read one email in full (text only, read-only). Use ids returned by mail_search.", { account: { type: "string" }, id: { type: "string" } }, ["account", "id"]),
  fn("notes_search", "Search the user's notes by words in the title or text. Returns note ids, titles and snippets.", { query: { type: "string" } }, ["query"]),
  fn("notes_list", "List the most recently edited notes (titles and ids).", {}),
  fn("notes_read", "Read one note in full as plain text. Use ids returned by notes_search or notes_list.", { id: { type: "string" } }, ["id"]),
  fn("notes_create", "Propose a new note. The body is Markdown (headings, bullets, - [ ] tasks, quotes). Nothing is saved until the user confirms.", { title: { type: "string" }, markdown: { type: "string" }, parentId: { type: "string", description: "Optional id of a note to nest it under" } }, ["title", "markdown"]),
  fn("notes_append", "Propose adding Markdown text to the end of an existing note. Nothing is saved until the user confirms.", { id: { type: "string" }, markdown: { type: "string" } }, ["id", "markdown"]),
  fn("library_list", "List the documents in the user's reading library with reading progress.", {}),
  fn("library_search", "Find the passages of one library document that are most relevant to a query. Write the query in the document's language.", { documentId: { type: "string" }, query: { type: "string" } }, ["documentId", "query"]),
];

export type Summary = { title: string; start: string; end: string; allDay: boolean; location: string; category: string; repeat?: unknown };
export type Proposal = {
  op: "create" | "update" | "delete" | "note_create" | "note_append";
  id?: string;
  scope?: "this" | "all";
  occurrenceDate?: string;
  /** The change exactly as the calendar endpoint will receive it. */
  event?: Record<string, unknown>;
  before?: Summary;
  after?: Summary;
  conflicts: string[];
  /** For note proposals: what will be written. */
  note?: { id?: string; title: string; markdown: string; parentId?: string | null };
};

const summary = (event: Summary): Summary => ({ title: event.title, start: event.start, end: event.end, allDay: event.allDay, location: event.location, category: event.category, repeat: event.repeat ?? null });

export function describeCall(name: string, rawArgs: string) {
  const args = parse(rawArgs);
  switch (name) {
    case "calendar_list": return "Checking your calendar";
    case "mail_search": return `Searching mail: ${String(args.query ?? "").slice(0, 60)}`;
    case "mail_read": return "Reading an email";
    case "notes_search": return `Searching notes: ${String(args.query ?? "").slice(0, 60)}`;
    case "notes_list": case "notes_read": return "Reading your notes";
    case "notes_create": case "notes_append": return "Preparing a note";
    case "library_list": return "Looking through your library";
    case "library_search": return `Searching a book: ${String(args.query ?? "").slice(0, 60)}`;
    default: return "Preparing a calendar change";
  }
}

function parse(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw || "{}");
    return value && typeof value === "object" ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

const cut = (text: string) => text.length > RESULT_LIMIT ? `${text.slice(0, RESULT_LIMIT)}\n…(shortened)` : text;

/** Titles of existing timed events that overlap the proposed time (all-day events are not counted). */
async function conflictsFor(fields: { start: string; end: string; allDay: boolean }, ignoreId?: string) {
  if (fields.allDay) return [];
  const start = Date.parse(fields.start);
  const end = Date.parse(fields.end);
  const { occurrences } = await listOccurrences(start - 3_600_000, end + 3_600_000);
  return occurrences.filter((entry) => !entry.allDay && entry.id !== ignoreId && Date.parse(entry.start) < end && Date.parse(entry.end) > start).map((entry) => entry.title).slice(0, 3);
}

export const calendarLines = (occurrences: Occurrence[], zone: string) => {
  const local = (iso: string, allDay: boolean) => allDay ? iso : new Intl.DateTimeFormat("sv-SE", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)).replace(" ", "T");
  return occurrences.map((item) => `- [${item.id}] ${item.title} | ${local(item.start, item.allDay)} → ${local(item.end, item.allDay)}${item.allDay ? " (all-day)" : ""} | ${item.category}${item.location ? ` | ${item.location}` : ""}${item.recurring ? ` | repeats (occurrence ${item.occurrenceDate})` : ""}`);
};

export type ToolContext = { zone: string; proposals: Proposal[] };

/** Runs one tool call. Read tools return text for the model; calendar writes only record a proposal. */
export async function runTool(name: string, rawArgs: string, ctx: ToolContext): Promise<string> {
  const args = parse(rawArgs);
  const zone = validZone(ctx.zone);
  try {
    switch (name) {
      case "calendar_list": {
        const from = toInstant(args.from, zone);
        const to = toInstant(args.to, zone);
        if (from === null || to === null || to <= from) return "Error: give valid from and to times.";
        const { occurrences } = await listOccurrences(from, Math.min(to, from + 60 * 86_400_000));
        return cut(occurrences.length ? calendarLines(occurrences.slice(0, 150), zone).join("\n") : "No events in that range.");
      }
      case "calendar_create": {
        const doc = await readCalendar();
        const fields = buildFields(args, zone, doc.categories);
        const conflicts = await conflictsFor(fields);
        ctx.proposals.push({ op: "create", event: args, after: summary(fields), conflicts });
        return `Proposed creating "${fields.title}". Awaiting the user's confirmation.${conflicts.length ? ` It overlaps with: ${conflicts.join(", ")}.` : ""}`;
      }
      case "calendar_update":
      case "calendar_delete": {
        const doc = await readCalendar();
        const series = doc.events.find((event) => event.id === args.id);
        if (!series) return "Error: no event has that id. Use an id from the calendar list.";
        const scope = args.scope === "this" ? "this" : "all";
        const occurrenceDate = typeof args.occurrenceDate === "string" ? args.occurrenceDate : undefined;
        let shown: Occurrence | undefined;
        if (series.repeat) {
          if (scope === "this" || occurrenceDate) shown = expand(series, 0, 8_640_000_000_000_000).find((entry) => entry.occurrenceDate === occurrenceDate);
          if (scope === "this" && !shown) return "Error: for one occurrence of a repeating event, give its occurrenceDate (YYYY-MM-DD).";
        }
        const before = summary(fieldsOf(shown ?? series));
        if (name === "calendar_delete") {
          ctx.proposals.push({ op: "delete", id: series.id, scope, occurrenceDate, before, conflicts: [] });
          return `Proposed deleting "${before.title}". Awaiting the user's confirmation.`;
        }
        const patch = args.event && typeof args.event === "object" ? args.event as Record<string, unknown> : {};
        const fields = buildFields(patch, zone, doc.categories, fieldsOf(shown && scope === "this" ? shown : series));
        const conflicts = await conflictsFor(fields, series.id);
        ctx.proposals.push({ op: "update", id: series.id, scope, occurrenceDate, event: patch, before, after: summary(fields), conflicts });
        return `Proposed changing "${before.title}". Awaiting the user's confirmation.${conflicts.length ? ` It would overlap with: ${conflicts.join(", ")}.` : ""}`;
      }
      case "mail_search": {
        if (!mailConfigured()) return "Mail is not set up.";
        const accounts = (await readAccounts()).filter((account) => !args.account || account.id === args.account);
        if (!accounts.length) return "No mail account is connected.";
        const max = Math.min(12, Math.max(1, Math.floor(Number(args.max) || 8)));
        const found = (await Promise.all(accounts.map((account) => listMessages(account, { q: String(args.query ?? "").slice(0, 300), max }).then((result) => result.messages).catch((error) => error instanceof MailAuthError ? [] : [])))).flat();
        found.sort((a, b) => b.date - a.date);
        return cut(found.length ? found.slice(0, max).map((message) => `- [account ${message.account} | id ${message.id}] ${new Date(message.date).toISOString().slice(0, 16)} | ${message.from} <${message.fromEmail}> | ${message.subject} | ${message.snippet.slice(0, 160)}${message.unread ? " | unread" : ""}`).join("\n") : "No matching emails.");
      }
      case "mail_read": {
        if (!mailConfigured()) return "Mail is not set up.";
        const account = (await readAccounts()).find((item) => item.id === args.account);
        if (!account || typeof args.id !== "string" || !/^[0-9a-f]{8,32}$/i.test(args.id)) return "Error: unknown account or message id.";
        const message = await getMessage(account, args.id);
        return cut(`From: ${message.from} <${message.fromEmail}>\nTo: ${message.to}\nDate: ${new Date(message.date).toISOString()}\nSubject: ${message.subject}\nAttachments: ${message.attachments.map((item) => item.name).join(", ") || "none"}\n\n${message.body.slice(0, 5000)}`);
      }
      case "notes_search": {
        const results = await searchNotes(String(args.query ?? "").slice(0, 200));
        return cut(results.length ? results.map((item) => `- [${item.meta.id}] ${item.meta.title || "Untitled"} | ${item.snippet}`).join("\n") : "No matching notes.");
      }
      case "notes_list": {
        const notes = (await listNotes()).filter((note) => !note.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 30);
        return cut(notes.length ? notes.map((note) => `- [${note.id}] ${note.title || "Untitled"} | updated ${note.updatedAt.slice(0, 10)} | ${note.preview.slice(0, 80)}`).join("\n") : "There are no notes yet.");
      }
      case "notes_read": {
        const found = typeof args.id === "string" && validNoteId(args.id) ? await readNote(args.id) : null;
        if (!found || found.note.deletedAt) return "Error: no note has that id.";
        return cut(`${found.note.title || "Untitled"}\n\n${jsonToText(found.content)}`);
      }
      case "notes_create": {
        const title = String(args.title ?? "").trim().slice(0, 200);
        const markdown = String(args.markdown ?? "").slice(0, 20_000);
        if (!title) return "Error: give the note a title.";
        const parentId = typeof args.parentId === "string" && validNoteId(args.parentId) ? args.parentId : null;
        ctx.proposals.push({ op: "note_create", note: { title, markdown, parentId }, conflicts: [] });
        return `Proposed creating the note "${title}". Awaiting the user's confirmation.`;
      }
      case "notes_append": {
        const found = typeof args.id === "string" && validNoteId(args.id) ? await readNote(args.id) : null;
        if (!found || found.note.deletedAt) return "Error: no note has that id.";
        const markdown = String(args.markdown ?? "").slice(0, 20_000);
        if (!markdown.trim()) return "Error: there is nothing to add.";
        ctx.proposals.push({ op: "note_append", note: { id: found.note.id, title: found.note.title || "Untitled", markdown }, conflicts: [] });
        return `Proposed adding text to "${found.note.title || "Untitled"}". Awaiting the user's confirmation.`;
      }
      case "library_list": {
        const documents = await listDocuments();
        return cut(documents.length ? documents.map((item) => `- [${item.id}] ${item.name} | ${item.pageCount ? `${item.pageCount} pages` : `${Math.round(item.characterCount / 1000)}k characters`}${item.progress ? ` | ${Math.round((item.progress / Math.max(1, item.characterCount)) * 100)}% read` : ""}`).join("\n") : "The library is empty.");
      }
      case "library_search": {
        const id = typeof args.documentId === "string" ? args.documentId : "";
        const document = await readDocument(id);
        const text = document ? await readDocumentText(id) : null;
        if (!document || !text) return "Error: no document has that id.";
        const { context } = retrieveContext(text, queryTerms(String(args.query ?? "")), 0);
        return cut(`From "${document.name}":\n${context}`);
      }
      default:
        return `Error: unknown tool ${name}.`;
    }
  } catch (error) {
    if (error instanceof CalendarInputError) return `Error: ${error.message}`;
    if (error instanceof MailAuthError) return "Error: Gmail access expired; the user must reconnect.";
    console.error("Agent tool failed", name, error instanceof Error ? error.message : error);
    return "Error: that tool failed. Continue without it or tell the user.";
  }
}
