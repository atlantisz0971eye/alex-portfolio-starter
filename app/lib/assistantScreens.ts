/**
 * The places the assistant can be opened from, with the name the model is told. The page and the route both read
 * this list, so a screen one of them knows is never dropped by the other.
 */
export const ASSISTANT_SCREENS = {
  today: "Today（今天的计划、日程和新邮件）",
  library: "资料库",
  mail: "邮件",
  calendar: "日历",
  mindstreams: "Mindstreams 笔记本",
  devlog: "Devlog（项目日志）",
  carcosa: "Carcosa",
} as const;

export type AssistantScreen = keyof typeof ASSISTANT_SCREENS;

export const isAssistantScreen = (value: unknown): value is AssistantScreen => typeof value === "string" && Object.hasOwn(ASSISTANT_SCREENS, value);
