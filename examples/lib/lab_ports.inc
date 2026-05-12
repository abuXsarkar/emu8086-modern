; lab_ports.inc — symbolic names for modern8086's native virtual
; peripherals + per-lab-manual aliasing notes.
;
; Why this file exists
; --------------------
; The four 8086 lab manuals catalogued in docs/lab-manual-audit.md
; (Hashemite MTS-8088 / Gopalan 10ECL68 / Sri Indu / BMSIT 15CSL48)
; assume 8255 PPI hardware-trainer port maps that don't match our
; virtual port set:
;
;   M1 Hashemite : 0FF10H..0FF13H (PA / PB / PC / Control Register)
;   M2 Gopalan   : 0D400H/0D402H and 0E800H/0E802H (kit variants)
;   M3 Sri Indu  : 0FFC0H..0FFC6H
;
; To run those manuals' programs unchanged we'd need an aliasing
; layer in the emulator, but the same 8255 address drives different
; peripherals in different experiments — there's no single map. So
; this include offers symbolic port names instead. To port a lab
; program: replace its `PA EQU 0FF10H` block with `INCLUDE "lib/
; lab_ports.inc"` and rename the manual's PA/PB/PC references to the
; matching native symbol below (see the per-experiment table).
;
; Native peripherals on modern8086
; ------------------------------------
SEVEN_SEG_PORT      EQU 199         ; 7-segment display, 1 byte = pattern
TRAFFIC_LIGHT_PORT  EQU 4           ; traffic-light controller
LED_MATRIX_DATA     EQU 9           ; 8x8 LED matrix, row pixel data
LED_MATRIX_ROW      EQU 10          ; 8x8 LED matrix, row address (0..7)
STEPPER_PORT        EQU 7           ; stepper-motor coil bits
PRINTER_PORT        EQU 0378h       ; LPT1-style printer
ROBOT_PORT          EQU 12          ; robot command port (0..4)

; Per-experiment port mapping cheat-sheet
; ---------------------------------------
;   Manual / experiment       | Manual symbol | Replace with
;   --------------------------+---------------+----------------------
;   M1 Exp 8 (stepper)        | PA = 0FF10H   | STEPPER_PORT
;   M1 Exp 9 (dot-matrix)     | PA = 0FF10H   | LED_MATRIX_ROW
;                             | PB = 0FF11H   | LED_MATRIX_DATA
;   M2 8.1 (7-seg via 8255)   | PA = 0D400H   | SEVEN_SEG_PORT
;   M2 8.2 (stepper)          | PB = 0D402H   | STEPPER_PORT
;   M2 8.3 (matrix keyboard)  |   ---         | not yet emulated
;   M2 8.4 (DAC ramp)         |   ---         | not yet emulated
;   M3 PPI program            | PA = 0FFC0H   | SEVEN_SEG_PORT
;
; The 8255 control-register write (`OUT CR, AL` with a mode byte) is
; a no-op on modern8086 — our virtual peripherals don't have
; configurable directions. Lab programs that emit a control-word can
; either drop the line or `OUT 0, AL` to a harmless port.
