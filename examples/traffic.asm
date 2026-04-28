; traffic.asm — set the traffic-light intersection to "N/S green, E/W red".
;
; Port 4 layout (one bit per lamp):
;   bit 0 N red    bit 1 N green
;   bit 2 S red    bit 3 S green
;   bit 4 E red    bit 5 E green
;   bit 6 W red    bit 7 W green
;
; To put N/S on green and E/W on red:
;   bit 1 (N green) + bit 3 (S green) + bit 4 (E red) + bit 6 (W red)
;   = 0b01011010 = 0x5A
;
; Run: emu8086 run-asm examples/traffic.asm

org 100h

    mov al, 5Ah
    mov dx, 4
    out dx, al

    mov ax, 4C00h
    int 21h
