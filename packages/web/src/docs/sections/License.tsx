import { Section } from "../Section";

export function License() {
  return (
    <Section
      id="license"
      title="License"
      lede="MIT. Use it, modify it, ship it, sell it. Keep the copyright notice."
    >
      <p>
        emu8086-modern is licensed under the MIT License. The full text:
      </p>
      <pre className="docs-license">
        <code>{`MIT License

Copyright (c) 2026 Abu Sufian Sarkar and contributors

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`}</code>
      </pre>

      <h3>Third-party software</h3>
      <p>
        The bundled distribution includes work from a handful of open-source
        projects. Their licenses are preserved verbatim in the{" "}
        <code>NOTICE</code> file at the repo root and inside the desktop
        installers. Notable dependencies:
      </p>
      <ul>
        <li>Monaco editor (MIT, Microsoft)</li>
        <li>React (MIT, Meta)</li>
        <li>Tauri (Apache-2.0 / MIT, the Tauri team)</li>
        <li>Geist Sans and Geist Mono (SIL OFL 1.1, Vercel)</li>
        <li>Instrument Serif (SIL OFL 1.1, Instrument)</li>
      </ul>
    </Section>
  );
}
