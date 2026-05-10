import { Section } from "../Section";

export function SelfHost() {
  return (
    <Section
      id="self-host"
      title="Self-hosting"
      lede="Run the whole stack on your own infrastructure. Useful for institutions that want everything inside their firewall."
    >
      <h3>The IDE</h3>
      <p>
        The web build is a static site. Any HTTP server can host it — Apache,
        nginx, Caddy, S3 + CloudFront, GitHub Pages, an SD card behind a
        classroom door.
      </p>
      <pre>
        <code>{`git clone https://github.com/abuXsarkar/emu8086-modern
cd emu8086-modern
pnpm install
pnpm --filter @emu8086/web build
# served files land in packages/web/dist/`}</code>
      </pre>

      <h3>The classroom server</h3>
      <p>
        Two deploy targets, same source.
      </p>
      <h4>Node</h4>
      <pre>
        <code>{`pnpm --filter @emu8086/classroom-server build
EMU8086_CLASSROOM_PORT=8787 \\
  pnpm --filter @emu8086/classroom-server start`}</code>
      </pre>
      <p>
        Survives a reverse proxy (it speaks plain WebSocket). Run it under
        systemd, PM2, or whatever your team already uses.
      </p>
      <h4>Cloudflare Workers</h4>
      <pre>
        <code>{`pnpm --filter @emu8086/classroom-server-worker cf-deploy`}</code>
      </pre>
      <p>
        Free plan is enough for most classrooms — Durable Objects use the
        SQLite backend and the WebSocket Hibernation API, so connections
        survive Worker cold starts and idle eviction.
      </p>

      <h3>Branding</h3>
      <p>
        Institutional self-hosters can rebrand. The IDE reads a small
        manifest at <code>/branding.json</code> if it exists — set the
        product name, the accent color, the institutional logo, and a
        footer line. Nothing else is touched.
      </p>

      <h3>Updates</h3>
      <p>
        Pin a release tag. <code>git fetch --tags &amp;&amp; git checkout v1.X.Y</code>,
        rebuild, redeploy. The schema for serialised programs is forward and
        backward compatible within a major version.
      </p>
    </Section>
  );
}
