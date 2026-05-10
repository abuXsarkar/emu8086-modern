// Cloudflare Workers entry. Two surfaces:
//
//   GET /healthz   — liveness probe; returns "ok\n".
//   GET /ws        — Upgrade: websocket. Forwarded to the single
//                    ClassroomHubDO which owns all room state.
//
// All other paths return 404. The IDE only ever opens a WebSocket
// to /ws; the room id rides in the first protocol message, not the
// URL.

import { ClassroomHubDO } from "./do.js";

export { ClassroomHubDO };

export interface Env {
  HUB: DurableObjectNamespace;
  EMU8086_CLASSROOM_HMAC_SECRET?: string;
  EMU8086_CLASSROOM_HMAC_SECRET_PREVIOUS?: string;
  EMU8086_CLASSROOM_GRACE_MS?: string;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/healthz") {
      return new Response("ok\n", { headers: { "content-type": "text/plain" } });
    }

    if (url.pathname === "/ws") {
      if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
        return new Response("expected websocket upgrade", { status: 426 });
      }
      const id = env.HUB.idFromName("singleton");
      const stub = env.HUB.get(id);
      return stub.fetch(req);
    }

    return new Response("not found\n", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
