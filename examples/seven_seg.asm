; seven_seg.asm — drive the 7-segment display through port 199.
;
; Standard segment layout (each bit = one lamp):
;   bit 0 = top, 1 = top-right, 2 = bottom-right, 3 = bottom,
;   bit 4 = bottom-left, 5 = top-left, 6 = middle, 7 = decimal point
;
; Writing 0x3F (00111111) lights the six outer segments — a "0".
; This program writes the digit pattern for "8" (all seven segments on)
; and then halts; the IDE's 7-seg panel renders the result.
;
; Run: emu8086 run-asm examples/seven_seg.asm
;      (or load from the IDE's example dropdown after rebuild)

org 100h

    ; The byte 0x7F = 01111111 has all 7 segment bits on; the dot
    ; (bit 7) stays off.
    mov al, 7Fh
    mov dx, 199
    out dx, al

    mov ax, 4C00h
    int 21h
