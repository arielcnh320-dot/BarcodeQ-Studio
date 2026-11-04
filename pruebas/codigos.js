// Códigos QR y de barras: se generan en la página y se vuelven a leer con la misma función que usa la pestaña "Leer códigos".
const { prueba, fin, abrirApp } = require('./comun');

(async () => {
    const { navegador, pagina, errores } = await abrirApp();
    const ev = f => pagina.evaluate(f);

    const qr = await ev(async () => {
        const txt = 'https://ejemplo.com/ñandú?x=1&y=2 ✓';
        const r = await generarQR(txt);
        const leidos = await leerCodigos(new File([r.blob], 'q.png', { type: 'image/png' }));
        return { magia: Array.from(new Uint8Array(await r.blob.arrayBuffer()).slice(0, 4)), leidos, txt };
    });
    prueba('QR en PNG es un PNG', qr.magia.join() === '137,80,78,71');
    prueba('QR se lee de vuelta igual, con ñ, tilde y símbolos', qr.leidos.length === 1 && qr.leidos[0].texto === qr.txt && qr.leidos[0].tipo === 'QR_CODE', JSON.stringify(qr.leidos));

    const niveles = await ev(async () => {
        const salida = [];
        for (const nivel of ['L', 'M', 'Q', 'H']) {
            const r = await generarQR('nivel ' + nivel, { nivel, caja: 6, margen: 2 });
            salida.push((await leerCodigos(new File([r.blob], 'q.png')))[0]?.texto);
        }
        return salida;
    });
    prueba('QR se lee con los 4 niveles de corrección', niveles.join('|') === 'nivel L|nivel M|nivel Q|nivel H', niveles.join('|'));

    const colores = await ev(async () => {
        const r = await generarQR('colores', { color: '#0b3d91', fondo: '#fffbe6' });
        return (await leerCodigos(new File([r.blob], 'q.png')))[0]?.texto;
    });
    prueba('QR con color y fondo propios se lee', colores === 'colores', colores);

    const jpg = await ev(async () => {
        const r = await generarQR('en jpeg', { formato: 'jpg' });
        const b = new Uint8Array(await r.blob.arrayBuffer());
        return { magia: [b[0], b[1]], texto: (await leerCodigos(new File([r.blob], 'q.jpg')))[0]?.texto };
    });
    prueba('QR en JPEG es un JPEG y se lee', jpg.magia.join() === '255,216' && jpg.texto === 'en jpeg', JSON.stringify(jpg));

    const svg = await ev(async () => (await (await generarQR('svg', { formato: 'svg' })).blob.text()));
    prueba('QR en SVG tiene <svg y un trazo', svg.includes('<svg') && svg.includes('<path'));

    const barras = await ev(async () => {
        const casos = [['code128', 'ABC-12345'], ['code39', 'ABC-123'], ['ean13', '590123412345'], ['ean8', '9638507'],
                       ['upca', '01234567890'], ['itf', '12345670']];
        const salida = {};
        for (const [tipo, dato] of casos) {
            const r = await generarBarras(tipo, dato);
            const leidos = await leerCodigos(new File([r.blob], 'b.png'));
            salida[tipo] = leidos[0] ? leidos[0].texto : null;
        }
        return salida;
    });
    prueba('Code 128 se lee igual', barras.code128 === 'ABC-12345', barras.code128);
    prueba('Code 39 se lee igual', barras.code39 === 'ABC-123', barras.code39);
    prueba('EAN-13 agrega el dígito verificador', barras.ean13 === '5901234123457', barras.ean13);
    prueba('EAN-8 agrega el dígito verificador', barras.ean8 === '96385074', barras.ean8);
    prueba('UPC-A agrega el dígito verificador', barras.upca === '012345678905', barras.upca);
    prueba('ITF se lee igual', barras.itf === '12345670', barras.itf);

    const svgB = await ev(async () => (await (await generarBarras('code128', 'X1', { formato: 'svg' })).blob.text()));
    prueba('código de barras en SVG', svgB.includes('<svg') && svgB.includes('xmlns'));

    const errores2 = await ev(async () => {
        const msg = async (t, d) => { try { await generarBarras(t, d); return null; } catch (e) { return e.message; } };
        let vacio = null; try { await generarQR(''); } catch (e) { vacio = e.message; }
        return { ean: await msg('ean13', 'abc'), vacio: await msg('code128', ''), qrVacio: vacio, tipo: await msg('xx', 'a') };
    });
    prueba('un EAN-13 con letras da un error claro en español', /no es válido para EAN-13/.test(errores2.ean || ''), errores2.ean);
    prueba('contenido vacío da error', /Falta/.test(errores2.vacio || '') && /Falta/.test(errores2.qrVacio || ''));
    prueba('tipo desconocido da error', /no soportado/.test(errores2.tipo || ''));

    const varios = await ev(async () => {
        const a = await imagenACanvas((await generarQR('primero', { caja: 6 })).blob);
        const b = await imagenACanvas((await generarBarras('code128', 'SEGUNDO')).blob);
        const hoja = crearCanvas(Math.max(a.width, b.width) + 100, a.height + b.height + 150);
        const c = hoja.getContext('2d');
        c.fillStyle = '#fff'; c.fillRect(0, 0, hoja.width, hoja.height);
        c.drawImage(a, 40, 40); c.drawImage(b, 40, a.height + 110);
        return leerCodigosDeCanvas(hoja).map(r => r.texto).sort();
    });
    prueba('en una misma imagen lee varios códigos (QR + barras)', varios.join('|') === 'SEGUNDO|primero', varios.join('|'));

    const vacia = await ev(async () => {
        const c = crearCanvas(300, 300); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 300, 300);
        return leerCodigosDeCanvas(c).length;
    });
    prueba('una imagen sin códigos no devuelve nada', vacia === 0);

    prueba('sin errores de JavaScript durante las pruebas', !errores.length, errores.join(' | '));
    await navegador.close();
    fin();
})().catch(e => { console.log('ERROR:', e.message); process.exit(1); });
