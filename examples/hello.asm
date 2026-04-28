; hello.asm — the classic emu8086 hello-world.
;
; Run it with:
;   emu8086 run-asm examples/hello.asm
;
; Or assemble first, then run the image:
;   emu8086 assemble examples/hello.asm -o hello.com
;   emu8086 run hello.com

org 100h

    mov dx, msg
    mov ah, 9
    int 21h

    mov ax, 4C00h
    int 21h

msg: db "Hello, world!$"
