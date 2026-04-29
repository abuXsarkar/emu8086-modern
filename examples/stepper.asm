; stepper.asm — drive a 4-coil stepper motor through wave-drive
; sequence. Convention:
;
;   port 7 = coil drive byte
;     bit 0 = N coil   bit 1 = E coil
;     bit 2 = S coil   bit 3 = W coil
;
; Wave drive lights one coil at a time in the order 1, 2, 4, 8 to
; rotate the rotor 90° per step. We loop the four-byte pattern table
; four times for a full 360° × 4 rotation, then halt — the IDE's
; Stepper component renders the rotor angle and step count live.

org 100h

    mov dx, 7              ; coil-drive port
    mov bx, 0              ; index 0..3 into the pattern table
    mov cx, 16             ; 16 steps = 4 full rotations

step_loop:
    mov si, pattern
    add si, bx
    lodsb
    out dx, al

    inc bx
    cmp bx, 4
    jl  no_wrap
    xor bx, bx
no_wrap:
    loop step_loop

    mov ax, 4C00h
    int 21h

pattern: db 1, 2, 4, 8
