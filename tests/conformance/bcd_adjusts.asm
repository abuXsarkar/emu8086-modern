; bcd_adjusts.asm — packed and unpacked BCD adjust opcodes.
;
;   DAA  (27h) — Decimal Adjust after Addition           (packed BCD)
;   DAS  (2Fh) — Decimal Adjust after Subtraction        (packed BCD)
;   AAA  (37h) — ASCII Adjust after Addition             (unpacked)
;   AAS  (3Fh) — ASCII Adjust after Subtraction          (unpacked)
;   AAM  (D4h, base) — ASCII Adjust after Multiplication
;   AAD  (D5h, base) — ASCII Adjust before Division
;
; AAM/AAD take an immediate base byte; the canonical decimal form is
; base = 10 (D4 0A / D5 0A). The instruction is single-byte
; otherwise.

org 100h

    ; Packed-BCD addition: 0x29 + 0x18 → AL = 0x47 after DAA.
    mov al, 0x29
    add al, 0x18
    daa

    ; Packed-BCD subtraction: 0x47 - 0x18 → AL = 0x29 after DAS.
    mov al, 0x47
    sub al, 0x18
    das

    ; Unpacked-BCD adjust after ADD/SUB on AL.
    mov ax, 0x0006
    add al, 0x05
    aaa

    mov ax, 0x000B
    sub al, 0x06
    aas

    ; Unpacked-BCD multiply / divide adjust (base 10).
    mov al, 0x07
    mov bl, 0x09
    mul bl                      ; AX = 0x003F
    aam

    mov ax, 0x0203              ; "23" unpacked
    aad                         ; AL = 23 packed-decimal-as-binary

    mov ax, 4C00h
    int 21h
