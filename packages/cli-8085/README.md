# modern8085-cli (`m85`)

Headless Intel 8085 runner — same core + assembler as the web IDE, exposed as a CLI binary for autograding, CI tests, and scripting.

```
# Show core/assembler version
m85 version

# Assemble source to a raw byte image
m85 assemble program.a85 -o program.bin

# Assemble + run + print final state JSON
m85 run program.a85

# Preload memory before running (one --poke per byte)
m85 run program.a85 --poke 2050=12H --poke 2051=34H

# Cap execution at N instructions (keeps tight loops from hanging CI)
m85 run program.a85 --max-steps 100000
```

The output JSON shape mirrors the web IDE's wasm-api state JSON, so the same downstream tools (autograders, regression harnesses) can consume either.
