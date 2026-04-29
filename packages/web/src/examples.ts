// Built-in example programs surfaced via the editor's "Load example"
// dropdown. The strings are kept in sync with the .asm files under
// /examples in the workspace; integration tests confirm the .asm files
// produce the expected output byte-for-byte.

export interface BuiltinExample {
  id: string;
  label: string;
  hint: string;
  source: string;
}

export const EXAMPLES: BuiltinExample[] = [
  {
    id: "hello",
    label: "hello — print a $-terminated string via INT 21h fn 09h",
    hint: 'Prints "Hello, world!"',
    source: `; hello.asm — the classic emu8086 hello-world.

org 100h

    mov dx, msg
    mov ah, 9
    int 21h

    mov ax, 4C00h
    int 21h

msg: db "Hello, world!$"
`,
  },
  {
    id: "sum",
    label: "sum — accumulate 1..10 with LOOP, format two decimal digits",
    hint: 'Prints "55"',
    source: `; sum.asm — compute 1+2+...+10 and print "55".

org 100h

    mov cx, 10
    xor ax, ax
    mov bx, 1

sum_loop:
    add ax, bx
    inc bx
    loop sum_loop

    xor cx, cx
tens_loop:
    cmp ax, 10
    jl tens_done
    sub ax, 10
    inc cx
    jmp tens_loop
tens_done:

    mov dl, cl
    add dl, '0'
    mov ah, 02h
    int 21h

    mov dl, al
    add dl, '0'
    mov ah, 02h
    int 21h

    mov dl, 10
    mov ah, 02h
    int 21h

    mov ax, 4C00h
    int 21h
`,
  },
  {
    id: "array_sum",
    label: "array_sum — walk a null-terminated array via LODSB",
    hint: 'Prints "55" by summing 1..10 from memory',
    source: `; array_sum.asm — sum a null-terminated byte array, print the result.

org 100h

    mov si, data
    xor bx, bx
    cld

read_loop:
    lodsb
    cmp al, 0
    je print_result
    add bl, al
    adc bh, 0
    jmp read_loop

print_result:
    mov ax, bx
    xor cx, cx
tens_loop:
    cmp ax, 10
    jl tens_done
    sub ax, 10
    inc cx
    jmp tens_loop
tens_done:

    mov dl, cl
    add dl, '0'
    mov ah, 02h
    int 21h

    mov dl, al
    add dl, '0'
    mov ah, 02h
    int 21h

    mov dl, 10
    mov ah, 02h
    int 21h

    mov ax, 4C00h
    int 21h

data: db 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0
`,
  },
  {
    id: "streq",
    label: "streq — compare two strings with REPE CMPSB",
    hint: 'Prints "=" when the strings match',
    source: `; streq.asm — compare two strings byte-by-byte and print '=' or '!'.

org 100h

    mov si, str_a
    mov di, str_b
    mov cx, len
    cld
    repe cmpsb
    je equal

    mov dl, '!'
    jmp print

equal:
    mov dl, '='

print:
    mov ah, 02h
    int 21h

    mov dl, 10
    mov ah, 02h
    int 21h

    mov ax, 4C00h
    int 21h

len equ 5
str_a: db "hello"
str_b: db "hello"
`,
  },
  {
    id: "countdown",
    label: "countdown — 10 9 8 ... 1 with push/pop state preservation",
    hint: 'Prints "10 9 8 7 6 5 4 3 2 1 "',
    source: `; countdown.asm — print "10 9 8 7 6 5 4 3 2 1" then a newline.

org 100h

    mov cx, 10

loop_top:
    push cx

    mov ax, cx
    xor bx, bx
tens_loop:
    cmp ax, 10
    jl tens_done
    sub ax, 10
    inc bx
    jmp tens_loop
tens_done:

    cmp bx, 0
    je no_tens
    push ax
    mov dl, bl
    add dl, '0'
    mov ah, 02h
    int 21h
    pop ax
no_tens:

    mov dl, al
    add dl, '0'
    mov ah, 02h
    int 21h

    mov dl, ' '
    mov ah, 02h
    int 21h

    pop cx
    loop loop_top

    mov dl, 10
    mov ah, 02h
    int 21h

    mov ax, 4C00h
    int 21h
`,
  },
  {
    id: "proc_hello",
    label: "proc_hello — `.MODEL SMALL` + PROC/ENDP lab-manual idiom",
    hint: 'Prints "Hello from PROC!" through the standard MASM-style scaffold',
    source: `; proc_hello.asm — the lab-manual idiom: .MODEL SMALL header, work
; in a main PROC ... main ENDP block, END main footer. The assembler
; treats the segment / model directives as no-ops on our flat .com
; image, and PROC/ENDP collapse into a plain labeled block.

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
`,
  },
  {
    id: "screen",
    label: "screen — write to text-mode video memory at B800:0000",
    hint: 'Renders "HELLO" near the top-left of the IDE\'s screen panel',
    source: `; screen.asm — DOS text mode at B800:0000. Each cell is 2 bytes
; (low=char, high=attribute). We swap DS to 0xB800 so plain [di]
; addresses the video buffer; segment overrides aren't yet supported
; by the assembler, so we encode each (char, attr) pair as a single
; 16-bit immediate (AH=attr, AL=char) — attr 0x07 is light grey on
; black, the default DOS text colour.

org 100h

    mov ax, 0B800h
    mov ds, ax
    mov di, 0

    mov ax, 0748h           ; 'H'
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
`,
  },
  {
    id: "stepper",
    label: "stepper — drive a 4-coil stepper motor in wave-drive sequence (port 7)",
    hint: "Steps the rotor through 16 positions (4 full rotations)",
    source: `; stepper.asm — 4-coil stepper at port 7. Bits 0..3 = coils N/E/S/W.
; Wave drive: 1, 2, 4, 8 cycles the rotor 90° per step.

org 100h

    mov dx, 7
    xor bx, bx
    mov cx, 16

step_loop:
    mov si, pattern
    add si, bx
    lodsb
    out dx, al

    inc bx
    cmp bx, 4
    jl  no_wrap
    xor bx, bx
no_wrap:
    loop step_loop

    mov ax, 4C00h
    int 21h

pattern: db 1, 2, 4, 8
`,
  },
  {
    id: "led_matrix",
    label: "led_matrix — paint a smiley on the 8x8 LED matrix (ports 9, 10)",
    hint: "Renders an 8x8 sprite via the row-address / row-data port pattern",
    source: `; led_matrix.asm — paint a smiley face on the 8x8 LED matrix.
;
;   port 10 (0x0A) = row address (0..7)
;   port  9 (0x09) = row data; bit 0 = leftmost lamp

org 100h

    mov si, pattern
    xor cx, cx
next_row:
    cmp cx, 8
    je  done

    mov al, cl
    mov dx, 10
    out dx, al

    mov al, [si]
    mov dx, 9
    out dx, al

    inc si
    inc cx
    jmp next_row

done:
    mov ax, 4C00h
    int 21h

pattern: db 7Eh, 81h, 0A5h, 81h, 0A5h, 99h, 81h, 7Eh
`,
  },
  {
    id: "stackdemo",
    label: "stackdemo — simplest LIFO push/pop demo",
    hint: 'Prints "321"',
    source: `; stackdemo.asm — push '1' '2' '3', pop them, print "321".

org 100h

    mov al, '1'
    push ax

    mov al, '2'
    push ax

    mov al, '3'
    push ax

    pop ax
    mov dl, al
    mov ah, 02h
    int 21h

    pop ax
    mov dl, al
    mov ah, 02h
    int 21h

    pop ax
    mov dl, al
    mov ah, 02h
    int 21h

    mov dl, 10
    mov ah, 02h
    int 21h

    mov ax, 4C00h
    int 21h
`,
  },
];
