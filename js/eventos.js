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

    async etiquetas(f, salida) {
        if (!csvEtiquetas) throw new Error("Elegí primero el archivo CSV");
        const { registros, omitidas } = registrosDeCSV(csvEtiquetas, {
            tieneEncabezado: marcado(f, "encabezado"), colCodigo: parseInt(f.elements.colCodigo.value, 10), colTexto: columnasTextoElegidas(f)
        });
        const r = await generarEtiquetas(registros, opcionesEtiquetas(f), (i, n) => { salida.textContent = `Generando etiqueta ${i} de ${n}…`; });
        const aviso = omitidas ? ` Se salteó ${omitidas} fila${omitidas === 1 ? "" : "s"} sin código.` : "";
        return { pdf: r.bytes, nombre: "etiquetas.pdf", nota: `${r.etiquetas} etiquetas en ${r.hojas} hoja${r.hojas === 1 ? "" : "s"} (${r.columnas}×${r.filas} por hoja).${aviso}` };
    },

    async vdp(f, salida) {
        const entero = nombre => { const v = parseInt(f.elements[nombre].value, 10); return Number.isFinite(v) ? v : null; };
        const imposicion = marcado(f, "impOn") ? {
            pliego: texto(f, "impPliego"), horizontal: marcado(f, "impHorizontal"), columnas: numero(f, "impColumnas", 2), filas: numero(f, "impFilas", 2),
            calle: numero(f, "impCalle", 4), margen: numero(f, "impMargen", 10), marcas: marcado(f, "impMarcas")
        } : null;
        const r = await disenador.generar({ desde: entero("desde") || 1, hasta: entero("hasta") || Infinity, imposicion },
            (i, n) => { salida.textContent = `Generando página ${i} de ${n}…`; });
        const nota = `${r.paginas} página${r.paginas === 1 ? "" : "s"} con datos variables` + (imposicion ? `, acomodadas en ${r.pliegos} pliego${r.pliegos === 1 ? "" : "s"}.` : ".") + (r.avisos.length ? " " + r.avisos.join(" ") : "");
        return { pdf: r.bytes, nombre: `${nombreBase(disenador.nombrePlantilla())}-datos-variables.pdf`, nota };
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
    if (res.nota) {
        const nota = document.createElement("p");
        nota.className = "ayuda";
        nota.textContent = res.nota;
        caja.appendChild(nota);
    }
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
        const boton = form.querySelector("button.btn-accion");
        boton.disabled = true;
        salida.dataset.vista = "";
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
// En "Datos variables" se editan muchos campos: Enter en uno de ellos no genera el PDF (solo el botón)
document.getElementById("form-vdp").addEventListener("keydown", e => {
    if (e.key === "Enter" && e.target.tagName === "INPUT" && e.target.type !== "submit") e.preventDefault();
});
function _opciones(select, lista) {
    lista.forEach(([valor, nombre]) => select.appendChild(new Option(nombre, valor)));
}
document.querySelectorAll("select[data-llenar]").forEach(s => {
    const tipos = TIPOS_BARRAS.map(t => [t.id, t.nombre]);
    const listas = {
        "tipos-barras": tipos,
        "tipos-con-qr": [["qr", "QR"], ...tipos],
        modos: MODOS_IMPOSICION.map(m => [m.id, m.nombre]),
        "pliegos-fijos": Object.entries(PLIEGOS).map(([n, [w, h]]) => [n, `${n} (${w}×${h} mm)`]),
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

// ---- Etiquetas en serie (CSV) ----
let csvEtiquetas = null; // filas del CSV elegido: lista de listas de celdas
const formEtiquetas = document.querySelector('[data-accion="etiquetas"]');

function opcionesEtiquetas(f) {
    const pliego = texto(f, "pliego");
    return {
        tipo: texto(f, "tipo"), ancho: numero(f, "anchoE", 50), alto: numero(f, "altoE", 30),
        pliego: pliego === "custom" ? [numero(f, "sw", 210), numero(f, "sh", 297)] : pliego,
        horizontal: marcado(f, "horizontal"), margen: numero(f, "margen", 10), calle: numero(f, "calle", 2),
        copias: Math.max(1, Math.floor(numero(f, "copias", 1))), contorno: marcado(f, "contorno"), mostrarTexto: marcado(f, "texto")
    };
}

// Escribe cuántas etiquetas entran por hoja y, si ya hay archivo, cuántas hojas salen
function actualizarResumenEtiquetas() {
    const f = formEtiquetas, el = f.querySelector("[data-resumen]");
    f.querySelector("[data-solo-medida]").hidden = f.elements.pliego.value !== "custom";
    try {
        const o = opcionesEtiquetas(f), g = grillaDeEtiquetas(o);
        if (g.columnas < 1 || g.filas < 1) { el.textContent = "La etiqueta no entra en el pliego con ese margen."; return; }
        let t = `Entran ${g.columnas}×${g.filas} = ${g.columnas * g.filas} etiquetas por hoja.`;
        if (csvEtiquetas) {
            const n = registrosDeCSV(csvEtiquetas, {
                tieneEncabezado: marcado(f, "encabezado"), colCodigo: parseInt(f.elements.colCodigo.value, 10), colTexto: -1
            }).registros.length * o.copias;
            t += ` Con ${n} etiqueta${n === 1 ? "" : "s"} salen ${Math.ceil(n / (g.columnas * g.filas))} hoja${Math.ceil(n / (g.columnas * g.filas)) === 1 ? "" : "s"}.`;
        }
        el.textContent = t;
    } catch (e) { el.textContent = ""; }
}

function columnasTextoElegidas(f) {
    return Array.from(f.querySelectorAll("[data-columnas-texto] input:checked")).map(c => parseInt(c.value, 10));
}

// Si hay una columna que por el título parece ser el código (QR, código, serie…) la elige sola
function adivinarColumnaCodigo(titulos) {
    for (const patron of [/^qr/i, /^c[oó]digo/i, /^code/i, /barcode|c[oó]digo.?de.?barras/i, /^sku$/i, /^(n[uú]mero.?de.?)?serie|^serial/i, /^id$/i]) {
        const i = titulos.findIndex(t => patron.test(t.trim()));
        if (i >= 0) return i;
    }
    return 0;
}

// Llena la lista de la columna del código y las casillas del texto con los títulos del CSV
// (o "Columna 1, 2…" si no hay fila de títulos). Con `conservar` se mantienen las elecciones hechas (al
// cambiar solo la casilla de los títulos); con un archivo nuevo se empieza limpio.
function llenarColumnasEtiquetas(conservar = false) {
    const f = formEtiquetas;
    const filas = csvEtiquetas || [];
    const ancho = Math.max(0, ...filas.map(r => r.length));
    const conTitulos = marcado(f, "encabezado");
    const titulos = Array.from({ length: ancho }, (_, i) => (conTitulos && (filas[0][i] || "").trim()) || `Columna ${i + 1}`);
    const eraTexto = new Set(conservar ? columnasTextoElegidas(f) : []);
    const eraCodigo = conservar ? f.elements.colCodigo.value : "";

    const select = f.elements.colCodigo;
    select.textContent = "";
    select.disabled = !filas.length;
    titulos.forEach((t, i) => select.appendChild(new Option(t, i)));
    select.value = eraCodigo !== "" && Number(eraCodigo) < ancho && !Number.isNaN(Number(eraCodigo)) && f.dataset.yaElegido ? eraCodigo : adivinarColumnaCodigo(titulos);

    const caja = f.querySelector("[data-columnas-texto]");
    caja.textContent = "";
    if (!filas.length) {
        const vacio = document.createElement("span");
        vacio.className = "vacio";
        vacio.textContent = "Primero elegí el archivo";
        caja.appendChild(vacio);
        return;
    }
    titulos.forEach((t, i) => {
        const label = document.createElement("label");
        label.className = "fila";
        const caja2 = document.createElement("input");
        caja2.type = "checkbox";
        caja2.value = i;
        caja2.checked = eraTexto.has(i);
        label.append(caja2, document.createTextNode(" " + t));
        caja.appendChild(label);
    });
}

// Muestra el CSV como una tabla con los títulos; marca en color la columna del código y las del texto
function mostrarVistaPreviaCSV() {
    const f = formEtiquetas, salida = f.parentElement.querySelector("[data-salida]");
    if (!csvEtiquetas) return;
    const conTitulos = marcado(f, "encabezado");
    const ancho = Math.max(0, ...csvEtiquetas.map(r => r.length));
    const colCodigo = parseInt(f.elements.colCodigo.value, 10), colsTexto = new Set(columnasTextoElegidas(f));
    const titulos = Array.from({ length: ancho }, (_, i) => (conTitulos && (csvEtiquetas[0][i] || "").trim()) || `Columna ${i + 1}`);
    const clase = i => (i === colCodigo ? "col-codigo" : colsTexto.has(i) ? "col-texto" : "");
    const datos = csvEtiquetas.slice(conTitulos ? 1 : 0);
    const { registros } = registrosDeCSV(csvEtiquetas, { tieneEncabezado: conTitulos, colCodigo, colTexto: -1 });

    salida.textContent = "";
    salida.dataset.vista = "csv";
    const leyenda = document.createElement("p");
    leyenda.className = "leyenda";
    leyenda.innerHTML = '<span><i class="c-codigo"></i>Código</span><span><i class="c-texto"></i>Texto de abajo</span>';
    const total = document.createElement("span");
    total.textContent = `${registros.length} código${registros.length === 1 ? "" : "s"} para imprimir (de ${datos.length} fila${datos.length === 1 ? "" : "s"}). Tocá el título de una columna para usarla como código.`;
    leyenda.appendChild(total);
    const contenedor = document.createElement("div");
    contenedor.className = "tabla-csv";
    const tabla = document.createElement("table");
    const cabecera = tabla.createTHead().insertRow();
    const fila0 = document.createElement("th");
    fila0.textContent = "#";
    cabecera.appendChild(fila0);
    titulos.forEach((t, i) => {
        const th = document.createElement("th");
        th.textContent = t;
        th.title = "Tocá para usar esta columna como código";
        th.className = clase(i);
        th.addEventListener("click", () => { f.elements.colCodigo.value = i; f.dataset.yaElegido = "1"; refrescarEtiquetas(); });
        cabecera.appendChild(th);
    });
    const cuerpo = tabla.createTBody();
    datos.slice(0, 12).forEach((celdas, n) => {
        const tr = cuerpo.insertRow();
        const num = tr.insertCell();
        num.className = "num";
        num.textContent = n + (conTitulos ? 2 : 1); // número de fila en la planilla
        for (let i = 0; i < ancho; i++) {
            const td = tr.insertCell();
            td.className = clase(i);
            td.textContent = celdas[i] || "";
            td.title = celdas[i] || "";
        }
    });
    contenedor.appendChild(tabla);
    salida.append(leyenda, contenedor);
    if (datos.length > 12) {
        const mas = document.createElement("p");
        mas.className = "ayuda";
        mas.textContent = `…y ${datos.length - 12} fila${datos.length - 12 === 1 ? "" : "s"} más.`;
        salida.appendChild(mas);
    }
}

function refrescarEtiquetas() {
    actualizarResumenEtiquetas();
    const salida = formEtiquetas.parentElement.querySelector("[data-salida]");
    if (csvEtiquetas && salida.dataset.vista === "csv") mostrarVistaPreviaCSV(); // solo mientras se ve la vista previa (no pisa un resultado)
}

formEtiquetas.elements.archivo.addEventListener("change", async e => {
    const salida = formEtiquetas.parentElement.querySelector("[data-salida]");
    csvEtiquetas = null;
    delete formEtiquetas.dataset.yaElegido;
    const [archivo] = e.target.files;
    try {
        if (!archivo) throw new Error("");
        csvEtiquetas = await leerArchivoCSV(archivo);
        llenarColumnasEtiquetas();
        mostrarVistaPreviaCSV();
    } catch (err) {
        llenarColumnasEtiquetas();
        salida.dataset.vista = "";
        if (err.message) mostrarError(salida, err);
    }
    actualizarResumenEtiquetas();
});
formEtiquetas.elements.encabezado.addEventListener("change", () => { llenarColumnasEtiquetas(true); refrescarEtiquetas(); });
formEtiquetas.elements.colCodigo.addEventListener("change", () => { formEtiquetas.dataset.yaElegido = "1"; });
formEtiquetas.addEventListener("input", refrescarEtiquetas);
formEtiquetas.addEventListener("change", refrescarEtiquetas);
formEtiquetas.elements.pliego.value = "A4";
actualizarResumenEtiquetas();

formEtiquetas.querySelector("[data-ejemplo-csv]").addEventListener("click", () => {
    const filas = ["codigo;descripcion", "ABC-0001;Tornillo M6", "ABC-0002;Tuerca M6", "ABC-0003;Arandela 6 mm", "ABC-0004;Caño 1/2\"", "ABC-0005;Pieza ñandú"];
    descargar(new Blob(["\uFEFF" + filas.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" }), "ejemplo-etiquetas.csv");
});

// ---- Datos variables (plantilla PDF + CSV) ----
const formVdp = document.getElementById("form-vdp");
const salidaVdp = () => formVdp.parentElement.querySelector("[data-salida]");

async function elegirPlantillaVdp() {
    const [archivo] = archivosDe(formVdp, "plantilla");
    if (!archivo) return;
    try {
        const p = await disenador.cargarPlantilla(archivo, numero(formVdp, "paginaPlantilla", 1));
        formVdp.elements.paginaPlantilla.max = p.paginas;
        formVdp.elements.paginaPlantilla.value = p.nro;
    } catch (e) {
        mostrarError(salidaVdp(), new Error("No se pudo leer la plantilla: tiene que ser un PDF válido (y sin contraseña)."));
    }
}
formVdp.elements.plantilla.addEventListener("change", elegirPlantillaVdp);
formVdp.elements.paginaPlantilla.addEventListener("change", elegirPlantillaVdp);

formVdp.elements.csv.addEventListener("change", async e => {
    const [archivo] = e.target.files;
    if (!archivo) return;
    try {
        disenador.cargarCSV(await leerArchivoCSV(archivo), marcado(formVdp, "encabezado"));
    } catch (err) { mostrarError(salidaVdp(), err); }
});
formVdp.elements.encabezado.addEventListener("change", () => disenador.cambiarEncabezado(marcado(formVdp, "encabezado")));

formVdp.querySelector("[data-abrir-diseno]").addEventListener("change", async e => {
    const [archivo] = e.target.files;
    e.target.value = ""; // para poder abrir el mismo archivo otra vez
    if (!archivo) return;
    try {
        const aviso = await disenador.abrirDiseno(archivo);
        avisar(aviso || "Diseño abierto");
    } catch (err) { mostrarError(salidaVdp(), err); }
});

// ---- Pestañas ----
const vistas = Array.from(document.querySelectorAll(".vista"));
const barraPestanas = document.getElementById("barra-pestanas");

function abrirPestana(id) {
    vistas.forEach(v => v.classList.toggle("activa", v.id === id));
    barraPestanas.querySelectorAll(".btn").forEach(b => b.classList.toggle("activa", b.dataset.vista === id));
    guardarPref("pestana", id);
    if (id === "vista-vdp") disenador.redibujar(); // la hoja se mide con el ancho disponible: hay que hacerlo con la pestaña a la vista
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
