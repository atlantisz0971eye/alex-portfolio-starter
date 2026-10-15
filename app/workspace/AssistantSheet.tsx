"use client";

import { BookOpen, Loader2, Send, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { WorkspaceDocument } from "../lib/workspaceStore";
import { Sheet } from "./Sheet";

export type AssistantIntent = { id: number; mode: "open" | "translate" | "ask"; selection?: string };
type Props = {
  open: boolean;
  onClose: () => void;
  document: WorkspaceDocument;
  intent: AssistantIntent | null;
  onDocument: (document: WorkspaceDocument) => void;
  request: <T>(body: Record<string, unknown>) => Promise<T>;
  onError: (message: string) => void;
};

export function AssistantSheet({ open, onClose, document, intent, onDocument, request, onError }: Props) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState<"guide" | "ask" | "translate" | null>(null);
  const [translation, setTranslation] = useState<{ source: string; text: string } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const handled = useRef(0);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [document.messages?.length, translation, open]);

  async function guide() {
    setBusy("guide");
    try {
      const data = await request<{ answer: string; coverage?: "full" | "excerpts" }>({ action: "guide", documentId: document.id });
      onDocument({ ...document, guide: data.answer, guideCoverage: data.coverage });
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not generate the guide.");
    } finally { setBusy(null); }
  }

  async function translate(selection: string) {
    setBusy("translate");
    setTranslation({ source: selection, text: "" });
    try {
      const data = await request<{ answer: string }>({ action: "translate", documentId: document.id, selection });
      setTranslation({ source: selection, text: data.answer });
    } catch (cause) {
      setTranslation(null);
      onError(cause instanceof Error ? cause.message : "Could not translate.");
    } finally { setBusy(null); }
  }

  async function ask(event?: React.FormEvent) {
    event?.preventDefault();
    const text = question.trim();
    if (text.length < 2 || busy) return;
    setBusy("ask");
    try {
      const data = await request<{ messages: WorkspaceDocument["messages"] }>({ action: "ask", documentId: document.id, question: text });
      onDocument({ ...document, messages: data.messages });
      setQuestion("");
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not get an answer.");
    } finally { setBusy(null); }
  }

  useEffect(() => {
    if (!intent || intent.id === handled.current) return;
    handled.current = intent.id;
    if (intent.mode === "translate" && intent.selection) void translate(intent.selection);
    if (intent.mode === "ask" && intent.selection) {
      setQuestion(`Explain this passage: “${intent.selection.slice(0, 400)}”`);
      window.setTimeout(() => inputRef.current?.focus(), 250);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent]);

  return <Sheet open={open} onClose={onClose} title="DeepSeek" size="tall" flush>
    <div className="ws-chat">
      <div className="ws-chat__scroll">
        <section className="ws-card">
          <div className="ws-card__head"><span><BookOpen size={15} /> Reading guide</span><small>{document.guideCoverage === "excerpts" ? "Based on excerpts" : document.guideCoverage === "full" ? "Based on full text" : ""}</small></div>
          {document.guide
            ? <div className="ws-markdown"><ReactMarkdown>{document.guide}</ReactMarkdown></div>
            : <button type="button" className="ws-pill" onClick={() => void guide()} disabled={busy === "guide"}>{busy === "guide" ? <Loader2 className="ws-spin" size={16} /> : <Sparkles size={16} />} Generate guide</button>}
        </section>
        {translation && <section className="ws-card">
          <div className="ws-card__head"><span>Translation</span></div>
          <p className="ws-quote">{translation.source.slice(0, 220)}{translation.source.length > 220 ? "…" : ""}</p>
          {translation.text ? <p className="ws-translation">{translation.text}</p> : <p className="ws-muted"><Loader2 className="ws-spin" size={14} /> Translating…</p>}
        </section>}
        {(document.messages ?? []).map((message, index) => <div key={index} className={`ws-message ws-message--${message.role}`}>
          <div className="ws-markdown"><ReactMarkdown>{message.content}</ReactMarkdown></div>
        </div>)}
        {busy === "ask" && <div className="ws-message ws-message--assistant"><p className="ws-muted"><Loader2 className="ws-spin" size={14} /> Thinking…</p></div>}
        <div ref={endRef} />
      </div>
      <form className="ws-compose" onSubmit={ask}>
        <textarea ref={inputRef} rows={1} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about this book" enterKeyHint="send" />
        <button type="submit" aria-label="Send" disabled={question.trim().length < 2 || !!busy}>{busy === "ask" ? <Loader2 className="ws-spin" size={18} /> : <Send size={18} />}</button>
      </form>
    </div>
  </Sheet>;
}
