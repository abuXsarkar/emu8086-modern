; lab_stepper_via_8255.asm — same wave-drive stepper rotation as
; examples/stepper.asm, but written in the style M1 Experiment 8 and
; M2 ALP 8.2 use (8255-PPI port aliases at the top of the program).
;
; The point of this example: show how to retarget a lab-manual
; program at modern8086's native ports by replacing the
; manual's `PA EQU 0FF10H` block with `INCLUDE "lib/lab_ports.inc"`
; and renaming the PA/PB references. After the include the rest of
; the program is the same code the manual prints.

org 100h

; The include must come AFTER `org 100h` on this branch — EQUs placed
; before the ORG directive get an extra origin offset added by the
; encoder's post-pass. PR 1 of the lab-manual close-out plan fixes
; this; until it merges, the rule of thumb for INCLUDE is: ORG first,
; then INCLUDE, then code.
include "lib/lab_ports.inc"

    ; Per the M1 Experiment 8 mapping note in lab_ports.inc:
    ;   the manual's `PB EQU 0FF11H` becomes STEPPER_PORT.
    mov dx, STEPPER_PORT
    mov bx, 0
    mov cx, 16

step_loop:
    ; Note: this branch is off main; if you've merged PR 1 you can
    ; equivalently write `mov si, OFFSET pattern` here.
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
