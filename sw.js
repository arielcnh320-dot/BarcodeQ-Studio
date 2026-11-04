// Service Worker de Barcode Studio
// - La app (index.html, css/estilos.css, js/ y lib/) se busca primero en la red para recibir siempre la última
//   versión de Netlify; si no hay conexión, se usa la copia guardada. La app no usa ningún sitio externo.
// Cambiar VERSION cuando se agreguen archivos nuevos a la lista de precarga (por ejemplo un archivo nuevo en js/:
// también va en PRECARGA, en el mismo orden que en index.html).

const VERSION = "barcode-studio-v1";

// Con señal débil, si la red tarda más que esto en responder se abre la copia guardada de la app
const ESPERA_RED_MS = 4000;

const PRECARGA = [
    "./",
    "./index.html",
    "./css/estilos.css",
    "./lib/pdf-lib.min.js",
    "./lib/pdf.min.js",
    "./lib/pdf.worker.min.js",
    "./lib/JsBarcode.all.min.js",
    "./lib/qrcode.js",
    "./lib/jszip.min.js",
    "./lib/zxing.min.js",
    "./js/constantes_y_textos.js",
    "./js/datos.js",
    "./js/codigos.js",
    "./js/lectura.js",
    "./js/imposicion.js",
    "./js/pdf_jpeg.js",
    "./js/eventos.js",
    "./js/inicio.js",
    "./manifest.webmanifest",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
    "./icons/icon-maskable-192.png",
    "./icons/icon-maskable-512.png",
    "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(VERSION)
            .then((cache) => Promise.allSettled(PRECARGA.map((url) => cache.add(url))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys()
            .then((claves) => Promise.all(claves.filter((c) => c !== VERSION).map((c) => caches.delete(c))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (req.method !== "GET") return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    // Red primero, caché como respaldo. Se usa la copia guardada si no hay conexión, si el servidor responde
    // con error (503, 404...) o si la red tarda más de ESPERA_RED_MS (señal débil).
    // La respuesta de la red, cuando llega, igual actualiza la copia para la próxima vez.
    const red = fetch(req).then((resp) => {
        if (resp.ok) {
            const copia = resp.clone();
            caches.open(VERSION).then((cache) => cache.put(req, copia));
        }
        return resp;
    });
    event.waitUntil(red.catch(() => {}));
    event.respondWith(new Promise((resolve, reject) => {
        let respondido = false;
        const responder = (resp) => { if (!respondido) { respondido = true; resolve(resp); } };
        const copiaGuardada = (conPaginaPrincipal) => caches.match(req)
            .then((r) => r || (conPaginaPrincipal ? caches.match("./index.html") : undefined));
        const espera = setTimeout(() => copiaGuardada(req.mode === "navigate").then((r) => { if (r) responder(r); }), ESPERA_RED_MS);
        red.then((resp) => {
            clearTimeout(espera);
            if (resp.ok) return responder(resp);
            return copiaGuardada(false).then((r) => responder(r || resp));
        }).catch(() => {
            clearTimeout(espera);
            return copiaGuardada(true).then((r) => {
                if (r) responder(r);
                else if (!respondido) { respondido = true; reject(new Error("Sin conexión y sin copia guardada")); }
            });
        });
    }));
});
