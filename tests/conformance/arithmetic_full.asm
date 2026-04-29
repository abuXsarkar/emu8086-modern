; arithmetic_full.asm — exercise the arithmetic instruction group.
;
; Coverage: ADD/ADC/SUB/SBB (reg/reg, reg/imm), INC/DEC reg16, NEG,
; MUL/IMUL/DIV/IDIV (reg16). Each form is touched at least once so a
; missing encoder branch surfaces as an `assemble` error rather than
; silent miscompilation.

org 100h

    ; ADD / ADC --------------------------------------------------
    mov ax, 0x0123
    mov bx, 0x0456
    add ax, bx                  ; reg/reg word
    add al, 7                   ; reg/imm byte
    adc ax, bx                  ; ADC reg/reg
    adc al, 1                   ; ADC reg/imm

    ; SUB / SBB --------------------------------------------------
    sub ax, bx
    sub al, 3
    sbb ax, bx
    sbb al, 1

    ; NEG / INC / DEC -------------------------------------------
    neg al
    inc bx
    dec bx
    inc cx
    dec cx

    ; MUL / IMUL / DIV / IDIV -----------------------------------
    mov ax, 0x0010
    mov bx, 0x0003
    mul bx                      ; unsigned: DX:AX = AX * BX
    mov ax, 0x0010
    mov bx, 0x0003
    imul bx                     ; signed
    mov dx, 0
    mov ax, 0x0064
    mov bx, 0x000A
    div bx                      ; AX = quotient, DX = remainder
    mov dx, 0
    mov ax, 0x0064
    mov bx, 0x000A
    idiv bx

    mov ax, 4C00h
    int 21h
