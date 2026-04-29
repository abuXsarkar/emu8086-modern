; modrm_addressing.asm — exercise the mod-r/m memory operand forms.
;
; The 8086 mod field selects one of:
;   00 = [base+index]            (no displacement, except direct16)
;   01 = [base+index+disp8]
;   10 = [base+index+disp16]
;   11 = register (covered everywhere else)
;
; And rm picks the base/index combination. We touch each of the
; common forms plus BYTE PTR / WORD PTR size overrides for the
; immediate-to-memory cases.

org 100h

    mov bx, data
    mov si, 2
    mov di, 4
    mov bp, 6

    ; mod=00 forms
    mov al, [bx]                ; rm=[bx]
    mov ax, [bx+si]             ; rm=[bx+si]
    mov ax, [bx+di]
    mov ax, [si]
    mov ax, [di]
    mov ax, [data]              ; mod=00 rm=110 → direct16

    ; mod=01 / mod=10 displaced forms
    mov al, [bx+1]              ; disp8
    mov ax, [bx+si+4]
    mov ax, [bx+0x100]          ; disp16
    mov ax, [bp+si+2]

    ; Memory destinations
    mov [bx], ax
    mov [bx+si+4], al
    mov [data], ax

    ; Size-override immediates
    mov word ptr [bx], 0x1234
    mov byte ptr [bx+1], 0x55

    mov ax, 4C00h
    int 21h

data: dw 0, 0, 0, 0, 0, 0, 0, 0
