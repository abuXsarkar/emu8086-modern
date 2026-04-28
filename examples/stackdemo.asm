; stackdemo.asm — push '1' '2' '3', pop them, print "321\n".
;
; Demonstrates: PUSH/POP, the stack's LIFO discipline, the
; INT 21h fn 02h putc. The only output should be exactly the three
; characters in reverse-push order, then a newline.
;
; Run: emu8086 run-asm examples/stackdemo.asm

org 100h

    mov al, '1'
    push ax

    mov al, '2'
    push ax

    mov al, '3'
    push ax

    ; Pop and print three times. Each pop pulls back the most recently
    ; pushed value, so the order coming out is '3', '2', '1'.
    pop ax
    mov dl, al
    mov ah, 02h
    int 21h

    pop ax
    mov dl, al
    mov ah, 02h
    int 21h

    pop ax
    mov dl, al
    mov ah, 02h
    int 21h

    mov dl, 10
    mov ah, 02h
    int 21h

    mov ax, 4C00h
    int 21h
