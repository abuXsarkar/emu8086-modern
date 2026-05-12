import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Floater } from "./Floater";

interface DeviceSlotProps {
  /** Stable id used for both the localStorage flag and the Floater key. */
  id: string;
  /** Title shown in the floater's header bar when popped out. */
  title: string;
  /** Where the floater first appears if no persisted position exists. */
  defaultPos: { x: number; y: number };
  /** The device UI. Rendered inline when docked, inside a Floater when popped. */
  children: ReactNode;
}

/**
 * Wraps a device so the user can detach it into a draggable Floater.
 * Pop-out state persists per-id under `modern8086.dev-popped:<id>` so the
 * bench survives reloads. When popped, the inline slot collapses to a
 * "↩ dock" button so the user can find their way back without
 * hunting for the floater.
 */
export function DeviceSlot({ id, title, defaultPos, children }: DeviceSlotProps) {
  const storageKey = `modern8086.dev-popped:${id}`;
  const [popped, setPopped] = useState<boolean>(() => {
    try {
      return localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, popped ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [storageKey, popped]);

  // Track previous popped state so we can restore focus to the popout
  // button when the user closes a floater. Without this, browser
  // default behaviour drops focus on body when the floater unmounts.
  const popoutBtnRef = useRef<HTMLButtonElement | null>(null);
  const dockBtnRef = useRef<HTMLButtonElement | null>(null);
  const prevPoppedRef = useRef(popped);
  useEffect(() => {
    const wasPopped = prevPoppedRef.current;
    prevPoppedRef.current = popped;
    if (wasPopped === popped) return;
    // Skip the first render's no-op transition; only react to user-driven flips.
    if (popped) {
      dockBtnRef.current?.focus();
    } else {
      popoutBtnRef.current?.focus();
    }
  }, [popped]);

  return (
    <div className="device-slot">
      {popped ? (
        <button
          ref={dockBtnRef}
          type="button"
          className="popout-btn"
          onClick={() => setPopped(false)}
          title={`Dock ${title} back into the device gallery`}
          aria-expanded="true"
          aria-label={`Dock ${title} back into the device gallery`}
        >
          {title} ↩ dock
        </button>
      ) : (
        <>
          {children}
          <button
            ref={popoutBtnRef}
            type="button"
            className="popout-btn"
            onClick={() => setPopped(true)}
            title="Pop out into a draggable window"
            aria-expanded="false"
            aria-label={`Pop out ${title} into a draggable window`}
          >
            ↗ pop out
          </button>
        </>
      )}
      {popped && (
        <Floater
          id={id}
          title={title}
          defaultPos={defaultPos}
          onClose={() => setPopped(false)}
        >
          {children}
        </Floater>
      )}
    </div>
  );
}
