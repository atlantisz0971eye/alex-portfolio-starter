const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

type Window = { startedAt: number; count: number };
type ClientUsage = { minute: Window; day: Window };
type Limits = {
  perClientMinute: number;
  perClientDay: number;
  perInstanceMinute: number;
  perInstanceDay: number;
  maxTrackedClients: number;
};

export type NarrativeLimit = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export class NarrativeRateLimiter {
  private readonly clients = new Map<string, ClientUsage>();
  private readonly limits: Limits;
  private minute: Window = { startedAt: 0, count: 0 };
  private day: Window = { startedAt: 0, count: 0 };

  constructor(limits: Limits = {
    perClientMinute: 6,
    perClientDay: 30,
    perInstanceMinute: 24,
    perInstanceDay: 120,
    maxTrackedClients: 1024,
  }) {
    this.limits = limits;
  }

  check(clientId: string, now = Date.now()): NarrativeLimit {
    this.minute = this.currentWindow(this.minute, now, MINUTE_MS);
    this.day = this.currentWindow(this.day, now, DAY_MS);

    let client = this.clients.get(clientId);
    if (!client && this.clients.size >= this.limits.maxTrackedClients) {
      for (const [id, usage] of this.clients) {
        if (now - usage.day.startedAt >= DAY_MS) this.clients.delete(id);
      }
      if (this.clients.size >= this.limits.maxTrackedClients) {
        return { allowed: false, retryAfterSeconds: 60 };
      }
    }

    client ??= {
      minute: { startedAt: now, count: 0 },
      day: { startedAt: now, count: 0 },
    };
    client.minute = this.currentWindow(client.minute, now, MINUTE_MS);
    client.day = this.currentWindow(client.day, now, DAY_MS);

    const blocked = [
      { window: client.minute, max: this.limits.perClientMinute, duration: MINUTE_MS },
      { window: client.day, max: this.limits.perClientDay, duration: DAY_MS },
      { window: this.minute, max: this.limits.perInstanceMinute, duration: MINUTE_MS },
      { window: this.day, max: this.limits.perInstanceDay, duration: DAY_MS },
    ].filter(({ window, max }) => window.count >= max);

    if (blocked.length) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(...blocked.map(({ window, duration }) =>
          Math.max(1, Math.ceil((window.startedAt + duration - now) / 1000))
        )),
      };
    }

    client.minute.count += 1;
    client.day.count += 1;
    this.minute.count += 1;
    this.day.count += 1;
    this.clients.set(clientId, client);
    return { allowed: true };
  }

  private currentWindow(window: Window, now: number, duration: number): Window {
    return now - window.startedAt >= duration
      ? { startedAt: now, count: 0 }
      : window;
  }
}
