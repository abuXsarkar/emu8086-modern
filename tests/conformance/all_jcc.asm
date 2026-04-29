; all_jcc.asm — touch every conditional-jump opcode.
;
; The 8086 has 16 short Jcc forms (encoded 70..7F). We don't care
; whether the jumps are *taken* — just that the encoder emits a valid
; 8-bit displacement for each mnemonic. A no-op tail keeps each jump
; target reachable so the assembler's forward-reference resolver
; sees a valid landing zone.

org 100h

    mov ax, 0
    mov bx, 0
    cmp ax, bx

    jo  l0                      ; 70
l0: jno l1                      ; 71
l1: jb  l2                      ; 72  (also JC / JNAE)
l2: jnb l3                      ; 73  (also JNC / JAE)
l3: je  l4                      ; 74  (also JZ)
l4: jne l5                      ; 75  (also JNZ)
l5: jbe l6                      ; 76  (also JNA)
l6: ja  l7                      ; 77  (also JNBE)
l7: js  l8                      ; 78
l8: jns l9                      ; 79
l9: jp  l10                     ; 7A  (also JPE)
l10: jnp l11                    ; 7B  (also JPO)
l11: jl  l12                    ; 7C  (also JNGE)
l12: jge l13                    ; 7D  (also JNL)
l13: jle l14                    ; 7E  (also JNG)
l14: jg  l15                    ; 7F  (also JNLE)

    ; Also touch the LOOP family + JCXZ.
l15:
    mov cx, 3
loop_top:
    loop loop_top
    mov cx, 3
loope_top:
    loope loope_top
    mov cx, 3
loopne_top:
    loopne loopne_top
    mov cx, 0
    jcxz tail
tail:

    mov ax, 4C00h
    int 21h
