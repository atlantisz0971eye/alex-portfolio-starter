import type { WorkspaceDocument } from "../lib/workspaceStore";

export const errors: Record<string, string> = {
  unauthorized: "Session expired. Sign in again.",
  storage_not_configured: "Private storage is not connected yet.",
  ai_not_configured: "DeepSeek is not configured yet.",
  no_extractable_text: "No readable text found. Scanned PDFs need OCR support.",
  unsupported_format: "Supported formats: PDF, TXT, Markdown and HTML.",
  invalid_pdf: "This file is not a valid PDF.",
  pdf_encrypted: "This PDF is password-protected. Remove the password and upload it again.",
  pdf_unreadable: "This PDF is damaged or uses an unsupported structure, so its text could not be read.",
  file_too_large: "Maximum file size: 25 MB.",
  file_not_found: "The upload did not reach storage. Try again.",
  already_exists: "This upload was already processed.",
  storage_failed: "Private storage failed while saving. Nothing was kept; try again.",
  not_found: "That document no longer exists.",
  invalid_request: "The request was not valid. Reload the page and try again.",
  rate_limited: "Too many requests. Try again shortly.",
  processing_failed: "Could not process this document. Check the file and try again.",
  assistant_failed: "The assistant could not complete this request. Try again.",
  upload_failed: "Upload failed. Try again.",
  invalid_access_key: "Invalid access key.",
  mail_not_configured: "Mail is not set up yet. Add the Google credentials in Vercel.",
  mail_reauth: "Gmail access expired. Reconnect the account.",
  mail_failed: "Gmail could not be reached. Try again.",
  invalid_selection: "Select a shorter passage to translate.",
  ai_timeout: "DeepSeek is responding slowly right now. Try again.",
  ai_busy: "DeepSeek is overloaded right now. Try again in a moment.",
  ai_auth: "DeepSeek rejected the API key. Check DEEPSEEK_API_KEY in Vercel.",
  ai_balance: "The DeepSeek account has insufficient balance. Top it up on the DeepSeek platform.",
  ai_request: "DeepSeek rejected the request, likely the model name. Check DEEPSEEK_MODEL.",
  invalid_question: "Ask a slightly longer question.",
};

export async function parseResponse<T>(response: Response): Promise<T> {
  let data: { error?: string } | null = null;
  try {
    data = await response.json();
  } catch {
    // Platform errors such as gateway timeouts are not JSON.
  }
  if (!response.ok) {
    if (data?.error && errors[data.error]) throw new Error(errors[data.error]);
    if (response.status === 504 || response.status === 408) throw new Error("This took too long to process. Large or complex files may need another try.");
    if (response.status === 413) throw new Error("The request was too large.");
    throw new Error(`Something went wrong (${response.status}). Try again.`);
  }
  return data as T;
}

export type StreamDone = { coverage?: "full" | "excerpts" | "retrieved"; messages?: WorkspaceDocument["messages"] };

/** POSTs JSON and reads the newline-delimited events the assistant routes send, reporting text as it arrives. */
export async function streamNdjson(url: string, body: Record<string, unknown>, onDelta: (text: string) => void, signal: AbortSignal): Promise<StreamDone> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  if (!response.ok || !response.body) return parseResponse<never>(response);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done: StreamDone | null = null;
  const handle = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as { t: string; v?: string; code?: string } & StreamDone;
    if (event.t === "delta" && event.v) onDelta(event.v);
    else if (event.t === "error") throw new Error(errors[event.code ?? ""] ?? errors.assistant_failed);
    else if (event.t === "done") done = { coverage: event.coverage, messages: event.messages };
  };
  for (;;) {
    const { done: finished, value } = await reader.read();
    if (finished) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(handle);
  }
  handle(buffer);
  if (!done) throw new Error("The answer was interrupted. Try again.");
  return done;
}
