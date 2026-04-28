; array_sum.asm — sum a small null-terminated byte array, print the result.
;
; Demonstrates: memory operands, mod-r/m addressing, LODSB string op,
; conditional jumps, ALU on memory, ASCII formatting. Output is "55\n"
; for the 1..10 array below.
;
; Run: emu8086 run-asm examples/array_sum.asm

org 100h

    mov si, data
    xor bx, bx          ; running sum (low byte = sum, high = carry)
    cld

read_loop:
    lodsb               ; AL = [DS:SI]; SI += 1
    cmp al, 0
    je print_result
    add bl, al
    adc bh, 0
    jmp read_loop

print_result:
    ; AX = BX. Print BX as two-decimal-digit count (assumes < 100).
    mov ax, bx
    xor cx, cx
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

    mov dl, al
    add dl, '0'
    mov ah, 02h
    int 21h

    mov dl, 10
    mov ah, 02h
    int 21h

    mov ax, 4C00h
    int 21h

data: db 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0
