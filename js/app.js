'use strict';

// ── Estado global ─────────────────────────────────────────────────────────────
let cfdis = [];   // Todos los CFDIs cargados (todas las fechas)

// ── Referencias DOM ───────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const dropZone   = $('drop-zone');
const rfcInput   = $('rfc-input');
const monthSel   = $('month-sel');
const yearSel    = $('year-sel');
const messagesEl = $('messages');
const resultsEl  = $('results');
const cfdiBar    = $('cfdi-bar');
const barCount   = $('bar-count');

// ── Inicialización ────────────────────────────────────────────────────────────
(function init() {
  // Poblar selector de año
  const now = new Date();
  const yr  = now.getFullYear();
  for (let y = yr - 2; y <= yr + 1; y++) {
    yearSel.add(new Option(y, y, y === yr, y === yr));
  }
  monthSel.value = now.getMonth() + 1;

  // Restaurar RFC de la sesión (no se guarda entre cierres de pestaña)
  rfcInput.value = sessionStorage.getItem('resico_rfc') || '';

  // Eventos
  setupDragDrop();

  rfcInput.addEventListener('input', () => {
    sessionStorage.setItem('resico_rfc', rfcInput.value.trim());
    recalc();
  });
  monthSel.addEventListener('change', recalc);
  yearSel.addEventListener('change', recalc);
  $('clear-btn').addEventListener('click', clearAll);

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn =>
    btn.addEventListener('click', () => activateTab(btn.dataset.tab))
  );
})();

// ── Drag & Drop ───────────────────────────────────────────────────────────────
function setupDragDrop() {
  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('over');
  });

  ['dragleave', 'dragend'].forEach(ev =>
    dropZone.addEventListener(ev, e => {
      if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('over');
    })
  );

  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('over');
    processFiles(e.dataTransfer.files);
  });

  dropZone.addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type     = 'file';
    inp.multiple = true;
    inp.accept   = '.xml';
    inp.onchange = e => processFiles(e.target.files);
    inp.click();
  });
}

// ── Procesamiento de archivos ─────────────────────────────────────────────────
async function processFiles(fileList) {
  const xmlFiles = Array.from(fileList).filter(f =>
    f.name.toLowerCase().endsWith('.xml')
  );

  if (!xmlFiles.length) {
    showMsg('No se encontraron archivos .xml en la selección.', 'warn');
    return;
  }

  let added = 0, dupes = 0, ignored = 0;
  const errors = [];

  for (const file of xmlFiles) {
    try {
      const text = await file.text();
      const cfdi = parseCFDI(text, file.name);

      if (cfdi === null) { ignored++; continue; }

      // Deduplicar por UUID
      if (cfdis.some(c => c.uuid === cfdi.uuid)) { dupes++; continue; }

      cfdis.push(cfdi);
      added++;
    } catch (e) {
      errors.push(`${file.name}: ${e.message}`);
    }
  }

  clearMessages();
  errors.forEach(e => showMsg(e, 'error'));

  const partes = [];
  if (added)   partes.push(`${added} CFDI${added > 1 ? 's' : ''} cargado${added > 1 ? 's' : ''}`);
  if (dupes)   partes.push(`${dupes} duplicado${dupes > 1 ? 's' : ''} omitido${dupes > 1 ? 's' : ''}`);
  if (ignored) partes.push(`${ignored} ignorado${ignored > 1 ? 's' : ''} (nómina/traslado)`);
  if (partes.length) showMsg(partes.join(' · '), 'info', 4000);

  updateBar();
  recalc();
}

// ── Cálculo principal ─────────────────────────────────────────────────────────
function recalc() {
  clearMessages();

  const rfc   = rfcInput.value.trim().toUpperCase();
  const month = +monthSel.value;
  const year  = +yearSel.value;

  if (!cfdis.length) { resultsEl.classList.add('hidden'); return; }

  if (!rfc) {
    resultsEl.classList.add('hidden');
    showMsg('Ingresa tu RFC para ver el cálculo.', 'warn');
    return;
  }

  // Filtrar por período
  const enPeriodo = cfdis.filter(c => {
    const d = new Date(c.fecha);
    return d.getFullYear() === year && d.getMonth() + 1 === month;
  });

  // Clasificar CFDIs según rol del usuario
  const ingresosEmitidos   = enPeriodo.filter(c => c.tipo === 'I' && uc(c.rfcEmisor)   === rfc);
  const notasCredEmitidas  = enPeriodo.filter(c => c.tipo === 'E' && uc(c.rfcEmisor)   === rfc);
  const gastosRecibidos    = enPeriodo.filter(c => c.tipo === 'I' && uc(c.rfcReceptor)  === rfc);
  const notasCredRecibidas = enPeriodo.filter(c => c.tipo === 'E' && uc(c.rfcReceptor)  === rfc);
  const complementosPago   = enPeriodo.filter(c => c.tipo === 'P');

  if (complementosPago.length) {
    showMsg(
      `Se detectaron ${complementosPago.length} Complemento${complementosPago.length > 1 ? 's' : ''} de Pago (tipo P). ` +
      `No se incluyen en el cálculo automático — consulta a tu contador si aplican en este período.`,
      'warn'
    );
  }

  if (!ingresosEmitidos.length && !gastosRecibidos.length) {
    resultsEl.classList.add('hidden');
    showMsg(
      `No se encontraron CFDIs para ${nombreMes(month)} ${year} con RFC ${rfc}. ` +
      `Verifica que tu RFC esté escrito correctamente.`,
      'warn'
    );
    return;
  }

  // Totales para ISR
  const ingresosBrutos  = sumOf(ingresosEmitidos,  'subtotal');
  const notasCreditoISR = sumOf(notasCredEmitidas,  'subtotal');
  const isrRetenido     = sumOf(ingresosEmitidos,   'isrRetenido');

  // Totales para IVA
  const ivaCausado     = sumOf(ingresosEmitidos,  'ivaTraslado')
                       - sumOf(notasCredEmitidas,  'ivaTraslado');
  const ivaAcreditable = sumOf(gastosRecibidos,   'ivaTraslado')
                       - sumOf(notasCredRecibidas, 'ivaTraslado');
  const ivaRetenido    = sumOf(ingresosEmitidos,   'ivaRetenido');

  const isr = calcISR(ingresosBrutos, notasCreditoISR, isrRetenido);
  const iva = calcIVA(ivaCausado, ivaAcreditable, ivaRetenido);

  renderTablas(ingresosEmitidos, notasCredEmitidas, gastosRecibidos, notasCredRecibidas);
  renderISR(isr);
  renderIVA(iva);
  renderResumen(isr, iva, month, year);

  resultsEl.classList.remove('hidden');
}

// ── Renderizado: tablas de CFDIs ──────────────────────────────────────────────
function renderTablas(ingresos, notasEm, gastos, notasRec) {
  // ── Tabla ingresos ──
  const tbodyI  = $('tbody-ingresos');
  const tfootI  = $('tfoot-ingresos');
  tbodyI.innerHTML = '';
  tfootI.innerHTML = '';

  const filasBrutos = [
    ...ingresos.map(c => ({ ...c, _nc: false })),
    ...notasEm.map(c => ({ ...c, _nc: true  })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha));

  if (!filasBrutos.length) {
    tbodyI.innerHTML = `<tr><td colspan="8" class="empty">Sin ingresos en este período</td></tr>`;
  } else {
    filasBrutos.forEach(c => {
      tbodyI.insertAdjacentHTML('beforeend', `
        <tr class="${c._nc ? 'row-nc' : ''}">
          <td>${c.fecha.substring(0, 10)}</td>
          <td class="mono">${esc((c.serie + c.folio).trim()) || c.uuid.substring(0, 8).toUpperCase()}</td>
          <td class="nombre" title="${esc(c.nombreReceptor)}">${esc(c.nombreReceptor)}</td>
          <td class="r">${c._nc ? '<span class="nc">NC</span> ' : ''}${mxn(c.subtotal)}</td>
          <td class="r">${mxn(c.ivaTraslado)}</td>
          <td class="r ${c.isrRetenido ? 'ret' : 'muted'}">${c.isrRetenido ? mxn(c.isrRetenido) : '—'}</td>
          <td class="r ${c.ivaRetenido ? 'ret' : 'muted'}">${c.ivaRetenido ? mxn(c.ivaRetenido) : '—'}</td>
          <td class="r">${mxn(c.total)}</td>
        </tr>`);
    });
    tfootI.innerHTML = `<tr>
      <td colspan="3">Total</td>
      <td class="r">${mxn(sumOf(ingresos,'subtotal') - sumOf(notasEm,'subtotal'))}</td>
      <td class="r">${mxn(sumOf(ingresos,'ivaTraslado') - sumOf(notasEm,'ivaTraslado'))}</td>
      <td class="r">${mxn(sumOf(ingresos,'isrRetenido'))}</td>
      <td class="r">${mxn(sumOf(ingresos,'ivaRetenido'))}</td>
      <td class="r">${mxn(sumOf(ingresos,'total') - sumOf(notasEm,'total'))}</td>
    </tr>`;
  }

  // ── Tabla egresos ──
  const tbodyE  = $('tbody-egresos');
  const tfootE  = $('tfoot-egresos');
  tbodyE.innerHTML = '';
  tfootE.innerHTML = '';

  const filasGasto = [
    ...gastos.map(c => ({ ...c, _nc: false })),
    ...notasRec.map(c => ({ ...c, _nc: true  })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha));

  if (!filasGasto.length) {
    tbodyE.innerHTML = `<tr><td colspan="6" class="empty">Sin egresos / gastos en este período</td></tr>`;
  } else {
    filasGasto.forEach(c => {
      tbodyE.insertAdjacentHTML('beforeend', `
        <tr class="${c._nc ? 'row-nc' : ''}">
          <td>${c.fecha.substring(0, 10)}</td>
          <td class="mono">${esc((c.serie + c.folio).trim()) || c.uuid.substring(0, 8).toUpperCase()}</td>
          <td class="nombre" title="${esc(c.nombreEmisor)}">${esc(c.nombreEmisor)}</td>
          <td class="r">${c._nc ? '<span class="nc">NC</span> ' : ''}${mxn(c.subtotal)}</td>
          <td class="r ${c.ivaTraslado ? '' : 'muted'}">${c.ivaTraslado ? mxn(c.ivaTraslado) : '—'}</td>
          <td class="r">${mxn(c.total)}</td>
        </tr>`);
    });
    tfootE.innerHTML = `<tr>
      <td colspan="3">Total</td>
      <td class="r">${mxn(sumOf(gastos,'subtotal') - sumOf(notasRec,'subtotal'))}</td>
      <td class="r">${mxn(sumOf(gastos,'ivaTraslado') - sumOf(notasRec,'ivaTraslado'))}</td>
      <td class="r">${mxn(sumOf(gastos,'total') - sumOf(notasRec,'total'))}</td>
    </tr>`;
  }
}

// ── Renderizado: ISR ──────────────────────────────────────────────────────────
function renderISR(r) {
  const el = $('isr-panel');

  if (r.excedeLimite) {
    el.innerHTML = alerta(
      `Los ingresos netos del mes (${mxn(r.base)}) superan el límite mensual de RESICO (${mxn(RESICO_LIMITE_MENSUAL)}), ` +
      `equivalente a ingresos anuales mayores a $3,500,000. Consulta a tu contador.`,
      'error'
    );
    return;
  }

  let html = fila('Ingresos brutos del mes', r.ingresosBrutos);

  if (r.notasCredito > 0) {
    html += fila('Notas de crédito emitidas', r.notasCredito, 'sub');
    html += fila('Base gravable neta', r.base, 'bold');
  }

  html += fila(
    `ISR causado <span class="tasa">${r.pct}</span>`,
    r.causado
  );

  if (r.isrRetenido > 0) {
    html += fila('ISR retenido por clientes', r.isrRetenido, 'sub');
    html += `<p class="nota-ret">Incluye ISR federal (1.25%) y puede incluir ISR cedular estatal (2%).</p>`;
  }

  html += totalFila(r.aPagar, r.aFavor);
  el.innerHTML = html;
}

// ── Renderizado: IVA ──────────────────────────────────────────────────────────
function renderIVA(r) {
  const el = $('iva-panel');

  let html = fila('IVA causado (trasladado a clientes)', r.causado);
  html += fila('IVA acreditable (pagado a proveedores)', r.acreditable, 'sub');

  if (r.retenido > 0) {
    html += fila('IVA retenido por clientes (10.6667%)', r.retenido, 'sub');
  }

  html += totalFila(r.aPagar, r.aFavor);
  el.innerHTML = html;
}

// ── Renderizado: Resumen ──────────────────────────────────────────────────────
function renderResumen(isr, iva, month, year) {
  const totalPagar = isr.aPagar + iva.aPagar;

  $('resumen-panel').innerHTML = `
    <div class="res-periodo">${nombreMes(month)} ${year}</div>
    <div class="res-grid">
      <div class="res-item">
        <div class="res-label">ISR</div>
        <div class="res-val ${isr.aPagar > 0 ? 'pagar' : 'favor'}">${mxn(isr.aPagar > 0 ? isr.aPagar : isr.aFavor)}</div>
        <div class="res-sub">${isr.aPagar > 0 ? 'a pagar' : 'a favor'}</div>
      </div>
      <div class="res-op">+</div>
      <div class="res-item">
        <div class="res-label">IVA</div>
        <div class="res-val ${iva.aPagar > 0 ? 'pagar' : 'favor'}">${mxn(iva.aPagar > 0 ? iva.aPagar : iva.aFavor)}</div>
        <div class="res-sub">${iva.aPagar > 0 ? 'a pagar' : 'a favor'}</div>
      </div>
      <div class="res-op">=</div>
      <div class="res-item res-total">
        <div class="res-label">Total estimado</div>
        <div class="res-val pagar">${mxn(totalPagar)}</div>
        <div class="res-sub">ISR + IVA a pagar</div>
      </div>
    </div>
    <div class="res-nota">
      Tabla ISR RESICO Art. 113-E LISR · Verifica con tu contador antes de presentar la declaración.
      Ningún dato se almacena ni se envía a servidores.
    </div>`;
}

// ── Helpers de renderizado ────────────────────────────────────────────────────
function fila(label, amount, mod = '') {
  const cls = mod === 'sub'  ? ' sub'  :
              mod === 'bold' ? ' bold' : '';
  const prefix = mod === 'sub' ? '− ' : '';
  return `<div class="result-row${cls}">
    <span>${label}</span>
    <span class="r">${prefix}${mxn(amount)}</span>
  </div>`;
}

function totalFila(aPagar, aFavor) {
  if (aPagar > 0)
    return `<div class="result-total pagar"><span>A pagar</span><strong>${mxn(aPagar)}</strong></div>`;
  if (aFavor > 0)
    return `<div class="result-total favor"><span>A favor</span><strong>${mxn(aFavor)}</strong></div>`;
  return `<div class="result-total favor"><span>A pagar / A favor</span><strong>$0.00</strong></div>`;
}

function alerta(texto, tipo = 'warn') {
  return `<div class="inline-alerta ${tipo}">${texto}</div>`;
}

// ── Helpers de UI ─────────────────────────────────────────────────────────────
function updateBar() {
  if (!cfdis.length) { cfdiBar.classList.add('hidden'); return; }
  cfdiBar.classList.remove('hidden');
  const i = cfdis.filter(c => c.tipo === 'I').length;
  const e = cfdis.filter(c => c.tipo === 'E').length;
  const p = cfdis.filter(c => c.tipo === 'P').length;
  barCount.textContent =
    `${cfdis.length} CFDI${cfdis.length > 1 ? 's' : ''} cargado${cfdis.length > 1 ? 's' : ''}: ` +
    `${i} ingreso${i !== 1 ? 's' : ''}, ${e} egreso${e !== 1 ? 's' : ''}` +
    (p ? `, ${p} pago${p !== 1 ? 's' : ''}` : '');
}

function clearAll() {
  cfdis = [];
  clearMessages();
  updateBar();
  resultsEl.classList.add('hidden');
}

function activateTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tabId)
  );
  document.querySelectorAll('.tab-pane').forEach(p =>
    p.classList.toggle('hidden', p.id !== `tab-${tabId}`)
  );
}

let _autoHideTimers = [];

function showMsg(texto, tipo = 'info', autoHide = 0) {
  const div = document.createElement('div');
  div.className   = `msg msg-${tipo}`;
  div.textContent = texto;
  messagesEl.appendChild(div);
  if (autoHide > 0) {
    const t = setTimeout(() => div.remove(), autoHide);
    _autoHideTimers.push(t);
  }
}

function clearMessages() {
  _autoHideTimers.forEach(clearTimeout);
  _autoHideTimers = [];
  messagesEl.innerHTML = '';
}

// ── Utilidades ────────────────────────────────────────────────────────────────
const mxnFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency', currency: 'MXN', minimumFractionDigits: 2
});

function mxn(n)   { return mxnFmt.format(n); }
function uc(s)    { return (s || '').toUpperCase(); }
function sumOf(arr, key) { return arr.reduce((s, c) => s + (c[key] || 0), 0); }
function esc(s)   {
  return (s || '').replace(/[<>&"]/g, c =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]
  );
}
function nombreMes(m) {
  return ['','Enero','Febrero','Marzo','Abril','Mayo','Junio',
          'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][m];
}
