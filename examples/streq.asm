; streq.asm — compare two strings byte-by-byte and print '=' or '!'.
;
; Demonstrates: REPE CMPSB (string compare with early-exit on mismatch),
; segment-equal addressing (DS = ES = .com seg), conditional jumps,
; INT 21h fn 02h.
;
; Run: emu8086 run-asm examples/streq.asm

org 100h

    mov si, str_a
    mov di, str_b
    mov cx, len
    cld
    repe cmpsb
    je equal

    mov dl, '!'
    jmp print

equal:
    mov dl, '='

print:
    mov ah, 02h
    int 21h

    mov dl, 10
    mov ah, 02h
    int 21h

    mov ax, 4C00h
    int 21h

len equ 5
str_a: db "hello"
str_b: db "hello"
