// One docs section. Renders an <article>-ish region with anchor id
// the sidebar nav uses; IntersectionObserver in Docs.tsx watches
// these and highlights the matching nav row.

import type { ReactNode } from "react";

export function Section({
  id,
  title,
  lede,
  children,
}: {
  id: string;
  title: string;
  lede?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      data-doc-section
      className="docs-section"
      aria-labelledby={`${id}-title`}
    >
      <header className="docs-section-head">
        <h2 id={`${id}-title`}>{title}</h2>
        {lede && <p className="docs-section-lede">{lede}</p>}
      </header>
      <div className="docs-section-body">{children}</div>
    </section>
  );
}
