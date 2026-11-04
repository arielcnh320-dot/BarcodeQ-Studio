// Generación de códigos QR (librería qrcode-generator) y de barras (JsBarcode). Todo en el navegador.
// Devuelven { blob, formato } con formato "png", "jpg" o "svg".

function _moduloQR(texto, nivel) {
    qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"]; // para que entren ñ, tildes y emojis
    const qr = qrcode(0, NIVELES_QR[nivel] || "M");
    qr.addData(texto, "Byte");
    qr.make();
    return qr;
}

async function generarQR(contenido, { formato = "png", caja = 10, margen = 4, nivel = "M", color = "#000000", fondo = "#ffffff" } = {}) {
    if (!contenido) throw new Error("Falta el contenido del QR");
    const qr = _moduloQR(contenido, nivel);
    const n = qr.getModuleCount();
    const lado = n + 2 * margen;
    if (formato === "svg") {
        let trazo = "";
        for (let f = 0; f < n; f++) {
            for (let c = 0; c < n; c++) if (qr.isDark(f, c)) trazo += `M${c + margen} ${f + margen}h1v1h-1z`;
        }
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" width="${lado * caja}" height="${lado * caja}" shape-rendering="crispEdges">` +
            `<rect width="${lado}" height="${lado}" fill="${fondo}"/><path d="${trazo}" fill="${color}"/></svg>`;
        return { blob: new Blob([svg], { type: "image/svg+xml" }), formato };
    }
    const canvas = crearCanvas(lado * caja, lado * caja);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = fondo;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color;
    for (let f = 0; f < n; f++) {
        for (let c = 0; c < n; c++) if (qr.isDark(f, c)) ctx.fillRect((c + margen) * caja, (f + margen) * caja, caja, caja);
    }
    return { blob: await canvasABlob(canvas, tipoMime(formato), 0.95), formato };
}

// Medidas en milímetros: modulo = ancho de la barra más fina, alto = altura de las barras.
async function generarBarras(tipo, dato, { formato = "png", dpi = 300, modulo = 0.33, alto = 15, mostrarTexto = true } = {}) {
    const def = TIPOS_BARRAS.find(t => t.id === tipo);
    if (!def) throw new Error("Tipo de código no soportado: " + tipo);
    if (!dato) throw new Error("Falta el contenido del código");
    // En imagen, la unidad es el píxel; en SVG usamos 10 unidades por milímetro.
    const pxPorMm = formato === "svg" ? 10 : dpi / 25.4;
    const opciones = {
        format: def.formato,
        width: formato === "svg" ? modulo * pxPorMm : Math.max(1, Math.round(modulo * pxPorMm)),
        height: alto * pxPorMm,
        displayValue: mostrarTexto,
        fontSize: 2.8 * pxPorMm,
        textMargin: 0.6 * pxPorMm,
        margin: 2.5 * pxPorMm,
        background: "#ffffff",
        lineColor: "#000000"
    };
    try {
        if (formato === "svg") {
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            JsBarcode(svg, dato, opciones);
            svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
            return { blob: new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }), formato };
        }
        const canvas = document.createElement("canvas");
        JsBarcode(canvas, dato, opciones);
        return { blob: await canvasABlob(canvas, tipoMime(formato), 0.95), formato };
    } catch (e) {
        // JsBarcode avisa los datos inválidos tirando un texto (no un Error)
        const mensaje = typeof e === "string" ? e : (e && e.message) || "";
        if (/not a valid input|is not valid/i.test(mensaje)) {
            throw new Error(`"${dato}" no es válido para ${def.nombre.split(" (")[0]}. Ejemplo: ${def.ejemplo}`);
        }
        throw typeof e === "string" ? new Error(e) : e;
    }
}

// Código listo para pegar en un PDF o en una imagen (siempre PNG)
function generarCodigoPNG(tipo, dato) {
    return tipo === "qr" ? generarQR(dato, { formato: "png", caja: 12 }) : generarBarras(tipo, dato, { formato: "png", dpi: 300 });
}
