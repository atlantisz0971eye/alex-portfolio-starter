export type Category = { id: string; name: string; color: string };
export type Repeat = { freq: "daily" | "weekly" | "monthly" | "yearly"; interval: number; until?: string; count?: number; byDay?: number[] };
/** One occurrence of a stored event as the API returns it. */
export type Occ = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  tz: string;
  category: string;
  location: string;
  notes: string;
  repeat?: Repeat;
  occurrenceDate: string;
  recurring: boolean;
  createdBy: "user" | "agent";
};
