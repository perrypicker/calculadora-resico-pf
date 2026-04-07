# Calculadora RESICO PF

Herramienta web para calcular el **pago provisional mensual de ISR e IVA** bajo el Régimen Simplificado de Confianza (RESICO) para personas físicas en México. Funciona completamente en el navegador: no requiere servidor, no almacena datos y no envía información a ningún servicio externo.

---

## Características

- Carga de CFDIs en XML mediante arrastrar y soltar o selección de archivos
- Compatible con CFDI versión 3.3 y 4.0
- Cálculo de ISR provisional con tabla de tasas Art. 113-E LISR (RESICO PF)
- Cálculo de IVA: causado, acreditable y retenido
- Soporte para notas de crédito (tipo E) emitidas y recibidas
- Detección y aviso de Complementos de Pago (tipo P)
- Conversión automática de CFDIs en moneda extranjera a MXN
- Deduplicación de CFDIs por UUID
- Filtro por mes y año
- Sin instalación, sin backend, sin cookies, sin almacenamiento persistente

---

## Cómo usarla

1. Abre `index.html` directamente en tu navegador (no se requiere servidor web).
2. Ingresa tu **RFC** en el campo correspondiente.
3. Selecciona el **mes y año** del período que deseas calcular.
4. Arrastra y suelta tus archivos XML de CFDI en la zona indicada, o haz clic para seleccionarlos. Puedes cargar en una sola operación tanto los CFDIs que tú **emitiste** (ingresos) como los que **recibiste** (gastos).
5. Los resultados se actualizan automáticamente.

### Qué archivos cargar

| Tipo de CFDI | Quién es el emisor | Para qué sirve |
|---|---|---|
| Ingreso (I) emitido por ti | Tu RFC | Base del ISR y del IVA causado |
| Ingreso (I) recibido por ti | RFC de tu proveedor | IVA acreditable |
| Egreso (E) emitido por ti | Tu RFC | Nota de crédito: reduce base ISR e IVA causado |
| Egreso (E) recibido por ti | RFC de tu proveedor | Nota de crédito: reduce IVA acreditable |

Los CFDIs de **nómina (N)** y **traslado (T)** se ignoran automáticamente.

---

## Cómo está construida

La aplicación es HTML, CSS y JavaScript vanilla sin dependencias externas ni proceso de compilación.

```
calculadora-resico-pf/
├── index.html              # Estructura y punto de entrada
├── css/
│   └── styles.css          # Estilos
└── js/
    ├── cfdi-parser.js      # Parseo de XML (CFDI 3.3 y 4.0)
    ├── tax-calculator.js   # Lógica de cálculo de ISR e IVA
    └── app.js              # Interfaz, drag & drop y renderizado
```

### cfdi-parser.js

Utiliza la API `DOMParser` del navegador para leer los archivos XML. Extrae los campos relevantes del nodo `Comprobante` y sus hijos (`Emisor`, `Receptor`, `TimbreFiscalDigital`, `Impuestos`), manejando ambas versiones de CFDI mediante `getElementsByTagNameNS` con namespace comodín. Retorna `null` para tipos ignorados (N, T).

### tax-calculator.js

Contiene dos funciones puras:

- **`calcISR(ingresosBrutos, notasCredito, isrRetenido)`** — aplica la tabla de tasas planas del Art. 113-E LISR sobre la base neta del mes y resta el ISR retenido por clientes.
- **`calcIVA(causado, acreditable, retenido)`** — calcula el IVA neto a pagar o a favor.

La tabla de tasas mensuales se deriva de los límites anuales oficiales divididos entre 12:

| Ingresos mensuales | Tasa |
|---|---|
| Hasta $25,000 | 1.00% |
| Hasta $50,000 | 1.10% |
| Hasta $83,333 | 1.50% |
| Hasta $208,333 | 2.00% |
| Hasta $291,667 | 2.50% |

### app.js

Gestiona el estado de los CFDIs cargados, el drag & drop, la clasificación de comprobantes por RFC y período, y el renderizado de tablas y paneles de resultado. El RFC se guarda en `sessionStorage` para comodidad dentro de la misma sesión del navegador y se descarta al cerrar la pestaña.

---

## Limitaciones conocidas

- **Complementos de Pago (tipo P):** no se incluyen en el cálculo automático. Si reconoces ingresos en el período de cobro (base de efectivo), revisa estos CFDIs con tu contador.
- **ISR cedular estatal (2%):** se muestra como parte del total de ISR retenido en los CFDIs. No se acredita contra el ISR federal; es un impuesto estatal independiente.
- **Gastos deducibles para IVA:** la aplicación incluye todos los CFDIs de egreso recibidos. Solo son acreditables los gastos estrictamente relacionados con tu actividad. Verifica la procedencia de cada deducción con tu contador.
- **Un solo RFC:** la herramienta calcula para un RFC a la vez. Si tienes socios o razones sociales distintas, deberás usar la app por separado para cada una.

---

## Disclaimer

> **Esta aplicación es únicamente para fines informativos y de referencia.**
>
> Los cálculos que genera son estimaciones basadas en la información contenida en los CFDIs que el usuario proporciona y en la tabla de tasas vigente al momento del desarrollo. No constituyen una declaración fiscal oficial, ni sustituyen el asesoramiento de un contador público o de cualquier otro profesional fiscal autorizado.
>
> El autor no asume responsabilidad alguna por errores en los cálculos, por cambios en la legislación fiscal que no se hayan incorporado a la herramienta, ni por cualquier decisión tomada con base en los resultados que esta aplicación muestre.
>
> Antes de presentar cualquier declaración ante el SAT, verifica los resultados con tu contador.
