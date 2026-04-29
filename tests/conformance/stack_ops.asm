; stack_ops.asm — PUSH and POP across every register form the
; encoder currently accepts.
;
;   PUSH/POP reg16     — single-byte 50..57 / 58..5F
;   PUSH/POP segreg    — 06/07 (es), 16/17 (ss), 1E/1F (ds);
;                         CS is push-only on 8086 (`push cs` = 0E) and
;                         we exercise that too without a matching pop.
;   PUSHF / POPF       — flag word push/pop
;
; The program restores SP to its starting value at the end so a
; conformance run finishes with a clean stack frame.

org 100h

    ; --- reg16 round trips ---
    mov ax, 0x1111
    mov bx, 0x2222
    mov cx, 0x3333
    mov dx, 0x4444
    push ax
    push bx
    push cx
    push dx
    pop  dx
    pop  cx
    pop  bx
    pop  ax

    ; --- segreg round trips (push then pop into the same slot) ---
    push es
    push ds
    push ss
    pop  ss
    pop  ds
    pop  es

    ; CS is push-only; balance with one extra pop into AX.
    push cs
    pop  ax

    ; --- memory-form r/m16 push / pop (FF /6 and 8F /0) ---
    mov bx, 0x300
    mov si, 0x10
    mov word ptr [bx+si], 0x55AA
    push word ptr [bx+si]
    pop  word ptr [bx+si]

    ; --- flag word round trip ---
    pushf
    popf

    mov ax, 4C00h
    int 21h
