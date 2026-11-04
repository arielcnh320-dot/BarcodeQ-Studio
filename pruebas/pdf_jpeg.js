// Archivos JPEG y PDF: imágenes → PDF, PDF → JPEG, unir PDF, código dentro de un PDF y lectura de la rotación EXIF.
const { prueba, fin, abrirApp, crearPdfDePrueba } = require('./comun');

(async () => {
    const { navegador, pagina, errores } = await abrirApp();
    const ev = (f, arg) => pagina.evaluate(f, arg);

    // Una imagen de prueba (JPEG o PNG) de ancho × alto, de color liso
    await ev(() => {
        window.imagenDePrueba = async (w, h, tipo = 'image/jpeg', color = '#c33') => {
            const c = crearCanvas(w, h); const x = c.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, w, h);
            return new File([await canvasABlob(c, tipo, 0.9)], tipo === 'image/png' ? 'a.png' : 'a.jpg', { type: tipo });
        };
        window.medidas = async bytes => (await PDFLib.PDFDocument.load(bytes)).getPages().map(p => p.getSize()).map(s => [+s.width.toFixed(1), +s.height.toFixed(1)]);
    });

    let m = await ev(async () => medidas(await imagenesAPdf([await imagenDePrueba(300, 200), await imagenDePrueba(100, 100, 'image/png')], { pagina: 'fit', dpi: 300 })));
    prueba('JPEG + PNG → PDF de 2 páginas del tamaño de la imagen (300 dpi: 300 px = 72 pt)', JSON.stringify(m) === '[[72,48],[24,24]]', JSON.stringify(m));
    m = await ev(async () => medidas(await imagenesAPdf([await imagenDePrueba(300, 200), await imagenDePrueba(200, 300)], { pagina: 'A4' })));
    prueba('con página A4 elige vertical u horizontal según la foto', JSON.stringify(m) === '[[841.9,595.3],[595.3,841.9]]', JSON.stringify(m));
    m = await ev(async () => medidas(await imagenesAPdf([await imagenDePrueba(300, 300)], { pagina: 'fit', dpi: 300, margen: 10 })));
    prueba('el margen agranda la página (72 pt + 2×10 mm)', Math.abs(m[0][0] - (72 + 2 * 10 * 72 / 25.4)) < 0.2, JSON.stringify(m));
    const sinImg = await ev(async () => { try { await imagenesAPdf([]); return null; } catch (e) { return e.message; } });
    prueba('sin imágenes da un error claro', /al menos una/.test(sinImg || ''), sinImg);

    const jpgIntacto = await ev(async () => {
        const f = await imagenDePrueba(200, 100);
        const original = new Uint8Array(await f.arrayBuffer());
        const doc = await PDFLib.PDFDocument.load(await imagenesAPdf([f]));
        // El JPEG original debe estar dentro del PDF sin recomprimir
        const pdfBytes = await doc.save({ useObjectStreams: false });
        const buscar = (g, a) => { outer: for (let i = 0; i < g.length - a.length; i++) { for (let j = 0; j < 64; j++) if (g[i + j] !== a[j]) continue outer; return true; } return false; };
        return buscar(pdfBytes, original);
    });
    prueba('el JPEG entra al PDF sin recomprimirlo (sin perder calidad)', jpgIntacto);

    const exif = await ev(() => {
        const tiff = [0x49, 0x49, 0x2A, 0, 8, 0, 0, 0, 1, 0, 0x12, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0];
        const cuerpo = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
        const largo = cuerpo.length + 2;
        const bytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE1, largo >> 8, largo & 255, ...cuerpo, 0xFF, 0xD9]);
        return [orientacionExif(bytes), orientacionExif(new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9])), orientacionExif(new Uint8Array([1, 2, 3]))];
    });
    prueba('lee la rotación EXIF de un JPEG (6 = girado), y 1 si no tiene', exif.join() === '6,1,1', exif.join());

    const unida = await ev(async () => {
        const a = await crearPdf(2), b = await crearPdf(3);
        async function crearPdf(n) { const d = await PDFLib.PDFDocument.create(); for (let i = 0; i < n; i++) d.addPage([100, 100]); return new File([await d.save()], 'x.pdf'); }
        const u = await unirPdfs([a, b]);
        let uno = null; try { await unirPdfs([a]); } catch (e) { uno = e.message; }
        return { paginas: (await PDFLib.PDFDocument.load(u)).getPageCount(), uno };
    });
    prueba('unir PDF de 2 y 3 páginas da uno de 5', unida.paginas === 5, unida.paginas);
    prueba('unir con un solo PDF da error claro', /al menos dos/.test(unida.uno || ''), unida.uno);

    const bytes3 = await crearPdfDePrueba(pagina, 3);
    const conv = await ev(async b => {
        const una = await pdfAJpeg(new Uint8Array(b).slice(), 'doc.pdf', { dpi: 72, calidad: 80 });
        const varias = await pdfAJpeg(new Uint8Array(b), 'doc.pdf', { dpi: 72 });
        const zip = await JSZip.loadAsync(varias.blob);
        const nombres = Object.keys(zip.files).sort();
        const primera = new Uint8Array(await zip.files[nombres[0]].async('arraybuffer'));
        const bmp = await createImageBitmap(new Blob([primera]));
        return { ext: varias.nombre, nombres, magia: [primera[0], primera[1]], tam: [bmp.width, bmp.height] };
    }, bytes3);
    prueba('PDF de 3 páginas → ZIP con doc-1.jpg, doc-2.jpg, doc-3.jpg', conv.ext === 'doc.zip' && conv.nombres.join() === 'doc-1.jpg,doc-2.jpg,doc-3.jpg', conv.nombres.join());
    prueba('cada página es un JPEG real del tamaño esperado (200×300 pt a 72 dpi)', conv.magia.join() === '255,216' && conv.tam.join() === '200,300', JSON.stringify(conv));
    const unaPag = await ev(async b => (await pdfAJpeg(new Uint8Array(b), 'solo.pdf')).nombre, await crearPdfDePrueba(pagina, 1));
    prueba('PDF de una página → un solo .jpg (no ZIP)', unaPag === 'solo.jpg', unaPag);
    const dpiAlto = await ev(async b => {
        const r = await pdfAJpeg(new Uint8Array(b), 's.pdf', { dpi: 144 });
        const bmp = await createImageBitmap(r.blob); return [bmp.width, bmp.height];
    }, await crearPdfDePrueba(pagina, 1));
    prueba('el DPI cambia el tamaño en píxeles (144 dpi = el doble)', dpiAlto.join() === '400,600', dpiAlto.join());

    const sello = await ev(async b => {
        const out = await insertarCodigoEnPdf(new Uint8Array(b), { tipo: 'qr', dato: 'hola 123', x: 10, y: 10, ancho: 40, paginas: 'all' });
        const pdf = await abrirPdfJs(out);
        const lecturas = [];
        for (let i = 1; i <= pdf.numPages; i++) lecturas.push(leerCodigosDeCanvas(await paginaACanvas(await pdf.getPage(i), 200)).map(r => r.texto).join());
        const solo1 = await insertarCodigoEnPdf(new Uint8Array(b), { tipo: 'code128', dato: 'ABC123', x: 5, y: 10, ancho: 60, paginas: 'first' });
        const pdf2 = await abrirPdfJs(solo1);
        const l2 = [];
        for (let i = 1; i <= pdf2.numPages; i++) l2.push(leerCodigosDeCanvas(await paginaACanvas(await pdf2.getPage(i), 300)).map(r => r.texto).join());
        return { lecturas, l2 };
    }, bytes3);
    prueba('QR insertado en las 3 páginas se lee en cada una', sello.lecturas.join('|') === 'hola 123|hola 123|hola 123', sello.lecturas.join('|'));
    prueba('código de barras solo en la primera página', sello.l2.join('|') === 'ABC123||', sello.l2.join('|'));

    const posicion = await ev(async b => {
        const out = await insertarCodigoEnPdf(new Uint8Array(b), { tipo: 'qr', dato: 'pos', x: 10, y: 20, ancho: 30 });
        const canvas = await paginaACanvas(await (await abrirPdfJs(out)).getPage(1), 72);
        const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let minX = 1e9, minY = 1e9;
        for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
            const i = (y * canvas.width + x) * 4; if (d[i] < 100 && d[i + 1] < 100) { minX = Math.min(minX, x); minY = Math.min(minY, y); }
        }
        return [minX, minY];
    }, await ev(async () => { const d = await PDFLib.PDFDocument.create(); d.addPage([200, 300]); return Array.from(await d.save()); }));
    // El QR tiene 4 cuadritos de margen blanco; el 1er punto negro cae a pocos puntos de la esquina (10 mm = 28 pt, 20 mm = 57 pt)
    const variasRes = await ev(async b => {
        const out = {};
        const bytes = await insertarCodigoEnPdf(new Uint8Array(b), { tipo: 'code128', dato: 'ABC123', x: 2, y: 10, ancho: 60 });
        const pg = await (await abrirPdfJs(bytes)).getPage(1);
        for (const dpi of [100, 200, 300, 400, 600]) out[dpi] = leerCodigosDeCanvas(await paginaACanvas(pg, dpi)).map(r => r.texto).join();
        return out;
    }, bytes3);
    prueba('un Code 128 dentro de un PDF se lee a 100, 200, 300, 400 y 600 dpi', Object.values(variasRes).every(t => t === 'ABC123'), JSON.stringify(variasRes));
    const qrRes = await ev(async b => {
        const falla = [];
        for (const ancho of [20, 40, 55]) {
            const bytes = await insertarCodigoEnPdf(new Uint8Array(b), { tipo: 'qr', dato: 'https://ejemplo.com/a?b=1', x: 5, y: 10, ancho });
            const pg = await (await abrirPdfJs(bytes)).getPage(1);
            for (const dpi of [120, 150, 175, 200, 300, 400]) {
                if (leerCodigosDeCanvas(await paginaACanvas(pg, dpi)).map(r => r.texto).join() !== 'https://ejemplo.com/a?b=1') falla.push(ancho + 'mm@' + dpi);
            }
        }
        return falla;
    }, bytes3);
    prueba('un QR de 20, 40 y 55 mm dentro de un PDF se lee de 120 a 400 dpi (el render suaviza los bordes)', !qrRes.length, 'no se leyó: ' + qrRes.join(' '));
    prueba('el código queda cerca de la posición pedida (10 mm del borde izquierdo y 20 mm de arriba)', posicion[0] >= 28 && posicion[0] < 45 && posicion[1] >= 57 && posicion[1] < 75, posicion.join());

    prueba('sin errores de JavaScript durante las pruebas', !errores.length, errores.join(' | '));
    await navegador.close();
    fin();
})().catch(e => { console.log('ERROR:', e.message); process.exit(1); });
