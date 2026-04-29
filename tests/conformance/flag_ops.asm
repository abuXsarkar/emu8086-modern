; flag_ops.asm — every single-byte flag-manipulation opcode the
; encoder emits.
;
;   F8 CLC — clear carry
;   F9 STC — set carry
;   F5 CMC — complement carry
;   FC CLD — clear direction
;   FD STD — set direction
;   FA CLI — clear interrupt enable
;   FB STI — set interrupt enable
;   9F LAHF — load AH from low flag byte
;   9E SAHF — store AH into low flag byte
;
; PUSHF / POPF appear in stack_ops.asm. INT/IRET appear in dos
; programs across the corpus.

org 100h

    clc
    stc
    cmc
    cld
    std
    cli
    sti

    ; LAHF reads CF/PF/AF/ZF/SF into AH. Set CF first so the round-trip
    ; through SAHF actually moves bits.
    stc
    lahf
    sahf

    mov ax, 4C00h
    int 21h
