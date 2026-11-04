// Manejo de archivos JPEG y PDF: imágenes → PDF, PDF → JPEG, unir PDF e insertar un código en un PDF.

// Orientación EXIF de un JPEG (1 = normal). Los celulares guardan la foto "de costado" con esta marca.
function orientacionExif(bytes) {
    if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return 1;
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let pos = 2;
    while (pos + 4 < v.byteLength) {
        if (v.getUint8(pos) !== 0xFF) break;
        const marca = v.getUint8(pos + 1), largo = v.getUint16(pos + 2);
        if (marca === 0xE1 && v.getUint32(pos + 4) === 0x45786966) { // "Exif"
            const tiff = pos + 10, little = v.getUint16(tiff) === 0x4949;
            const ifd = tiff + v.getUint32(tiff + 4, little);
            const n = v.getUint16(ifd, little);
            for (let i = 0; i < n; i++) {
                const e = ifd + 2 + i * 12;
                if (e + 12 <= v.byteLength && v.getUint16(e, little) === 0x0112) return v.getUint16(e + 8, little);
            }
            return 1;
        }
        pos += 2 + largo;
    }
    return 1;
}

// Prepara una imagen para pdf-lib: JPEG y PNG se usan tal cual (sin perder calidad); el resto, o un JPEG
// con rotación EXIF, se redibuja en un canvas.
async function _imagenParaPdf(doc, archivo) {
    const bytes = await leerBytes(archivo);
    const esJpeg = bytes[0] === 0xFF && bytes[1] === 0xD8;
    const esPng = bytes[0] === 0x89 && bytes[1] === 0x50;
    if (esJpeg && orientacionExif(bytes) <= 1) return doc.embedJpg(bytes);
    if (esPng) return doc.embedPng(bytes);
    const canvas = await imagenACanvas(archivo); // createImageBitmap ya aplica la rotación EXIF
    return doc.embedJpg(new Uint8Array(await (await canvasABlob(canvas, "image/jpeg", 0.95)).arrayBuffer()));
}

// pagina: "fit" (la página toma el tamaño de la imagen según dpi) o "A4"
async function imagenesAPdf(archivos, { pagina = "fit", margen = 0, dpi = 300 } = {}) {
    if (!archivos.length) throw new Error("Elegí al menos una imagen");
    const doc = await PDFLib.PDFDocument.create();
    const m = margen * MM_A_PT;
    for (const archivo of archivos) {
        const img = await _imagenParaPdf(doc, archivo);
        let pw, ph;
        if (pagina === "A4") [pw, ph] = img.width >= img.height ? [841.89, 595.28] : [595.28, 841.89];
        else [pw, ph] = [img.width * 72 / dpi + 2 * m, img.height * 72 / dpi + 2 * m];
        const p = doc.addPage([pw, ph]);
        const escala = Math.min((pw - 2 * m) / img.width, (ph - 2 * m) / img.height);
        const w = img.width * escala, h = img.height * escala;
        p.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    }
    return doc.save();
}

// Devuelve { blob, nombre }: un JPEG si el PDF tiene una página, o un ZIP con todas
async function pdfAJpeg(bytes, nombreOriginal, { dpi = 200, calidad = 90 } = {}, alAvanzar) {
    const pdf = await abrirPdfJs(bytes);
    const paginas = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        if (alAvanzar) alAvanzar(i, pdf.numPages);
        paginas.push(await canvasABlob(await paginaACanvas(await pdf.getPage(i), dpi), "image/jpeg", calidad / 100));
    }
    const base = nombreBase(nombreOriginal);
    if (paginas.length === 1) return { blob: paginas[0], nombre: `${base}.jpg` };
    const zip = new JSZip();
    const cifras = String(paginas.length).length;
    paginas.forEach((b, i) => zip.file(`${base}-${String(i + 1).padStart(cifras, "0")}.jpg`, b));
    return { blob: await zip.generateAsync({ type: "blob" }), nombre: `${base}.zip` };
}

async function unirPdfs(archivos) {
    if (archivos.length < 2) throw new Error("Elegí al menos dos PDF");
    const salida = await PDFLib.PDFDocument.create();
    for (const a of archivos) {
        const doc = await PDFLib.PDFDocument.load(await leerBytes(a), { ignoreEncryption: true });
        (await salida.copyPages(doc, doc.getPageIndices())).forEach(p => salida.addPage(p));
    }
    return salida.save();
}

// Pone un QR o código de barras en el PDF. x e y son la esquina superior izquierda, en mm desde arriba.
async function insertarCodigoEnPdf(bytes, { tipo, dato, x, y, ancho, paginas = "all" }) {
    const codigo = await generarCodigoPNG(tipo, dato);
    const doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
    const png = await doc.embedPng(new Uint8Array(await codigo.blob.arrayBuffer()));
    const w = ancho * MM_A_PT, h = w * png.height / png.width;
    doc.getPages().forEach((p, i) => {
        if (paginas === "first" && i > 0) return;
        p.drawImage(png, { x: x * MM_A_PT, y: p.getHeight() - y * MM_A_PT - h, width: w, height: h });
    });
    return doc.save();
}
