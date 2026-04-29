; seg_overrides.asm — segment-override prefixes on memory operands.
;
; The 8086 lets any memory access pick a non-default segment by
; prefixing the instruction with one of:
;
;   26 ES:    2E CS:    36 SS:    3E DS:
;
; The prefix attaches to the next instruction's mod-r/m memory
; operand. We hit each of the four prefix bytes here so a regression
; in the parser or encoder for any direction is caught.

org 100h

    mov bx, 0x200
    mov bp, 0x300

    ; ES override on a 16-bit read.
    mov ax, es:[bx]
    ; ES override on a 16-bit write with a size hint.
    mov word ptr es:[bx], 0x4242

    ; DS override (redundant for [bx], but tests the prefix path).
    mov ax, ds:[bx]

    ; CS override — useful for reading constants in the code segment.
    mov ax, cs:[bx]

    ; SS override on a [bp]-based address (BP defaults to SS already,
    ; but we want the prefix in the byte stream regardless).
    mov ax, ss:[bp]

    mov ax, 4C00h
    int 21h
