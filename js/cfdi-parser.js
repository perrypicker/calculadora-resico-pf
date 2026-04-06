'use strict';

/**
 * Parsea un archivo XML de CFDI (versión 3.3 y 4.0).
 * Retorna null para nóminas (N) y traslados (T) — se ignoran.
 */
function parseCFDI(xmlText, filename) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');

  if (doc.querySelector('parsererror'))
    throw new Error('XML malformado');

  const ns   = '*';
  const get  = (parent, localName) => parent.getElementsByTagNameNS(ns, localName)[0] ?? null;
  const attr = (el, a) => el?.getAttribute(a) ?? '';
  const num  = (el, a) => parseFloat(el?.getAttribute(a) ?? '0') || 0;

  const comp = get(doc, 'Comprobante');
  if (!comp) throw new Error('No es un CFDI válido (falta elemento Comprobante)');

  const tipo = attr(comp, 'TipoDeComprobante');

  // Ignorar nóminas y traslados
  if (tipo === 'N' || tipo === 'T') return null;

  const moneda     = attr(comp, 'Moneda') || 'MXN';
  const tipoCambio = (moneda !== 'MXN' && moneda !== 'XXX')
                     ? (parseFloat(attr(comp, 'TipoCambio')) || 1) : 1;

  const emisor   = get(comp, 'Emisor');
  const receptor = get(comp, 'Receptor');
  const timbre   = get(doc, 'TimbreFiscalDigital');

  // Impuestos del comprobante (nodo directo hijo de Comprobante, no de Concepto)
  let ivaTraslado = 0;
  let isrRetenido = 0;
  let ivaRetenido = 0;

  for (const impNode of comp.getElementsByTagNameNS(ns, 'Impuestos')) {
    if (impNode.parentNode?.localName !== 'Comprobante') continue;

    for (const t of impNode.getElementsByTagNameNS(ns, 'Traslado')) {
      if (attr(t, 'Impuesto') === '002')
        ivaTraslado += parseFloat(attr(t, 'Importe')) || 0;
    }
    for (const r of impNode.getElementsByTagNameNS(ns, 'Retencion')) {
      const imp = attr(r, 'Impuesto');
      const val = parseFloat(attr(r, 'Importe')) || 0;
      if (imp === '001') isrRetenido += val;
      if (imp === '002') ivaRetenido += val;
    }
  }

  const fx = tipoCambio;
  const r2 = n => Math.round(n * fx * 100) / 100;

  return {
    uuid:          attr(timbre, 'UUID') || `${filename}|${Date.now()}|${Math.random()}`,
    filename,
    tipo,
    fecha:         attr(comp, 'Fecha'),           // ISO: 2024-01-15T12:00:00
    serie:         attr(comp, 'Serie'),
    folio:         attr(comp, 'Folio'),
    moneda,
    tipoCambio,
    subtotal:      r2(num(comp, 'SubTotal')),
    total:         r2(num(comp, 'Total')),
    rfcEmisor:     attr(emisor,   'Rfc'),
    nombreEmisor:  attr(emisor,   'Nombre') || attr(emisor,   'Rfc'),
    rfcReceptor:   attr(receptor, 'Rfc'),
    nombreReceptor:attr(receptor, 'Nombre') || attr(receptor, 'Rfc'),
    ivaTraslado:   r2(ivaTraslado),
    isrRetenido:   r2(isrRetenido),
    ivaRetenido:   r2(ivaRetenido),
  };
}
