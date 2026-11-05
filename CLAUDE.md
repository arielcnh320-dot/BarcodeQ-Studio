# Barcode Studio

App web (PWA) para generar y leer códigos de barras y QR, hacer imposición de PDF y manejar archivos JPEG y PDF: `index.html` (la página) + `css/estilos.css` + el código en `js/` + `lib/` (librerías) + `sw.js` (copia sin conexión).
**Todo se procesa en el navegador**: no hay servidor, base de datos, cuentas ni claves, y la app no pide nada a sitios de afuera (las librerías están en `lib/`). Los archivos de la persona nunca salen de su equipo.
Tiene la misma estructura que `konica-minolta-extractor` (index + css + js por tema sin módulos + sw.js + manifest + pruebas con Playwright).

## Forma de trabajo con el usuario
- El usuario no es técnico en programación: explicar en español simple, paso a paso.
- Mandar los archivos cambiados (`index.html`, `js/…`, `css/…`) para revisar antes de subir. Hacer commit y push **solo** cuando diga "subilo".
- Nunca pedir claves ni contraseñas por el chat.
- Cada vez que se sube un cambio de la app (`index.html`, `js/`, `css/` o `lib/`), actualizar `VERSION_APP` (fecha y número del día, ej. `2026.11.04-2`). Está en `index.html` y tiene que quedar ahí: la app compara su versión con la del `index.html` publicado y, si hay una nueva, muestra el botón "🔄 Actualizar app".

## Archivos de la app
`index.html` tiene la página (pestañas, formularios) y `VERSION_APP`; los estilos están en `css/estilos.css` y el código en `js/`, repartido por tema. Sin módulos: todos los archivos comparten las mismas funciones y variables.

| Archivo | Qué tiene |
|---|---|
| `js/constantes_y_textos.js` | `TIPOS_BARRAS`, `PLIEGOS` (tamaños en mm), `MODOS_IMPOSICION`, `MM_A_PT` |
| `js/datos.js` | utilidades: lo guardado en el equipo (`guardarPref`/`leerPref`), lectura de formularios (`numero`, `texto`, `marcado`), `descargar`, `canvasABlob`, `crearCanvas` |
| `js/csv.js` | `leerArchivoCSV`, `parsearCSV`, `decodificarCSV`, `detectarSeparador` (CSV de Excel: `;`, comillas, acentos en windows-1252) |
| `js/codigos.js` | `generarQR`, `generarBarras` (PNG, JPEG, SVG) y `generarCodigoPNG` |
| `js/lectura.js` | `leerCodigos` (imagen o PDF), `leerCodigosDeCanvas` (varios códigos por imagen: reintenta a menor escala y recorre la hoja por franjas y ventanas), `abrirPdfJs`, `paginaACanvas`, `imagenACanvas` |
| `js/imposicion.js` | `imponer` (step & repeat, N-up, cuadernillo, marcas de corte) y `planDeCaras` |
| `js/etiquetas.js` | `generarEtiquetas` (una etiqueta por fila de un CSV, ordenadas en hojas), `grillaDeEtiquetas`, `registrosDeCSV` |
| `js/pdf_jpeg.js` | `imagenesAPdf`, `pdfAJpeg` (JPEG o ZIP), `unirPdfs`, `insertarCodigoEnPdf`, `orientacionExif` |
| `js/eventos.js` | `ACCIONES` (una por formulario, `data-accion` en `index.html`), vista previa y descarga del resultado, pestañas |
| `js/inicio.js` | versión, service worker, botón "Instalar app" y aviso de versión nueva |

- Se cargan **en el orden** de `index.html`: al cargarse, un archivo solo puede usar lo de los anteriores. `eventos.js` e `inicio.js` van al final. La prueba `archivos` lo revisa.
- Archivo nuevo en `js/`: agregar su `<script src>` en `index.html` en el lugar que corresponda y la misma ruta en `PRECARGA` de `sw.js` (mismo orden), y cambiar `VERSION` en `sw.js`.
- Pestaña nueva: agregar una `<section class="vista" data-titulo="…">` con un `<form data-accion="nombre">` y su función en `ACCIONES` de `eventos.js` (devuelve `{ imagen | pdf | archivo | texto, nombre }`). La barra de pestañas se arma sola.

## Librerías (carpeta `lib/`)
Copias locales con versión fija (la app funciona sin conexión y sin depender de un CDN): `pdf-lib` 1.17.1 (armar y modificar PDF), `pdfjs-dist` 3.11.174 (mostrar y leer páginas de PDF; `pdf.worker.min.js` es su worker), `jsbarcode` 3.11.6 (códigos de barras), `qrcode-generator` 1.4.4 (QR), `jszip` 3.10.1 (ZIP de JPEG), `@zxing/library` 0.21.3 (leer códigos).
- Actualizarlas: `bash herramientas/actualizar_librerias.sh`, correr las pruebas, subir `VERSION_APP` y `VERSION` de `sw.js`.
- Un archivo de `lib/` nuevo va en `index.html` (`<script src>`) y en `PRECARGA` de `sw.js`.
- `pdf.js` se usa con `isEvalSupported: false` (la política de seguridad no permite `eval`).

## Seguridad
- `_headers` (Netlify): `default-src 'self'`. La app no usa ningún sitio externo. Si empieza a usar uno (otra librería de un CDN, un servicio), agregarlo en `script-src` / `connect-src`; la prueba `archivos` falla si la app pide algo afuera.
- No hay datos personales ni cuentas. Lo único guardado en el equipo es la última pestaña usada (`bs_pestana`, localStorage).

## Lo que hace cada pestaña y sus límites
- **Código de barras**: Code 128, Code 39, EAN-13/8, UPC-A, ITF, ITF-14, Codabar, MSI y Pharmacode. Medidas en mm; los EAN/UPC calculan solos el dígito verificador. Un dato inválido muestra el error con un ejemplo.
- **QR**: texto UTF-8 (ñ, tildes, emojis), 4 niveles de corrección, colores propios.
- **Leer códigos**: QR y barras en JPEG/PNG o en todas las páginas de un PDF (a 200 dpi); varios códigos por imagen, incluso una hoja llena de etiquetas (24 de 24 a 150, 200 y 300 dpi). ZXing tiene límites que se resolvieron así: a tamaño completo falla con muchos códigos juntos o con uno chico en una hoja grande, y los códigos de barras solo se leen si la imagen que mira mide menos de ~600 px de alto. Por eso, si hay una imagen grande, se suman reintentos a menor escala, otro método de blanco y negro y un recorrido por franjas horizontales (para barras) y ventanas superpuestas (para QR), tapando de blanco cada código leído. Tarda ~2-3 s por página. Limitaciones: con resoluciones muy bajas (menos de ~120 dpi) puede no leer, y con "dibujar contorno" activado en una hoja de etiquetas a veces no encuentra todos los códigos de barras de la hoja entera (cada etiqueta por separado sí se lee).
- **Etiquetas (CSV)**: una etiqueta por fila de un CSV (Excel en español: `;`, acentos en formato Windows, con o sin fila de títulos). Se elige la columna del código y la del texto, el tipo (QR o barras), el tamaño de la etiqueta, el pliego, el margen y el espacio entre etiquetas; la app calcula cuántas entran por hoja. La grilla empieza en el margen de arriba a la izquierda (como una hoja de etiquetas adhesivas: ajustar margen y espacio a la hoja que se use). Copias por etiqueta, texto debajo (se achica si es largo; lo que no existe en Latin-1, como emojis, sale como `?`), contorno opcional como guía de corte. Máximo 20.000 etiquetas; un dato inválido dice en qué fila del archivo está.
- **Imposición**: repetir página, N-up, cuadernillo (8 páginas → 8|1, 2|7, 6|3, 4|5; se completa a múltiplos de 4; siempre apaisado), pliegos A5/A4/A3/SRA3/Carta/Tabloide o medida propia, calle, margen, sangrado y marcas de corte.
  - No convierte colores (CMYK), no hace trapping ni marcas de registro/barras de color. En el cuadernillo el dorso no se espeja (el orden de páginas sí es el de un duplex "voltear por el borde corto").
- **JPEG → PDF**: los JPEG/PNG entran sin recomprimir; un JPEG con rotación EXIF (fotos de celular) se redibuja para que quede derecho.
- **PDF → JPEG**: una página = un `.jpg`; varias = un `.zip`.
- **Unir PDF** y **Código en PDF** (QR o barras en una posición en mm medida desde arriba a la izquierda).
- Un PDF protegido con contraseña no se puede abrir (pdf-lib se abre con `ignoreEncryption`, pdf.js no).

## Herramientas (carpeta `herramientas/`)
- `actualizar_librerias.sh`: ver arriba.
- `hacer_iconos.py`: rehace los íconos de `icons/`: `python3 -I herramientas/hacer_iconos.py icons` (necesita Pillow).

### Pruebas de la app (carpeta `pruebas/`)
`node pruebas/correr.js` arranca un servidor local con los mismos encabezados que Netlify y corre todas las pruebas (Playwright); termina con un resumen y falla si alguna falla. Para correr una sola: `node pruebas/correr.js imposicion`. **Correrlas siempre antes de subir un cambio de la app.**
- `archivos`: están todos los archivos de `js/`, `lib/` y `css/` (y en la copia sin conexión de `sw.js`, en el mismo orden), `VERSION_APP` sigue en `index.html`, la app abre sin errores y sin pedir nada afuera, y abre sin conexión.
- `codigos`: cada QR y cada tipo de código de barras se genera y se vuelve a leer igual; errores claros; varios códigos en una imagen.
- `imposicion`: cantidad y tamaño de pliegos, orden del cuadernillo, escala de la página, marcas de corte y errores.
- `etiquetas`: lectura del CSV (separadores, comillas, BOM, windows-1252), grilla de etiquetas por hoja, generación y relectura de las etiquetas (QR y barras, hoja llena a varias resoluciones), copias, textos raros y errores claros con el número de fila.
- `pdf_jpeg`: imágenes → PDF (tamaños, sin recomprimir), rotación EXIF, PDF → JPEG/ZIP, unir, y códigos insertados (se leen en el PDF resultante y quedan en la posición pedida).
- `pestanas`: las 9 pestañas, generar y descargar, leer lo descargado, mensajes de error, imposición por pantalla, etiquetas desde un CSV de Excel por pantalla (columnas, resumen, copias, error con número de fila, CSV de ejemplo), última pestaña recordada y que no haya scroll horizontal en un celular (375 px).
- No usan archivos de clientes: todo se arma dentro de la prueba.
- Al cambiar algo de la app, agregar o ajustar la prueba que corresponda. Comprobar que una prueba nueva falle de verdad rompiendo a propósito lo que cuida (y restaurar).

## Publicar
Es una carpeta de archivos estáticos: se sube tal cual a Netlify (u otro hosting estático). También se puede abrir `index.html` con doble clic, pero sin servidor no se instala como app ni guarda la copia sin conexión (los service workers necesitan http/https).
