// Corre todas las pruebas de la app: node pruebas/correr.js [nombre ...]
// Arranca un servidor local con los mismos encabezados que Netlify, ejecuta cada prueba y da un resumen.
// La app no usa red ni datos de clientes. Necesita Node y Playwright.
const { spawn, spawnSync } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const RAIZ = path.resolve(__dirname, '..');
const PUERTO = process.env.BS_PUERTO || '8766';
const todas = ['archivos', 'codigos', 'imposicion', 'etiquetas', 'pdf_jpeg', 'pestanas'];
const elegidas = process.argv.slice(2).length ? process.argv.slice(2) : todas;

function esperarServidor(intentos = 40) {
    return new Promise((ok, fallo) => {
        const probar = n => http.get(`http://127.0.0.1:${PUERTO}/index.html`, r => { r.resume(); ok(); })
            .on('error', () => n <= 0 ? fallo(new Error('el servidor no arrancó')) : setTimeout(() => probar(n - 1), 250));
        probar(intentos);
    });
}

(async () => {
    const servidor = spawn('python3', ['-I', path.join(__dirname, 'servidor_con_headers.py'), RAIZ, PUERTO], { stdio: 'ignore' });
    const resultados = [];
    try {
        await esperarServidor();
        for (const nombre of elegidas) {
            const archivo = path.join(__dirname, nombre + '.js');
            if (!fs.existsSync(archivo)) { console.log(`\n=== ${nombre}: NO EXISTE ===`); resultados.push([nombre, false]); continue; }
            console.log(`\n=== ${nombre} ===`);
            const r = spawnSync('node', [archivo], { stdio: 'inherit', env: { ...process.env, BS_URL: `http://127.0.0.1:${PUERTO}/index.html` } });
            resultados.push([nombre, r.status === 0]);
        }
    } finally {
        servidor.kill();
    }
    console.log('\n================ RESUMEN ================');
    for (const [n, bien] of resultados) console.log(`${bien ? 'OK   ' : 'FALLA'} ${n}`);
    const mal = resultados.filter(r => !r[1]).length;
    console.log(mal ? `\n${mal} prueba(s) con fallas` : '\nTodo en orden');
    process.exit(mal ? 1 : 0);
})().catch(e => { console.log('ERROR:', e.message); process.exit(1); });
