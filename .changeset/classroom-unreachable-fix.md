- **Classroom: surface unreachable-server failures instead of
  looping**. Reported from a deployed-to-GitHub-Pages install:
  starting a classroom got stuck on "Connecting…" forever because
  the IDE was happily dialling `wss://<github-pages-host>:8787`,
  failing, and entering an infinite reconnect loop the Start/Join
  dialog had no way to surface.
  The connection layer now tracks whether the current attempt ever
  reached the server's `joined` response. A WebSocket close
  *before* that point is treated as a terminal failure — no
  reconnect, no silent retry — and the store flips to `idle` with
  `errorCode: "server_unreachable"`, which the dialog already
  knows how to render inline. A 5-second connect timeout closes
  the socket with `errorCode: "connect_timeout"` for the case
  where the host accepts the TCP handshake but never sends a
  frame. Both codes are client-synthesised and additive to the
  protocol's `ErrorCode` union, so no `PROTOCOL_VERSION` bump is
  needed.
  English translations explain the cause and point at the self-host
  + `VITE_CLASSROOM_WS_URL` workaround. Other locales fall through
  to English until someone translates.
