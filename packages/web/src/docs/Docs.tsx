// Docs hub at /docs/. Single long page with a sticky sidebar
// nav — Stripe / Vercel docs shape, paper-aesthetic styling.
// IntersectionObserver tracks the active section so the sidebar
// highlights where you are.

import { useEffect, useState } from "react";
import { Mark } from "../about/Landing";
import { GettingStarted } from "./sections/GettingStarted";
import { Editor } from "./sections/Editor";
import { Debugger } from "./sections/Debugger";
import { Devices } from "./sections/Devices";
import { Sharing } from "./sections/Sharing";
import { Classroom } from "./sections/Classroom";
import { CLI } from "./sections/CLI";
import { Plugins } from "./sections/Plugins";
import { SelfHost } from "./sections/SelfHost";
import { FAQ } from "./sections/FAQ";
import { License } from "./sections/License";
import { Credits } from "./sections/Credits";
import { Privacy } from "./sections/Privacy";
import { Terms } from "./sections/Terms";

const NAV: Array<{ group: string; items: Array<{ slug: string; title: string }> }> = [
  {
    group: "Getting started",
    items: [
      { slug: "getting-started", title: "Quick start" },
      { slug: "editor", title: "The editor" },
      { slug: "debugger", title: "The time-travel debugger" },
      { slug: "devices", title: "Devices" },
    ],
  },
  {
    group: "Collaboration",
    items: [
      { slug: "sharing", title: "Sharing & autograding" },
      { slug: "classroom", title: "Classroom mode" },
    ],
  },
  {
    group: "Beyond the browser",
    items: [
      { slug: "cli", title: "Command-line tool" },
      { slug: "plugins", title: "Plugin SDK" },
      { slug: "self-host", title: "Self-hosting" },
    ],
  },
  {
    group: "Reference",
    items: [
      { slug: "faq", title: "FAQ" },
      { slug: "license", title: "License" },
      { slug: "credits", title: "Credits" },
      { slug: "privacy", title: "Privacy" },
      { slug: "terms", title: "Terms" },
    ],
  },
];

export function Docs() {
  const [active, setActive] = useState<string>("getting-started");
  const [navOpen, setNavOpen] = useState(false);

  // Track active section as the reader scrolls. Each <section>
  // carries id={slug}; IntersectionObserver marks one as in-view
  // and we mirror that into the sidebar's active state.
  useEffect(() => {
    const sections = document.querySelectorAll<HTMLElement>("section[data-doc-section]");
    if (sections.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        // Pick the topmost visible section.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          const slug = visible[0].target.getAttribute("id");
          if (slug) setActive(slug);
        }
      },
      { rootMargin: "-25% 0px -55% 0px", threshold: [0, 0.1, 0.5] },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  return (
    <div className="docs-root">
      <header className="docs-topbar">
        <a href="/" className="docs-topbar-brand">
          <Mark size={22} />
          <span>modern8086</span>
          <span className="docs-topbar-divider" aria-hidden>
            /
          </span>
          <span className="docs-topbar-label">Docs</span>
        </a>
        <button
          type="button"
          className="docs-nav-toggle"
          onClick={() => setNavOpen((o) => !o)}
          aria-label="Toggle navigation"
          aria-expanded={navOpen}
        >
          {navOpen ? "Close" : "Contents"}
        </button>
        <nav className="docs-topbar-nav">
          <a href="/">Open the IDE</a>
          <a href="/about/">About</a>
          <a
            href="https://github.com/abuXsarkar/modern8086"
            target="_blank"
            rel="noopener"
          >
            GitHub
          </a>
        </nav>
      </header>

      <div className="docs-layout">
        <aside className={`docs-sidebar${navOpen ? " open" : ""}`}>
          <nav aria-label="Documentation">
            {NAV.map((group) => (
              <div key={group.group} className="docs-nav-group">
                <h4 className="docs-nav-heading">{group.group}</h4>
                <ul>
                  {group.items.map((item) => (
                    <li
                      key={item.slug}
                      className={active === item.slug ? "active" : ""}
                    >
                      <a
                        href={`#${item.slug}`}
                        onClick={() => setNavOpen(false)}
                      >
                        {item.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <main className="docs-main">
          <GettingStarted />
          <Editor />
          <Debugger />
          <Devices />
          <Sharing />
          <Classroom />
          <CLI />
          <Plugins />
          <SelfHost />
          <FAQ />
          <License />
          <Credits />
          <Privacy />
          <Terms />
        </main>
      </div>
    </div>
  );
}
