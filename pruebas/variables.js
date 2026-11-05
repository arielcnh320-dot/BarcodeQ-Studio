// Datos variables (plantilla PDF + CSV): el motor que arma una página por fila con texto, QR y código de barras.
const { prueba, fin, abrirApp } = require('./comun');

(async () => {
    const { navegador, pagina, errores } = await abrirApp();
    const ev = (f, arg) => pagina.evaluate(f, arg);
    const j = JSON.stringify;

    // Una plantilla de prueba: A5 apaisado (210×148 mm) con el texto "ENTRADA" (para comprobar que se conserva)
    await ev(() => {
        window.plantilla = async (mmAncho = 210, mmAlto = 148) => {
            const d = await PDFLib.PDFDocument.create();
            const f = await d.embedFont(PDFLib.StandardFonts.HelveticaBold);
            d.addPage([mmAncho * MM_A_PT, mmAlto * MM_A_PT]).drawText('ENTRADA', { x: 20, y: 20, size: 14, font: f });
            return new Uint8Array(await d.save());
        };
        window.cine = [
            ['ID', 'Película', 'Nombre', 'Apellido', 'Sala', 'QR'],
            ['1', 'Entrenamiento', 'Miruna', 'Alfaro', 'S1', '3450802982'],
            ['2', 'Entrenamiento', 'Lex', 'Pratt', 'S1', '649705671'],
            ['3', 'Entrenamiento', 'Kellie', 'Maynard', 'S2', '1314184638'],
            ['', '', '', '', '', ''],
            ['4', 'Entrenamiento', 'Katey', 'Peralta', 'S2', '']
        ];
        window.textosDe = async (bytes, n) => {
            const p = await (await abrirPdfJs(bytes)).getPage(n);
            return (await p.getTextContent()).items.filter(t => t.str.trim()).map(t => ({ str: t.str, x: t.transform[4], y: t.transform[5], m: t.transform.slice(0, 4).map(v => Math.round(v * 1000) / 1000) }));
        };
    });

    // ---- Funciones auxiliares ----
    const aux = await ev(() => {
        const v = valoresDeFila(['Nombre', ' Apellido '], ['Ana', 'Gómez']);
        return {
            usadas: columnasUsadas('Hola {Nombre} {Apellido} {#} {Nombre}'),
            interp: interpolar('{Nombre} {apellido} #{#} {Otra} {', v, 7),
            nuevo: ['texto', 'qr', 'barras'].map(t => campoNuevo(t, 1).tipo),
            titulos: [titulosDeCSV([['a', ''], ['1', '2']], true), titulosDeCSV([['a', 'b']], false)]
        };
    });
    prueba('detecta las columnas usadas en un contenido ({#} no es una columna)', j(aux.usadas) === j(['Nombre', 'Apellido', 'Nombre']), j(aux.usadas));
    prueba('reemplaza {Columna} (sin distinguir mayúsculas), {#} y deja lo desconocido como está', aux.interp === 'Ana Gómez #7 {Otra} {', aux.interp);
    prueba('los títulos vacíos se llaman "Columna N"', j(aux.titulos) === j([['a', 'Columna 2'], ['Columna 1', 'Columna 2']]), j(aux.titulos));

    // ---- Texto, QR y código de barras sobre la plantilla ----
    const base = await ev(async () => {
        const campos = [
            { ...campoNuevo('texto', 1, '{Nombre} {Apellido}'), x: 15, y: 20, tam: 16 },
            { ...campoNuevo('qr', 2, '{QR}'), x: 150, y: 20, ancho: 30 },
            { ...campoNuevo('barras', 3, '{ID}-{Sala}'), x: 15, y: 100, ancho: 60, alto: 14 },
            { ...campoNuevo('texto', 4, 'Sala {Sala} - N.º {#}'), x: 15, y: 40, tam: 10, negrita: true }
        ];
        const r = await generarDatosVariables(await plantilla(), cine, campos, {});
        const pdf = await abrirPdfJs(r.bytes);
        const salida = { paginas: pdf.numPages, avisos: r.avisos, filas: [] };
        for (let n = 1; n <= pdf.numPages; n++) {
            const canvas = await paginaACanvas(await pdf.getPage(n), 200);
            salida.filas.push({
                textos: (await textosDe(r.bytes, n)).map(t => t.str),
                codigos: leerCodigosDeCanvas(canvas).map(c => c.texto).sort()
            });
        }
        return salida;
    });
    prueba('una página por fila con datos (la fila vacía no cuenta): 4 páginas', base.paginas === 4, base.paginas);
    prueba('cada página conserva el texto de la plantilla ("ENTRADA")', base.filas.every(f => f.textos.includes('ENTRADA')));
    prueba('el texto variable se arma con las columnas elegidas ("Miruna Alfaro")', base.filas[0].textos.includes('Miruna Alfaro') && base.filas[2].textos.includes('Kellie Maynard'), j(base.filas[0].textos));
    prueba('{#} es el número de página y {Sala} sale de la columna', base.filas[1].textos.includes('Sala S1 - N.º 2') && base.filas[3].textos.includes('Sala S2 - N.º 4'), j(base.filas.map(f => f.textos[f.textos.length - 1])));
    prueba('el QR de cada página tiene los datos de su fila', base.filas[0].codigos.includes('3450802982') && base.filas[1].codigos.includes('649705671') && base.filas[2].codigos.includes('1314184638'), j(base.filas.map(f => f.codigos)));
    prueba('el código de barras de cada página también ("1-S1", "2-S1"…)', base.filas[0].codigos.includes('1-S1') && base.filas[1].codigos.includes('2-S1') && base.filas[3].codigos.includes('4-S2'), j(base.filas.map(f => f.codigos)));
    prueba('una fila sin dato para el QR no dibuja el QR y avisa', !base.filas[3].codigos.includes('') && base.filas[3].codigos.length === 1 && base.avisos.some(a => /campo 2 \(QR\).*1 fila/.test(a)), j(base.avisos));

    // ---- Posición exacta: el QR cae en el lugar pedido ----
    const pos = await ev(async () => {
        const campos = [{ ...campoNuevo('qr', 1, 'posicion'), x: 100, y: 50, ancho: 30, borde: 0 }];
        const r = await generarDatosVariables(await plantilla(), [['a'], ['x']], campos, { tieneEncabezado: true });
        const canvas = await paginaACanvas(await (await abrirPdfJs(r.bytes)).getPage(1), 100);
        const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let x0 = 1e9, y0 = 1e9, x1 = 0, y1 = 0;
        for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
            if (y < 40 * 100 / 25.4 && y > 10) continue; // ignora el texto "ENTRADA" de la plantilla (abajo-izquierda)
            const i = (y * canvas.width + x) * 4;
            if (d[i] < 100 && x > canvas.width * 0.4) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
        }
        const mm = 25.4 / 100;
        return { x: x0 * mm, y: y0 * mm, ancho: (x1 - x0) * mm, alto: (y1 - y0) * mm };
    });
    prueba('el QR empieza en el X/Y pedido (100, 50 mm, ±1) y mide lo pedido (30 mm, ±1)',
        Math.abs(pos.x - 100) < 1 && Math.abs(pos.y - 50) < 1 && Math.abs(pos.ancho - 30) < 1 && Math.abs(pos.alto - 30) < 1, j(pos));

    // ---- Texto: tamaño, alineación, ancho máximo y rotación ----
    const txt = await ev(async () => {
        const campos = [
            { ...campoNuevo('texto', 1, 'Largo largo largo largo largo largo'), x: 10, y: 10, tam: 20, ancho: 40 },
            { ...campoNuevo('texto', 2, 'Centro'), x: 100, y: 30, tam: 12, ancho: 50, alinear: 'centro' },
            { ...campoNuevo('texto', 3, 'Derecha'), x: 100, y: 40, tam: 12, ancho: 50, alinear: 'der' },
            { ...campoNuevo('texto', 4, 'Izquierda'), x: 100, y: 50, tam: 12, ancho: 50, alinear: 'izq' },
            { ...campoNuevo('texto', 5, 'Girado'), x: 20, y: 60, tam: 12, rotar: 90 },
            { ...campoNuevo('texto', 6, 'Línea 1\nLínea 2'), x: 20, y: 100, tam: 10 }
        ];
        const r = await generarDatosVariables(await plantilla(), [['a'], ['x']], campos, {});
        const t = await textosDe(r.bytes, 1);
        const por = s => t.find(z => z.str === s);
        return { largo: por('Largo largo largo largo largo largo'), centro: por('Centro'), der: por('Derecha'), izq: por('Izquierda'), giro: por('Girado'), l1: por('Línea 1'), l2: por('Línea 2') };
    });
    const pt = mm => mm * 72 / 25.4;
    prueba('un texto más ancho que su recuadro se achica para entrar', txt.largo && txt.largo.m[0] < 20 && txt.largo.m[0] >= 5, j(txt.largo));
    prueba('alineado al centro y a la derecha dentro del recuadro de 50 mm', txt.izq && txt.centro && txt.der && txt.centro.x > txt.izq.x + 10 && txt.der.x > txt.centro.x, `izq ${txt.izq && txt.izq.x} centro ${txt.centro && txt.centro.x} der ${txt.der && txt.der.x}`);
    prueba('el texto de la izquierda empieza en el X pedido (100 mm)', Math.abs(txt.izq.x - pt(100)) < 1, txt.izq && txt.izq.x);
    prueba('un texto girado 90° queda girado en el PDF', txt.giro && Math.abs(txt.giro.m[0]) < 0.01 && Math.abs(Math.abs(txt.giro.m[1]) - 12) < 0.1, j(txt.giro));
    prueba('un texto de varias líneas se dibuja línea por línea (separadas 1,2 × tamaño)', txt.l1 && txt.l2 && Math.abs((txt.l1.y - txt.l2.y) - 12) < 0.1, `${txt.l1 && txt.l1.y} ${txt.l2 && txt.l2.y}`);

    // ---- Códigos girados y barras sin texto ----
    const centro = await ev(async () => {
        // Girar un QR no lo corre de lugar: gira sobre su centro (en 0°, 90°, 180° y 270° la mancha negra tiene el mismo centro)
        const centros = [];
        for (const rotar of [0, 90, 180, 270]) {
            const campos = [{ ...campoNuevo('qr', 1, 'centro'), x: 100, y: 40, ancho: 30, borde: 0, rotar }];
            const r = await generarDatosVariables(await plantilla(), [['a'], ['x']], campos, {});
            const canvas = await paginaACanvas(await (await abrirPdfJs(r.bytes)).getPage(1), 100);
            const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
            let x0 = 1e9, y0 = 1e9, x1 = 0, y1 = 0;
            for (let y = 0; y < canvas.height; y++) for (let x = Math.floor(canvas.width * 0.4); x < canvas.width; x++) {
                if (d[(y * canvas.width + x) * 4] < 100) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
            }
            centros.push([Math.round((x0 + x1) / 2 * 25.4 / 100), Math.round((y0 + y1) / 2 * 25.4 / 100)]);
        }
        return centros;
    });
    prueba('al girar un campo gira sobre su centro (115, 55 mm) y no se corre de lugar', centro.every(c => Math.abs(c[0] - 115) <= 1 && Math.abs(c[1] - 55) <= 1), j(centro));

    const giro = await ev(async () => {
        const campos = [
            { ...campoNuevo('qr', 1, 'girado-90'), x: 20, y: 20, ancho: 30, rotar: 90 },
            { ...campoNuevo('barras', 2, 'GIRO-180'), x: 150, y: 120, ancho: 55, alto: 14, rotar: 180, textoDebajo: false }
        ];
        const r = await generarDatosVariables(await plantilla(), [['a'], ['x']], campos, {});
        const canvas = await paginaACanvas(await (await abrirPdfJs(r.bytes)).getPage(1), 200);
        return leerCodigosDeCanvas(canvas).map(c => c.texto).sort();
    });
    prueba('un QR girado 90° y un código de barras girado 180° siguen leyéndose', j(giro) === j(['GIRO-180', 'girado-90']), j(giro));

    // ---- Rango de filas, imposición, páginas de la plantilla ----
    const rango = await ev(async () => {
        const campos = [{ ...campoNuevo('texto', 1, '{Nombre}'), x: 15, y: 20 }];
        const a = await generarDatosVariables(await plantilla(), cine, campos, { desde: 3, hasta: 4 });
        const b = await generarDatosVariables(await plantilla(), cine, campos, {
            imposicion: { pliego: 'A3', columnas: 2, filas: 2, calle: 4, margen: 10, marcas: true }
        });
        const c = await generarDatosVariables(await plantilla(), [['n'], ['a'], ['b'], ['c'], ['d'], ['e']], [{ ...campoNuevo('texto', 1, '{n}'), x: 10, y: 10 }], {
            imposicion: { pliego: 'A3', columnas: 2, filas: 2, calle: 4, margen: 10, marcas: false }
        });
        return {
            filasA: (await Promise.all([1, 2].map(n => textosDe(a.bytes, n)))).map(t => t.map(z => z.str).filter(s => s !== 'ENTRADA').join()),
            paginasA: a.paginas,
            hojasB: (await abrirPdfJs(b.bytes)).numPages, hojasC: (await abrirPdfJs(c.bytes)).numPages
        };
    });
    prueba('"desde la fila 3, hasta la 4" genera solo esas filas (números de la planilla)', rango.paginasA === 2 && rango.filasA.join('|') === 'Lex|Kellie', j(rango));
    prueba('con imposición, 4 páginas salen en 1 pliego A3 (2×2) y 5 en 2 pliegos', rango.hojasB === 1 && rango.hojasC === 2, `${rango.hojasB} ${rango.hojasC}`);

    // ---- Errores claros ----
    const err = await ev(async () => {
        const falla = async (campos, filas = cine, op = {}, bytes) => { try { await generarDatosVariables(bytes || await plantilla(), filas, campos, op); return null; } catch (e) { return e.message; } };
        const t = (c, extra = {}) => ({ ...campoNuevo('texto', 1, c), ...extra });
        return {
            sinCampos: await falla([]),
            columna: await falla([t('{Nobre}')]),
            vacio: await falla([t('  ')]),
            ancho: await falla([{ ...campoNuevo('qr', 1, '{QR}'), ancho: 0 }]),
            barras: await falla([{ ...campoNuevo('barras', 1, '{Nombre}'), barras: 'ean13' }]),
            rango: await falla([t('{Nombre}')], cine, { desde: 50, hasta: 60 }),
            pagina: await falla([t('{Nombre}')], cine, { pagina: 3 })
        };
    });
    prueba('sin campos da un error claro', /al menos un campo/.test(err.sinCampos || ''), err.sinCampos);
    prueba('una columna mal escrita dice cuál es y qué columnas tiene el CSV', /Campo 1 \(Texto\).*\{Nobre\}.*Columnas del CSV: ID, Película/.test(err.columna || ''), err.columna);
    prueba('un campo sin contenido da error', /no tiene contenido/.test(err.vacio || ''), err.vacio);
    prueba('un QR con ancho 0 da error', /ancho tiene que ser mayor a 0/.test(err.ancho || ''), err.ancho);
    prueba('un código inválido dice fila y campo (EAN-13 con letras)', /^Fila 2, campo 1 \(Código de barras\): .*no es válido para EAN-13/.test(err.barras || ''), err.barras);
    prueba('un rango sin filas da error', /No hay ninguna fila/.test(err.rango || ''), err.rango);
    prueba('una página de plantilla que no existe da error', /plantilla tiene 1 página/.test(err.pagina || ''), err.pagina);

    const blanca = await ev(async () => {
        const d = await PDFLib.PDFDocument.create(); d.addPage([300, 200]); // sin ningún contenido
        const r = await generarDatosVariables(new Uint8Array(await d.save()), [['n'], ['Ana'], ['Luis']], [{ ...campoNuevo('texto', 1, '{n}'), x: 10, y: 10 }], {});
        const pdf = await abrirPdfJs(r.bytes);
        return { paginas: pdf.numPages, textos: (await textosDe(r.bytes, 2)).map(t => t.str), ancho: (await pdf.getPage(1)).getViewport({ scale: 1 }).width };
    });
    prueba('una plantilla totalmente en blanco también funciona (mismo tamaño de página)', blanca.paginas === 2 && blanca.textos.join() === 'Luis' && Math.round(blanca.ancho) === 300, j(blanca));

    // ---- Muchas filas ----
    const muchas = await ev(async () => {
        const filas = [['n', 'cod']]; for (let i = 1; i <= 300; i++) filas.push([`Persona ${i}`, 'C' + String(i).padStart(5, '0')]);
        const t0 = performance.now();
        const r = await generarDatosVariables(await plantilla(), filas, [
            { ...campoNuevo('texto', 1, '{n}'), x: 15, y: 20 }, { ...campoNuevo('qr', 2, '{cod}'), x: 150, y: 20, ancho: 30 }
        ], {});
        return { paginas: r.paginas, kb: Math.round(r.bytes.length / 1024), ms: Math.round(performance.now() - t0) };
    });
    prueba('300 filas con texto y QR: 300 páginas en menos de 30 s y un archivo razonable (< 4 MB)', muchas.paginas === 300 && muchas.ms < 30000 && muchas.kb < 4096, j(muchas));

    prueba('sin errores de JavaScript durante las pruebas', !errores.length, errores.join(' | '));
    await navegador.close();
    fin();
})().catch(e => { console.log('ERROR:', e.message); process.exit(1); });
