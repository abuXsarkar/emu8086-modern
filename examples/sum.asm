; sum.asm — compute 1 + 2 + ... + 10 and print the result.
;
; The sum lives in AX. We isolate the tens and ones digits by
; repeatedly subtracting 10, then print each as an ASCII character
; through INT 21h fn 02h. Output is "55" followed by a newline.
;
; Run: emu8086 run-asm examples/sum.asm

org 100h

    mov cx, 10          ; loop counter
    xor ax, ax          ; sum = 0
    mov bx, 1           ; current number to add

sum_loop:
    add ax, bx
    inc bx
    loop sum_loop       ; AX is now 55

    ; ---- print the tens digit ----
    xor cx, cx          ; cx = tens count
tens_loop:
    cmp ax, 10
    jl tens_done
    sub ax, 10
    inc cx
    jmp tens_loop
tens_done:

    mov dl, cl
    add dl, '0'
    mov ah, 02h
    int 21h

    ; ---- print the ones digit ----
    mov dl, al
    add dl, '0'
    mov ah, 02h
    int 21h

    ; ---- newline ----
    mov dl, 10
    mov ah, 02h
    int 21h

    mov ax, 4C00h
    int 21h
