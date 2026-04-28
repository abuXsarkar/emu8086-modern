; hello_macros.asm — the same hello-world, but built from the
; stdlib's PRINT and NEWLINE macros. Drop the macro definitions from
; examples/lib/stdlib.asm into your file and you can write programs
; the same way emu8086.inc lab manuals do.

org 100h

PUTC MACRO ch
    push ax
    push dx
    mov dl, ch
    mov ah, 02h
    int 21h
    pop dx
    pop ax
ENDM

PRINT MACRO addr
    push ax
    push dx
    mov dx, addr
    mov ah, 09h
    int 21h
    pop dx
    pop ax
ENDM

NEWLINE MACRO
    PUTC 10
ENDM

    PRINT msg
    NEWLINE

    mov ax, 4C00h
    int 21h

msg: db "Hello via macros!$"
