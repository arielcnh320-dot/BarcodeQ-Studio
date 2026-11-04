// Imposición: repetir página, N-up y cuadernillo. Se arman PDF de prueba y se vuelven a leer con pdf.js.
const { prueba, fin, abrirApp, crearPdfDePrueba } = require('./comun');

(async () => {
    const { navegador, pagina, errores } = await abrirApp();

    // Ejecuta imponer() dentro de la página y devuelve, por pliego: medidas, textos de izquierda a derecha y cantidad de operaciones
    const correr = async (n, opciones) => {
        const pdf = await crearPdfDePrueba(pagina, n);
        return pagina.evaluate(async ([pdf, opciones]) => {
            try {
                const bytes = await imponer(new Uint8Array(pdf), opciones);
                const doc = await abrirPdfJs(bytes);
                const pliegos = [];
                for (let i = 1; i <= doc.numPages; i++) {
                    const p = await doc.getPage(i);
                    const v = p.getViewport({ scale: 1 });
                    const textos = (await p.getTextContent()).items.filter(t => t.str.trim()).sort((a, b) => a.transform[4] - b.transform[4]).map(t => t.str);
                    const ops = (await p.getOperatorList()).fnArray.length;
                    pliegos.push({ ancho: v.width, alto: v.height, textos, ops });
                }
                return { pliegos };
            } catch (e) { return { error: e.message }; }
        }, [pdf, opciones]);
    };
    const mm = pt => Math.round(pt / 72 * 25.4);

    let r = await correr(1, { modo: 'step', pliego: 'A4', columnas: 2, filas: 3 });
    prueba('step & repeat: 1 página → 1 pliego A4 con la página 6 veces', r.pliegos?.length === 1 && r.pliegos[0].textos.length === 6 && r.pliegos[0].textos.every(t => t === 'P1'), JSON.stringify(r).slice(0, 200));
    prueba('el pliego A4 mide 210×297 mm', mm(r.pliegos[0].ancho) === 210 && mm(r.pliegos[0].alto) === 297);

    const con = await correr(1, { modo: 'step', pliego: 'A4', columnas: 2, filas: 2, marcas: true });
    const sin = await correr(1, { modo: 'step', pliego: 'A4', columnas: 2, filas: 2, marcas: false });
    prueba('las marcas de corte agregan trazos al pliego', con.pliegos[0].ops > sin.pliegos[0].ops, `${con.pliegos[0].ops} vs ${sin.pliegos[0].ops}`);

    r = await correr(3, { modo: 'step', pliego: 'A4', columnas: 1, filas: 1 });
    prueba('step con 3 páginas: un pliego por página', r.pliegos?.length === 3 && r.pliegos.map(p => p.textos[0]).join() === 'P1,P2,P3');

    r = await correr(5, { modo: 'nup', pliego: 'A4', columnas: 2, filas: 2 });
    prueba('N-up: 5 páginas en 2×2 → 2 pliegos (4 + 1)', r.pliegos?.length === 2 && r.pliegos[0].textos.length === 4 && r.pliegos[1].textos.join() === 'P5', JSON.stringify(r).slice(0, 200));

    r = await correr(8, { modo: 'booklet', pliego: 'A4' });
    prueba('cuadernillo de 8 páginas: orden 8|1, 2|7, 6|3, 4|5',
        r.pliegos?.map(p => p.textos.join('|')).join(' ; ') === 'P8|P1 ; P2|P7 ; P6|P3 ; P4|P5', JSON.stringify(r).slice(0, 250));
    prueba('el cuadernillo sale apaisado (420×297 en A3 → A4 apaisado 297×210)', r.pliegos[0].ancho > r.pliegos[0].alto && mm(r.pliegos[0].ancho) === 297);

    r = await correr(5, { modo: 'booklet', pliego: 'A4' });
    prueba('cuadernillo de 5 páginas se completa a 8 (4 pliegos, con páginas en blanco)', r.pliegos?.length === 4 && r.pliegos[0].textos.join('|') === 'P1', JSON.stringify(r).slice(0, 250));

    r = await correr(1, { modo: 'step', pliego: [100, 150], columnas: 1, filas: 1, horizontal: true });
    prueba('medida personalizada + horizontal: 150×100 mm', mm(r.pliegos[0].ancho) === 150 && mm(r.pliegos[0].alto) === 100);

    r = await correr(1, { modo: 'step', pliego: 'A5', columnas: 40, filas: 40 });
    prueba('demasiadas columnas para el pliego da un error claro', /No entran/.test(r.error || ''), r.error);
    r = await correr(1, { modo: 'raro', pliego: 'A4' });
    prueba('modo desconocido da error', /desconocido/.test(r.error || ''), r.error);

    // La página se agranda o achica para entrar en la celda, sin deformarse
    const geom = await pagina.evaluate(async pdf => {
        const bytes = await imponer(new Uint8Array(pdf), { modo: 'step', pliego: 'A4', columnas: 2, filas: 2, margen: 10, calle: 4, marcas: false });
        const p = await (await abrirPdfJs(bytes)).getPage(1);
        const t = (await p.getTextContent()).items.filter(x => x.str.trim());
        return t.map(x => ({ x: x.transform[4], tam: x.transform[0] }));
    }, await crearPdfDePrueba(pagina, 1));
    // celda = (210-20-4)/2 = 93 mm de ancho; página de 200×300 pt → escala = min(93mm/200pt, 136.5mm/300pt)
    const escalaEsperada = Math.min(93 * 72 / 25.4 / 200, ((297 - 20 - 4) / 2) * 72 / 25.4 / 300);
    prueba('la página se escala proporcionalmente (texto de 40 pt × escala)', Math.abs(geom[0].tam - 40 * escalaEsperada) < 0.5, `${geom[0].tam} vs ${40 * escalaEsperada}`);

    prueba('sin errores de JavaScript durante las pruebas', !errores.length, errores.join(' | '));
    await navegador.close();
    fin();
})().catch(e => { console.log('ERROR:', e.message); process.exit(1); });
