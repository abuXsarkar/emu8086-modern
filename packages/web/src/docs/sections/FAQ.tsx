import { Section } from "../Section";

export function FAQ() {
  return (
    <Section
      id="faq"
      title="Frequently asked questions"
      lede="The questions students and instructors keep asking. If yours isn’t here, open an issue."
    >
      <details open>
        <summary>Is this the original emu8086?</summary>
        <p>
          No. The original emu8086 is closed-source Windows software from the
          mid-2000s. This is a fresh, MIT-licensed rewrite — a different
          codebase that aims to be familiar to anyone who used the original,
          but runs in a browser, supports modern OSes, and lives in the open.
        </p>
      </details>

      <details>
        <summary>Why does the textbook syntax I’m used to work?</summary>
        <p>
          On purpose. The South-Asian undergraduate lab manuals lean on a
          dialect of 8086 assembly that mostly matches MASM but has its
          own quirks — single-quoted multi-byte literals, implicit memory
          dereferences, <code>db ?</code>. The assembler accepts all of them.
        </p>
      </details>

      <details>
        <summary>Can I use this in my course?</summary>
        <p>
          Yes. MIT licence, no strings. If your institution wants a hosted,
          branded deployment under their own domain, the self-hosting
          section covers it.
        </p>
      </details>

      <details>
        <summary>Does my code leave my machine?</summary>
        <p>
          No. Everything runs locally. The Share button puts your source in
          the URL fragment (which never gets sent to a server). Classroom
          mode sends source over WebSocket only to the server you’ve
          configured — your laptop, your school’s server, or a Cloudflare
          Worker you control.
        </p>
      </details>

      <details>
        <summary>How accurate is the emulation?</summary>
        <p>
          Accurate enough that every example program in every lab manual we
          tested runs identically to the original emu8086 — flags, cycle
          counts, BIOS service behaviour. We run a regression suite against
          a corpus of textbook exercises on every commit.
        </p>
      </details>

      <details>
        <summary>Does it work offline?</summary>
        <p>
          Yes. The first visit caches the IDE; subsequent visits work with
          no network. The desktop build needs no network at all after install.
        </p>
      </details>

      <details>
        <summary>What about 8085 / 80286 / 80386 / x86-64?</summary>
        <p>
          Out of scope. The project is deliberately narrow — the 8086 + 8088
          instruction set, real mode, the BIOS services textbooks use. If
          you need 80286 protected mode or beyond, look at QEMU.
        </p>
      </details>

      <details>
        <summary>How do I report a bug?</summary>
        <p>
          Open an issue at{" "}
          <a
            href="https://github.com/abuXsarkar/modern8086/issues"
            target="_blank"
            rel="noopener"
          >
            github.com/abuXsarkar/modern8086/issues
          </a>
          . A minimal repro program helps a lot.
        </p>
      </details>

      <details>
        <summary>Can I contribute?</summary>
        <p>
          Please. PRs welcome. The codebase is TypeScript + Rust (the
          emulator core is a small Rust crate compiled to WebAssembly).
          See <code>CONTRIBUTING.md</code> in the repo root.
        </p>
      </details>
    </Section>
  );
}
