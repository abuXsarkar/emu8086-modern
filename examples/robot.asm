; robot.asm — drive a virtual robot through a square path.
;
;   port 0x12 = motion command:
;     0 = stop, 1 = forward, 2 = backward,
;     3 = turn left (CCW 90°), 4 = turn right (CW 90°)
;
; Heading starts North. We walk a 4-cell square clockwise:
;   forward, forward, turn right
; repeated four times. The IDE's Robot panel renders the trail.

org 100h

    mov dx, 0x12
    mov cx, 4              ; four sides

side_loop:
    mov al, 1              ; forward
    out dx, al
    out dx, al             ; two cells per side
    mov al, 4              ; turn right
    out dx, al
    loop side_loop

    mov al, 0              ; stop
    out dx, al

    mov ax, 4C00h
    int 21h
