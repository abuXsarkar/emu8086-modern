; macro_putc.asm — define a PUTC macro and use it three times.
;
; Demonstrates the assembler's macro support: PUTC takes one
; positional argument (a character) and expands to the
; mov-dl-mov-ah-int sequence. Output: "Hi\n".
;
; This is the same idiom emu8086.inc uses for PRINT etc; the user can
; define their own PRINT/PRINTN/etc on top of this.

org 100h

PUTC MACRO ch
    mov dl, ch
    mov ah, 02h
    int 21h
ENDM

    PUTC 'H'
    PUTC 'i'
    PUTC 10

    mov ax, 4C00h
    int 21h
