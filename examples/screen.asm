; screen.asm — write "HELLO" to text-mode video memory at B800:0000.
;
; DOS text mode lays out 80x25 cells of 2 bytes each:
;   low byte  = ASCII character
;   high byte = attribute (high nibble = bg color, low = fg color)
;
; We swap DS to 0xB800 so plain `[di]` memory operands address the
; video buffer, write five 16-bit words near the top-left corner,
; then exit. Because the assembler doesn't yet model segment
; overrides like `[es:di]`, we encode each (char, attr) cell as a
; single 16-bit immediate (AH=attr, AL=char) instead of reading the
; characters from a string in our own data segment.
;
; Attribute 0x07 = light grey on black — the default DOS text colour.

org 100h

    mov ax, 0B800h
    mov ds, ax              ; DS now points at video memory
    mov di, 0               ; offset into video buffer

    mov ax, 0748h           ; attr=07, char='H'
    mov [di], ax
    add di, 2

    mov ax, 0745h           ; 'E'
    mov [di], ax
    add di, 2

    mov ax, 074Ch           ; 'L'
    mov [di], ax
    add di, 2

    mov ax, 074Ch           ; 'L'
    mov [di], ax
    add di, 2

    mov ax, 074Fh           ; 'O'
    mov [di], ax

    mov ax, 4C00h
    int 21h
