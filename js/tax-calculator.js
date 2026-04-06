'use strict';

/**
 * Tabla de tasas RESICO PF — Pagos provisionales mensuales
 * Artículo 113-E, Ley del ISR (2024/2025)
 * Fuente: límites anuales ÷ 12
 *
 * Límite anual     Límite mensual    Tasa
 * $300,000         $25,000           1.00%
 * $600,000         $50,000           1.10%
 * $1,000,000       $83,333.33        1.50%
 * $2,500,000       $208,333.33       2.00%
 * $3,500,000       $291,666.67       2.50%
 *
 * NOTA: Se aplica la tasa al total de ingresos del bracket (tasa plana, no marginal).
 * Verifica esta tabla con tu contador en cada ejercicio fiscal.
 */
const TABLA_RESICO_MENSUAL = [
  { limSup: 25_000.00,   tasa: 0.010, pct: '1.00%' },
  { limSup: 50_000.00,   tasa: 0.011, pct: '1.10%' },
  { limSup: 83_333.33,   tasa: 0.015, pct: '1.50%' },
  { limSup: 208_333.33,  tasa: 0.020, pct: '2.00%' },
  { limSup: 291_666.67,  tasa: 0.025, pct: '2.50%' },
];

const RESICO_LIMITE_MENSUAL = 291_666.67;

/**
 * Calcula el ISR provisional RESICO PF.
 * @param {number} ingresosBrutos  - Suma de subtotales de CFDIs de ingreso emitidos
 * @param {number} notasCredito    - Suma de subtotales de notas de crédito emitidas
 * @param {number} isrRetenido     - Suma de ISR retenido por clientes (incluye federal 1.25% y estatal 2%)
 */
function calcISR(ingresosBrutos, notasCredito, isrRetenido) {
  const base = r2(Math.max(0, ingresosBrutos - notasCredito));

  if (base > RESICO_LIMITE_MENSUAL) {
    return {
      excedeLimite: true,
      ingresosBrutos: r2(ingresosBrutos),
      notasCredito: r2(notasCredito),
      base,
    };
  }

  const fila = TABLA_RESICO_MENSUAL.find(f => base <= f.limSup) ?? TABLA_RESICO_MENSUAL[0];
  const causado = r2(base * fila.tasa);
  const neto    = r2(causado - isrRetenido);

  return {
    ingresosBrutos: r2(ingresosBrutos),
    notasCredito:   r2(notasCredito),
    base,
    tasa:           fila.tasa,
    pct:            fila.pct,
    causado,
    isrRetenido:    r2(isrRetenido),
    aPagar:         neto > 0 ?  neto : 0,
    aFavor:         neto < 0 ? -neto : 0,
  };
}

/**
 * Calcula el IVA del mes.
 * @param {number} causado      - IVA trasladado en CFDIs de ingreso (menos notas de crédito emitidas)
 * @param {number} acreditable  - IVA pagado en CFDIs de gasto recibidos (menos notas de crédito recibidas)
 * @param {number} retenido     - IVA retenido por clientes personas morales (10.6667%)
 */
function calcIVA(causado, acreditable, retenido) {
  const neto = r2(causado - acreditable - retenido);
  return {
    causado:     r2(causado),
    acreditable: r2(acreditable),
    retenido:    r2(retenido),
    aPagar:      neto > 0 ?  neto : 0,
    aFavor:      neto < 0 ? -neto : 0,
  };
}

function r2(n) { return Math.round(n * 100) / 100; }
