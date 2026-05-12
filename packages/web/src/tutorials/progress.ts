// Tracks tutorial progress in localStorage. Two pieces:
//   - the *active* tutorial + step (so re-opening the panel lands
//     you where you left off);
//   - the set of *completed* step ids per tutorial (so the picker
//     can show a "12 / 15 steps" hint and badge finished lessons).
//
// Everything else (lesson definitions, UI state) is non-persistent.

const KEY_ACTIVE = "modern8086.tutorial.active";
const KEY_COMPLETED = "modern8086.tutorial.completed";

export interface ActiveTutorial {
  tutorialId: string;
  stepIndex: number;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode — nothing we can do */
  }
}

export function getActive(): ActiveTutorial | null {
  const v = readJson<ActiveTutorial | null>(KEY_ACTIVE, null);
  if (v && typeof v.tutorialId === "string" && typeof v.stepIndex === "number") {
    return v;
  }
  return null;
}

export function setActive(active: ActiveTutorial | null): void {
  if (active === null) {
    try {
      localStorage.removeItem(KEY_ACTIVE);
    } catch {
      /* ignore */
    }
    return;
  }
  writeJson(KEY_ACTIVE, active);
}

export function getCompletedSteps(tutorialId: string): Set<string> {
  const all = readJson<Record<string, string[]>>(KEY_COMPLETED, {});
  const list = all[tutorialId];
  return new Set(Array.isArray(list) ? list : []);
}

export function markStepCompleted(tutorialId: string, stepId: string): void {
  const all = readJson<Record<string, string[]>>(KEY_COMPLETED, {});
  const existing = Array.isArray(all[tutorialId]) ? all[tutorialId] : [];
  if (existing.includes(stepId)) return;
  all[tutorialId] = [...existing, stepId];
  writeJson(KEY_COMPLETED, all);
}

export function resetTutorialProgress(tutorialId: string): void {
  const all = readJson<Record<string, string[]>>(KEY_COMPLETED, {});
  if (!(tutorialId in all)) return;
  delete all[tutorialId];
  writeJson(KEY_COMPLETED, all);
}
