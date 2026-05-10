- **In-app tutorials + single-page user manual**. Ten lessons land
  as plain data in `packages/web/src/tutorials/lessons.ts`: *Hello,
  8086 · Registers · Memory and addressing modes · Arithmetic and
  flags · The stack · Procedures · Interrupts · Devices · The
  time-travel debugger · Sharing and the autograder*. Each lesson
  is 4–7 steps; most include a "Load this code" affordance that
  drops the starter snippet into the editor and resets the
  stepper. Progress saves to localStorage per (tutorial, step) so
  a learner can come back where they left off. The `📖` trigger in
  the bottom-right opens the drawer; markdown bodies render
  through a tiny hand-rolled subset (bold / italic / code / lists)
  to avoid pulling in a ~30 KB markdown library for a handful of
  features. A new `docs/user-manual.md` ships as the single-page
  reference, indexed from the README and linked from the final
  tutorial.
