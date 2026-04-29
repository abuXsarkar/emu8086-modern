; bitwise.asm — AND, OR, XOR, NOT, TEST in their three encodings.

org 100h

    mov ax, 0x00FF
    mov bx, 0xF0F0

    ; AND / OR / XOR -- reg/reg + reg/imm forms
    and ax, bx
    or  ax, 0x000F
    xor bx, ax
    and al, 0x7F                ; reg8/imm8

    ; NOT -- reg16 + reg8
    not ax
    not al

    ; TEST in all three encodings:
    ;   84/85  → reg/reg
    ;   A8/A9  → AL/AX with imm (special accumulator form)
    ;   F6/F7  → reg/imm via mod-r/m
    test ax, bx                 ; 85 form
    test al, 0x80               ; A8 (AL accumulator imm)
    test ax, 0x1234             ; A9 (AX accumulator imm)
    test bx, 0x1234             ; F7 form (non-accumulator)
    test bl, 0x10               ; F6 form

    mov ax, 4C00h
    int 21h
