// Arranque: versión, copia sin conexión (service worker), botón "Instalar app" y aviso de versión nueva.
// Va al final: usa lo definido en los archivos anteriores.

document.getElementById("lbl-version").textContent = "v" + VERSION_APP;

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("sw.js").catch(err => console.warn("Service Worker no registrado:", err));
    });
}

// Botón "Instalar app" (Chrome y Edge avisan cuando se puede instalar)
const btnInstalar = document.getElementById("btn-instalar-app");
let instalacionPendiente = null;
window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    instalacionPendiente = e;
    btnInstalar.hidden = false;
});
btnInstalar.addEventListener("click", async () => {
    if (!instalacionPendiente) return;
    instalacionPendiente.prompt();
    await instalacionPendiente.userChoice;
    instalacionPendiente = null;
    btnInstalar.hidden = true;
});
window.addEventListener("appinstalled", () => { btnInstalar.hidden = true; });

// Aviso de versión nueva: se compara VERSION_APP con la del index.html publicado, sin usar la copia guardada.
(async function avisarVersionNueva() {
    if (!location.protocol.startsWith("http")) return;
    try {
        const resp = await fetch("index.html?v=" + Date.now(), { cache: "no-store" });
        if (!resp.ok) return;
        const publicada = (await resp.text()).match(/const VERSION_APP = "(\d{4}\.\d{2}\.\d{2}-\d+)"/);
        if (publicada && publicada[1] !== VERSION_APP) document.getElementById("btn-actualizar-app").hidden = false;
    } catch (e) { /* sin conexión: no hay nada que avisar */ }
})();
document.getElementById("btn-actualizar-app").addEventListener("click", () => location.reload());
