; hello_include.asm — same hello-world, this time using `include`
; to pull the stdlib macros in. Verifies the CLI's file-level
; include resolution.

org 100h

include "lib/stdlib.asm"

    PRINT msg
    NEWLINE

    mov ax, 4C00h
    int 21h

msg: db "Hello via include!$"
