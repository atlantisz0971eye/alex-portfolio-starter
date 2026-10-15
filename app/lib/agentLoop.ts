import { describeCall, runTool, TOOLS, type ToolContext } from "./agentTools";
import { DeepSeekError, streamChat, type ChatMessage } from "./workspaceDeepSeek";

type Events = {
  onText?: (delta: string) => void;
  onTool?: (name: string, label: string) => void;
  signal?: AbortSignal;
};

/**
 * Runs the tool-calling conversation: the model reads the calendar, mail, notes and library through tools
 * until it answers. Write tools only record proposals in `ctx`; nothing is changed here.
 */
export async function runAgentLoop(messages: ChatMessage[], ctx: ToolContext, events: Events = {}, maxSteps = 6) {
  let full = "";
  for (let step = 0; step < maxSteps; step += 1) {
    let text = "";
    let pending: { id: string; name: string; args: string }[] = [];
    for await (const part of streamChat(messages, TOOLS, 1800, events.signal)) {
      if (part.kind === "text") {
        if (!text && full) { full += "\n\n"; events.onText?.("\n\n"); }
        text += part.text;
        full += part.text;
        events.onText?.(part.text);
      } else {
        pending = part.calls;
      }
    }
    if (!pending.length) {
      if (!full.trim()) throw new DeepSeekError(502);
      break;
    }
    messages.push({ role: "assistant", content: text || null, tool_calls: pending.map((call) => ({ id: call.id, type: "function" as const, function: { name: call.name, arguments: call.args } })) });
    for (const call of pending) {
      if (events.signal?.aborted) return full;
      events.onTool?.(call.name, describeCall(call.name, call.args));
      messages.push({ role: "tool", tool_call_id: call.id, content: await runTool(call.name, call.args, ctx) });
    }
    if (step === maxSteps - 1) { const note = "\n\n（查询步骤已达上限，以上是目前找到的结果。）"; full += note; events.onText?.(note); }
  }
  return full;
}
