// Local-only, opt-in usage counters. All data lives in localStorage
// and never leaves the browser — there is no network call anywhere
// in this module. The intent is to give educators (and the user
// themselves) visibility into which actions are getting hit and how
// often errors are being surfaced, so the IDE's rough edges can be
// prioritized empirically rather than from gut feel.
//
// Privacy posture:
//   - Disabled by default. Nothing is recorded until the user flips
//     the toggle in the Tweaks panel.
//   - We record event NAMES only. No source code, no error messages,
//     no timestamps finer than the install date.
//   - Resetting the counters wipes everything, including the install
//     date.
//
// The data shape is a flat `{ eventName: count }` map plus an
// install-date string in YYYY-MM-DD form. New event names can be
// added at call sites without a schema migration — unknown keys are
// simply absent from existing payloads.

const FLAG_KEY = "emu8086.metrics-enabled";
const DATA_KEY = "emu8086.metrics-data";

export interface MetricsData {
  /** ISO date string (YYYY-MM-DD) of the first time metrics were enabled. */
  since: string;
  /** Event-name → count. */
  counts: Record<string, number>;
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function readEnabled(): boolean {
  try {
    return localStorage.getItem(FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

function readData(): MetricsData {
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (!raw) return { since: todayIso(), counts: {} };
    const parsed = JSON.parse(raw) as Partial<MetricsData>;
    return {
      since: typeof parsed.since === "string" ? parsed.since : todayIso(),
      counts:
        parsed.counts && typeof parsed.counts === "object" ? parsed.counts : {},
    };
  } catch {
    return { since: todayIso(), counts: {} };
  }
}

function writeData(d: MetricsData) {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(d));
  } catch {
    /* quota / private-mode — nothing to do */
  }
}

let listeners: Array<() => void> = [];

function notify() {
  for (const fn of listeners) fn();
}

export function subscribeMetrics(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((f) => f !== fn);
  };
}

export function isMetricsEnabled(): boolean {
  return readEnabled();
}

export function setMetricsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(FLAG_KEY, enabled ? "1" : "0");
    if (enabled) {
      // Stamp the install date the first time the toggle is flipped
      // on, so the panel can show "metrics since YYYY-MM-DD".
      const d = readData();
      if (!d.since) {
        writeData({ ...d, since: todayIso() });
      }
    }
  } catch {
    /* ignore */
  }
  notify();
}

export function recordEvent(name: string): void {
  if (!readEnabled()) return;
  const d = readData();
  d.counts[name] = (d.counts[name] ?? 0) + 1;
  writeData(d);
  notify();
}

export function getMetrics(): MetricsData {
  return readData();
}

export function clearMetrics(): void {
  try {
    localStorage.removeItem(DATA_KEY);
  } catch {
    /* ignore */
  }
  notify();
}
