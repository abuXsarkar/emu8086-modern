// Tiny expression evaluator for debugger watches and breakpoints.
//
// Grammar (whitespace-insensitive, case-insensitive identifiers):
//   expr  := term (op term)?
//   term  := <register> | <flag> | <number>
//   op    := == != < <= > >=
//
// Atoms:
//   <register>  AX, BX, CX, DX, SI, DI, BP, SP, IP, CS, DS, ES, SS
//   <flag>      CF, PF, AF, ZF, SF, TF, IF, DF, OF — extracted as 0/1
//   <number>    decimal `42`, hex `0x100` / `0FFh`, binary `1011b`
//
// A single-term expression evaluates to its numeric value; a two-term
// comparison evaluates to 1 / 0 (truthy / falsy). Memory operands like
// `[BX+SI]` are not parsed yet — that's a future expansion.

import type { RunRegisters } from "./registers";

export interface EvalOk {
  ok: true;
  value: number;
  truthy: boolean;
}

export interface EvalErr {
  ok: false;
  message: string;
}

export type EvalResult = EvalOk | EvalErr;

const FLAG_BITS: Record<string, number> = {
  cf: 0,
  pf: 2,
  af: 4,
  zf: 6,
  sf: 7,
  tf: 8,
  if: 9,
  df: 10,
  of: 11,
};

const REG_KEYS = new Set([
  "ax",
  "bx",
  "cx",
  "dx",
  "si",
  "di",
  "bp",
  "sp",
  "ip",
  "cs",
  "ds",
  "es",
  "ss",
]);

function lookupAtom(raw: string, regs: RunRegisters): number | null {
  const name = raw.trim().toLowerCase();
  if (REG_KEYS.has(name)) {
    return (regs as unknown as Record<string, number>)[name] ?? 0;
  }
  if (name in FLAG_BITS) {
    return (regs.flags >> FLAG_BITS[name]) & 1;
  }
  return parseNumber(name);
}

function parseNumber(raw: string): number | null {
  const t = raw.trim();
  if (/^0x[0-9a-f]+$/i.test(t)) return parseInt(t.slice(2), 16);
  if (/^[0-9a-f]+h$/i.test(t)) return parseInt(t.slice(0, -1), 16);
  if (/^[01]+b$/i.test(t)) return parseInt(t.slice(0, -1), 2);
  if (/^-?\d+$/.test(t)) return parseInt(t, 10);
  return null;
}

function applyOp(a: number, op: string, b: number): boolean {
  switch (op) {
    case "==":
      return a === b;
    case "!=":
      return a !== b;
    case "<":
      return a < b;
    case "<=":
      return a <= b;
    case ">":
      return a > b;
    case ">=":
      return a >= b;
    default:
      return false;
  }
}

const COMPARE_RE = /^\s*([^=!<>\s]+)\s*(==|!=|<=|>=|<|>)\s*([^=!<>\s].*)$/;

export function evaluate(expr: string, regs: RunRegisters): EvalResult {
  const trimmed = expr.trim();
  if (!trimmed) {
    return { ok: false, message: "empty expression" };
  }
  const m = trimmed.match(COMPARE_RE);
  if (m) {
    const [, lhs, op, rhs] = m;
    const a = lookupAtom(lhs, regs);
    if (a === null) return { ok: false, message: `unknown atom \`${lhs}\`` };
    const b = lookupAtom(rhs, regs);
    if (b === null) return { ok: false, message: `unknown atom \`${rhs}\`` };
    const truthy = applyOp(a, op, b);
    return { ok: true, value: truthy ? 1 : 0, truthy };
  }
  const v = lookupAtom(trimmed, regs);
  if (v === null) {
    return {
      ok: false,
      message: `unknown register / flag / number \`${trimmed}\``,
    };
  }
  return { ok: true, value: v, truthy: v !== 0 };
}

/// Format an evaluation result for display in the UI.
export function formatValue(expr: string, regs: RunRegisters): string {
  const r = evaluate(expr, regs);
  if (!r.ok) return `! ${r.message}`;
  // Single-bit flags: render as 0/1. Comparisons render as T/F. Other
  // values render as 4-digit hex with a decimal in parens.
  const trimmed = expr.trim().toLowerCase();
  const isFlag = trimmed in FLAG_BITS;
  const isCompare = COMPARE_RE.test(trimmed);
  if (isFlag) return r.value.toString();
  if (isCompare) return r.truthy ? "T" : "F";
  return `0x${r.value.toString(16).toUpperCase().padStart(4, "0")} (${r.value})`;
}
