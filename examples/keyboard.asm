; keyboard.asm — read keystrokes the IDE injects into the keyboard
; FIFO and echo them back to stdout. Demonstrates two equivalent
; approaches:
;
;   1) Direct port I/O — `in al, 0x64` polls the status port (bit 0
;      = "data available"); `in al, 0x60` drains the data port.
;   2) BIOS INT 16h — `AH=01h` peek (ZF=1 if empty); `AH=00h` reads.
;
; Both forms work; this program uses (1) since it's the path most
; emu8086 lab manuals walk through. The IDE's Keyboard component is
; the input side: focus the textbox, type, and watch the byte show
; up in stdout via INT 21h fn 02h.
;
; A Ctrl+C keystroke (byte 0x03) ends the loop cleanly.

org 100h

poll:
    in  al, 0x64           ; status port: bit 0 = data ready
    test al, 1
    jz  poll               ; no key → keep polling

    in  al, 0x60           ; data port: drain one byte
    cmp al, 0x03           ; Ctrl+C → exit
    je  done

    mov dl, al             ; echo via DOS putchar
    mov ah, 02h
    int 21h
    jmp poll

done:
    mov ax, 4C00h
    int 21h
