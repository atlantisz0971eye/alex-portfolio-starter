import { describeCall, runTool, TOOLS, type Proposal, type ToolContext } from "./agentTools";
import { DeepSeekError, streamChat, type ChatMessage } from "./workspaceDeepSeek";

type Events = {
  onText?: (delta: string) => void;
  onTool?: (name: string, label: string) => void;
  /** Called as soon as a tool records a proposal, so it is not lost if the rest of the turn fails. */
  onProposal?: (proposal: Proposal) => void;
  signal?: AbortSignal;
};

/**
 * Runs the tool-calling conversation: the model reads the calendar, mail, notes and library through tools
 * until it answers. Write tools only record proposals in `ctx`; nothing is changed here.
 * After `maxSteps` rounds of tool calls the model gets one more turn in which it may only answer, so what the
 * last round found is used instead of thrown away.
 */
export async function runAgentLoop(messages: ChatMessage[], ctx: ToolContext, events: Events = {}, maxSteps = 6, finalOnly = false) {
  let full = "";
  let last = "";
  for (let step = 0; step <= maxSteps; step += 1) {
    const closing = step === maxSteps;
    if (closing) messages.push({ role: "user", content: "（系统提示：查询步骤已用完，不能再调用工具。请直接根据上面已经查到的内容回答；没来得及查的部分明确说出来。）" });
    let text = "";
    let pending: { id: string; name: string; args: string }[] = [];
    for await (const part of streamChat(messages, TOOLS, 1800, events.signal, closing)) {
      if (part.kind === "text") {
        if (!text && full) { full += "\n\n"; events.onText?.("\n\n"); }
        text += part.text;
        full += part.text;
        events.onText?.(part.text);
      } else {
        pending = part.calls;
      }
    }
    if (!pending.length || closing) {
      if (!full.trim()) throw new DeepSeekError(502);
      last = text;
      break;
    }
    messages.push({ role: "assistant", content: text || null, tool_calls: pending.map((call) => ({ id: call.id, type: "function" as const, function: { name: call.name, arguments: call.args } })) });
    for (const call of pending) {
      if (events.signal?.aborted) return full;
      events.onTool?.(call.name, describeCall(call.name, call.args));
      const before = ctx.proposals.length;
      messages.push({ role: "tool", tool_call_id: call.id, content: await runTool(call.name, call.args, ctx) });
      ctx.proposals.slice(before).forEach((proposal) => events.onProposal?.(proposal));
    }
  }
  return finalOnly && last.trim() ? last : full;
}
