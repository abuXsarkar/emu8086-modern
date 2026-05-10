import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

const STORE = "emu8086.floaters";

type Pos = { x: number; y: number };

function loadAll(): Record<string, Pos> {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as Record<string, Pos>) : {};
  } catch {
    return {};
  }
}

function saveAll(map: Record<string, Pos>) {
  try {
    localStorage.setItem(STORE, JSON.stringify(map));
  } catch {
    /* ignore quota / disabled-storage errors */
  }
}

export interface FloaterProps {
  /** Stable id used as the localStorage position key. Different ids
   *  give independent persisted positions; reusing an id remembers
   *  where the user last dropped that floater. */
  id: string;
  title: string;
  defaultPos: Pos;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Draggable lab-bench window. Wraps a piece of UI in a hairline frame
 * with a title bar; the user can drag the bar to reposition, close
 * the floater, or arrow-key-nudge it for keyboard a11y. Position
 * persists per-id in localStorage so the bench layout survives
 * reloads. Mirrors `.design/v2/src/floaters.jsx`.
 */
export function Floater({
  id,
  title,
  defaultPos,
  onClose,
  children,
}: FloaterProps) {
  const [pos, setPos] = useState<Pos>(() => loadAll()[id] ?? defaultPos);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ x: number; y: number; ox: number; oy: number }>({
    x: 0,
    y: 0,
    ox: 0,
    oy: 0,
  });
  const posRef = useRef<Pos>(pos);
  posRef.current = pos;
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    // Pull focus into the floater when it opens so a keyboard user
    // can dismiss it without hunting via Tab. The close button is the
    // most obvious anchor; if the user prefers to drag instead, they
    // can Shift+Tab once to reach the head.
    closeBtnRef.current?.focus();
  }, []);

  function persist(next: Pos) {
    const all = loadAll();
    all[id] = next;
    saveAll(all);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Don't drag if the close button (or anything else interactive)
    // was the actual target — let it handle its own click.
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    setDragging(true);
    startRef.current = {
      x: e.clientX,
      y: e.clientY,
      ox: pos.x,
      oy: pos.y,
    };
  }

  useEffect(() => {
    if (!dragging) return;
    function onMove(e: PointerEvent) {
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      // Clamp at the viewport edges so the floater can't be dragged
      // entirely off-screen and become un-recoverable.
      const next = {
        x: Math.max(8, Math.min(window.innerWidth - 64, startRef.current.ox + dx)),
        y: Math.max(8, Math.min(window.innerHeight - 32, startRef.current.oy + dy)),
      };
      setPos(next);
    }
    function onUp() {
      setDragging(false);
      persist(posRef.current);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only re-run when drag state flips
  }, [dragging]);

  function onHeadKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    // Keyboard a11y: arrow keys nudge the floater 16px so a user
    // without a pointer can still rearrange the bench.
    const step = e.shiftKey ? 64 : 16;
    let dx = 0;
    let dy = 0;
    if (e.key === "ArrowLeft") dx = -step;
    else if (e.key === "ArrowRight") dx = step;
    else if (e.key === "ArrowUp") dy = -step;
    else if (e.key === "ArrowDown") dy = step;
    else return;
    e.preventDefault();
    const next = {
      x: Math.max(8, Math.min(window.innerWidth - 64, pos.x + dx)),
      y: Math.max(8, Math.min(window.innerHeight - 32, pos.y + dy)),
    };
    setPos(next);
    persist(next);
  }

  function onFrameKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  }

  return (
    <div
      className={`floater${dragging ? " dragging" : ""}`}
      style={{ left: pos.x, top: pos.y }}
      role="dialog"
      aria-label={title}
      aria-modal="false"
      onKeyDown={onFrameKeyDown}
    >
      <div
        className="floater-head"
        onPointerDown={onPointerDown}
        onKeyDown={onHeadKeyDown}
        tabIndex={0}
        role="button"
        aria-label={`Move ${title} (arrow keys to nudge)`}
      >
        <span className="title">{title}</span>
        <button
          ref={closeBtnRef}
          type="button"
          className="x"
          onClick={onClose}
          aria-label={`Close ${title}`}
        >
          ×
        </button>
      </div>
      <div className="floater-body">{children}</div>
    </div>
  );
}
