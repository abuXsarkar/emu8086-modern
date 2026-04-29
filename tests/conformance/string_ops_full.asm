; string_ops_full.asm — every string opcode in both byte and word
; widths, with REP / REPE / REPNE prefixes where the variant exists.
;
; Coverage: MOVSB, MOVSW, STOSB, STOSW, LODSB, LODSW, CMPSB, SCASB.
; Direction flag is cleared (`cld`) so SI/DI advance forward.

org 100h

    cld

    ; --- copy 8 bytes from src → dst with REP MOVSB ----------
    mov si, src
    mov di, dst
    mov cx, 8
    rep movsb

    ; --- copy 4 words from src → dst with REP MOVSW ----------
    mov si, src
    mov di, dst
    mov cx, 4
    rep movsw

    ; --- fill 8 bytes of dst with AL via REP STOSB -----------
    mov di, dst
    mov al, '*'
    mov cx, 8
    rep stosb

    ; --- fill 4 words of dst with AX via REP STOSW -----------
    mov di, dst
    mov ax, 0x4242
    mov cx, 4
    rep stosw

    ; --- read out 4 bytes via LODSB --------------------------
    mov si, src
    lodsb
    lodsb
    lodsb
    lodsb

    ; --- read out 2 words via LODSW --------------------------
    mov si, src
    lodsw
    lodsw

    ; --- compare 4 bytes with REPE CMPSB ---------------------
    mov si, src
    mov di, dst
    mov cx, 4
    repe cmpsb

    ; --- search for 0x42 in dst with REPNE SCASB --------------
    mov di, dst
    mov al, 0x42
    mov cx, 8
    repne scasb

    mov ax, 4C00h
    int 21h

src: db 1, 2, 3, 4, 5, 6, 7, 8
dst: db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
