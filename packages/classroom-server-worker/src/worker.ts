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
  M86_CLASSROOM_HMAC_SECRET?: string;
  M86_CLASSROOM_HMAC_SECRET_PREVIOUS?: string;
  M86_CLASSROOM_GRACE_MS?: string;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/healthz") {
      return new Response("ok\n", { headers: { "content-type": "text/plain" } });
    }

    // Permissive WS routing. Original spec was `/ws`, but accept the
    // upgrade on any path so a deploy whose VITE_CLASSROOM_WS_URL
    // drops the trailing `/ws` (easy mistake when copy-pasting from
    // the CF dashboard) still works.
    const wantsUpgrade = req.headers.get("upgrade")?.toLowerCase() === "websocket";
    if (wantsUpgrade) {
      console.log(`[worker] WS upgrade path=${url.pathname}`);
      const id = env.HUB.idFromName("singleton");
      const stub = env.HUB.get(id);
      return stub.fetch(req);
    }

    if (url.pathname === "/ws") {
      return new Response("this endpoint expects a WebSocket upgrade\n", { status: 426 });
    }

    return new Response("not found\n", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
