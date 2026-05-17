/// Text printer — accumulates every byte written to its port as a
/// stream of characters (printable ASCII shown literally, non-
/// printables shown as . in a dim style). Scrollback persists
/// across runs in the parent state so a Reset can wipe it.
///
/// Lab use: drive a "hello world" by walking a DB string and OUT'ing
/// each byte to the printer port.

export interface PrinterProps {
  port: number;
  buffer: string;
  onClear: () => void;
}

export function Printer({ port, buffer, onClear }: PrinterProps) {
  return (
    <div className="device-wrap">
      <div className="device-label mono">
        port {port.toString(16).toUpperCase().padStart(2, "0")}H · printer
        <button
          type="button"
          onClick={onClear}
          className="printer-clear"
          title="Clear printer buffer"
        >
          clear
        </button>
      </div>
      <pre className="printer-tape mono" aria-live="polite">
        {buffer.length === 0 ? <span className="printer-empty">— empty —</span> : buffer}
      </pre>
    </div>
  );
}
