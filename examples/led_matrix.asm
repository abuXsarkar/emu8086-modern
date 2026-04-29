; led_matrix.asm — paint a smiley face on the 8x8 LED matrix.
;
; Port layout the IDE renders against:
;   port 10 (0x0A) = row address (0..7)
;   port  9 (0x09) = row data; bit 0 = leftmost lamp, bit 7 = rightmost
;
; The pattern below draws:
;   .######.    01111110 = 7E
;   #......#    10000001 = 81
;   #.#..#.#    10100101 = A5
;   #......#    10000001 = 81
;   #.#..#.#    10100101 = A5
;   #..##..#    10011001 = 99
;   #......#    10000001 = 81
;   .######.    01111110 = 7E
;
; Loop over the 8 rows: write the row index to port 10, then the byte
; from `pattern[row]` to port 9. The IDE's `led_matrix_rows()` walks
; the OUT log on each step and the LedMatrix component re-renders.

org 100h

    mov si, pattern
    xor cx, cx          ; current row index in cx (cl is the low byte)
next_row:
    cmp cx, 8
    je  done

    mov al, cl
    mov dx, 10          ; row address port
    out dx, al

    mov al, [si]        ; row data byte
    mov dx, 9           ; row data port
    out dx, al

    inc si
    inc cx
    jmp next_row

done:
    mov ax, 4C00h
    int 21h

pattern: db 7Eh, 81h, 0A5h, 81h, 0A5h, 99h, 81h, 7Eh
