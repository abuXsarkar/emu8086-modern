// Generic slide wrapper. Two responsibilities:
//   1. Detect when the slide enters the viewport (IntersectionObserver)
//      and add a class that drives the entrance animation. CSS does
//      the actual fade + translate.
//   2. Register the slide with the parent Landing's index so the
//      side-rail navigation dots can scroll to it.

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

interface SlideProps {
  /** Stable slug, used for the URL hash and the side-rail anchor. */
  slug: string;
  /** Headline shown in the side-rail tooltip. */
  title: string;
  /** Optional small label rendered above the heading. */
  kicker?: string;
  /** Pages skipped from the index won't show a side dot — useful
   *  for the hero (the dot is implicit when you're at the top). */
  hideFromIndex?: boolean;
  children: ReactNode;
  /** Optional expandable "for the curious" panel — the technical
   *  detail behind the marketing copy. Renders as a collapsed
   *  `<details>` by default so the slide stays uncluttered for the
   *  reader who doesn't care about the implementation. */
  forTheCurious?: ReactNode;
}

export function Slide({
  slug,
  title,
  kicker,
  hideFromIndex,
  children,
  forTheCurious,
}: SlideProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [active, setActive] = useState(false);
  const headingId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Register with the landing so the side-rail knows about us.
    el.setAttribute("data-slide-slug", slug);
    if (!hideFromIndex) el.setAttribute("data-slide-title", title);
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target !== el) continue;
          if (entry.isIntersecting && entry.intersectionRatio > 0.35) {
            setActive(true);
            // Update the URL hash without jumping scroll position.
            if (window.history.replaceState) {
              window.history.replaceState(null, "", `#${slug}`);
            }
            // Mark active on this element so the side-rail can
            // observe the change via mutation events / queries.
            el.classList.add("is-active");
            // Clear from all siblings.
            document
              .querySelectorAll("section.slide.is-active")
              .forEach((s) => {
                if (s !== el) s.classList.remove("is-active");
              });
          }
        }
      },
      { threshold: [0, 0.35, 0.75] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [slug, title, hideFromIndex]);

  return (
    <section
      ref={ref}
      id={slug}
      className={`slide${active ? " slide-active" : ""}`}
      aria-labelledby={headingId}
    >
      <div className="slide-inner">
        <div className="slide-content">
          {kicker ? <p className="slide-kicker">{kicker}</p> : null}
          <h2 className="slide-heading" id={headingId}>
            {title}
          </h2>
          <div className="slide-body">{children}</div>
          {forTheCurious ? (
            <details className="slide-curious">
              <summary>
                <span className="slide-curious-marker" aria-hidden>
                  ▸
                </span>
                <span>For the curious — what's under the hood</span>
              </summary>
              <div className="slide-curious-body">{forTheCurious}</div>
            </details>
          ) : null}
        </div>
      </div>
    </section>
  );
}
