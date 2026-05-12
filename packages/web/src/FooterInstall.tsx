// Install / coming-soon footer row. Sits below the meta footer on
// every web build; hidden inside Tauri (the user already has the
// app — no point promoting other download paths).
//
// Tauri 2 attaches `__TAURI_INTERNALS__` to `window` very early; we
// read it once at module load. SSR-safe via `typeof window` guard.

const IS_TAURI =
  typeof window !== "undefined" &&
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ((window as any).__TAURI_INTERNALS__ !== undefined ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__TAURI__ !== undefined);

interface Channel {
  href: string;
  label: string;
  /** Shown when the channel isn't live yet. */
  comingSoon?: boolean;
}

const AVAILABLE: Channel[] = [
  {
    href: "https://www.npmjs.com/package/@modern8086/cli",
    label: "npm",
  },
  {
    href: "https://github.com/abuXsarkar/homebrew-modern8086",
    label: "Homebrew",
  },
  {
    href: "https://github.com/abuXsarkar/scoop-modern8086",
    label: "Scoop",
  },
  {
    href: "https://community.chocolatey.org/packages/m86",
    label: "Chocolatey",
  },
  {
    href: "https://github.com/abuXsarkar/modern8086/releases/latest",
    label: "Desktop ↓",
  },
];

const COMING_SOON: Channel[] = [
  { href: "#", label: "Play Store", comingSoon: true },
  { href: "#", label: "App Store", comingSoon: true },
  { href: "#", label: "Microsoft Store", comingSoon: true },
];

export function FooterInstall() {
  if (IS_TAURI) return null;

  return (
    <div className="app-footer-install" aria-label="Install on other platforms">
      <span className="app-footer-install-label">Install:</span>
      {AVAILABLE.map((c) => (
        <a
          key={c.label}
          className="install-chip"
          href={c.href}
          target="_blank"
          rel="noopener"
        >
          {c.label}
        </a>
      ))}
      <span className="app-footer-install-sep" aria-hidden>
        ·
      </span>
      <span className="app-footer-install-label">Coming soon:</span>
      {COMING_SOON.map((c) => (
        <span key={c.label} className="install-chip soon" aria-disabled="true">
          {c.label}
        </span>
      ))}
    </div>
  );
}
