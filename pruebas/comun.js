// Utilidades comunes de las pruebas de la app (Playwright). La app no usa red: no hay nada que simular.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const URL_APP = process.env.BS_URL || 'http://127.0.0.1:8766/index.html';

let ok = 0, mal = 0;
function prueba(nombre, condicion, detalle = '') {
    condicion ? ok++ : mal++;
    console.log(`${condicion ? 'OK   ' : 'FALLA'} ${nombre}${detalle ? ' — ' + String(detalle).slice(0, 200) : ''}`);
}
function fin() {
    console.log(`\n${ok} OK, ${mal} FALLAS`);
    process.exit(mal ? 1 : 0);
}
const dormir = ms => new Promise(r => setTimeout(r, ms));

// Abre la app y junta los errores de JavaScript y de carga. Devuelve { navegador, pagina, errores }.
async function abrirApp(opciones = {}) {
    const navegador = await chromium.launch();
    const contexto = await navegador.newContext({ acceptDownloads: true, serviceWorkers: opciones.serviceWorkers || 'block', ...(opciones.contexto || {}) });
    const pagina = await contexto.newPage();
    const errores = [];
    pagina.on('pageerror', e => errores.push('pageerror: ' + e.message));
    pagina.on('console', m => { if (m.type() === 'error') errores.push('console: ' + m.text()); });
    pagina.on('requestfailed', r => errores.push('requestfailed: ' + r.url()));
    await pagina.goto(URL_APP);
    return { navegador, contexto, pagina, errores };
}

// Un PDF de prueba con N páginas (cada una dice "P1", "P2"...) hecho dentro de la página con pdf-lib
function crearPdfDePrueba(pagina, n, ancho = 200, alto = 300) {
    return pagina.evaluate(async ([n, ancho, alto]) => {
        const doc = await PDFLib.PDFDocument.create();
        const fuente = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
        for (let i = 1; i <= n; i++) doc.addPage([ancho, alto]).drawText('P' + i, { x: 20, y: alto / 2, size: 40, font: fuente });
        return Array.from(await doc.save());
    }, [n, ancho, alto]);
}

module.exports = { chromium, prueba, fin, dormir, abrirApp, crearPdfDePrueba, URL_APP, fs, path };
