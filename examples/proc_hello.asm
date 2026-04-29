; proc_hello.asm — same hello-world payload, framed in the lab-manual
; idiom: `.MODEL SMALL` header, the work organized into a `main PROC ...
; main ENDP` block, and the `END main` footer that names the entry
; point. The assembler treats `.MODEL` / `.STACK` / `.DATA` / `.CODE`
; as no-ops for our flat .com image, and PROC/ENDP collapse into a
; plain labeled block.

.MODEL SMALL
.STACK 100h
.CODE

org 100h

main PROC NEAR
    mov dx, msg
    mov ah, 9
    int 21h

    mov ax, 4C00h
    int 21h
main ENDP

msg: db "Hello from PROC!$"

END main
