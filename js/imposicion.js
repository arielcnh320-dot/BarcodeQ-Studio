// Imposición de PDF con pdf-lib: repetir una página (step & repeat), N-up secuencial y cuadernillo.
// Las medidas llegan en milímetros; adentro se trabaja en puntos de PDF y con el origen arriba a la izquierda.

// Marcas de corte en las 4 esquinas del rectángulo de corte, hacia afuera. Medidas en puntos.
function _marcasDeCorte(pagina, altoPliego, x0, y0, x1, y1, largo, separacion) {
    const linea = (xa, ya, xb, yb) => pagina.drawLine({
        start: { x: xa, y: altoPliego - ya }, end: { x: xb, y: altoPliego - yb },
        thickness: 0.25, color: PDFLib.rgb(0, 0, 0)
    });
    for (const x of [x0, x1]) {
        linea(x, y0 - separacion, x, y0 - separacion - largo);
        linea(x, y1 + separacion, x, y1 + separacion + largo);
    }
    for (const y of [y0, y1]) {
        linea(x0 - separacion, y, x0 - separacion - largo, y);
        linea(x1 + separacion, y, x1 + separacion + largo, y);
    }
}

// Qué página va en cada lugar de cada cara del pliego. Devuelve una lista de caras; cada cara, una lista
// de índices de página (o null = lugar vacío).
function planDeCaras(modo, cantidad, columnas, filas) {
    if (modo === "booklet") {
        const total = Math.ceil(cantidad / 4) * 4; // el cuadernillo se completa con páginas en blanco
        const caras = [];
        for (let i = 0; i < total / 4; i++) {
            caras.push([total - 1 - 2 * i, 2 * i]);          // frente: última | primera
            caras.push([2 * i + 1, total - 2 - 2 * i]);      // dorso: segunda | penúltima
        }
        return caras.map(c => c.map(p => (p < cantidad ? p : null)));
    }
    const lugares = columnas * filas;
    if (modo === "nup") {
        const caras = [];
        for (let i = 0; i < cantidad; i += lugares) {
            caras.push(Array.from({ length: lugares }, (_, k) => (i + k < cantidad ? i + k : null)));
        }
        return caras;
    }
    if (modo === "step") return Array.from({ length: cantidad }, (_, i) => Array(lugares).fill(i));
    throw new Error("Modo de imposición desconocido: " + modo);
}

// opciones: modo, pliego (nombre o [ancho, alto] en mm), horizontal, columnas, filas, calle, margen, sangrado, marcas
async function imponer(bytes, opciones) {
    const { modo = "step", pliego = "A4", horizontal = false, calle = 4, margen = 10, sangrado = 0, marcas = true } = opciones;
    let { columnas = 2, filas = 2 } = opciones;
    const origen = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
    const cantidad = origen.getPageCount();
    if (!cantidad) throw new Error("El PDF no tiene páginas");

    let [anchoMm, altoMm] = Array.isArray(pliego) ? pliego : PLIEGOS[pliego];
    if (!anchoMm) throw new Error("Tamaño de pliego desconocido");
    if (horizontal || modo === "booklet") [anchoMm, altoMm] = [Math.max(anchoMm, altoMm), Math.min(anchoMm, altoMm)];
    if (modo === "booklet") { columnas = 2; filas = 1; }
    if (columnas < 1 || filas < 1) throw new Error("Columnas y filas deben ser al menos 1");

    const sw = anchoMm * MM_A_PT, sh = altoMm * MM_A_PT;
    const calleP = calle * MM_A_PT, margenP = margen * MM_A_PT, sangradoP = sangrado * MM_A_PT;
    const cw = (sw - 2 * margenP - (columnas - 1) * calleP) / columnas;
    const ch = (sh - 2 * margenP - (filas - 1) * calleP) / filas;
    if (cw <= 0 || ch <= 0) throw new Error("No entran tantas columnas/filas con ese margen y esa calle en el pliego");

    const salida = await PDFLib.PDFDocument.create();
    // pdf-lib no puede copiar una página sin ningún contenido (una página en blanco): esas quedan como lugar
    // vacío, pero ocupan su lugar en el pliego y se cuentan al armar el cuadernillo.
    const tamanos = origen.getPageIndices().map(i => origen.getPage(i).getSize());
    const conContenido = origen.getPageIndices().filter(i => origen.getPage(i).node.Contents());
    const copiadas = await salida.embedPdf(origen, conContenido);
    const incrustadas = origen.getPageIndices().map(i => (conContenido.includes(i) ? copiadas[conContenido.indexOf(i)] : null));

    for (const cara of planDeCaras(modo, cantidad, columnas, filas)) {
        const pagina = salida.addPage([sw, sh]);
        cara.forEach((nro, k) => {
            if (nro === null) return;
            const pag = incrustadas[nro], tam = tamanos[nro];
            const fila = Math.floor(k / columnas), col = k % columnas;
            const celdaX = margenP + col * (cw + calleP), celdaY = margenP + fila * (ch + calleP);
            const escala = Math.min(cw / tam.width, ch / tam.height);
            const tw = tam.width * escala, th = tam.height * escala;
            const x = celdaX + (cw - tw) / 2, y = celdaY + (ch - th) / 2; // esquina superior izquierda
            if (pag) pagina.drawPage(pag, { x, y: sh - (y + th), width: tw, height: th });
            if (marcas) {
                _marcasDeCorte(pagina, sh, x + sangradoP, y + sangradoP, x + tw - sangradoP, y + th - sangradoP,
                    3 * MM_A_PT, Math.max(sangradoP, 2 * MM_A_PT));
            }
        });
    }
    return salida.save();
}
