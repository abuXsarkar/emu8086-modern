// Side-rail navigation dots. Polls the DOM for slides every time
// a slide becomes active (via the `is-active` class set by
// `Slide`). Click a dot to scroll to that slide.

import { useEffect, useState } from "react";

interface RailEntry {
  slug: string;
  title: string;
  active: boolean;
}

export function SideRail() {
  const [entries, setEntries] = useState<RailEntry[]>([]);

  useEffect(() => {
    function rebuild() {
      const slides = Array.from(
        document.querySelectorAll<HTMLElement>("section.slide"),
      );
      setEntries(
        slides
          .filter((s) => s.hasAttribute("data-slide-title"))
          .map((s) => ({
            slug: s.getAttribute("data-slide-slug") ?? "",
            title: s.getAttribute("data-slide-title") ?? "",
            active: s.classList.contains("is-active"),
          })),
      );
    }
    // Initial.
    rebuild();
    // Watch for active-class flips and slide additions.
    const mo = new MutationObserver(rebuild);
    mo.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
      childList: true,
      subtree: true,
    });
    return () => mo.disconnect();
  }, []);

  if (entries.length === 0) return null;

  return (
    <nav className="side-rail" aria-label="On this page">
      <ol>
        {entries.map((e) => (
          <li key={e.slug} className={e.active ? "active" : ""}>
            <a href={`#${e.slug}`} aria-label={e.title}>
              <span className="side-rail-dot" aria-hidden />
              <span className="side-rail-label">{e.title}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
