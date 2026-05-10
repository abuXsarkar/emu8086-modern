import { Slide } from "../Slide";

export function SelfHost() {
  return (
    <Slide
      slug="self-host"
      kicker="Your campus, your servers, your data."
      title="Self-host. Whitelabel. Or just use ours."
      forTheCurious={
        <>
          <p>
            The web IDE is a static SPA — drop the
            <code className="mono"> packages/web/dist</code> behind
            any HTTP server (the bundled Dockerfile uses nginx +
            alpine; ~74 MB image). The classroom WebSocket relay
            ships as a separate Docker image (~110 MB on alpine) or
            as a Cloudflare Workers + Durable Objects deployment
            (free tier handles thousands of concurrent rooms).
            Bring both up with one
            <code className="mono"> docker compose up </code>
            and you have a fully private, network-isolated
            classroom service on your campus LAN.
          </p>
          <p>
            HMAC secret rotation, healthcheck endpoints, an
            unprivileged runtime user, message size caps,
            byte-clamped fields — the boring deployment-grade
            details are all wired and documented in
            <code className="mono"> docs/release-process.md</code>{" "}
            and <code className="mono"> docs/classroom-mode.md</code>.
          </p>
        </>
      }
    >
      <ul className="prose-list">
        <li>
          <strong>Run it offline.</strong> The browser IDE is a
          progressive web app. Install once, work in the lab with
          the Wi-Fi off.
        </li>
        <li>
          <strong>Run it on your campus.</strong> Two Docker
          containers. One <code className="mono">docker compose up</code>.
          No outbound network calls — the whole stack lives behind
          your firewall.
        </li>
        <li>
          <strong>Run it free on Cloudflare.</strong> A small
          Worker plus Durable Objects fits comfortably in
          Cloudflare's free tier; thousands of concurrent rooms
          per institute is realistic without a billing surprise.
        </li>
        <li>
          <strong>Whitelabel.</strong> MIT-licensed; fork freely.
          The institute logo slot in the classroom banner is a
          single URL field. No watermark, no royalties.
        </li>
      </ul>
    </Slide>
  );
}
