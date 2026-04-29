; shifts_rotates.asm — every shift/rotate variant, by 1 and by CL.
;
; The 8086 encodes shifts/rotates with two opcode pairs: D0/D1 (count
; = 1, byte/word) and D2/D3 (count = CL, byte/word). The /n field of
; the modrm byte selects the operation: 0 ROL, 1 ROR, 2 RCL, 3 RCR,
; 4 SHL/SAL, 5 SHR, 6 (reserved), 7 SAR. We touch each in both forms.

org 100h

    mov ax, 0x1234
    mov al, 0x55
    mov cl, 4

    ; --- by 1 (D0/D1) ----
    rol ax, 1
    ror ax, 1
    rcl ax, 1
    rcr ax, 1
    shl ax, 1
    shr ax, 1
    sar ax, 1
    rol al, 1
    ror al, 1
    shl al, 1
    shr al, 1
    sar al, 1

    ; --- by CL (D2/D3) ----
    rol ax, cl
    ror ax, cl
    rcl ax, cl
    rcr ax, cl
    shl ax, cl
    shr ax, cl
    sar ax, cl
    rol al, cl
    ror al, cl
    shl al, cl
    shr al, cl
    sar al, cl

    mov ax, 4C00h
    int 21h
