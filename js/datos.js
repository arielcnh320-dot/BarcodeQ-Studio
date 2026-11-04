// Utilidades comunes: lo guardado en el equipo (localStorage), lectura de formularios, descargas y mensajes.

function guardarPref(clave, valor) {
    try { localStorage.setItem("bs_" + clave, JSON.stringify(valor)); } catch (e) { /* sin almacenamiento: no pasa nada */ }
}

function leerPref(clave, porDefecto) {
    try {
        const v = localStorage.getItem("bs_" + clave);
        return v === null ? porDefecto : JSON.parse(v);
    } catch (e) { return porDefecto; }
}

// Valor numérico de un campo del formulario (si está vacío o mal escrito, devuelve porDefecto)
function numero(form, nombre, porDefecto) {
    const v = parseFloat(String(form.elements[nombre] ? form.elements[nombre].value : "").replace(",", "."));
    return Number.isFinite(v) ? v : porDefecto;
}

function texto(form, nombre) {
    return form.elements[nombre] ? form.elements[nombre].value : "";
}

function marcado(form, nombre) {
    return !!(form.elements[nombre] && form.elements[nombre].checked);
}

function archivosDe(form, nombre) {
    const campo = form.elements[nombre];
    return campo && campo.files ? Array.from(campo.files) : [];
}

async function leerBytes(archivo) {
    return new Uint8Array(await archivo.arrayBuffer());
}

function descargar(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function canvasABlob(canvas, tipo, calidad) {
    return new Promise((ok, fallo) => canvas.toBlob(b => b ? ok(b) : fallo(new Error("No se pudo armar la imagen")), tipo, calidad));
}

function crearCanvas(ancho, alto) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(ancho));
    c.height = Math.max(1, Math.round(alto));
    return c;
}

function extension(nombre) {
    const m = /\.([^.]+)$/.exec(nombre || "");
    return m ? m[1].toLowerCase() : "";
}

function nombreBase(nombre) {
    return (nombre || "archivo").replace(/\.[^.]+$/, "");
}

function tipoMime(formato) {
    return formato === "svg" ? "image/svg+xml" : formato === "jpg" ? "image/jpeg" : "image/png";
}
