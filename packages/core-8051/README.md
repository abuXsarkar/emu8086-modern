# modern8051-core

Deterministic Intel 8051 MCU core. Sibling to `modern8085-core` and `modern8086-core`.

Status: **M0** — register/flag/SFR model + memory layout (IDATA 256 B, XDATA 64 KiB, CODE 64 KiB) + version probe. Full ISA executor lands in M1.

The 8051 is a Harvard-architecture 8-bit microcontroller with a quirkier memory model than the 8085 (separate code / internal / external spaces, bit-addressable RAM, register-bank-switching), so the data layer carries more weight than 8085's flat 64 KiB. The executor will hide most of that behind a uniform `step(cpu, mem)` interface.

See `docs/plans/8051-port.md` for the phased plan.
