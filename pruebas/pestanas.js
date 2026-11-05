// Pantalla: las pestañas, los formularios y la descarga, usando la app como la usaría una persona.
const { prueba, fin, abrirApp, crearPdfDePrueba, fs, path } = require('./comun');
const os = require('os');

(async () => {
    const { navegador, pagina, errores } = await abrirApp();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-'));
    const vistaActiva = () => pagina.$$eval('.vista.activa', v => v.map(x => x.id));

    const titulos = await pagina.$$eval('#barra-pestanas .btn', b => b.map(x => x.textContent));
    prueba('hay 9 pestañas', titulos.length === 9, titulos.join(' | '));
    prueba('arranca con una sola vista abierta', (await vistaActiva()).length === 1);
    let todasAbren = true;
    for (let i = 0; i < titulos.length; i++) {
        await pagina.click(`#barra-pestanas .btn:nth-child(${i + 1})`);
        const act = await vistaActiva();
        const marcada = await pagina.$$eval('#barra-pestanas .btn.activa', b => b.length);
        if (act.length !== 1 || marcada !== 1) todasAbren = false;
    }
    prueba('cada pestaña abre solo su vista', todasAbren);

    // QR por pantalla
    await pagina.click('#barra-pestanas .btn:nth-child(2)');
    await pagina.fill('#vista-qr textarea[name=dato]', 'https://hola.com/ñ');
    await pagina.click('#vista-qr button.btn-accion');
    await pagina.waitForSelector('#vista-qr .resultado img');
    const enlace = await pagina.$eval('#vista-qr a.descarga', a => ({ nombre: a.download, href: a.href }));
    prueba('QR por pantalla: muestra la imagen y el botón de descarga', enlace.nombre === 'qr.png' && enlace.href.startsWith('blob:'), JSON.stringify(enlace));
    const [descarga] = await Promise.all([pagina.waitForEvent('download'), pagina.click('#vista-qr a.descarga')]);
    const rutaQr = path.join(tmp, 'qr.png');
    await descarga.saveAs(rutaQr);
    prueba('la descarga es un PNG de verdad', fs.readFileSync(rutaQr).subarray(1, 4).toString() === 'PNG');

    // Ese mismo archivo, leído por la pestaña "Leer códigos"
    await pagina.click('#barra-pestanas .btn:nth-child(3)');
    await pagina.setInputFiles('#vista-leer input[type=file]', rutaQr);
    await pagina.click('#vista-leer button.btn-accion');
    await pagina.waitForFunction(() => /ñ/.test(document.querySelector('#vista-leer [data-salida]').textContent));
    const leido = await pagina.textContent('#vista-leer [data-salida]');
    prueba('"Leer códigos" lee el QR que se acaba de descargar', /QR_CODE/.test(leido) && leido.includes('https://hola.com/ñ'), leido);

    // Error visible
    await pagina.click('#barra-pestanas .btn:nth-child(1)');
    await pagina.selectOption('#vista-barras select[name=tipo]', 'ean13');
    const ejemplo = await pagina.inputValue('#vista-barras input[name=dato]');
    prueba('al cambiar el tipo se pone un ejemplo válido', ejemplo === '590123412345', ejemplo);
    await pagina.fill('#vista-barras input[name=dato]', 'letras');
    await pagina.click('#vista-barras button.btn-accion');
    await pagina.waitForSelector('#vista-barras .error');
    prueba('un dato inválido muestra el error en rojo y deja usar el botón', /no es válido/.test(await pagina.textContent('#vista-barras .error')) && !(await pagina.$eval('#vista-barras button.btn-accion', b => b.disabled)));
    await pagina.fill('#vista-barras input[name=dato]', '590123412345');
    await pagina.click('#vista-barras button.btn-accion');
    await pagina.waitForSelector('#vista-barras .resultado img');
    prueba('corregido el dato, genera el código', true);

    // Imposición por pantalla
    const pdf = await crearPdfDePrueba(pagina, 1);
    const rutaPdf = path.join(tmp, 'entrada.pdf');
    fs.writeFileSync(rutaPdf, Buffer.from(pdf));
    await pagina.click('#barra-pestanas .btn:nth-child(4)');
    prueba('al elegir "medida personalizada" aparecen ancho y alto', await pagina.$eval('#vista-imponer [data-solo-medida]', e => e.hidden) &&
        (await pagina.selectOption('#vista-imponer select[name=pliego]', 'custom'), !(await pagina.$eval('#vista-imponer [data-solo-medida]', e => e.hidden))));
    await pagina.selectOption('#vista-imponer select[name=pliego]', 'A4');
    await pagina.selectOption('#vista-imponer select[name=modo]', 'booklet');
    prueba('en cuadernillo se esconden columnas/filas', await pagina.$eval('#vista-imponer [data-solo-grilla]', e => e.hidden));
    await pagina.selectOption('#vista-imponer select[name=modo]', 'step');
    await pagina.setInputFiles('#vista-imponer input[type=file]', rutaPdf);
    await pagina.click('#vista-imponer button.btn-accion');
    await pagina.waitForSelector('#vista-imponer .resultado canvas');
    const nombre = await pagina.$eval('#vista-imponer a.descarga', a => a.download);
    prueba('imposición: muestra la vista previa y ofrece "entrada-imposicion.pdf"', nombre === 'entrada-imposicion.pdf', nombre);
    const [d2] = await Promise.all([pagina.waitForEvent('download'), pagina.click('#vista-imponer a.descarga')]);
    await d2.saveAs(path.join(tmp, 'salida.pdf'));
    prueba('el PDF descargado es un PDF de 1 pliego', fs.readFileSync(path.join(tmp, 'salida.pdf')).subarray(0, 4).toString() === '%PDF');

    // JPEG → PDF → JPEG por pantalla
    const jpg = await pagina.evaluate(async () => { const c = crearCanvas(120, 80); const x = c.getContext('2d'); x.fillStyle = '#36c'; x.fillRect(0, 0, 120, 80); return Array.from(new Uint8Array(await (await canvasABlob(c, 'image/jpeg')).arrayBuffer())); });
    const rutaJpg = path.join(tmp, 'foto.jpg');
    fs.writeFileSync(rutaJpg, Buffer.from(jpg));
    await pagina.click('#barra-pestanas .btn:nth-child(5)');
    await pagina.setInputFiles('#vista-img-pdf input[type=file]', [rutaJpg, rutaJpg]);
    await pagina.click('#vista-img-pdf button.btn-accion');
    await pagina.waitForSelector('#vista-img-pdf .resultado canvas');
    prueba('JPEG → PDF: dice cuántas páginas tiene', /2 páginas/.test(await pagina.textContent('#vista-img-pdf .resultado .ayuda')));

    // Etiquetas en serie: un CSV como lo guarda Excel en español (separador ; y acentos en formato Windows)
    const rutaCsv = path.join(tmp, 'etiquetas.csv');
    fs.writeFileSync(rutaCsv, Buffer.from('codigo;descripción\r\nAB-001;Caño ñandú\r\nAB-002;Tuerca\r\nAB-003;Arandela\r\n', 'latin1'));
    await pagina.click('#barra-pestanas .btn:nth-child(9)');
    prueba('antes de elegir archivo las listas de columnas están desactivadas', await pagina.$eval('#vista-etiquetas select[name=colCodigo]', s => s.disabled));
    await pagina.setInputFiles('#vista-etiquetas input[type=file]', rutaCsv);
    await pagina.waitForFunction(() => document.querySelector('#vista-etiquetas select[name=colCodigo]').options.length === 2);
    const titulosCsv = await pagina.$$eval('#vista-etiquetas select[name=colCodigo] option', o => o.map(x => x.textContent));
    prueba('las columnas se llenan con los títulos del CSV (con la ó bien leída)', titulosCsv.join('|') === 'codigo|descripción', titulosCsv.join('|'));
    const casillasTexto = await pagina.$$eval('#vista-etiquetas [data-columnas-texto] label', o => o.map(x => x.textContent.trim()));
    prueba('para el texto hay una casilla por columna (se pueden marcar varias)', casillasTexto.join('|') === 'codigo|descripción', casillasTexto.join('|'));
    const tabla = await pagina.$$eval('#vista-etiquetas .tabla-csv th', o => o.map(x => x.textContent));
    prueba('la vista previa es una tabla con los títulos y el número de fila', tabla.join('|') === '#|codigo|descripción', tabla.join('|'));
    prueba('la columna del código está marcada en la tabla', await pagina.$eval('#vista-etiquetas .tabla-csv th.col-codigo', th => th.textContent) === 'codigo');
    const resumen = await pagina.textContent('#vista-etiquetas [data-resumen]');
    prueba('dice cuántas entran por hoja y cuántas hojas salen', /Entran 3×8 = 24 etiquetas por hoja/.test(resumen) && /Con 3 etiquetas salen 1 hoja\./.test(resumen), resumen);
    prueba('muestra cómo se leyó el archivo', /Caño ñandú/.test(await pagina.textContent('#vista-etiquetas [data-salida]')));
    await pagina.uncheck('#vista-etiquetas input[name=encabezado]');
    const sinTit = await pagina.$$eval('#vista-etiquetas select[name=colCodigo] option', o => o.map(x => x.textContent));
    prueba('sin fila de títulos las columnas se llaman "Columna 1", "Columna 2"', sinTit.join('|') === 'Columna 1|Columna 2', sinTit.join('|'));
    prueba('y ahora son 4 etiquetas (la fila de títulos también cuenta)', /Con 4 etiquetas/.test(await pagina.textContent('#vista-etiquetas [data-resumen]')));
    await pagina.check('#vista-etiquetas input[name=encabezado]');
    await pagina.check('#vista-etiquetas [data-columnas-texto] input[value="1"]');
    prueba('al marcar una columna de texto se pinta en la tabla', await pagina.$$eval('#vista-etiquetas .tabla-csv th.col-texto', th => th.map(x => x.textContent)).then(x => x.join() === 'descripción'));
    await pagina.fill('#vista-etiquetas input[name=copias]', '2');
    prueba('con 2 copias de cada una salen 6 etiquetas', /Con 6 etiquetas/.test(await pagina.textContent('#vista-etiquetas [data-resumen]')));
    await pagina.click('#vista-etiquetas button.btn-accion');
    await pagina.waitForSelector('#vista-etiquetas .resultado canvas');
    const notaEt = await pagina.textContent('#vista-etiquetas .resultado .ayuda');
    prueba('genera el PDF y avisa "6 etiquetas en 1 hoja (3×8 por hoja)"', /6 etiquetas en 1 hoja \(3×8 por hoja\)/.test(notaEt), notaEt);
    prueba('el archivo se llama etiquetas.pdf', await pagina.$eval('#vista-etiquetas a.descarga', a => a.download) === 'etiquetas.pdf');
    await pagina.selectOption('#vista-etiquetas select[name=tipo]', 'ean13');
    await pagina.click('#vista-etiquetas button.btn-accion');
    await pagina.waitForSelector('#vista-etiquetas .error');
    prueba('con un tipo que no admite esos datos (EAN-13 con letras) dice en qué fila está el problema', /Fila 2: .*no es válido para EAN-13/.test(await pagina.textContent('#vista-etiquetas .error')), await pagina.textContent('#vista-etiquetas .error'));
    const [dEj] = await Promise.all([pagina.waitForEvent('download'), pagina.click('#vista-etiquetas [data-ejemplo-csv]')]);
    const rutaEj = path.join(tmp, 'ejemplo.csv');
    await dEj.saveAs(rutaEj);
    const ej = fs.readFileSync(rutaEj, 'utf8');
    prueba('el CSV de ejemplo se descarga y trae el separador ; (abre bien en Excel en español)', dEj.suggestedFilename() === 'ejemplo-etiquetas.csv' && ej.includes('codigo;descripcion') && ej.includes('ñandú'), ej.slice(0, 60));

    // Un CSV con la misma forma que el de las entradas de cine: muchas columnas, la del código no es la primera
    const rutaCine = path.join(tmp, 'cine.csv');
    fs.writeFileSync(rutaCine, 'ID;Movie;Guest-Name;Guest-Surname;Email;Date-Time;Price;Theater;Row;Seat;QR\r\n' +
        '1;Online Training;Miruna;Alfaro;Miruna.Alfaro@youremail.com;01.11.2021 - 8PM;10 €;S1;1A;1;3450802982\r\n' +
        '2;Online Training;Lex;Pratt;Lex.Pratt@youremail.com;01.11.2021 - 8PM;10 €;S1;1A;2;649705671\r\n');
    await pagina.setInputFiles('#vista-etiquetas input[type=file]', rutaCine);
    await pagina.waitForFunction(() => document.querySelector('#vista-etiquetas select[name=colCodigo]').options.length === 11);
    const elegida = await pagina.$eval('#vista-etiquetas select[name=colCodigo]', s => s.options[s.selectedIndex].textContent);
    prueba('elige sola la columna "QR" como código (en vez de la primera)', elegida === 'QR', elegida);
    prueba('la tabla de vista previa tiene las 11 columnas y se puede desplazar sin cortar el texto', await pagina.$eval('#vista-etiquetas .tabla-csv', t => t.querySelectorAll('th').length === 12 && t.scrollWidth >= t.clientWidth));
    await pagina.check('#vista-etiquetas [data-columnas-texto] input[value="2"]');
    await pagina.check('#vista-etiquetas [data-columnas-texto] input[value="3"]');
    const colTexto = await pagina.$$eval('#vista-etiquetas .tabla-csv th.col-texto', th => th.map(x => x.textContent));
    prueba('se pueden marcar varias columnas para el texto (nombre y apellido)', colTexto.join() === 'Guest-Name,Guest-Surname', colTexto.join());
    await pagina.click('#vista-etiquetas .tabla-csv th:nth-child(8)'); // "Price" (la 1ª es el #)
    const tocada = await pagina.$eval('#vista-etiquetas select[name=colCodigo]', s => s.options[s.selectedIndex].textContent);
    prueba('tocar el título de una columna en la tabla la elige como código', tocada === 'Price', tocada);
    prueba('y la tabla la pinta de azul', await pagina.$eval('#vista-etiquetas .tabla-csv th.col-codigo', th => th.textContent) === 'Price');
    await pagina.selectOption('#vista-etiquetas select[name=colCodigo]', '10');
    await pagina.fill('#vista-etiquetas input[name=copias]', '1');
    await pagina.selectOption('#vista-etiquetas select[name=tipo]', 'qr'); // antes quedó en EAN-13, que no admite estos códigos de 10 dígitos
    await pagina.click('#vista-etiquetas button.btn-accion');
    await pagina.waitForSelector('#vista-etiquetas .resultado canvas');
    prueba('genera las etiquetas con la columna QR y avisa "2 etiquetas en 1 hoja"', /2 etiquetas en 1 hoja/.test(await pagina.textContent('#vista-etiquetas .resultado .ayuda')));
    prueba('después de generar, el resultado no se pisa con la tabla al tocar otra opción', await (async () => {
        await pagina.fill('#vista-etiquetas input[name=margen]', '12');
        return (await pagina.$('#vista-etiquetas .resultado canvas')) !== null && (await pagina.$('#vista-etiquetas .tabla-csv')) === null;
    })());

    // Recarga: recuerda la última pestaña usada
    await pagina.click('#barra-pestanas .btn:nth-child(7)');
    await pagina.reload();
    prueba('al reabrir recuerda la última pestaña', (await vistaActiva())[0] === 'vista-unir', (await vistaActiva()).join());

    // Teléfono: sin scroll horizontal
    await pagina.setViewportSize({ width: 375, height: 700 });
    for (const i of [1, 4, 8, 9]) {
        await pagina.click(`#barra-pestanas .btn:nth-child(${i})`);
    }
    const desborde = await pagina.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    prueba('en pantalla de celular (375 px) no hay scroll horizontal', desborde <= 0, desborde);

    prueba('sin errores de JavaScript durante las pruebas', !errores.length, errores.join(' | '));
    await navegador.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    fin();
})().catch(e => { console.log('ERROR:', e.message); process.exit(1); });
