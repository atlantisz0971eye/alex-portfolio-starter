"use client";

import { BookOpen, Loader2, RotateCcw, Send, Sparkles, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { WorkspaceDocument } from "../lib/workspaceStore";
import { Sheet } from "./Sheet";

/** Turns "[Page 12]" mentions into links that jump the reader to that page. */
function withCitations(markdown: string) {
  return markdown.replace(/\[(?:Page|p\.?)\s*(\d{1,5})(?:\s*[-–,，、]\s*\d{1,5})?\]/gi, (_match, page) => `[p. ${page}](#cite-${page})`);
}

function Markdown({ children, onCite }: { children: string; onCite: (page: number) => void }) {
  return <ReactMarkdown components={{
    a: ({ href, children: label }) => href?.startsWith("#cite-")
      ? <button type="button" className="ws-cite" onClick={() => onCite(Number(href.slice(6)))}>{label}</button>
      : <a href={href} target="_blank" rel="noreferrer">{label}</a>,
  }}>{withCitations(children)}</ReactMarkdown>;
}

export type AssistantIntent = { id: number; mode: "open" | "translate" | "ask"; selection?: string; offset?: number };
type Done = { coverage?: "full" | "excerpts" | "retrieved"; messages?: WorkspaceDocument["messages"] };
type Live = { kind: "guide" | "ask" | "translate"; question?: string; source?: string; text: string };
type Props = {
  open: boolean;
  onClose: () => void;
  document: WorkspaceDocument;
  intent: AssistantIntent | null;
  onDocument: (document: WorkspaceDocument) => void;
  stream: (body: Record<string, unknown>, onDelta: (text: string) => void, signal: AbortSignal) => Promise<Done>;
  onError: (message: string) => void;
  onCite: (page: number) => void;
};

export function AssistantSheet({ open, onClose, document, intent, onDocument, stream, onError, onCite }: Props) {
  const [question, setQuestion] = useState("");
  const [live, setLive] = useState<Live | null>(null);
  const [translation, setTranslation] = useState<{ source: string; text: string } | null>(null);
  const [failure, setFailure] = useState<{ message: string; retry: () => void } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const handled = useRef(0);
  const offsetRef = useRef(0);
  const documentRef = useRef(document);
  documentRef.current = document;

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [document.messages?.length, translation, open, live?.text.length, failure]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const run = useCallback(async (next: Live, body: Record<string, unknown>) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setFailure(null);
    setLive(next);
    let text = "";
    try {
      const done = await stream(body, (delta) => {
        text += delta;
        setLive((current) => current && { ...current, text });
      }, controller.signal);
      const current = documentRef.current;
      if (next.kind === "guide") onDocument({ ...current, guide: text, guideCoverage: done.coverage === "retrieved" ? "excerpts" : done.coverage });
      else if (next.kind === "ask") onDocument({ ...current, messages: done.messages });
      else setTranslation({ source: next.source ?? "", text });
    } catch (cause) {
      if (controller.signal.aborted) return;
      const message = cause instanceof Error ? cause.message : "The assistant could not complete this request.";
      setFailure({ message, retry: () => void run(next, body) });
      onError(message);
    } finally {
      if (abortRef.current === controller) { abortRef.current = null; setLive(null); }
    }
  }, [onDocument, onError, stream]);

  const guide = () => void run({ kind: "guide", text: "" }, { action: "guide", documentId: document.id });
  const translate = useCallback((selection: string) => void run({ kind: "translate", source: selection, text: "" }, { action: "translate", documentId: documentRef.current.id, selection }), [run]);

  function ask(event?: React.FormEvent) {
    event?.preventDefault();
    const text = question.trim();
    if (text.length < 2 || live) return;
    setQuestion("");
    void run({ kind: "ask", question: text, text: "" }, { action: "ask", documentId: document.id, question: text, offset: offsetRef.current });
  }

  useEffect(() => {
    if (!intent || intent.id === handled.current) return;
    handled.current = intent.id;
    offsetRef.current = intent.offset ?? 0;
    if (intent.mode === "translate" && intent.selection) translate(intent.selection);
    if (intent.mode === "ask" && intent.selection) {
      setQuestion(`Explain this passage: “${intent.selection.slice(0, 400)}”`);
      window.setTimeout(() => inputRef.current?.focus(), 250);
    }
  }, [intent, translate]);

  const busy = live !== null;
  const showTranslation = live?.kind === "translate" ? { source: live.source ?? "", text: live.text } : translation;

  return <Sheet open={open} onClose={onClose} title="DeepSeek" size="tall" flush>
    <div className="ws-chat">
      <div className="ws-chat__scroll">
        <section className="ws-card">
          <div className="ws-card__head"><span><BookOpen size={15} /> Reading guide</span><small>{document.guideCoverage === "excerpts" ? "Based on excerpts" : document.guideCoverage === "full" ? "Based on full text" : ""}</small></div>
          {live?.kind === "guide"
            ? (live.text ? <div className="ws-markdown"><Markdown onCite={onCite}>{live.text}</Markdown></div> : <p className="ws-muted"><Loader2 className="ws-spin" size={14} /> Reading the book…</p>)
            : document.guide
              ? <div className="ws-markdown"><Markdown onCite={onCite}>{document.guide}</Markdown></div>
              : <button type="button" className="ws-pill" onClick={guide} disabled={busy}><Sparkles size={16} /> Generate guide</button>}
        </section>
        {showTranslation && <section className="ws-card">
          <div className="ws-card__head"><span>Translation</span></div>
          <p className="ws-quote">{showTranslation.source.slice(0, 220)}{showTranslation.source.length > 220 ? "…" : ""}</p>
          {showTranslation.text ? <p className="ws-translation">{showTranslation.text}</p> : <p className="ws-muted"><Loader2 className="ws-spin" size={14} /> Translating…</p>}
        </section>}
        {(document.messages ?? []).map((message, index) => <div key={index} className={`ws-message ws-message--${message.role}`}>
          <div className="ws-markdown"><Markdown onCite={onCite}>{message.content}</Markdown></div>
        </div>)}
        {live?.kind === "ask" && <>
          <div className="ws-message ws-message--user"><div className="ws-markdown"><p>{live.question}</p></div></div>
          <div className="ws-message ws-message--assistant">
            {live.text ? <div className="ws-markdown"><Markdown onCite={onCite}>{live.text}</Markdown></div> : <p className="ws-muted"><Loader2 className="ws-spin" size={14} /> Searching the book…</p>}
          </div>
        </>}
        {failure && !busy && <div className="ws-card ws-card--error">
          <p>{failure.message}</p>
          <button type="button" className="ws-pill" onClick={failure.retry}><RotateCcw size={15} /> Try again</button>
        </div>}
        <div ref={endRef} />
      </div>
      <form className="ws-compose" onSubmit={ask}>
        <textarea ref={inputRef} rows={1} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about this book" enterKeyHint="send" />
        {busy
          ? <button type="button" aria-label="Stop" onClick={() => abortRef.current?.abort()}><Square size={14} fill="currentColor" /></button>
          : <button type="submit" aria-label="Send" disabled={question.trim().length < 2}><Send size={18} /></button>}
      </form>
    </div>
  </Sheet>;
}
