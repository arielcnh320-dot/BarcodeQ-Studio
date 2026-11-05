// Etiquetas en serie desde CSV: lectura del CSV (Excel en español), grilla, generación y lectura de vuelta de los códigos.
const { prueba, fin, abrirApp } = require('./comun');

(async () => {
    const { navegador, pagina, errores } = await abrirApp();
    const ev = (f, arg) => pagina.evaluate(f, arg);

    // ---- Lectura del CSV ----
    const csv = await ev(() => {
        const bytes = t => new TextEncoder().encode(t);
        const latin1 = t => Uint8Array.from(Array.from(t, c => c.charCodeAt(0)));
        return {
            coma: parsearCSV('a,b,c\n1,2,3\n'),
            puntoycoma: parsearCSV('codigo;desc\nA1;uno\nA2;dos\r\n'),
            tab: parsearCSV('a\tb\n1\t2'),
            comillas: parsearCSV('a,b\n"x, y","dijo ""hola"""\n"línea 1\nlínea 2",z'),
            bom: parsearCSV(decodificarCSV(new Uint8Array([0xEF, 0xBB, 0xBF, ...bytes('a;b\n1;2')]))),
            utf8: decodificarCSV(bytes('Caño ñandú ✓')),
            win1252: decodificarCSV(latin1('Caño ñandú descripción')),
            vacias: parsearCSV('a;b\n\n1;2\n\n'),
            sepDec: detectarSeparador('1,5;2\n3;4'),
            sinSep: detectarSeparador('solo\nuna\ncolumna'),
            unaFila: parsearCSV('x;y')
        };
    });
    const j = JSON.stringify;
    prueba('CSV con comas', j(csv.coma) === j([['a', 'b', 'c'], ['1', '2', '3']]), j(csv.coma));
    prueba('CSV de Excel en español: separador ; y saltos de línea de Windows', j(csv.puntoycoma) === j([['codigo', 'desc'], ['A1', 'uno'], ['A2', 'dos']]), j(csv.puntoycoma));
    prueba('CSV con tabuladores', j(csv.tab) === j([['a', 'b'], ['1', '2']]));
    prueba('comillas: comas adentro, comillas dobles y saltos de línea dentro de una celda', j(csv.comillas) === j([['a', 'b'], ['x, y', 'dijo "hola"'], ['línea 1\nlínea 2', 'z']]), j(csv.comillas));
    prueba('quita la marca BOM de los UTF-8 de Excel', j(csv.bom) === j([['a', 'b'], ['1', '2']]), j(csv.bom));
    prueba('lee UTF-8 con ñ, tildes y símbolos', csv.utf8 === 'Caño ñandú ✓', csv.utf8);
    prueba('lee el formato viejo de Windows (acentos y ñ no se rompen)', csv.win1252 === 'Caño ñandú descripción', csv.win1252);
    prueba('las líneas vacías se conservan en el medio (la fila coincide con la planilla)', csv.vacias.length === 4 && csv.vacias[1].join('') === '' , j(csv.vacias));
    prueba('con coma decimal y ; separa por ;', csv.sepDec === ';' && csv.sinSep === ',', `${csv.sepDec} ${csv.sinSep}`);
    prueba('una sola fila sin salto final', j(csv.unaFila) === j([['x', 'y']]));

    // ---- Grilla ----
    const grilla = await ev(() => ({
        a4: grillaDeEtiquetas({ pliego: 'A4', ancho: 50, alto: 30, margen: 10, calle: 2 }),
        sinCalle: grillaDeEtiquetas({ pliego: 'A4', ancho: 70, alto: 37, margen: 0, calle: 0 }),
        horiz: grillaDeEtiquetas({ pliego: 'A4', horizontal: true, ancho: 50, alto: 30, margen: 10, calle: 2 }),
        propio: grillaDeEtiquetas({ pliego: [100, 100], ancho: 40, alto: 40, margen: 5, calle: 0 }),
        grande: grillaDeEtiquetas({ pliego: 'A5', ancho: 300, alto: 30, margen: 10, calle: 2 })
    }));
    prueba('A4, etiqueta 50×30, margen 10, 2 mm entre etiquetas → 3×8', grilla.a4.columnas === 3 && grilla.a4.filas === 8, j(grilla.a4));
    prueba('A4 con etiquetas 70×37 sin margen (la típica de 24 por hoja) → 3×8', grilla.sinCalle.columnas === 3 && grilla.sinCalle.filas === 8, j(grilla.sinCalle));
    prueba('horizontal invierte el pliego (297×210 → 5×6)', grilla.horiz.sw === 297 && grilla.horiz.columnas === 5 && grilla.horiz.filas === 6, j(grilla.horiz));
    prueba('medida de pliego propia: 100×100 con margen 5 y etiquetas de 40 → 2×2', grilla.propio.columnas === 2 && grilla.propio.filas === 2, j(grilla.propio));
    prueba('etiqueta más ancha que el pliego → 0 columnas', grilla.grande.columnas === 0);

    // ---- Generación: se genera, se lee cada página con pdf.js y se comparan los códigos ----
    const base = { tipo: 'qr', ancho: 50, alto: 30, pliego: 'A4', margen: 10, calle: 2, copias: 1, contorno: false, mostrarTexto: true };
    const qr = await ev(async base => {
        const filas = [['codigo', 'texto'], ...Array.from({ length: 7 }, (_, i) => ['SN-' + String(i + 1).padStart(4, '0'), 'Pieza ' + (i + 1)])];
        const { registros } = registrosDeCSV(filas, { tieneEncabezado: true, colCodigo: 0, colTexto: 1 });
        const r = await generarEtiquetas(registros, base);
        const pdf = await abrirPdfJs(r.bytes);
        const pag = await pdf.getPage(1);
        const textos = (await pag.getTextContent()).items.map(t => t.str).filter(Boolean);
        const leidos = leerCodigosDeCanvas(await paginaACanvas(pag, 200)).map(c => c.texto).sort();
        return { r: { etiquetas: r.etiquetas, hojas: r.hojas, columnas: r.columnas, filas: r.filas }, paginas: pdf.numPages, leidos, textos };
    }, base);
    prueba('7 etiquetas QR en una hoja A4 (3×8 por hoja)', qr.r.etiquetas === 7 && qr.r.hojas === 1 && qr.paginas === 1 && qr.r.columnas === 3 && qr.r.filas === 8, j(qr.r));
    prueba('los 7 QR se leen de vuelta con el contenido correcto', j(qr.leidos) === j(Array.from({ length: 7 }, (_, i) => 'SN-000' + (i + 1))), qr.leidos.join(','));
    prueba('el texto de la columna elegida queda debajo de cada código', qr.textos.includes('Pieza 1') && qr.textos.includes('Pieza 7'), qr.textos.join(','));

    const llena = await ev(async base => {
        const regs = Array.from({ length: 24 }, (_, i) => ({ fila: i + 2, codigo: 'SN-' + String(i + 1).padStart(4, '0'), texto: 'Pieza ' + (i + 1) }));
        const g = await generarEtiquetas(regs, base);
        const pag = await (await abrirPdfJs(g.bytes)).getPage(1);
        const faltan = {};
        for (const dpi of [150, 200, 300]) {
            const leidos = leerCodigosDeCanvas(await paginaACanvas(pag, dpi)).map(c => c.texto);
            faltan[dpi] = regs.filter(r => !leidos.includes(r.codigo)).length;
        }
        return faltan;
    }, base);
    prueba('una hoja llena de 24 QR se lee completa (sin faltantes) a 150, 200 y 300 dpi', Object.values(llena).every(n => n === 0), j(llena));

    const varias = await ev(async base => {
        const registros = Array.from({ length: 50 }, (_, i) => ({ fila: i + 2, codigo: 'X' + i, texto: '' }));
        const a = await generarEtiquetas(registros, base);
        const b = await generarEtiquetas(registros.slice(0, 5), { ...base, copias: 10 });
        const t0 = performance.now();
        const c = await generarEtiquetas(Array.from({ length: 300 }, (_, i) => ({ fila: i + 2, codigo: 'Z' + i, texto: '' })), base);
        return { hojas50: a.hojas, hojasCopias: b.hojas, etiquetasCopias: b.etiquetas, hojas300: c.hojas, ms: Math.round(performance.now() - t0) };
    }, base);
    prueba('50 etiquetas a 24 por hoja → 3 hojas', varias.hojas50 === 3, j(varias));
    prueba('5 códigos × 10 copias = 50 etiquetas', varias.etiquetasCopias === 50 && varias.hojasCopias === 3);
    prueba('300 etiquetas se generan en un tiempo razonable (< 20 s)', varias.hojas300 === 13 && varias.ms < 20000, `${varias.ms} ms`);

    const barras = await ev(async base => {
        const registros = [{ fila: 2, codigo: 'ABC-123', texto: '' }, { fila: 3, codigo: 'XYZ-789', texto: 'Texto largo de prueba para ver si se achica' }];
        const r = await generarEtiquetas(registros, { ...base, tipo: 'code128', ancho: 60, alto: 25 });
        const pag = await (await abrirPdfJs(r.bytes)).getPage(1);
        return leerCodigosDeCanvas(await paginaACanvas(pag, 300)).map(c => c.texto).sort();
    }, base);
    prueba('etiquetas con código de barras Code 128 (y un texto largo que se achica) se leen de vuelta', j(barras) === j(['ABC-123', 'XYZ-789']), barras.join(','));

    const hojaBarras = await ev(async base => {
        const regs = Array.from({ length: 24 }, (_, i) => ({ fila: i + 2, codigo: 'SN-' + String(i + 1).padStart(4, '0'), texto: '' }));
        const g = await generarEtiquetas(regs, { ...base, tipo: 'code128', ancho: 60, alto: 25, margen: 5 });
        const pag = await (await abrirPdfJs(g.bytes)).getPage(1);
        const faltan = {};
        for (const dpi of [150, 200, 300]) {
            const leidos = leerCodigosDeCanvas(await paginaACanvas(pag, dpi)).map(c => c.texto);
            faltan[dpi] = regs.filter(r => !leidos.includes(r.codigo)).length;
        }
        return { porHoja: g.columnas * g.filas, faltan };
    }, base);
    prueba('una hoja llena de códigos de barras Code 128 se lee completa a 150, 200 y 300 dpi', Object.values(hojaBarras.faltan).every(n => n === 0), j(hojaBarras));

    const contorno = await ev(async base => {
        const g = await generarEtiquetas([{ fila: 2, codigo: 'ABC-123', texto: '' }], { ...base, tipo: 'code128', ancho: 60, alto: 25, contorno: true });
        const pag = await (await abrirPdfJs(g.bytes)).getPage(1);
        const ops = (await pag.getOperatorList()).fnArray.length;
        const g2 = await generarEtiquetas([{ fila: 2, codigo: 'ABC-123', texto: '' }], { ...base, tipo: 'code128', ancho: 60, alto: 25, contorno: false });
        const ops2 = (await (await (await abrirPdfJs(g2.bytes)).getPage(1)).getOperatorList()).fnArray.length;
        return ops > ops2;
    }, base);
    prueba('"dibujar contorno" agrega el borde de cada etiqueta al PDF', contorno === true);

    const raros = await ev(async base => {
        try {
            const r = await generarEtiquetas([{ fila: 2, codigo: 'ñandú ✓ 😀', texto: 'Caño ✓ 😀 € ñ' }], base);
            return { ok: true, bytes: r.bytes.length };
        } catch (e) { return { error: e.message }; }
    }, base);
    prueba('texto con emoji o símbolos fuera de Latin-1 no rompe el PDF (se reemplaza por ?)', raros.ok === true, j(raros));

    const errs = await ev(async base => {
        const falla = async (regs, o = {}) => { try { await generarEtiquetas(regs, { ...base, ...o }); return null; } catch (e) { return e.message; } };
        return {
            ean: await falla([{ fila: 2, codigo: '590123412345', texto: '' }, { fila: 17, codigo: 'letras', texto: '' }], { tipo: 'ean13' }),
            vacio: await falla([]),
            grande: await falla([{ fila: 2, codigo: 'A', texto: '' }], { ancho: 400 }),
            demasiadas: await falla(Array.from({ length: 30 }, (_, i) => ({ fila: i, codigo: 'A' + i, texto: '' })), { copias: 1000 }),
            cero: await falla([{ fila: 2, codigo: 'A', texto: '' }], { alto: 0 })
        };
    }, base);
    prueba('un código inválido dice en qué fila del archivo está', /^Fila 17:/.test(errs.ean || '') && /no es válido para EAN-13/.test(errs.ean), errs.ean);
    prueba('sin códigos da un error claro', /No hay ningún código/.test(errs.vacio || ''), errs.vacio);
    prueba('etiqueta más grande que el pliego da un error claro', /no entra en el pliego/.test(errs.grande || ''), errs.grande);
    prueba('más del máximo de etiquetas da un error claro', /máximo/.test(errs.demasiadas || ''), errs.demasiadas);
    prueba('alto 0 da un error claro', /mayores a 0/.test(errs.cero || ''), errs.cero);

    const omit = await ev(() => registrosDeCSV([['c', 't'], ['A1', 'x'], ['', 'sin código'], ['', ''], ['A2', ''], ['  A3  ', 'y']], { tieneEncabezado: true, colCodigo: 0, colTexto: 1 }));
    prueba('saltea las filas sin código (cuenta solo las que tenían otros datos) y limpia espacios',
        j(omit.registros.map(r => [r.fila, r.codigo])) === j([[2, 'A1'], [5, 'A2'], [6, 'A3']]) && omit.omitidas === 1, j(omit));
    const sinTitulos = await ev(() => registrosDeCSV([['A1', 'x'], ['A2', 'y']], { tieneEncabezado: false, colCodigo: 0, colTexto: -1 }).registros.length);
    prueba('sin fila de títulos, la primera fila también es un código', sinTitulos === 2);

    prueba('sin errores de JavaScript durante las pruebas', !errores.length, errores.join(' | '));
    await navegador.close();
    fin();
})().catch(e => { console.log('ERROR:', e.message); process.exit(1); });
