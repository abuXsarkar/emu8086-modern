; call_ret.asm — near CALL/RET with arguments via registers and via
; the stack. Two procedures:
;
;   add3        — register-passing convention (AX = a + b + c).
;                 Arguments come in via BX, CX, DX. Result in AX.
;
;   sum_frame   — stack-passing convention (BP-frame). Caller pushes
;                 two 16-bit arguments before CALL; callee reads them
;                 via [bp+4] / [bp+6], returns in AX, and frees the
;                 args by RET 4 (16-bit far-return forms aren't used
;                 here — `ret 4` does a near return + immediate
;                 stack adjust).

org 100h

    ; --- register-passing call ---------------------------------
    mov bx, 5
    mov cx, 7
    mov dx, 11
    call add3                   ; AX = 23

    ; --- stack-frame call --------------------------------------
    ; Genuine 8086 only encodes register/segreg/flags pushes
    ; (`push imm` is 80186+), and the assembler only knows the bare
    ; RET form (RET imm16 is also 80186+ish in practice). So caller
    ; pushes registers and drops the args after the call itself.
    mov ax, 100
    push ax                     ; argument b = 100
    mov ax, 23
    push ax                     ; argument a = 23
    call sum_frame              ; AX = 123
    add sp, 4                   ; caller-side cleanup

    mov ax, 4C00h
    int 21h

; --- procedures -----------------------------------------------
add3:
    mov ax, bx
    add ax, cx
    add ax, dx
    ret

sum_frame:
    push bp
    mov bp, sp
    mov ax, [bp+4]              ; first arg pushed last → at [bp+4]
    add ax, [bp+6]
    pop bp
    ret                         ; caller drops the 4 stack arg bytes
