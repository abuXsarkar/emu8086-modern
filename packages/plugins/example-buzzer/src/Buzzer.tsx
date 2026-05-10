// Buzzer plugin component. Observes port 200 (0xC8). On any write,
// pulses a speaker icon; if "Sound" is toggled on, also emits a
// short tone whose frequency is proportional to the byte value.
//
// The component is intentionally self-contained: no global store,
// no shared hooks. Other plugins copy this file as a starting
// point.

import { useEffect, useRef, useState } from "react";
import type { DevicePluginProps } from "@emu8086/plugin-sdk";

const PORT = 200;
const PULSE_MS = 240;

export function Buzzer({ port, stepCount }: DevicePluginProps) {
  const value = port(PORT);
  const [soundOn, setSoundOn] = useState(false);
  const [pulsing, setPulsing] = useState(false);
  const lastSeenRef = useRef<number | null>(null);
  const pulseTimerRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    // Treat any change in the port value (not just zero -> non-zero)
    // as a fresh beep. Programs that beep repeatedly with the same
    // byte still register one pulse per step, which is what the
    // stepCount dep gives us "for free".
    void stepCount;
    if (lastSeenRef.current === value && value === 0) return;
    lastSeenRef.current = value;
    if (value === 0) return;

    setPulsing(true);
    if (pulseTimerRef.current !== null) {
      window.clearTimeout(pulseTimerRef.current);
    }
    pulseTimerRef.current = window.setTimeout(() => {
      setPulsing(false);
      pulseTimerRef.current = null;
    }, PULSE_MS);

    if (soundOn) {
      try {
        const ctx =
          audioCtxRef.current ??
          new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        audioCtxRef.current = ctx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        // Map byte value (1..255) into a friendly tone range.
        osc.frequency.value = 200 + (value / 255) * 800;
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      } catch {
        // Audio may be blocked by autoplay policy on first load.
        // Toggling soundOn off/on resumes once the user has
        // interacted with the page.
      }
    }
  }, [value, stepCount, soundOn]);

  return (
    <div className="buzzer">
      <div className={`buzzer-icon${pulsing ? " pulsing" : ""}`} aria-hidden>
        <span className="buzzer-cone" />
        <span className="buzzer-waves" />
      </div>
      <div className="buzzer-meta mono">
        <div>port {PORT}</div>
        <div>0x{value.toString(16).toUpperCase().padStart(2, "0")}</div>
      </div>
      <label className="buzzer-sound">
        <input
          type="checkbox"
          checked={soundOn}
          onChange={(e) => setSoundOn(e.target.checked)}
        />
        <span>Sound</span>
      </label>
      <style>{`
        .buzzer {
          display: grid;
          grid-template-columns: 36px 1fr;
          gap: 8px;
          align-items: center;
          padding: 6px 8px;
          border: 0.6px solid var(--rule);
          font-family: "Geist Mono", monospace;
          font-size: 11px;
        }
        .buzzer-icon {
          position: relative;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .buzzer-cone {
          width: 16px;
          height: 16px;
          background: var(--ink);
          clip-path: polygon(0 25%, 60% 25%, 100% 0, 100% 100%, 60% 75%, 0 75%);
        }
        .buzzer-waves {
          position: absolute;
          inset: 0;
          border: 2px solid var(--accent);
          border-left: 0;
          border-radius: 0 50% 50% 0 / 0 50% 50% 0;
          opacity: 0;
          transform: scale(0.7);
          transition: opacity 60ms ease, transform 60ms ease;
        }
        .buzzer-icon.pulsing .buzzer-waves {
          opacity: 1;
          transform: scale(1.15);
          transition: opacity 60ms ease, transform 240ms ease;
        }
        .buzzer-meta {
          color: var(--ink);
          line-height: 1.4;
        }
        .buzzer-sound {
          grid-column: 1 / -1;
          font-size: 10px;
          color: var(--muted);
          display: inline-flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
