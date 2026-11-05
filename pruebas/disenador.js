// Datos variables en pantalla: plantilla PDF + CSV, campos arrastrables, editor, guardar/abrir diseño y generar el PDF.
const { prueba, fin, abrirApp, fs, path } = require('./comun');
const os = require('os');

(async () => {
    const { navegador, pagina, errores } = await abrirApp({ contexto: { viewport: { width: 1300, height: 1000 }, acceptDownloads: true } });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-vdp-'));
    const j = JSON.stringify;
    const V = '#vista-vdp';

    // Plantilla de entrada de cine (210×100 mm) y un CSV como el de las entradas
    const plantilla = await pagina.evaluate(async () => {
        const d = await PDFLib.PDFDocument.create(); const fb = await d.embedFont(PDFLib.StandardFonts.HelveticaBold);
        const p = d.addPage([210 * MM_A_PT, 100 * MM_A_PT]);
        p.drawText('CINE CENTRAL', { x: 70 * MM_A_PT, y: 80 * MM_A_PT, size: 22, font: fb });
        d.addPage([100, 100]).drawText('segunda', { x: 10, y: 10, size: 10, font: fb });
        return Array.from(await d.save());
    });
    const rutaPlantilla = path.join(tmp, 'entrada.pdf'); fs.writeFileSync(rutaPlantilla, Buffer.from(plantilla));
    const filas = ['ID;Movie;Guest-Name;Guest-Surname;Theater;Row;Seat;QR'];
    const nombres = [['Miruna', 'Alfaro'], ['Lex', 'Pratt'], ['Kellie', 'Maynard'], ['Katey', 'Peralta'], ['Leonard', 'Cohen']];
    for (let i = 1; i <= 30; i++) { const [n, a] = nombres[(i - 1) % 5]; filas.push(`${i};Online Training;${n};${a};S1;${Math.ceil(i / 10)}A;${((i - 1) % 10) + 1};${1000000000 + i * 7919}`); }
    const rutaCsv = path.join(tmp, 'cine.csv'); fs.writeFileSync(rutaCsv, filas.join('\r\n') + '\r\n');

    await pagina.click('#barra-pestanas .btn:nth-child(10)');
    prueba('al principio no hay hoja ni campos', (await pagina.$(`${V} .hoja`)) === null && (await pagina.$(`${V} [data-editor]:not([hidden])`)) === null);
    await pagina.setInputFiles(`${V} input[name=plantilla]`, rutaPlantilla);
    await pagina.waitForSelector(`${V} .hoja canvas`);
    const hoja = await pagina.$eval(`${V} .hoja`, h => ({ w: h.getBoundingClientRect().width, h: h.getBoundingClientRect().height }));
    prueba('la plantilla se muestra con sus proporciones (210×100 mm)', Math.abs(hoja.w / hoja.h - 2.1) < 0.02, j(hoja));
    prueba('el campo "Página de la plantilla" conoce cuántas páginas hay (2)', await pagina.$eval(`${V} input[name=paginaPlantilla]`, i => i.max) === '2');
    await pagina.setInputFiles(`${V} input[name=csv]`, rutaCsv);
    await pagina.waitForFunction(() => /fila 2/.test(document.querySelector('#vista-vdp [data-etiqueta-fila]').textContent));
    prueba('con el CSV se ve "fila 2 (1 de 30)" y se pueden pasar las filas', /fila 2 \(1 de 30\)/.test(await pagina.textContent(`${V} [data-etiqueta-fila]`)));
    const escala = hoja.w / (210 * 72 / 25.4); // píxeles por punto
    const mmAPx = mm => mm * 72 / 25.4 * escala;

    // ---- QR: aparece con la columna QR elegida sola, y se arrastra ----
    await pagina.click(`${V} [data-nuevo=qr]`);
    await pagina.waitForSelector(`${V} .capa .campo-vdp img[src^="blob:"]`);
    prueba('al agregar un QR el contenido es {QR} (la columna del código se adivina)', await pagina.inputValue(`${V} [data-f=contenido]`) === '{QR}');
    prueba('el QR de la vista previa tiene la forma de la fila 1 y el campo queda elegido', (await pagina.$$eval(`${V} .capa .campo-vdp.sel`, e => e.length)) === 1);
    const x0 = parseFloat(await pagina.inputValue(`${V} [data-f=x]`)), y0 = parseFloat(await pagina.inputValue(`${V} [data-f=y]`));
    const caja = await pagina.$eval(`${V} .capa .campo-vdp`, e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    await pagina.mouse.move(caja.x + caja.w / 2, caja.y + caja.h / 2);
    await pagina.mouse.down();
    await pagina.mouse.move(caja.x + caja.w / 2 + mmAPx(40), caja.y + caja.h / 2 + mmAPx(20), { steps: 6 });
    await pagina.mouse.up();
    const x1 = parseFloat(await pagina.inputValue(`${V} [data-f=x]`)), y1 = parseFloat(await pagina.inputValue(`${V} [data-f=y]`));
    prueba('arrastrar el QR con el mouse lo mueve 40 mm a la derecha y 20 mm abajo (±1)', Math.abs(x1 - x0 - 40) < 1 && Math.abs(y1 - y0 - 20) < 1, `${x0},${y0} → ${x1},${y1}`);
    const pos = await pagina.$eval(`${V} .capa .campo-vdp`, e => ({ l: parseFloat(e.style.left), t: parseFloat(e.style.top) }));
    prueba('el cuadro del QR en la hoja queda donde dicen X e Y', Math.abs(pos.l - mmAPx(x1)) < 1.5 && Math.abs(pos.t - mmAPx(y1)) < 1.5, j(pos));

    const asa = await pagina.$eval(`${V} .capa .asa`, e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    const ancho0 = parseFloat(await pagina.inputValue(`${V} [data-f=ancho]`));
    await pagina.mouse.move(asa.x, asa.y); await pagina.mouse.down(); await pagina.mouse.move(asa.x + mmAPx(10), asa.y + mmAPx(10), { steps: 4 }); await pagina.mouse.up();
    const ancho1 = parseFloat(await pagina.inputValue(`${V} [data-f=ancho]`));
    prueba('arrastrar la manija de la esquina agranda el QR (+10 mm)', Math.abs(ancho1 - ancho0 - 10) < 1.2, `${ancho0} → ${ancho1}`);

    await pagina.fill(`${V} [data-f=x]`, '140');
    await pagina.fill(`${V} [data-f=y]`, '25');
    await pagina.fill(`${V} [data-f=ancho]`, '30');
    await pagina.fill(`${V} [data-f=borde]`, '0');
    const l = await pagina.$eval(`${V} .capa .campo-vdp`, e => parseFloat(e.style.left));
    prueba('cambiar X en el editor mueve el cuadro en la hoja', Math.abs(l - mmAPx(140)) < 1.5, l);

    // ---- Texto con columnas elegidas ----
    await pagina.click(`${V} [data-nuevo=texto]`);
    await pagina.fill(`${V} [data-f=contenido]`, '');
    await pagina.click(`${V} .chip:text-is("Guest-Name")`);
    await pagina.click(`${V} .chip:text-is("Guest-Surname")`);
    prueba('tocar las columnas arma el contenido ("{Guest-Name} {Guest-Surname}")', await pagina.inputValue(`${V} [data-f=contenido]`) === '{Guest-Name} {Guest-Surname}', await pagina.inputValue(`${V} [data-f=contenido]`));
    prueba('la vista previa muestra los datos de la fila 1 ("Miruna Alfaro")', await pagina.$eval(`${V} .capa .campo-vdp.sel`, e => e.textContent) === 'Miruna Alfaro');
    await pagina.click(`${V} [data-fila-vista="1"]`);
    prueba('con ▶ pasa a la fila 2 ("Lex Pratt") y la etiqueta lo dice', await pagina.$eval(`${V} .capa .campo-vdp.sel`, e => e.textContent) === 'Lex Pratt' && /fila 3 \(2 de 30\)/.test(await pagina.textContent(`${V} [data-etiqueta-fila]`)));
    await pagina.click(`${V} [data-fila-vista="-1"]`);
    await pagina.fill(`${V} [data-f=x]`, '70'); await pagina.fill(`${V} [data-f=y]`, '35'); await pagina.fill(`${V} [data-f=tam]`, '16');
    await pagina.check(`${V} [data-f=negrita]`);
    prueba('negrita y tamaño se ven en la vista previa', await pagina.$eval(`${V} .capa .campo-vdp.sel`, e => e.style.fontWeight === 'bold' && e.style.fontSize !== ''));

    // ---- Código de barras, girar, duplicar y borrar ----
    await pagina.click(`${V} [data-nuevo=barras]`);
    await pagina.fill(`${V} [data-f=contenido]`, '');
    await pagina.click(`${V} .chip:text-is("ID")`);
    await pagina.click(`${V} .chip:text-is("Row")`);
    await pagina.fill(`${V} [data-f=x]`, '70'); await pagina.fill(`${V} [data-f=y]`, '60');
    await pagina.waitForSelector(`${V} .capa .campo-vdp.sel img[src^="blob:"]`);
    prueba('un código de barras con las columnas ID y Row se ve en la hoja, juntas y sin espacio ("11A")', await pagina.$eval(`${V} .capa .campo-vdp.sel .texto-barras`, e => e.textContent) === '11A');
    await pagina.selectOption(`${V} [data-f=rotar]`, '90');
    prueba('"Girar 90°" gira el campo en la hoja', /rotate\(90deg\)/.test(await pagina.$eval(`${V} .capa .campo-vdp.sel`, e => e.style.transform)));
    await pagina.selectOption(`${V} [data-f=rotar]`, '0');
    await pagina.click(`${V} [data-duplicar]`);
    prueba('"Duplicar" suma un campo (4 en la lista)', (await pagina.$$(`${V} .item-campo`)).length === 4);
    await pagina.click(`${V} [data-borrar]`);
    prueba('"Borrar campo" lo saca (3 en la lista)', (await pagina.$$(`${V} .item-campo`)).length === 3);
    await pagina.click(`${V} .item-campo:nth-child(2)`);
    prueba('tocar un campo de la lista lo elige', (await pagina.textContent(`${V} [data-editor] h3`)).includes('Campo 2: Texto') );

    // ---- Un campo con una columna que no existe: error claro y no se genera ----
    await pagina.click(`${V} .item-campo:nth-child(1)`);
    await pagina.fill(`${V} [data-f=contenido]`, '{Nope}');
    await pagina.click(`${V} button.btn-accion`);
    await pagina.waitForSelector(`${V} .error`);
    prueba('una columna que no existe da un error que dice cuál y cuáles hay', /Campo 1 \(QR\).*\{Nope\}.*Columnas del CSV: ID, Movie/.test(await pagina.textContent(`${V} .error`)), await pagina.textContent(`${V} .error`));
    await pagina.fill(`${V} [data-f=contenido]`, '{QR}');

    // ---- Guardar y abrir el diseño ----
    const [dDis] = await Promise.all([pagina.waitForEvent('download'), pagina.click(`${V} [data-guardar-diseno]`)]);
    const rutaDis = path.join(tmp, 'diseno.json'); await dDis.saveAs(rutaDis);
    const dis = JSON.parse(fs.readFileSync(rutaDis, 'utf8'));
    prueba('el diseño se guarda como JSON con los 3 campos (sin ids internos)', dDis.suggestedFilename() === 'diseno-datos-variables.json' && dis.campos.length === 3 && dis.campos.every(c => c.id === undefined) && dis.campos[0].tipo === 'qr' && dis.campos[0].x === 140, JSON.stringify(dis).slice(0, 200));

    // ---- Generar ----
    await pagina.click(`${V} button.btn-accion`);
    await pagina.waitForSelector(`${V} .resultado canvas`);
    const nota = await pagina.textContent(`${V} .resultado .ayuda`);
    prueba('genera 30 páginas (una por fila) y lo avisa', /^30 páginas con datos variables\./.test(await pagina.textContent(`${V} .resultado p.ayuda:last-of-type`)) || nota.includes('30'), nota);
    const [dPdf] = await Promise.all([pagina.waitForEvent('download'), pagina.click(`${V} a.descarga`)]);
    const rutaPdf = path.join(tmp, 'salida.pdf'); await dPdf.saveAs(rutaPdf);
    prueba('el archivo se llama entrada-datos-variables.pdf', dPdf.suggestedFilename() === 'entrada-datos-variables.pdf', dPdf.suggestedFilename());
    const salida = await pagina.evaluate(async arr => {
        const bytes = new Uint8Array(arr); const pdf = await abrirPdfJs(bytes);
        const res = { paginas: pdf.numPages, filas: [] };
        for (const n of [1, 2, 30]) {
            const p = await pdf.getPage(n);
            const canvas = await paginaACanvas(p, 150);
            const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
            let x0 = 1e9, y0 = 1e9, x1 = 0, y1 = 0; // la mancha del QR: lo negro a la derecha de x = 136 mm (el título de la plantilla llega hasta ~134) y arriba de y = 58 mm (el código de barras queda más abajo)
            for (let y = 0; y < Math.floor(58 * 150 / 25.4); y++) for (let x = Math.floor(136 * 150 / 25.4); x < canvas.width; x++) if (d[(y * canvas.width + x) * 4] < 100) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
            res.filas.push({
                textos: (await p.getTextContent()).items.map(t => t.str).filter(s => s.trim()),
                codigos: leerCodigosDeCanvas(canvas).map(c => c.texto).sort(),
                qr: [(x0 + x1) / 2 * 25.4 / 150, (y0 + y1) / 2 * 25.4 / 150]
            });
        }
        return res;
    }, Array.from(fs.readFileSync(rutaPdf)));
    prueba('el PDF tiene 30 páginas', salida.paginas === 30, salida.paginas);
    prueba('cada página conserva la plantilla ("CINE CENTRAL")', salida.filas.every(f => f.textos.includes('CINE CENTRAL')));
    prueba('página 1: "Miruna Alfaro" y su QR; página 2: "Lex Pratt" y el suyo',
        salida.filas[0].textos.includes('Miruna Alfaro') && salida.filas[0].codigos.includes('1000007919') && salida.filas[1].textos.includes('Lex Pratt') && salida.filas[1].codigos.includes('1000015838'), j(salida.filas.slice(0, 2)));
    prueba('el código de barras de la página 1 dice "11A" y el de la 30 "303A"', salida.filas[0].codigos.includes('11A') && salida.filas[2].codigos.includes('303A'), j(salida.filas.map(f => f.codigos)));
    prueba('el QR del PDF queda donde se ve en la hoja: centro en (155, 40) mm (±1,5)', Math.abs(salida.filas[0].qr[0] - 155) < 1.5 && Math.abs(salida.filas[0].qr[1] - 40) < 1.5, j(salida.filas[0].qr));

    // ---- Rango de filas e imposición ----
    await pagina.fill(`${V} input[name=desde]`, '3');
    await pagina.fill(`${V} input[name=hasta]`, '7');
    await pagina.click(`${V} button.btn-accion`);
    await pagina.waitForFunction(() => /5 páginas/.test(document.querySelector('#vista-vdp [data-salida]').textContent));
    prueba('"desde la fila 3 hasta la 7" genera 5 páginas', true);
    await pagina.fill(`${V} input[name=desde]`, ''); await pagina.fill(`${V} input[name=hasta]`, '');
    await pagina.click(`${V} details.grupo summary`);
    await pagina.check(`${V} input[name=impOn]`);
    await pagina.selectOption(`${V} select[name=impPliego]`, 'A3');
    await pagina.fill(`${V} input[name=impColumnas]`, '1'); await pagina.fill(`${V} input[name=impFilas]`, '3');
    await pagina.click(`${V} button.btn-accion`);
    await pagina.waitForFunction(() => /acomodadas en \d+ pliegos/.test(document.querySelector('#vista-vdp [data-salida]').textContent));
    prueba('con imposición (1×3 por pliego A3) el aviso dice "30 páginas… acomodadas en 10 pliegos"', /30 páginas.*acomodadas en 10 pliegos/.test(await pagina.textContent(`${V} .resultado .ayuda`)), await pagina.textContent(`${V} .resultado .ayuda`));
    await pagina.uncheck(`${V} input[name=impOn]`);

    // ---- Abrir un diseño guardado, con otra plantilla y el CSV ----
    await pagina.reload();
    await pagina.click('#barra-pestanas .btn:nth-child(10)');
    await pagina.setInputFiles(`${V} input[name=plantilla]`, rutaPlantilla);
    await pagina.waitForSelector(`${V} .hoja canvas`);
    await pagina.setInputFiles(`${V} input[name=csv]`, rutaCsv);
    await pagina.waitForFunction(() => /fila 2/.test(document.querySelector('#vista-vdp [data-etiqueta-fila]').textContent));
    await pagina.setInputFiles(`${V} [data-abrir-diseno]`, rutaDis);
    await pagina.waitForSelector(`${V} .capa .campo-vdp`);
    prueba('al abrir el diseño vuelven los 3 campos, con sus posiciones', (await pagina.$$(`${V} .item-campo`)).length === 3 && (await pagina.$$(`${V} .capa .campo-vdp`)).length === 3 && await pagina.inputValue(`${V} [data-f=x]`) === '140');
    await pagina.setInputFiles(`${V} [data-abrir-diseno]`, rutaCsv);
    await pagina.waitForSelector(`${V} .error`);
    prueba('abrir un archivo que no es un diseño da un error claro', /no es un diseño/.test(await pagina.textContent(`${V} .error`)), await pagina.textContent(`${V} .error`));

    // ---- Título del CSV desactivado: las columnas se llaman "Columna N" ----
    await pagina.uncheck(`${V} input[name=encabezado]`);
    await pagina.click(`${V} .item-campo:nth-child(2)`);
    const chips = await pagina.$$eval(`${V} .chip`, c => c.slice(0, 3).map(x => x.textContent));
    prueba('sin fila de títulos, las columnas pasan a llamarse "Columna 1, 2, 3"', chips.join('|') === 'Columna 1|Columna 2|Columna 3', chips.join('|'));
    await pagina.check(`${V} input[name=encabezado]`);

    // ---- Plantilla inválida y celular ----
    const rutaMala = path.join(tmp, 'mala.pdf'); fs.writeFileSync(rutaMala, 'esto no es un pdf');
    await pagina.setInputFiles(`${V} input[name=plantilla]`, rutaMala);
    await pagina.waitForFunction(() => /No se pudo leer la plantilla/.test(document.querySelector('#vista-vdp [data-salida]').textContent));
    prueba('una plantilla que no es PDF da un error claro', /No se pudo leer la plantilla/.test(await pagina.textContent(`${V} .error`)), await pagina.textContent(`${V} .error`));
    await pagina.setViewportSize({ width: 390, height: 800 });
    await pagina.setInputFiles(`${V} input[name=plantilla]`, rutaPlantilla);
    await pagina.waitForSelector(`${V} .hoja canvas`);
    const desborde = await pagina.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    prueba('en un celular (390 px) no hay scroll horizontal', desborde <= 0, desborde);

    prueba('sin errores de JavaScript durante las pruebas', !errores.length, errores.join(' | '));
    await navegador.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    fin();
})().catch(e => { console.log('ERROR:', e.message); process.exit(1); });
