; mov_forms.asm — every MOV encoding the assembler currently emits.
;
;   reg/imm    — B0..B7 (8-bit), B8..BF (16-bit)
;   reg/reg    — 88/89 (mem,reg), 8A/8B (reg,mem)
;   r/m, imm   — C6/C7
;   accumulator moffs — A0/A1 (load), A2/A3 (store)
;   segreg     — 8C /r (mov r/m16, segreg), 8E /r (mov segreg, r/m16)
;
; LEA (8D /r) and XCHG (86/87 plus the 90+rw accumulator form) live
; in dedicated programs in this corpus (see end of file). XLAT (D7)
; appears in examples/array_sum.asm.

org 100h

    ; --- reg/imm 8-bit and 16-bit ---
    mov al, 0x12
    mov bl, 0x34
    mov ah, 0x56
    mov ax, 0x1234
    mov bx, 0xABCD

    ; --- reg/reg, both directions ---
    mov cx, ax
    mov ax, cx
    mov dl, al
    mov al, dl

    ; --- reg/mem and mem/reg via mod-r/m ---
    mov bx, 0x200
    mov word ptr [bx], 0xDEAD     ; mem, imm16 (C7)
    mov ax, [bx]                  ; reg, mem (8B)
    mov [bx], cx                  ; mem, reg (89)
    mov byte ptr [bx], 0x42       ; mem, imm8 (C6)
    mov dl, [bx]                  ; reg8, mem (8A)
    mov [bx], dh                  ; mem, reg8 (88)

    ; --- accumulator memory-offset (A0..A3) ---
    mov [0x300], ax               ; store AX at DS:0x300 (A3)
    mov ax, [0x300]               ; load AX from DS:0x300 (A1)
    mov [0x302], al               ; store AL (A2)
    mov al, [0x302]               ; load AL (A0)

    ; --- segment registers ---
    mov ax, 0x0700
    mov es, ax                    ; mov segreg, r16  (8E /r)
    ; The matching `mov r16, segreg` (8C /r reg16 dest) is not yet
    ; wired in the parser — see HANDOFF "known gaps".

    ; --- LEA (8D /r) — load effective address without reading mem ---
    lea si, [bx+2]
    lea di, [0x400]

    ; --- XCHG (86/87 plus accumulator 90+rw) ---
    xchg ax, bx                   ; 90+rw form, 1 byte
    xchg cx, dx                   ; mod-r/m form, 2 bytes
    xchg al, [bx]                 ; reg/mem byte form

    mov ax, 4C00h
    int 21h
