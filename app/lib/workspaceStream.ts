import { DeepSeekError, deepSeekErrorCode } from "./workspaceDeepSeek";

/** Newline-delimited JSON events so the browser can render the answer as it arrives. */
export function ndjson(run: (send: (event: Record<string, unknown>) => void) => Promise<void>) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => { try { controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); } catch { /* client went away */ } };
      try {
        await run(send);
      } catch (error) {
        const status = error instanceof DeepSeekError ? error.status : 502;
        send({ t: "error", code: deepSeekErrorCode(status) });
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" },
  });
}
