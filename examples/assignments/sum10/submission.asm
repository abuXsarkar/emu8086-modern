; sum10/submission.asm — sample student submission for spec.yml.
; Computes 1+2+...+10 and halts with the result in AX. The autograder
; asserts AX == 55 and ZF == 0 at halt.

org 100h

    mov cx, 10
    xor ax, ax
    mov bx, 1

sum_loop:
    add ax, bx
    inc bx
    loop sum_loop

    ; AX == 55. Halt; the autograder snapshots register state.
    hlt
