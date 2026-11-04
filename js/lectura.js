// Lectura de códigos QR y de barras en imágenes y PDF (librería ZXing + pdf.js para las páginas del PDF).

if (typeof pdfjsLib !== "undefined") pdfjsLib.GlobalWorkerOptions.workerSrc = "lib/pdf.worker.min.js";

function _lectorZXing() {
    const hints = new Map();
    hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
    const lector = new ZXing.MultiFormatReader();
    lector.setHints(hints);
    return lector;
}

// Lee un código de un canvas; devuelve null si no hay ninguno. Prueba dos formas de pasar la imagen a blanco y negro:
// la local (mejor con sombras o fondos desparejos) y la global (mejor con imágenes suavizadas de un PDF).
function _leerUno(canvas) {
    for (const Binarizador of [ZXing.HybridBinarizer, ZXing.GlobalHistogramBinarizer]) {
        try {
            const fuente = new ZXing.HTMLCanvasElementLuminanceSource(canvas);
            return _lectorZXing().decode(new ZXing.BinaryBitmap(new Binarizador(fuente)));
        } catch (e) { /* NotFoundException u otro: probar con el otro método */ }
    }
    return null;
}

const FORMATOS_2D = ["QR_CODE", "DATA_MATRIX", "AZTEC", "PDF_417", "MAXICODE"];

// Tapa de blanco el código que se acaba de leer, para poder buscar otros en la misma imagen.
// Un código 2D ocupa el rectángulo de sus puntos. En uno de barras los puntos son solo una línea a lo ancho:
// el alto se busca hacia arriba y abajo hasta el primer espacio en blanco.
function _taparCodigo(ctx, canvas, formato, puntos) {
    const xs = puntos.map(p => p.getX()), ys = puntos.map(p => p.getY());
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const margen = Math.max(12, (x1 - x0) * 0.1);
    let y0 = Math.min(...ys), y1 = Math.max(...ys);
    if (!FORMATOS_2D.includes(formato)) {
        const ancho = Math.max(1, Math.min(canvas.width, Math.round(x1 + margen)) - Math.max(0, Math.round(x0 - margen)));
        const izq = Math.max(0, Math.round(x0 - margen));
        const hayTinta = y => {
            if (y < 0 || y >= canvas.height) return false;
            const d = ctx.getImageData(izq, y, ancho, 1).data;
            for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 384) return true;
            return false;
        };
        const hueco = Math.max(6, Math.round(canvas.height * 0.01)); // filas vacías seguidas que cortan el código
        for (const paso of [-1, 1]) {
            let y = Math.round(paso < 0 ? y0 : y1), vacias = 0, limite = y;
            while (y >= 0 && y < canvas.height && vacias < hueco) {
                y += paso;
                if (hayTinta(y)) { vacias = 0; limite = y; } else vacias++;
            }
            if (paso < 0) y0 = limite; else y1 = limite;
        }
    }
    ctx.fillStyle = "#fff";
    ctx.fillRect(x0 - margen, y0 - margen, x1 - x0 + 2 * margen, y1 - y0 + 2 * margen);
}

// Una pasada completa sobre un canvas: lee un código, lo tapa de blanco y vuelve a buscar.
function _leerTodosEnCanvas(canvasOriginal, escala, maximo) {
    const canvas = crearCanvas(canvasOriginal.width * escala, canvasOriginal.height * escala);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(canvasOriginal, 0, 0, canvas.width, canvas.height);
    const encontrados = [];
    for (let i = 0; i < maximo; i++) {
        const r = _leerUno(canvas);
        if (!r) break;
        const formato = ZXing.BarcodeFormat[r.getBarcodeFormat()];
        encontrados.push({ tipo: formato, texto: r.getText() });
        const puntos = r.getResultPoints() || [];
        if (!puntos.length) break;
        _taparCodigo(ctx, canvas, formato, puntos);
    }
    return encontrados;
}

// Devuelve todos los códigos de un canvas. Con imágenes grandes o suavizadas (un PDF pasado a imagen) el lector
// a veces falla a tamaño completo, así que si no encuentra nada se reintenta a escalas menores.
const ESCALAS_DE_LECTURA = [1, 0.75, 0.6, 0.5, 0.4, 0.3, 0.25];
function leerCodigosDeCanvas(canvas, maximo = 20) {
    for (const escala of ESCALAS_DE_LECTURA) {
        if (escala < 1 && Math.max(canvas.width, canvas.height) * escala < 250) break; // ya quedaría demasiado chica
        const r = _leerTodosEnCanvas(canvas, escala, maximo);
        if (r.length) return r;
    }
    return [];
}

async function imagenACanvas(archivoOBlob) {
    const bmp = await createImageBitmap(archivoOBlob);
    const canvas = crearCanvas(bmp.width, bmp.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0);
    bmp.close && bmp.close();
    return canvas;
}

async function abrirPdfJs(bytes) {
    // Se pasa una copia: pdf.js se queda con el arreglo que recibe
    return pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
}

async function paginaACanvas(pagina, dpi) {
    const vista = pagina.getViewport({ scale: dpi / 72 });
    const canvas = crearCanvas(vista.width, vista.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pagina.render({ canvasContext: ctx, viewport: vista }).promise;
    return canvas;
}

// Imagen (JPEG, PNG…) o PDF → lista { pagina, tipo, texto }
async function leerCodigos(archivo, alAvanzar) {
    const bytes = await leerBytes(archivo);
    const esPdf = extension(archivo.name) === "pdf" || archivo.type === "application/pdf";
    const resultados = [];
    if (esPdf) {
        const pdf = await abrirPdfJs(bytes);
        for (let i = 1; i <= pdf.numPages; i++) {
            if (alAvanzar) alAvanzar(i, pdf.numPages);
            const canvas = await paginaACanvas(await pdf.getPage(i), 200);
            leerCodigosDeCanvas(canvas).forEach(r => resultados.push({ pagina: i, ...r }));
        }
    } else {
        leerCodigosDeCanvas(await imagenACanvas(archivo)).forEach(r => resultados.push({ pagina: 1, ...r }));
    }
    return resultados;
}
