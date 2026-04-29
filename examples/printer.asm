; printer.asm — drive an LPT1-style printer at port 0x378.
;
;   port 0x378 = data port; each byte written becomes one printed
;                character. Special bytes:
;                  0x0A LF — line feed (advance one line)
;                  0x0C FF — form feed (clear the page)
;                  0x0D CR — carriage return (dropped)
;
; This program prints two lines, "HELLO" and "PRINTER", then halts.
; The IDE's Printer panel shows the resulting paper.

org 100h

    mov si, msg
    mov dx, 0x378
print_loop:
    lodsb
    cmp al, 0
    je  done
    out dx, al
    jmp print_loop

done:
    mov ax, 4C00h
    int 21h

msg: db "HELLO", 0Ah, "PRINTER", 0Ah, 0
