# m51 — modern8051 CLI

Headless Intel 8051 runner. Same core + assembler as the
[web IDE](https://modern8086.com/8051/), exposed as a single binary
so CI pipelines, autograders, and lab-submission scripts can drive
it without a browser.

## Install

```bash
cargo install --git https://github.com/abuXsarkar/modern8086 modern8051-cli
```

Or via the `@modern8086/cli-8051` npm wrapper:

```bash
npm install -g @modern8086/cli-8051
```

## Use

```bash
m51 version
m51 assemble myprog.a51              # writes myprog.bin
m51 run myprog.a51                   # JSON state to stdout
m51 run myprog.a51 \
    --poke idata:30=AA \             # pre-load IDATA[0x30] = 0xAA
    --poke xdata:1000=12 \           # pre-load XDATA[0x1000] = 0x12
    --bp 0x0010,0x0020 \             # break at 0x0010 or 0x0020
    --mem-dump xdata:2000,16         # dump 16 XDATA bytes from 0x2000
```

Exit codes:

- `0` — program ran to `SJMP $` (the canonical 8051 halt-equivalent).
- `1` — budget exhausted, invalid opcode, breakpoint hit, or other stop.
- `2` — failed to assemble or read the input.
