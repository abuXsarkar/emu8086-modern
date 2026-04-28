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
