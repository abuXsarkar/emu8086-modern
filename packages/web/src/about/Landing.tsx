// The landing page. A vertical sequence of full-viewport slides
// with snap-scroll, entrance animations on intersection, and a
// side rail showing where you are in the deck. Keyboard arrow keys
// (and Page Up/Down) navigate between slides for presentations.

import { useEffect, useState } from "react";
import { SideRail } from "./SideRail";
import { Hero } from "./slides/Hero";
import { ForStudents } from "./slides/ForStudents";
import { ForTeachers } from "./slides/ForTeachers";
import { Devices } from "./slides/Devices";
import { Debugger } from "./slides/Debugger";
import { Classroom } from "./slides/Classroom";
import { Sharing } from "./slides/Sharing";
import { SelfHost } from "./slides/SelfHost";
import { GetStarted } from "./slides/GetStarted";
import { Credits } from "./slides/Credits";

export function Landing() {
  // Keyboard navigation: arrow keys + page up/down jump to
  // adjacent slides. Space advances. Always respects the user's
  // current scroll position rather than forcing them to slide 0.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Don't interfere with form/text inputs.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const slides = Array.from(
        document.querySelectorAll<HTMLElement>("section.slide"),
      );
      const active =
        document.querySelector<HTMLElement>("section.slide.is-active") ??
        slides[0];
      const idx = slides.indexOf(active);
      if (idx === -1) return;
      let next: HTMLElement | undefined;
      if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") {
        next = slides[idx + 1];
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        next = slides[idx - 1];
      } else if (e.key === "Home") {
        next = slides[0];
      } else if (e.key === "End") {
        next = slides[slides.length - 1];
      }
      if (next) {
        e.preventDefault();
        next.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Track viewport for the side-rail dots (it polls active slides
  // separately, this just forces a re-render after first layout so
  // the rail picks up the slide list).
  const [, force] = useState(0);
  useEffect(() => {
    // Force one re-render after mount so SideRail sees the
    // populated DOM. requestAnimationFrame guarantees layout.
    requestAnimationFrame(() => force((n) => n + 1));
  }, []);

  return (
    <div className="landing-root">
      <TopBar />
      <SideRail />
      <main className="slides">
        <Hero />
        <ForStudents />
        <Debugger />
        <Devices />
        <ForTeachers />
        <Classroom />
        <Sharing />
        <SelfHost />
        <GetStarted />
        <Credits />
      </main>
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <a className="landing-footer-link" href="./">
            ↺ Open the IDE
          </a>
          <span aria-hidden>·</span>
          <a className="landing-footer-link" href="./docs/">
            Read the docs
          </a>
          <span aria-hidden>·</span>
          <a
            className="landing-footer-link"
            href="https://github.com/abuXsarkar/modern8086"
            target="_blank"
            rel="noopener"
          >
            View source on GitHub
          </a>
          <span aria-hidden>·</span>
          <span className="landing-footer-meta mono">MIT-licensed · free forever</span>
        </div>
      </footer>
    </div>
  );
}

function TopBar() {
  return (
    <header className="landing-topbar">
      <a href="./" className="landing-topbar-brand">
        <Mark size={28} />
        <span className="landing-topbar-name">modern8086</span>
      </a>
      <nav className="landing-topbar-nav">
        <a href="./">Open the IDE</a>
        <a
          href="https://github.com/abuXsarkar/modern8086"
          target="_blank"
          rel="noopener"
        >
          GitHub
        </a>
      </nav>
    </header>
  );
}

/** Inline SVG brand mark — kept here so the landing has zero
 *  external image dependencies. The full designed icon lives in
 *  `/favicon.ico` etc., this is just the hairline DIP-package
 *  symbol from the brand work. */
export function Mark({ size = 28 }: { size?: number }) {
  // Hairline DIP square with `0x86` at the centre and a pin-1
  // orientation notch at the top-left. Same construction as the
  // designer's MarkA.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <rect x="4" y="4" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <polygon points="4,4 16,4 4,16" fill="var(--paper)" />
      <line x1="16" y1="4" x2="4" y2="16" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="8" cy="8" r="0.8" fill="currentColor" opacity="0.5" />
      <circle cx="56" cy="8" r="0.8" fill="currentColor" opacity="0.5" />
      <circle cx="56" cy="56" r="0.8" fill="currentColor" opacity="0.5" />
      <circle cx="8" cy="56" r="0.8" fill="currentColor" opacity="0.5" />
      <text
        x="32"
        y="32"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Geist Mono, ui-monospace, monospace"
        fontWeight="600"
        fontSize="20"
        fill="currentColor"
      >
        0<tspan fill="var(--accent)">x</tspan>86
      </text>
    </svg>
  );
}
