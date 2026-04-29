// Shared register-shape interface. Defined here so debugExpr.ts can
// import it without pulling in App.tsx.

export interface RunRegisters {
  ax: number;
  bx: number;
  cx: number;
  dx: number;
  si: number;
  di: number;
  bp: number;
  sp: number;
  ip: number;
  cs: number;
  ds: number;
  es: number;
  ss: number;
  flags: number;
}
