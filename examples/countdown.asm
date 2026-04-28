; countdown.asm — print "10 9 8 7 6 5 4 3 2 1 " followed by a newline.
;
; Demonstrates: nested loops, push/pop to preserve CX across body
; computations, conditional output (only print the tens digit when
; non-zero), the cmp-and-sub-by-10 ASCII formatting trick.
;
; Run: emu8086 run-asm examples/countdown.asm

org 100h

    mov cx, 10

loop_top:
    push cx                 ; preserve loop counter

    ; AX = current count; isolate tens (in BX) and ones (residue in AX).
    mov ax, cx
    xor bx, bx
tens_loop:
    cmp ax, 10
    jl tens_done
    sub ax, 10
    inc bx
    jmp tens_loop
tens_done:

    ; Print the tens digit only when non-zero.
    cmp bx, 0
    je no_tens
    push ax
    mov dl, bl
    add dl, '0'
    mov ah, 02h
    int 21h
    pop ax
no_tens:

    ; Print the ones digit.
    mov dl, al
    add dl, '0'
    mov ah, 02h
    int 21h

    ; Trailing space.
    mov dl, ' '
    mov ah, 02h
    int 21h

    pop cx
    loop loop_top

    mov dl, 10
    mov ah, 02h
    int 21h

    mov ax, 4C00h
    int 21h
