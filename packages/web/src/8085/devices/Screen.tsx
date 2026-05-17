/// Text screen — wider scrollback than the Printer, fixed-width
/// monospace, treats LF (0AH) as newline, CR (0DH) as carriage
/// return, BS (08H) as backspace, FF (0CH) as clear-screen. Buffer
/// is supplied by the parent; this component only renders.
///
/// Use case: a serial terminal stand-in. Send characters from the
/// program with OUT to the screen port; watch them appear here as
/// though piped to a tty.

export interface ScreenProps {
  port: number;
  buffer: string;
  onClear: () => void;
}

export function Screen({ port, buffer, onClear }: ScreenProps) {
  return (
    <div className="device-wrap">
      <div className="device-label mono">
        port {port.toString(16).toUpperCase().padStart(2, "0")}H · screen
        <button
          type="button"
          onClick={onClear}
          className="printer-clear"
          title="Clear screen"
        >
          clear
        </button>
      </div>
      <pre className="screen-display mono" aria-live="polite">
        {buffer.length === 0 ? <span className="printer-empty">— blank —</span> : buffer}
      </pre>
    </div>
  );
}
