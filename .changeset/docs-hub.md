- **Docs hub at `/docs/`**. A long-form documentation site sitting next
  to the IDE and the `/about/` landing. Fourteen sections — quick
  start, editor, time-travel debugger, devices, sharing &amp;
  autograding, classroom mode, CLI, plugins, self-hosting, FAQ,
  license, credits, privacy, terms — laid out in the same
  paper-aesthetic that the rest of the site uses. Sticky left rail,
  IntersectionObserver-driven active-section tracking, deep links via
  URL hash, collapsible FAQ rows. Wired into the IDE footer and the
  landing footer; built as its own Vite entry so neither the landing
  nor the docs pulls Monaco into its bundle (docs ships at ~11 KB
  gzipped). Privacy and terms pages cover the hosted-IDE / classroom
  server stance: no collection, in-memory rooms only, reaped after the
  host disconnects.
