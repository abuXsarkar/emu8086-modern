; modern8086 stdlib macros — copy-paste at the top of your source.
;
; This is the equivalent of the legacy emu8086.inc macro pack, written
; against this assembler's macro mechanism. Once we add `include`
; support (planned), you'll be able to `include "lib/stdlib.asm"`
; instead. For now: paste the macros you need and use them.
;
; Naming, semantics, and register-clobbering match the legacy emu8086
; library so existing lab-manual examples need no changes beyond
; pasting the relevant snippet.

; ---- PUTC: print one character (in DL) -----------------------------
PUTC MACRO ch
    push ax
    push dx
    mov dl, ch
    mov ah, 02h
    int 21h
    pop dx
    pop ax
ENDM

; ---- NEWLINE: print a single LF ------------------------------------
NEWLINE MACRO
    push ax
    push dx
    mov dl, 10
    mov ah, 02h
    int 21h
    pop dx
    pop ax
ENDM

; ---- PRINT: print a $-terminated string at DS:[label] --------------
;   Usage:  PRINT my_msg
;   The argument is a label of a `db "...$"` declaration.
PRINT MACRO addr
    push ax
    push dx
    mov dx, addr
    mov ah, 09h
    int 21h
    pop dx
    pop ax
ENDM

; ---- PRINTN: PRINT followed by NEWLINE -----------------------------
PRINTN MACRO addr
    PRINT addr
    NEWLINE
ENDM

; ---- GOTOXY: set cursor to (col, row) via INT 10h fn 02h ----------
;   Usage: GOTOXY 10, 5
GOTOXY MACRO col, row
    push ax
    push bx
    push dx
    mov ah, 02h
    mov bh, 0
    mov dh, row
    mov dl, col
    int 10h
    pop dx
    pop bx
    pop ax
ENDM

; ---- CLEAR_SCREEN: scroll up the whole 80x25 screen ----------------
CLEAR_SCREEN MACRO
    push ax
    push bx
    push cx
    push dx
    mov ax, 0600h          ; AH=06 scroll-up, AL=0 clear all
    mov bh, 07h            ; attribute (light grey on black)
    mov cx, 0              ; (CH, CL) = top-left (0, 0)
    mov dx, 184Fh          ; (DH, DL) = bottom-right (24, 79)
    int 10h
    pop dx
    pop cx
    pop bx
    pop ax
ENDM
