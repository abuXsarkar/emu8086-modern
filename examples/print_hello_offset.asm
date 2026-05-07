; print_hello_offset.asm — the canonical lab-manual print idiom.
;
; Demonstrates two MASM features that PR 1 added:
;   - `OFFSET msg`         the address-of operator most lab manuals use
;   - `LEN EQU $-MSG`      the length-of-data trick for length-aware
;                          loops over a fixed string buffer
;
; INT 21h fn 09h prints a $-terminated string at DS:DX. We keep a
; separate LEN constant — not strictly needed for fn 09h, but every
; manual computes it for the next exercise (a counted-loop print).

org 100h

    mov dx, OFFSET msg      ; → mov dx, msg, both forms now equivalent
    mov ah, 09h
    int 21h

    mov cx, LEN             ; LEN is computed from `$-msg` below
    ; … (a loop using CX would go here)

    mov ax, 4C00h
    int 21h

msg:    db "Hello, lab!", 0Dh, 0Ah, "$"
LEN     EQU $ - msg
