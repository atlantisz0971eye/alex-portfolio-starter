"use client";

import { Extension, type Editor, type Range } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";
import Highlight from "@tiptap/extension-highlight";
import Suggestion from "@tiptap/suggestion";
import { Bold, CheckSquare, Code, Heading1, Heading2, Highlighter, Italic, Link2, List, ListOrdered, Minus, Pilcrow, Quote, Redo2, Strikethrough, TextQuote, Undo2, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { JSONNode } from "../lib/notesText";

type SlashItem = { title: string; hint: string; keywords: string; icon: LucideIcon; run: (editor: Editor, range: Range) => void };

const ITEMS: SlashItem[] = [
  { title: "Text", hint: "Plain paragraph", keywords: "paragraph text p", icon: Pilcrow, run: (e, r) => e.chain().focus().deleteRange(r).setParagraph().run() },
  { title: "Heading 1", hint: "Large section title", keywords: "h1 title heading", icon: Heading1, run: (e, r) => e.chain().focus().deleteRange(r).setNode("heading", { level: 1 }).run() },
  { title: "Heading 2", hint: "Medium section title", keywords: "h2 heading subtitle", icon: Heading2, run: (e, r) => e.chain().focus().deleteRange(r).setNode("heading", { level: 2 }).run() },
  { title: "Heading 3", hint: "Small section title", keywords: "h3 heading", icon: TextQuote, run: (e, r) => e.chain().focus().deleteRange(r).setNode("heading", { level: 3 }).run() },
  { title: "Bulleted list", hint: "A simple list", keywords: "bullet ul list unordered", icon: List, run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run() },
  { title: "Numbered list", hint: "A list with numbers", keywords: "ordered ol number list", icon: ListOrdered, run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run() },
  { title: "To-do list", hint: "Track tasks with checkboxes", keywords: "todo task check checkbox", icon: CheckSquare, run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run() },
  { title: "Quote", hint: "Quote or highlight a passage", keywords: "blockquote quote cite", icon: Quote, run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run() },
  { title: "Code", hint: "A block of code", keywords: "code snippet pre", icon: Code, run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run() },
  { title: "Divider", hint: "A horizontal line", keywords: "hr line rule divider separator", icon: Minus, run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run() },
];

type SlashState = { items: SlashItem[]; index: number; rect: DOMRect | null; command: (item: SlashItem) => void } | null;

type Bridge = { show: (state: NonNullable<SlashState>) => void; hide: () => void; key: (event: KeyboardEvent) => boolean };

/** Typing "/" opens a menu of blocks, as in Notion. */
function slashExtension(bridge: { current: Bridge | null }) {
  return Extension.create({
    name: "slashCommand",
    addProseMirrorPlugins() {
      return [Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        char: "/",
        allowSpaces: false,
        items: ({ query }) => {
          const q = query.toLowerCase().trim();
          return ITEMS.filter((item) => !q || item.title.toLowerCase().includes(q) || item.keywords.includes(q)).slice(0, 10);
        },
        command: ({ editor, range, props }) => props.run(editor, range),
        render: () => ({
          onStart: (props) => bridge.current?.show({ items: props.items, index: 0, rect: props.clientRect?.() ?? null, command: (item) => props.command(item) }),
          onUpdate: (props) => bridge.current?.show({ items: props.items, index: 0, rect: props.clientRect?.() ?? null, command: (item) => props.command(item) }),
          onKeyDown: ({ event }) => bridge.current?.key(event) ?? false,
          onExit: () => bridge.current?.hide(),
        }),
      })];
    },
  });
}

type Props = {
  /** Remount with a new key per note; content is only read at mount. */
  initial: JSONNode;
  onChange: (content: JSONNode) => void;
  autoFocus?: boolean;
};

export function NoteEditor({ initial, onChange, autoFocus }: Props) {
  const [slash, setSlash] = useState<SlashState>(null);
  const slashRef = useRef<SlashState>(null);
  slashRef.current = slash;
  const bridge = useRef<Bridge | null>(null);
  bridge.current = {
    show: (state) => setSlash((current) => ({ ...state, index: current && current.items.length === state.items.length ? Math.min(current.index, state.items.length - 1) : 0 })),
    hide: () => setSlash(null),
    key: (event) => {
      const state = slashRef.current;
      if (!state || !state.items.length) return false;
      if (event.key === "ArrowDown") { setSlash({ ...state, index: (state.index + 1) % state.items.length }); return true; }
      if (event.key === "ArrowUp") { setSlash({ ...state, index: (state.index + state.items.length - 1) % state.items.length }); return true; }
      if (event.key === "Enter" || event.key === "Tab") { state.command(state.items[state.index]); return true; }
      if (event.key === "Escape") { setSlash(null); return true; }
      return false;
    },
  };

  const extensions = useMemo(() => [
    StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" } } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Highlight,
    Placeholder.configure({ placeholder: ({ node }) => node.type.name === "heading" ? "Heading" : "Type “/” for blocks…" }),
    slashExtension(bridge),
  ], []);

  const editor = useEditor({
    extensions,
    content: initial,
    immediatelyRender: false,
    autofocus: autoFocus ? "end" : false,
    editorProps: { attributes: { class: "note-prose", spellcheck: "true", autocapitalize: "sentences" } },
    onUpdate: ({ editor: current }) => onChange(current.getJSON() as JSONNode),
  });

  return <div className="note-editor">
    <EditorContent editor={editor} />
    {editor && <Overlay><NoteToolbar editor={editor} /></Overlay>}
    {slash && slash.items.length > 0 && <Overlay><SlashMenu state={slash} /></Overlay>}
  </div>;
}

/** Floating pieces render at the app root so scrolling page content never moves them. */
function Overlay({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.querySelector<HTMLElement>(".ws-root")), []);
  return host ? createPortal(children, host) : null;
}

function NoteToolbar({ editor }: { editor: Editor }) {
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      focused: e.isFocused,
      bold: e.isActive("bold"), italic: e.isActive("italic"), strike: e.isActive("strike"), code: e.isActive("code"), highlight: e.isActive("highlight"), link: e.isActive("link"),
      h1: e.isActive("heading", { level: 1 }), h2: e.isActive("heading", { level: 2 }), bullet: e.isActive("bulletList"), todo: e.isActive("taskList"), quote: e.isActive("blockquote"),
      canUndo: e.can().undo(), canRedo: e.can().redo(),
    }),
  });
  const [visible, setVisible] = useState(false);
  // Keep the bar while a toolbar button is pressed (focus briefly leaves the editor).
  useEffect(() => {
    if (active.focused) { setVisible(true); return; }
    const timer = window.setTimeout(() => setVisible(false), 250);
    return () => window.clearTimeout(timer);
  }, [active.focused]);
  if (!visible) return null;

  const run = (action: () => void) => (event: React.PointerEvent | React.MouseEvent) => { event.preventDefault(); action(); };
  const Btn = ({ label, on, icon: Icon, action, disabled }: { label: string; on?: boolean; icon: LucideIcon; action: () => void; disabled?: boolean }) =>
    <button type="button" aria-label={label} aria-pressed={on} className={on ? "is-on" : ""} disabled={disabled} onPointerDown={run(action)}><Icon size={18} /></button>;

  return <div className="note-toolbar" role="toolbar" aria-label="Formatting">
    <Btn label="Undo" icon={Undo2} disabled={!active.canUndo} action={() => editor.chain().focus().undo().run()} />
    <Btn label="Redo" icon={Redo2} disabled={!active.canRedo} action={() => editor.chain().focus().redo().run()} />
    <i />
    <Btn label="Heading 1" icon={Heading1} on={active.h1} action={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
    <Btn label="Heading 2" icon={Heading2} on={active.h2} action={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
    <Btn label="Bulleted list" icon={List} on={active.bullet} action={() => editor.chain().focus().toggleBulletList().run()} />
    <Btn label="To-do list" icon={CheckSquare} on={active.todo} action={() => editor.chain().focus().toggleTaskList().run()} />
    <Btn label="Quote" icon={Quote} on={active.quote} action={() => editor.chain().focus().toggleBlockquote().run()} />
    <i />
    <Btn label="Bold" icon={Bold} on={active.bold} action={() => editor.chain().focus().toggleBold().run()} />
    <Btn label="Italic" icon={Italic} on={active.italic} action={() => editor.chain().focus().toggleItalic().run()} />
    <Btn label="Strikethrough" icon={Strikethrough} on={active.strike} action={() => editor.chain().focus().toggleStrike().run()} />
    <Btn label="Highlight" icon={Highlighter} on={active.highlight} action={() => editor.chain().focus().toggleHighlight().run()} />
    <Btn label="Code" icon={Code} on={active.code} action={() => editor.chain().focus().toggleCode().run()} />
    <Btn label="Link" icon={Link2} on={active.link} action={() => {
      const previous = editor.getAttributes("link").href as string | undefined;
      const url = window.prompt("Link address", previous ?? "https://");
      if (url === null) return;
      if (url.trim() === "") editor.chain().focus().extendMarkRange("link").unsetLink().run();
      else editor.chain().focus().extendMarkRange("link").setLink({ href: /^[a-z][a-z0-9+.-]*:/i.test(url.trim()) ? url.trim() : `https://${url.trim()}` }).run();
    }} />
  </div>;
}

function SlashMenu({ state }: { state: NonNullable<SlashState> }) {
  const height = Math.min(state.items.length * 52 + 12, 320);
  const room = (window.visualViewport?.height ?? window.innerHeight);
  const rect = state.rect;
  // Open below the caret, or above it when the keyboard leaves no room.
  const below = !rect || rect.bottom + height + 70 < room;
  const style: React.CSSProperties = rect
    ? { left: Math.min(Math.max(12, rect.left), window.innerWidth - 292), ...(below ? { top: rect.bottom + 8 } : { top: Math.max(8, rect.top - height - 8) }) }
    : { left: 12, top: 120 };
  const active = useRef<HTMLButtonElement>(null);
  useEffect(() => { active.current?.scrollIntoView({ block: "nearest" }); }, [state.index]);
  return <div className="slash-menu" style={style} role="listbox" aria-label="Blocks" onPointerDown={(event) => event.preventDefault()}>
    {state.items.map((item, index) => <button key={item.title} ref={index === state.index ? active : undefined} type="button" role="option" aria-selected={index === state.index} className={index === state.index ? "is-on" : ""} onClick={() => state.command(item)}>
      <span><item.icon size={18} /></span><b>{item.title}<small>{item.hint}</small></b>
    </button>)}
  </div>;
}
