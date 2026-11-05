// Archivos de la app: index.html carga lib/*.js, css/estilos.css y los js/*.js en orden. Esta prueba cuida que
// - estén todos (ni de más ni de menos) y también en la copia sin conexión (PRECARGA de sw.js), en el mismo orden,
// - index.html siga teniendo `const VERSION_APP = "..."` (la app publicada la busca ahí para avisar que hay una actualización),
// - no haya código ni estilos sueltos grandes dentro de index.html,
// - la app abra sin errores, sin pedir nada a sitios de afuera, y abra sin conexión con la copia guardada.
const fs = require('fs');
const path = require('path');
const { prueba, fin, dormir, abrirApp, URL_APP } = require('./comun');

const RAIZ = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');

const libs = [...html.matchAll(/<script src="(lib\/[^"]+\.js)"><\/script>/g)].map(m => m[1]);
const scripts = [...html.matchAll(/<script src="(js\/[^"]+\.js)"><\/script>/g)].map(m => m[1]);
const estilos = [...html.matchAll(/<link rel="stylesheet" href="(css\/[^"]+\.css)">/g)].map(m => m[1]);
const propios = [...estilos, ...libs, ...scripts];
const enCarpeta = d => fs.readdirSync(path.join(RAIZ, d)).map(f => `${d}/${f}`);
const precarga = [...sw.matchAll(/"\.\/([^"]+)"/g)].map(m => m[1]);

prueba('index.html carga los estilos, las librerías y el código', estilos.length === 1 && libs.length >= 6 && scripts.length >= 6, `${estilos.length} css, ${libs.length} lib, ${scripts.length} js`);
prueba('cada archivo que carga index.html existe', propios.every(f => fs.existsSync(path.join(RAIZ, f))), propios.filter(f => !fs.existsSync(path.join(RAIZ, f))).join(', '));
const sobrantes = [...enCarpeta('js'), ...enCarpeta('css')].filter(f => !propios.includes(f));
prueba('no hay archivos en js/ o css/ que index.html no cargue', !sobrantes.length, sobrantes.join(', '));
const faltanSw = [...propios, 'lib/pdf.worker.min.js'].filter(f => !precarga.includes(f));
prueba('todos están en la copia sin conexión (PRECARGA de sw.js)', !faltanSw.length, faltanSw.join(', '));
const ordenSw = precarga.filter(f => f.startsWith('js/'));
prueba('en sw.js los js/ van en el mismo orden que en index.html', JSON.stringify(ordenSw) === JSON.stringify(scripts), ordenSw.join(' '));
const ordenLib = precarga.filter(f => f.startsWith('lib/') && f !== 'lib/pdf.worker.min.js');
prueba('en sw.js las lib/ van en el mismo orden que en index.html', JSON.stringify(ordenLib) === JSON.stringify(libs));
prueba('index.html tiene const VERSION_APP = "AAAA.MM.DD-N" (aviso de versión nueva)',
    /<script>[^<]*\nconst VERSION_APP = "\d{4}\.\d{2}\.\d{2}-\d+";\n<\/script>/.test(html));
prueba('no queda código ni estilos sueltos grandes dentro de index.html',
    !/<style>/.test(html) && [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].every(m => m[1].length < 600));
prueba('manifest.webmanifest y los íconos existen',
    ['manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-192.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png']
        .every(f => fs.existsSync(path.join(RAIZ, f))));

(async () => {
    // Abre sin errores y sin pedir nada afuera (la política de seguridad de _headers no deja salir a ningún lado)
    const pedidos = [];
    const app = await abrirApp({ serviceWorkers: 'allow' });
    app.pagina.on('request', r => pedidos.push(r.url()));
    await app.pagina.reload();
    await dormir(800);
    prueba('la app abre sin errores de JavaScript ni de carga', !app.errores.length, app.errores.join(' | '));
    const afuera = pedidos.filter(u => !u.startsWith(new URL(URL_APP).origin) && !u.startsWith('blob:') && !u.startsWith('data:'));
    prueba('no pide nada a sitios externos', !afuera.length, afuera.join(', '));
    prueba('las funciones principales están definidas', await app.pagina.evaluate(() =>
        ['generarQR', 'generarBarras', 'leerCodigos', 'imponer', 'generarEtiquetas', 'leerArchivoCSV', 'imagenesAPdf', 'pdfAJpeg', 'unirPdfs', 'insertarCodigoEnPdf'].every(n => typeof window[n] === 'function')));

    // Sin conexión: el service worker guarda todo y la app vuelve a abrir
    await app.pagina.evaluate(() => navigator.serviceWorker.ready);
    await dormir(2500); // tiempo para que termine la precarga
    await app.contexto.setOffline(true);
    const errores2 = [];
    const p2 = await app.contexto.newPage();
    p2.on('pageerror', e => errores2.push(e.message));
    let abrio = true;
    try { await p2.goto(URL_APP, { timeout: 15000 }); } catch (e) { abrio = false; errores2.push(e.message); }
    await dormir(500);
    const listo = abrio && await p2.evaluate(() => typeof generarQR === 'function' && typeof pdfjsLib !== 'undefined' && document.querySelectorAll('.vista').length >= 9).catch(() => false);
    prueba('abre sin conexión con la copia guardada, con todo su código', listo, errores2.join(' | '));
    await app.navegador.close();
    fin();
})().catch(e => { console.log('ERROR:', e.message); process.exit(1); });
