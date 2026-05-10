import { Section } from "../Section";

export function Plugins() {
  return (
    <Section
      id="plugins"
      title="Plugin SDK"
      lede="Add custom devices, snippet packs, or example sets in ~30 lines of JavaScript."
    >
      <h3>What a plugin can do</h3>
      <ul>
        <li>Register a new device on a port (or a port range).</li>
        <li>Render that device’s UI in the right rail or as a floater.</li>
        <li>Contribute example programs to the examples picker.</li>
        <li>Add language snippets that show up in the editor’s suggest list.</li>
        <li>Subscribe to step events (useful for logging or instrumentation).</li>
      </ul>

      <h3>Anatomy</h3>
      <p>
        A plugin is a default-exported function that registers itself
        against the host. There is no build step; the file ships as
        a plain ES module.
      </p>
      <pre>
        <code>{`// my-buzzer.js
export default function register(host) {
  host.device({
    name: "Buzzer",
    port: 0x14,
    onWrite(value) {
      host.beep({ freq: 220 + value * 4, duration: 50 });
    },
    render(state) {
      return host.h("div", { className: "buzzer" },
        state.lastValue ? "♪" : "—",
      );
    },
  });
}`}</code>
      </pre>

      <h3>Loading a plugin</h3>
      <ul>
        <li>
          <strong>In the web IDE</strong>: open <em>Settings → Plugins</em> and
          paste the URL of an ES module. The plugin is fetched and run in a
          Web Worker sandbox.
        </li>
        <li>
          <strong>In the desktop build</strong>: drop the file in{" "}
          <code>~/.emu8086/plugins/</code>. They load at startup.
        </li>
        <li>
          <strong>In the CLI</strong>: pass <code>--plugin path/to/file.js</code>.
        </li>
      </ul>

      <h3>Sandbox</h3>
      <p>
        Plugins do not see your filesystem, network, or any other browser
        API except the small host object passed in. Misbehaving plugins
        can be force-quit from the same settings panel.
      </p>
    </Section>
  );
}
