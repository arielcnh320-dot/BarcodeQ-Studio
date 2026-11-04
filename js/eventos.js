// Conecta las pestañas y los formularios con las funciones. Cada formulario tiene data-accion="nombre"
// y su lógica está en ACCIONES. Una acción devuelve uno de estos resultados:
//   { imagen: Blob, nombre }  { pdf: Uint8Array, nombre }  { archivo: Blob, nombre }  { texto: "..." }

function avisar(mensaje) {
    const el = document.getElementById("aviso-flotante");
    el.textContent = mensaje;
    el.classList.add("visible");
    clearTimeout(avisar._t);
    avisar._t = setTimeout(() => el.classList.remove("visible"), 3000);
}

const ACCIONES = {
    async barras(f) {
        const r = await generarBarras(texto(f, "tipo"), texto(f, "dato").trim(), {
            formato: texto(f, "formato"), dpi: numero(f, "dpi", 300), modulo: numero(f, "modulo", 0.33),
            alto: numero(f, "alto", 15), mostrarTexto: marcado(f, "texto")
        });
        return { imagen: r.blob, nombre: `barras-${texto(f, "tipo")}.${r.formato}` };
    },

    async qr(f) {
        const r = await generarQR(texto(f, "dato"), {
            formato: texto(f, "formato"), caja: numero(f, "caja", 10), margen: numero(f, "margen", 4),
            nivel: texto(f, "nivel"), color: texto(f, "color"), fondo: texto(f, "fondo")
        });
        return { imagen: r.blob, nombre: `qr.${r.formato}` };
    },

    async leer(f, salida) {
        const [archivo] = archivosDe(f, "archivo");
        const lista = await leerCodigos(archivo, (i, n) => { salida.textContent = `Leyendo página ${i} de ${n}…`; });
        if (!lista.length) return { texto: "No se encontró ningún código. Probá con una imagen más grande o más nítida." };
        return { texto: lista.map(c => `Pág. ${c.pagina} · ${c.tipo}\n${c.texto}`).join("\n\n") };
    },

    async imponer(f) {
        const [archivo] = archivosDe(f, "archivo");
        const pliego = texto(f, "pliego");
        const bytes = await imponer(await leerBytes(archivo), {
            modo: texto(f, "modo"),
            pliego: pliego === "custom" ? [numero(f, "ancho", 210), numero(f, "alto", 297)] : pliego,
            horizontal: marcado(f, "horizontal"), columnas: numero(f, "columnas", 2), filas: numero(f, "filas", 2),
            calle: numero(f, "calle", 4), margen: numero(f, "margen", 10), sangrado: numero(f, "sangrado", 0),
            marcas: marcado(f, "marcas")
        });
        return { pdf: bytes, nombre: `${nombreBase(archivo.name)}-imposicion.pdf` };
    },

    async "img-pdf"(f) {
        const bytes = await imagenesAPdf(archivosDe(f, "archivos"), {
            pagina: texto(f, "pagina"), dpi: numero(f, "dpi", 300), margen: numero(f, "margen", 0)
        });
        return { pdf: bytes, nombre: "imagenes.pdf" };
    },

    async "pdf-img"(f, salida) {
        const [archivo] = archivosDe(f, "archivo");
        const r = await pdfAJpeg(await leerBytes(archivo), archivo.name,
            { dpi: numero(f, "dpi", 200), calidad: numero(f, "calidad", 90) },
            (i, n) => { salida.textContent = `Convirtiendo página ${i} de ${n}…`; });
        return r.nombre.endsWith(".jpg") ? { imagen: r.blob, nombre: r.nombre } : { archivo: r.blob, nombre: r.nombre };
    },

    async unir(f) {
        return { pdf: await unirPdfs(archivosDe(f, "archivos")), nombre: "unido.pdf" };
    },

    async estampar(f) {
        const [archivo] = archivosDe(f, "archivo");
        const bytes = await insertarCodigoEnPdf(await leerBytes(archivo), {
            tipo: texto(f, "tipo"), dato: texto(f, "dato").trim(), x: numero(f, "x", 10), y: numero(f, "y", 10),
            ancho: numero(f, "ancho", 25), paginas: texto(f, "paginas")
        });
        return { pdf: bytes, nombre: `${nombreBase(archivo.name)}-con-codigo.pdf` };
    }
};

// ---- Mostrar el resultado ----
function _enlaceDescarga(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.className = "descarga";
    a.href = url;
    a.download = nombre;
    a.textContent = `⬇ Descargar ${nombre}`;
    return { a, url };
}

async function _vistaPreviaPdf(bytes, contenedor) {
    const pdf = await abrirPdfJs(bytes);
    const info = document.createElement("p");
    info.className = "ayuda";
    info.textContent = `${pdf.numPages} página${pdf.numPages === 1 ? "" : "s"}` + (pdf.numPages > 4 ? " (se muestran las primeras 4)" : "");
    contenedor.appendChild(info);
    const fila = document.createElement("div");
    fila.className = "paginas";
    contenedor.appendChild(fila);
    for (let i = 1; i <= Math.min(4, pdf.numPages); i++) {
        const pagina = await pdf.getPage(i);
        const ancho = pagina.getViewport({ scale: 1 }).width;
        const canvas = await paginaACanvas(pagina, 72 * Math.min(2, 420 / ancho * 1.5));
        canvas.style.width = Math.min(420, canvas.width) + "px";
        fila.appendChild(canvas);
    }
}

async function mostrarResultado(salida, res) {
    (salida._urls || []).forEach(u => URL.revokeObjectURL(u));
    salida._urls = [];
    salida.textContent = "";
    const caja = document.createElement("div");
    caja.className = "resultado";
    salida.appendChild(caja);
    if (res.texto !== undefined) {
        const pre = document.createElement("pre");
        pre.textContent = res.texto;
        caja.appendChild(pre);
        return;
    }
    const blob = res.pdf ? new Blob([res.pdf], { type: "application/pdf" }) : res.imagen || res.archivo;
    const { a, url } = _enlaceDescarga(blob, res.nombre);
    salida._urls.push(url);
    if (res.imagen) {
        const img = document.createElement("img");
        img.src = url;
        img.alt = res.nombre;
        caja.appendChild(img);
    } else if (res.pdf) {
        await _vistaPreviaPdf(res.pdf, caja);
    }
    caja.appendChild(a);
}

function mostrarError(salida, e) {
    salida.textContent = "";
    const p = document.createElement("span");
    p.className = "error";
    p.textContent = (e && e.message) || String(e);
    salida.appendChild(p);
}

document.querySelectorAll("form[data-accion]").forEach(form => {
    form.addEventListener("submit", async ev => {
        ev.preventDefault();
        const salida = form.parentElement.querySelector("[data-salida]");
        const boton = form.querySelector("button");
        boton.disabled = true;
        salida.textContent = "Procesando…";
        try {
            await mostrarResultado(salida, await ACCIONES[form.dataset.accion](form, salida));
        } catch (e) {
            console.warn(e); // los errores esperables (dato inválido, falta un archivo) se avisan en pantalla
            mostrarError(salida, e);
        } finally {
            boton.disabled = false;
        }
    });
});

// ---- Listas de opciones ----
function _opciones(select, lista) {
    lista.forEach(([valor, nombre]) => select.appendChild(new Option(nombre, valor)));
}
document.querySelectorAll("select[data-llenar]").forEach(s => {
    const tipos = TIPOS_BARRAS.map(t => [t.id, t.nombre]);
    const listas = {
        "tipos-barras": tipos,
        "tipos-con-qr": [["qr", "QR"], ...tipos],
        modos: MODOS_IMPOSICION.map(m => [m.id, m.nombre]),
        pliegos: [...Object.entries(PLIEGOS).map(([n, [w, h]]) => [n, `${n} (${w}×${h} mm)`]), ["custom", "Medida personalizada"]]
    };
    _opciones(s, listas[s.dataset.llenar]);
});
document.querySelector('[data-accion="imponer"] select[name="pliego"]').value = "A4";

// El dato de ejemplo cambia con el tipo de código elegido
document.querySelector('[data-accion="barras"] select[name="tipo"]').addEventListener("change", e => {
    const t = TIPOS_BARRAS.find(x => x.id === e.target.value);
    if (t) e.target.form.elements.dato.value = t.ejemplo;
});

// Imposición: mostrar solo lo que corresponde al modo y al pliego elegidos
function ajustarFormularioImposicion() {
    const f = document.querySelector('[data-accion="imponer"]');
    f.querySelector("[data-solo-medida]").hidden = f.elements.pliego.value !== "custom";
    f.querySelector("[data-solo-grilla]").hidden = f.elements.modo.value === "booklet";
    f.elements.horizontal.disabled = f.elements.modo.value === "booklet"; // el cuadernillo siempre va apaisado
}
["modo", "pliego"].forEach(n => document.querySelector('[data-accion="imponer"]').elements[n].addEventListener("change", ajustarFormularioImposicion));
ajustarFormularioImposicion();

// ---- Pestañas ----
const vistas = Array.from(document.querySelectorAll(".vista"));
const barraPestanas = document.getElementById("barra-pestanas");

function abrirPestana(id) {
    vistas.forEach(v => v.classList.toggle("activa", v.id === id));
    barraPestanas.querySelectorAll(".btn").forEach(b => b.classList.toggle("activa", b.dataset.vista === id));
    guardarPref("pestana", id);
}

vistas.forEach(v => {
    const b = document.createElement("button");
    b.className = "btn";
    b.dataset.vista = v.id;
    b.textContent = v.dataset.titulo;
    b.addEventListener("click", () => abrirPestana(v.id));
    barraPestanas.appendChild(b);
});
abrirPestana(vistas.some(v => v.id === leerPref("pestana")) ? leerPref("pestana") : vistas[0].id);
