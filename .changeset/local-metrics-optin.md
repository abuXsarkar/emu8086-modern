- **Opt-in local-only metrics**. New "Telemetry" section in the
  Tweaks panel toggles a per-event counter that records button-press
  and error-frequency counts to localStorage. Disabled by default —
  nothing is recorded until the user flips the switch. There is no
  network call: the data lives in the browser, the panel renders it
  as a simple `event_name → count` table, and the user can wipe it
  at any time. Captured events: `run`, `run_halted`,
  `run_out_of_steps`, `run_breakpoint`, `step`, `back`, `reset`,
  `share`, `example_loaded`, `assemble_error`, `runtime_error`,
  `theme_change`, `language_change`. Closes the M6 deliverable on
  "instrumentation (opt-in, anonymous) to measure error frequencies"
  for the local case; an upstream pipe is intentionally not built
  here.
