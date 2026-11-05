// Diseñador de "Datos variables": muestra la plantilla PDF y los campos encima (texto, QR, código de barras)
// con los datos de una fila de ejemplo. Los campos se arrastran para ponerlos en su lugar. Las posiciones se
// guardan en milímetros desde arriba a la izquierda, igual que las usa generarDatosVariables (js/variables.js).

const disenador = (() => {
    const GAP_TEXTO_BARRAS_MM = 0.3;
    const estado = {
        plantilla: null,   // { bytes, nro, nombre, anchoPt, altoPt, paginas }
        csv: null,         // { filas, tieneEncabezado, titulos, registros: [{ nro, celdas }] }
        campos: [],
        sel: null,         // id del campo elegido
        filaVista: 0,      // índice dentro de csv.registros
        siguienteId: 1,
        escala: 1,         // píxeles de pantalla por punto de PDF
        imagenes: new Map(), // código de la vista previa: clave → Promise de URL
        dibujo: 0          // para descartar un dibujo de la plantilla que quedó viejo
    };
    const sec = () => document.getElementById("vista-vdp");
    const q = s => sec().querySelector(s);
    const px = mm => mm * MM_A_PT * estado.escala;
    const redondear = v => Math.round(v * 10) / 10;
    const campoElegido = () => estado.campos.find(c => c.id === estado.sel) || null;

    // ---------- Datos de la fila de ejemplo ----------
    function valorVista(c) {
        const reg = estado.csv && estado.csv.registros[estado.filaVista];
        const valores = estado.csv && reg ? valoresDeFila(estado.csv.titulos, reg.celdas) : new Map();
        return interpolar(c.contenido, valores, estado.filaVista + 1);
    }

    function urlImagen(c, valor) {
        const clave = [c.tipo, c.barras, c.borde, c.zonaBlanca, valor].join("|");
        if (!estado.imagenes.has(clave)) {
            if (estado.imagenes.size > 200) estado.imagenes.clear();
            estado.imagenes.set(clave, imagenDeCampo(c, valor).then(bytes => URL.createObjectURL(new Blob([bytes], { type: "image/png" }))));
        }
        return estado.imagenes.get(clave);
    }

    let _ctx = null;
    function anchoTextoPx(txt, tamPx, negrita) {
        _ctx = _ctx || document.createElement("canvas").getContext("2d");
        _ctx.font = `${negrita ? "bold " : ""}${tamPx}px Helvetica, Arial, "Liberation Sans", sans-serif`;
        return Math.max(...txt.split(/\r?\n/).map(l => _ctx.measureText(l).width));
    }

    // ---------- La hoja con los campos ----------
    function elementoCampo(c) {
        const e = document.createElement("div");
        e.className = "campo-vdp" + (c.id === estado.sel ? " sel" : "");
        e.dataset.id = c.id;
        e.style.left = px(c.x) + "px";
        e.style.top = px(c.y) + "px";
        if (c.rotar) e.style.transform = `rotate(${c.rotar}deg)`;
        const valor = valorVista(c);
        if (!valor.trim()) {
            e.classList.add("vacio-fila");
            e.style.width = Math.max(px(c.ancho || 20), 24) + "px";
            e.style.height = Math.max(px(c.tipo === "barras" ? c.alto : c.tipo === "qr" ? c.ancho : 5), 14) + "px";
            e.title = "Este campo está vacío en esta fila: no se dibuja";
        } else if (c.tipo === "texto") {
            e.classList.add("t-texto");
            let tam = c.tam * estado.escala;
            if (c.ancho > 0) {
                const w = px(c.ancho), mayor = anchoTextoPx(valor, tam, c.negrita);
                if (mayor > w) tam = Math.max(5 * estado.escala, tam * w / mayor);
                e.style.width = w + "px";
                e.style.textAlign = c.alinear === "centro" ? "center" : c.alinear === "der" ? "right" : "left";
            }
            e.style.fontSize = tam + "px";
            e.style.fontWeight = c.negrita ? "bold" : "normal";
            e.style.color = c.color;
            e.textContent = valor;
        } else {
            e.classList.add("t-codigo");
            e.style.width = px(c.ancho) + "px";
            const img = document.createElement("img");
            img.alt = "";
            img.style.height = px(c.tipo === "qr" ? c.ancho : c.alto) + "px";
            img.style.objectFit = "fill";
            e.appendChild(img);
            if (c.tipo === "barras" && c.textoDebajo) {
                const t = document.createElement("div");
                t.className = "texto-barras";
                let tam = c.tam * estado.escala;
                const mayor = anchoTextoPx(valor, tam, false);
                if (mayor > px(c.ancho)) tam = Math.max(5 * estado.escala, tam * px(c.ancho) / mayor);
                t.style.fontSize = tam + "px";
                t.style.marginTop = px(GAP_TEXTO_BARRAS_MM) + "px";
                t.textContent = valor;
                e.appendChild(t);
            }
            urlImagen(c, valor).then(url => { img.src = url; })
                .catch(err => {
                    e.classList.add("con-error");
                    const a = document.createElement("div");
                    a.className = "aviso-campo";
                    a.textContent = "⚠ " + (((err && err.message) || "no se pudo armar el código").slice(0, 80));
                    e.appendChild(a);
                });
        }
        if (c.id === estado.sel && !c.rotar && !e.classList.contains("vacio-fila")) {
            const asa = document.createElement("span");
            asa.className = "asa";
            asa.title = "Arrastrá para cambiar el tamaño";
            asa.addEventListener("pointerdown", ev => iniciarArrastre(ev, c, "tamano"));
            e.appendChild(asa);
        }
        e.addEventListener("pointerdown", ev => { if (!ev.target.classList.contains("asa")) iniciarArrastre(ev, c, "mover"); });
        return e;
    }

    function pintarCampos() {
        const capa = q(".capa");
        if (!capa) return;
        capa.textContent = "";
        estado.campos.forEach(c => capa.appendChild(elementoCampo(c)));
    }

    function refrescarCampo(c) {
        const capa = q(".capa");
        const viejo = capa && capa.querySelector(`[data-id="${c.id}"]`);
        if (viejo) viejo.replaceWith(elementoCampo(c)); else pintarCampos();
    }

    async function dibujarEscenario() {
        const esc = q("[data-escenario]");
        const miDibujo = ++estado.dibujo;
        if (!estado.plantilla) {
            esc.innerHTML = '<span class="vacio">Elegí la plantilla (y el CSV) para empezar. Después agregá campos y arrastralos a su lugar.</span>';
            return;
        }
        const libre = esc.clientWidth - 24;
        const ancho = Math.max(280, Math.min(libre > 0 ? libre : 600, 760));
        estado.escala = ancho / estado.plantilla.anchoPt;
        const pdf = await abrirPdfJs(estado.plantilla.bytes);
        const pagina = await pdf.getPage(estado.plantilla.nro);
        const canvas = await paginaACanvas(pagina, 72 * estado.escala * (window.devicePixelRatio || 1));
        if (miDibujo !== estado.dibujo) return; // mientras tanto se pidió otro dibujo
        canvas.style.width = ancho + "px";
        canvas.style.height = estado.plantilla.altoPt * estado.escala + "px";
        const hoja = document.createElement("div");
        hoja.className = "hoja";
        hoja.style.width = canvas.style.width;
        hoja.style.height = canvas.style.height;
        const capa = document.createElement("div");
        capa.className = "capa";
        hoja.append(canvas, capa);
        hoja.addEventListener("pointerdown", ev => { if (ev.target === hoja || ev.target === capa || ev.target === canvas) seleccionar(null); });
        esc.textContent = "";
        esc.appendChild(hoja);
        pintarCampos();
    }

    // ---------- Arrastrar y cambiar de tamaño ----------
    function iniciarArrastre(ev, c, modo) {
        ev.preventDefault();
        ev.stopPropagation();
        if (estado.sel !== c.id) seleccionar(c.id);
        const x0 = ev.clientX, y0 = ev.clientY, cx = c.x, cy = c.y, ancho0 = c.ancho, alto0 = c.alto;
        const elem = q(`.capa [data-id="${c.id}"]`);
        const anchoActual = elem ? elem.getBoundingClientRect().width / estado.escala / MM_A_PT : ancho0;
        const mover = e => {
            const dx = (e.clientX - x0) / (MM_A_PT * estado.escala), dy = (e.clientY - y0) / (MM_A_PT * estado.escala);
            if (modo === "mover") {
                c.x = redondear(cx + dx);
                c.y = redondear(cy + dy);
            } else {
                // el tamaño se mide en los ejes del propio campo (por si estuviera girado)
                const a = (c.rotar || 0) * Math.PI / 180;
                const du = dx * Math.cos(a) + dy * Math.sin(a), dv = -dx * Math.sin(a) + dy * Math.cos(a);
                if (c.tipo === "barras") { c.ancho = Math.max(5, redondear(ancho0 + du)); c.alto = Math.max(3, redondear(alto0 + dv)); }
                else if (c.tipo === "qr") c.ancho = Math.max(5, redondear(ancho0 + Math.max(du, dv)));
                else c.ancho = Math.max(5, redondear((ancho0 > 0 ? ancho0 : anchoActual) + du));
            }
            refrescarCampo(c);
            sincronizarEditor(c);
        };
        const soltar = () => { window.removeEventListener("pointermove", mover); window.removeEventListener("pointerup", soltar); window.removeEventListener("pointercancel", soltar); };
        window.addEventListener("pointermove", mover);
        window.addEventListener("pointerup", soltar);
        window.addEventListener("pointercancel", soltar);
    }

    // ---------- Lista de campos y editor ----------
    function seleccionar(id) {
        estado.sel = id;
        pintarCampos();
        dibujarLista();
        dibujarEditor();
    }

    function dibujarLista() {
        const lista = q("[data-lista-campos]");
        lista.textContent = "";
        if (!estado.campos.length) {
            lista.innerHTML = '<span class="vacio">Todavía no agregaste campos.</span>';
            return;
        }
        estado.campos.forEach((c, i) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "item-campo" + (c.id === estado.sel ? " sel" : "");
            b.textContent = `${i + 1}. ${NOMBRE_TIPO_CAMPO[c.tipo]} · ${c.contenido.replace(/\s+/g, " ") || "(vacío)"}`;
            b.addEventListener("click", () => seleccionar(c.id));
            lista.appendChild(b);
        });
    }

    // Cada control del editor: [propiedad, tipo, etiqueta, atributos]
    const CONTROLES = {
        comunes: [["x", "num", "Desde el borde izquierdo (mm)", 'step="0.5"'], ["y", "num", "Desde el borde de arriba (mm)", 'step="0.5"']],
        texto: [["tam", "num", "Tamaño de letra (pt)", 'step="0.5" min="1"'], ["ancho", "num", "Ancho del recuadro (mm, 0 = el que necesite)", 'step="0.5" min="0"']],
        qr: [["ancho", "num", "Tamaño (mm)", 'step="0.5" min="3"'], ["borde", "num", "Borde blanco (cuadritos)", 'min="0" max="10"']],
        barras: [["ancho", "num", "Ancho (mm)", 'step="0.5" min="5"'], ["alto", "num", "Alto de las barras (mm)", 'step="0.5" min="3"']]
    };

    function dibujarEditor() {
        const ed = q("[data-editor]");
        const c = campoElegido();
        ed.hidden = !c;
        if (!c) { ed.textContent = ""; return; }
        const titulos = estado.csv ? estado.csv.titulos : [];
        const ctl = ([k, t, et, at]) => `<label>${et}<input data-f="${k}" data-t="${t}" type="number" ${at}></label>`;
        ed.innerHTML = `
            <h3>Campo ${estado.campos.indexOf(c) + 1}: ${NOMBRE_TIPO_CAMPO[c.tipo]}</h3>
            <label>Contenido${c.tipo === "texto" ? " (lo que se escribe)" : " (lo que lleva el código)"}<textarea data-f="contenido" data-t="str" rows="2" placeholder="Ej.: {Nombre} {Apellido}"></textarea></label>
            <div class="titulo-campo">Tocá una columna para agregarla al contenido:</div>
            <div class="chips" data-chips></div>
            ${c.tipo === "barras" ? `<label>Tipo de código<select data-f="barras" data-t="str">${TIPOS_BARRAS.map(t => `<option value="${t.id}">${t.nombre}</option>`).join("")}</select></label>` : ""}
            <div class="dos">${CONTROLES.comunes.map(ctl).join("")}</div>
            <div class="dos">${CONTROLES[c.tipo].map(ctl).join("")}</div>
            ${c.tipo === "texto" ? `
                <div class="dos">
                    <label>Alineación (dentro del recuadro)<select data-f="alinear" data-t="str"><option value="izq">Izquierda</option><option value="centro">Centro</option><option value="der">Derecha</option></select></label>
                    <label>Color<input data-f="color" data-t="str" type="color"></label>
                </div>
                <label class="fila"><input data-f="negrita" data-t="bool" type="checkbox"> Negrita</label>` : ""}
            ${c.tipo === "barras" ? `
                <label class="fila"><input data-f="textoDebajo" data-t="bool" type="checkbox"> Escribir el texto debajo de las barras</label>
                <label>Tamaño del texto (pt)<input data-f="tam" data-t="num" type="number" step="0.5" min="1"></label>
                <label class="fila"><input data-f="zonaBlanca" data-t="bool" type="checkbox"> Blanco a los costados (necesario para que se lea)</label>` : ""}
            <label>Girar<select data-f="rotar" data-t="num"><option value="0">No</option><option value="90">90° (a la derecha)</option><option value="180">180°</option><option value="270">270° (a la izquierda)</option></select></label>
            <div class="botonera">
                <button type="button" class="btn" data-duplicar>Duplicar</button>
                <button type="button" class="btn" data-borrar>Borrar campo</button>
            </div>`;
        const chips = ed.querySelector("[data-chips]");
        [...titulos, "#"].forEach(t => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "chip";
            b.textContent = t === "#" ? "# (número de página)" : t;
            b.title = t === "#" ? "Inserta {#}: 1, 2, 3… según la página" : `Inserta {${t}}`;
            b.addEventListener("click", () => insertarEnContenido(`{${t}}`));
            chips.appendChild(b);
        });
        if (!titulos.length) chips.innerHTML = '<span class="vacio">Elegí el CSV para ver sus columnas.</span>';
        sincronizarEditor(c);
        ed.querySelectorAll("[data-f]").forEach(el => {
            const evento = el.tagName === "TEXTAREA" || el.type === "number" || el.type === "color" ? "input" : "change";
            el.addEventListener(evento, () => {
                const k = el.dataset.f;
                c[k] = el.dataset.t === "bool" ? el.checked : el.dataset.t === "num" ? (parseFloat(el.value) || 0) : el.value;
                if (k === "rotar") { c.rotar = parseInt(el.value, 10) || 0; }
                if (k === "contenido") dibujarLista();
                if (k === "rotar") pintarCampos(); else refrescarCampo(c);
            });
        });
        ed.querySelector("[data-duplicar]").addEventListener("click", () => {
            const copia = { ...c, id: estado.siguienteId++, x: redondear(c.x + 5), y: redondear(c.y + 5) };
            estado.campos.push(copia);
            seleccionar(copia.id);
        });
        ed.querySelector("[data-borrar]").addEventListener("click", () => {
            estado.campos = estado.campos.filter(x => x.id !== c.id);
            seleccionar(estado.campos.length ? estado.campos[estado.campos.length - 1].id : null);
        });
    }

    // Pone en cada control del editor el valor actual del campo
    function sincronizarEditor(c) {
        const ed = q("[data-editor]");
        if (!ed || ed.hidden) return;
        ed.querySelectorAll("[data-f]").forEach(el => {
            if (el === document.activeElement && el.tagName === "TEXTAREA") return; // no se pisa lo que se está escribiendo
            const v = c[el.dataset.f];
            if (el.type === "checkbox") el.checked = !!v;
            else if (el !== document.activeElement) el.value = el.dataset.t === "num" && typeof v === "number" ? String(redondear(v)) : (v === undefined ? "" : v);
        });
    }

    function insertarEnContenido(marca) {
        const c = campoElegido();
        const ta = q('[data-editor] [data-f="contenido"]');
        if (!c || !ta) return;
        const a = ta.selectionStart ?? ta.value.length, b = ta.selectionEnd ?? ta.value.length;
        const antes = ta.value.slice(0, a), despues = ta.value.slice(b);
        const sep = c.tipo === "texto" && antes && !/\s$/.test(antes) && marca !== "" ? " " : ""; // en un texto, las columnas se separan con un espacio
        ta.value = antes + sep + marca + despues;
        ta.focus();
        ta.selectionStart = ta.selectionEnd = (antes + sep + marca).length;
        ta.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function agregarCampo(tipo) {
        const titulos = estado.csv ? estado.csv.titulos : [];
        const titulo = tipo === "texto" ? titulos[0] : titulos[adivinarColumnaCodigo(titulos)];
        const c = campoNuevo(tipo, estado.siguienteId++, titulo ? `{${titulo}}` : "");
        // en un lugar visible de la hoja, un poco corrido para que no se tapen entre sí
        const n = estado.campos.length;
        c.x = redondear(15 + (n % 6) * 8);
        c.y = redondear(15 + (n % 6) * 8);
        estado.campos.push(c);
        seleccionar(c.id);
    }

    // ---------- Fila de ejemplo ----------
    function actualizarBarraFila() {
        const et = q("[data-etiqueta-fila]");
        const n = estado.csv ? estado.csv.registros.length : 0;
        et.textContent = n ? `fila ${estado.csv.registros[estado.filaVista].nro} (${estado.filaVista + 1} de ${n})` : "–";
        sec().querySelectorAll("[data-fila-vista]").forEach(b => { b.disabled = n < 2; });
    }

    function cambiarFila(delta) {
        const n = estado.csv ? estado.csv.registros.length : 0;
        if (!n) return;
        estado.filaVista = (estado.filaVista + delta + n) % n;
        actualizarBarraFila();
        pintarCampos();
    }

    // ---------- Archivos ----------
    async function cargarPlantilla(archivo, nro) {
        const bytes = await leerBytes(archivo);
        const pdf = await abrirPdfJs(bytes); // si no es un PDF, falla acá con un error
        const n = Math.min(Math.max(1, Math.floor(nro) || 1), pdf.numPages);
        const vp = (await pdf.getPage(n)).getViewport({ scale: 1 });
        estado.plantilla = { bytes, nro: n, nombre: archivo.name, anchoPt: vp.width, altoPt: vp.height, paginas: pdf.numPages };
        await dibujarEscenario();
        return estado.plantilla;
    }

    function cargarCSV(filas, tieneEncabezado) {
        const titulos = titulosDeCSV(filas, tieneEncabezado);
        const registros = [];
        for (let i = tieneEncabezado ? 1 : 0; i < filas.length; i++) {
            if (filas[i].some(c => c.trim() !== "")) registros.push({ nro: i + 1, celdas: filas[i] });
        }
        estado.csv = { filas, tieneEncabezado, titulos, registros };
        estado.filaVista = Math.min(estado.filaVista, Math.max(0, registros.length - 1));
        actualizarBarraFila();
        dibujarEditor();
        pintarCampos();
    }

    function cambiarEncabezado(tieneEncabezado) {
        if (estado.csv) cargarCSV(estado.csv.filas, tieneEncabezado);
    }

    // ---------- Guardar y abrir el diseño ----------
    function guardarDiseno() {
        const datos = { app: "barcode-studio", version: 1, campos: estado.campos.map(({ id, ...resto }) => resto) };
        descargar(new Blob([JSON.stringify(datos, null, 2)], { type: "application/json" }), "diseno-datos-variables.json");
    }

    async function abrirDiseno(archivo) {
        let datos;
        try { datos = JSON.parse(await archivo.text()); } catch (e) { throw new Error("El archivo no es un diseño válido."); }
        if (!datos || datos.app !== "barcode-studio" || !Array.isArray(datos.campos)) throw new Error("El archivo no es un diseño de Barcode Studio.");
        const campos = datos.campos.map(c => {
            if (!["texto", "qr", "barras"].includes(c.tipo)) throw new Error("El diseño tiene un campo de un tipo desconocido.");
            const base = campoNuevo(c.tipo, estado.siguienteId++, "");
            for (const k of Object.keys(base)) if (k !== "id" && k !== "tipo" && c[k] !== undefined && typeof c[k] === typeof base[k]) base[k] = c[k];
            return base;
        });
        estado.campos = campos;
        estado.imagenes.clear();
        seleccionar(campos.length ? campos[0].id : null);
        // avisa si el diseño usa columnas que este CSV no tiene
        if (estado.csv) {
            const conocidas = new Set(estado.csv.titulos.map(t => t.toLowerCase()));
            const faltan = [...new Set(campos.flatMap(c => columnasUsadas(c.contenido)))].filter(n => !conocidas.has(n.toLowerCase()));
            if (faltan.length) return `El diseño usa columnas que este CSV no tiene: ${faltan.join(", ")}. Corregilas en el contenido de cada campo.`;
        }
        return "";
    }

    function generar(opciones, alAvanzar) {
        if (!estado.plantilla) throw new Error("Elegí primero la plantilla PDF.");
        if (!estado.csv) throw new Error("Elegí primero el archivo CSV.");
        return generarDatosVariables(estado.plantilla.bytes, estado.csv.filas, estado.campos.map(c => ({ ...c })),
            { pagina: estado.plantilla.nro, tieneEncabezado: estado.csv.tieneEncabezado, ...opciones }, alAvanzar);
    }

    // ---------- Conexión con la pantalla ----------
    sec().querySelectorAll("[data-nuevo]").forEach(b => b.addEventListener("click", () => agregarCampo(b.dataset.nuevo)));
    sec().querySelectorAll("[data-fila-vista]").forEach(b => b.addEventListener("click", () => cambiarFila(parseInt(b.dataset.filaVista, 10))));
    sec().querySelector("[data-guardar-diseno]").addEventListener("click", guardarDiseno);
    let _t = null;
    window.addEventListener("resize", () => { clearTimeout(_t); _t = setTimeout(() => { if (sec().classList.contains("activa")) dibujarEscenario(); }, 250); });

    return {
        cargarPlantilla, cargarCSV, cambiarEncabezado, abrirDiseno, generar,
        redibujar: dibujarEscenario,
        nombrePlantilla: () => (estado.plantilla ? estado.plantilla.nombre : "plantilla"),
        estado // para las pruebas
    };
})();
