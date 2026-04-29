import type { Locale } from "./types";

// Spanish translation of the IDE strings. Kept as the second locale
// to validate the translation surface; new languages can copy this
// file as a template. Tooltips are short imperatives that match the
// style of the English originals.

export const es: Locale = {
  id: "es",
  name: "Español",
  strings: {
    appTitle: "emu8086-modern",
    appLead:
      "Un emulador 8086 y entorno de ensamblador moderno y de código abierto para estudiantes. Edita, pulsa ",
    appLeadRunVerb: "Ejecutar",

    loadingWasm: "Cargando núcleo wasm…",
    loadWasmFailed: (m) => `No se pudo cargar el wasm: ${m}`,

    source: "código",
    output: "salida",
    registers: "registros",
    flags: "indicadores",
    devices: "dispositivos",
    memory: "memoria",

    loadExample: "Cargar ejemplo…",
    loadExampleTooltip: "Reemplaza el editor con uno de los ejemplos incluidos",
    reset: "Reiniciar",
    resetTooltip: "Re-ensambla y apunta el depurador a la instrucción 0",
    back: "◀ Atrás",
    backTooltip: "Deshace el último paso (depuración inversa)",
    step: "Paso ▶",
    stepTooltip: "Ejecuta una instrucción (o ensambla + ejecuta desde el inicio)",
    run: "Ejecutar (Ctrl+Enter)",
    running: "ejecutando…",
    share: "↗ Compartir",
    shareTooltip: "Copia una URL que reabre este programa en el IDE",

    shareCopied: "enlace copiado al portapapeles",
    shareInUrl: "el enlace está en la barra de URL",

    noOutputYet: "(sin salida todavía — pulsa Ejecutar)",
    noRegistersYet: "ejecuta un programa para ver los registros",

    errorAt: (stage, line, column, message) =>
      `error de ${stage} en la línea ${line}, columna ${column}: ${message}`,

    bytesAssembled: (n, originHex) =>
      `${n} bytes ensamblados (origen = 0x${originHex});`,
    stepsCount: (n) => `${n.toLocaleString("es-ES")} pasos;`,
    exitCodeLabel: "código de salida",

    stepLogSummary: (n) => `registro de pasos (${n} paso${n === 1 ? "" : "s"})`,

    memoryRangeLabel: "DS:0x100..1FF",

    footerLink: "github",
    footerSeparator: " · ",
    footerNote:
      "M0–M5 listos en versión alfa; ocho periféricos en vivo + depurador de viaje en el tiempo + puntos de interrupción + observadores.",

    languageLabel: "Idioma",
  },
};
