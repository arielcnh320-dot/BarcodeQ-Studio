// Datos variables: una plantilla PDF + un CSV → un PDF con una página por fila, con campos (texto, QR, código
// de barras) puestos en el lugar elegido. Los datos salen de las columnas del CSV: en el contenido de un campo,
// {Columna} se reemplaza por el valor de esa columna en cada fila, y {#} por el número de página (1, 2, 3…).
// Posiciones y medidas en milímetros, desde la esquina superior izquierda de la página.

const BASE_TEXTO = 0.9465; // la línea de base del texto queda a este múltiplo del tamaño desde el borde de arriba
const ALTO_LINEA = 1.2;
const MAX_PAGINAS_VARIABLES = 5000;

function campoNuevo(tipo, id, contenido = "") {
    const comun = { id, tipo, contenido, x: 20, y: 20, rotar: 0 };
    if (tipo === "texto") return { ...comun, ancho: 0, tam: 12, negrita: false, color: "#000000", alinear: "izq" };
    if (tipo === "qr") return { ...comun, ancho: 25, borde: 4 };
    if (tipo === "barras") return { ...comun, barras: "code128", ancho: 50, alto: 12, zonaBlanca: true, textoDebajo: true, tam: 8 };
    throw new Error("Tipo de campo desconocido: " + tipo);
}

const NOMBRE_TIPO_CAMPO = { texto: "Texto", qr: "QR", barras: "Código de barras" };

// Nombres de columna usados en un contenido: "{Nombre} {Apellido}" → ["Nombre", "Apellido"]
function columnasUsadas(contenido) {
    return Array.from(String(contenido).matchAll(/\{([^{}]+)\}/g), m => m[1].trim()).filter(n => n !== "#");
}

// Reemplaza {Columna} por el valor de la fila. `valores` es un Map: nombre en minúsculas → valor.
function interpolar(contenido, valores, numero) {
    return String(contenido).replace(/\{([^{}]+)\}/g, (todo, nombre) => {
        const n = nombre.trim();
        if (n === "#") return String(numero);
        const v = valores.get(n.toLowerCase());
        return v === undefined ? todo : v;
    });
}

function valoresDeFila(titulos, celdas) {
    const m = new Map();
    titulos.forEach((t, i) => { const k = t.trim().toLowerCase(); if (!m.has(k)) m.set(k, (celdas[i] || "").trim()); });
    return m;
}

// Chequea los campos antes de generar; lanza un error claro si algo no va
function validarCampos(campos, titulos) {
    if (!campos.length) throw new Error("Agregá al menos un campo (texto, QR o código de barras).");
    const conocidas = new Set(titulos.map(t => t.trim().toLowerCase()));
    campos.forEach((c, i) => {
        const nombre = `Campo ${i + 1} (${NOMBRE_TIPO_CAMPO[c.tipo]})`;
        if (!String(c.contenido).trim()) throw new Error(`${nombre}: no tiene contenido. Escribí texto o elegí columnas.`);
        const faltan = columnasUsadas(c.contenido).filter(n => !conocidas.has(n.toLowerCase()));
        if (faltan.length) throw new Error(`${nombre}: usa {${faltan.join("}, {")}} pero el CSV no tiene esa columna. Columnas del CSV: ${titulos.join(", ")}.`);
        if (!(c.ancho >= 0) || (c.tipo !== "texto" && !(c.ancho > 0))) throw new Error(`${nombre}: el ancho tiene que ser mayor a 0.`);
        if (c.tipo === "barras" && !(c.alto > 0)) throw new Error(`${nombre}: el alto tiene que ser mayor a 0.`);
        if (c.tipo === "barras" && !TIPOS_BARRAS.some(t => t.id === c.barras)) throw new Error(`${nombre}: tipo de código de barras desconocido.`);
        if (c.tipo !== "qr" && !(c.tam > 0)) throw new Error(`${nombre}: el tamaño de letra tiene que ser mayor a 0.`);
    });
}

// Imagen PNG (bytes) del código de un campo, tal como se usa en la vista previa y en el PDF
async function imagenDeCampo(campo, valor) {
    const r = campo.tipo === "qr"
        ? await generarQR(valor, { formato: "png", caja: 10, margen: campo.borde })
        : await generarBarras(campo.barras, valor, {
            formato: "png", dpi: 300, mostrarTexto: false, margenV: 0.5, margenH: campo.zonaBlanca ? 10 * 0.33 : 0
        });
    return new Uint8Array(await r.blob.arrayBuffer());
}

// Punto de la página (origen arriba-izquierda, y hacia abajo) para un punto (u, v) del campo. El campo ocupa un
// recuadro de w × h con su esquina superior izquierda en `o` y gira `ang` grados en sentido horario alrededor
// de su CENTRO (así al girarlo no se corre de lugar).
function _punto(o, ang, u, v, w, h) {
    const r = ang * Math.PI / 180, c = Math.round(Math.cos(r) * 1e9) / 1e9, s = Math.round(Math.sin(r) * 1e9) / 1e9;
    const du = u - w / 2, dv = v - h / 2;
    return { x: o.x + w / 2 + du * c - dv * s, y: o.y + h / 2 + du * s + dv * c };
}

function _color(hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
    return m ? PDFLib.rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255) : PDFLib.rgb(0, 0, 0);
}

// Líneas de un texto, y el tamaño de letra final: si hay un ancho máximo (en puntos) y no entra, se achica (hasta 5 pt)
function _prepararTexto(fuente, apto, texto, tam, anchoPt) {
    const lineas = texto.split(/\r?\n/).map(apto); // primero se separan las líneas, después se reemplazan los caracteres que el PDF no admite
    let mayor = Math.max(...lineas.map(l => fuente.widthOfTextAtSize(l, tam)));
    if (anchoPt > 0 && mayor > anchoPt) { tam = Math.max(5, tam * anchoPt / mayor); mayor = Math.max(...lineas.map(l => fuente.widthOfTextAtSize(l, tam))); }
    return { lineas, tam, ancho: mayor, alto: lineas.length * ALTO_LINEA * tam };
}

// Dibuja las líneas de un texto preparado. `caja` = { w, h }: el recuadro del campo (alrededor de su centro gira).
function _dibujarLineas(pagina, alto, fuente, prep, { o, ang, anchoPt, alinear, color, vInicial = 0, caja }) {
    prep.lineas.forEach((l, i) => {
        const w = fuente.widthOfTextAtSize(l, prep.tam);
        const u = anchoPt > 0 ? (alinear === "centro" ? (anchoPt - w) / 2 : alinear === "der" ? anchoPt - w : 0) : 0;
        const p = _punto(o, ang, u, vInicial + BASE_TEXTO * prep.tam + i * ALTO_LINEA * prep.tam, caja.w, caja.h);
        pagina.drawText(l, { x: p.x, y: alto - p.y, size: prep.tam, font: fuente, color, rotate: PDFLib.degrees(-ang) });
    });
}

// opciones: { pagina (de la plantilla, desde 1), tieneEncabezado, desde, hasta (números de fila del archivo), imposicion }
async function generarDatosVariables(plantillaBytes, filasCSV, campos, opciones = {}, alAvanzar) {
    const { pagina: nroPlantilla = 1, tieneEncabezado = true, desde = 1, hasta = Infinity, imposicion = null } = opciones;
    const titulos = titulosDeCSV(filasCSV, tieneEncabezado);
    validarCampos(campos, titulos);

    const filas = [];
    for (let i = tieneEncabezado ? 1 : 0; i < filasCSV.length; i++) {
        const nro = i + 1; // número de fila en la planilla
        if (nro < desde || nro > hasta) continue;
        if (filasCSV[i].every(c => c.trim() === "")) continue;
        filas.push({ nro, celdas: filasCSV[i] });
    }
    if (!filas.length) throw new Error("No hay ninguna fila de datos para generar (revisá el rango de filas).");
    if (filas.length > MAX_PAGINAS_VARIABLES) throw new Error(`Son ${filas.length} páginas: el máximo es ${MAX_PAGINAS_VARIABLES}. Usá "Desde/Hasta la fila" para dividir el trabajo.`);

    const origen = await PDFLib.PDFDocument.load(plantillaBytes, { ignoreEncryption: true });
    if (nroPlantilla < 1 || nroPlantilla > origen.getPageCount()) throw new Error(`La plantilla tiene ${origen.getPageCount()} página(s): la ${nroPlantilla} no existe.`);
    const { width: W, height: H } = origen.getPage(nroPlantilla - 1).getSize();

    const doc = await PDFLib.PDFDocument.create();
    // Una plantilla sin ningún contenido (página en blanco) no se puede copiar con pdf-lib: se usa una página vacía
    let plantilla = null;
    if (origen.getPage(nroPlantilla - 1).node.Contents()) [plantilla] = await doc.embedPdf(origen, [nroPlantilla - 1]);
    const fuenteR = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
    const fuenteB = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
    const aptoDe = f => s => Array.from(s).map(c => { try { f.encodeText(c); return c; } catch (e) { return "?"; } }).join("");

    const imagenes = new Map(); // un mismo código no se genera dos veces
    const vacios = new Array(campos.length).fill(0);

    for (let n = 0; n < filas.length; n++) {
        const valores = valoresDeFila(titulos, filas[n].celdas);
        const pag = doc.addPage([W, H]);
        if (plantilla) pag.drawPage(plantilla, { x: 0, y: 0, width: W, height: H });
        for (let k = 0; k < campos.length; k++) {
            const c = campos[k];
            const valor = interpolar(c.contenido, valores, n + 1);
            if (!valor.trim()) { vacios[k]++; continue; } // fila sin ese dato: no se dibuja
            const o = { x: c.x * MM_A_PT, y: c.y * MM_A_PT }, ang = c.rotar || 0;
            if (c.tipo === "texto") {
                const f = c.negrita ? fuenteB : fuenteR;
                const prep = _prepararTexto(f, aptoDe(f), valor, c.tam, c.ancho * MM_A_PT);
                const anchoPt = c.ancho * MM_A_PT;
                _dibujarLineas(pag, H, f, prep, { o, ang, anchoPt, alinear: c.alinear, color: _color(c.color), caja: { w: anchoPt > 0 ? anchoPt : prep.ancho, h: prep.alto } });
                continue;
            }
            const clave = [c.tipo, c.barras, c.borde, c.zonaBlanca, valor].join("|");
            if (!imagenes.has(clave)) {
                try { imagenes.set(clave, await doc.embedPng(await imagenDeCampo(c, valor))); }
                catch (e) { throw new Error(`Fila ${filas[n].nro}, campo ${k + 1} (${NOMBRE_TIPO_CAMPO[c.tipo]}): ${(e && e.message) || e}`); }
            }
            const w = c.ancho * MM_A_PT, h = (c.tipo === "qr" ? c.ancho : c.alto) * MM_A_PT;
            const conTexto = c.tipo === "barras" && c.textoDebajo;
            const prep = conTexto ? _prepararTexto(fuenteR, aptoDe(fuenteR), valor, c.tam, w) : null;
            const separacion = 0.3 * MM_A_PT;
            const caja = { w, h: conTexto ? h + separacion + prep.alto : h }; // el código y su texto giran juntos
            const bi = _punto(o, ang, 0, h, caja.w, caja.h); // esquina inferior izquierda del código, ya girado
            pag.drawImage(imagenes.get(clave), { x: bi.x, y: H - bi.y, width: w, height: h, rotate: PDFLib.degrees(-ang) });
            if (conTexto) _dibujarLineas(pag, H, fuenteR, prep, { o, ang, anchoPt: w, alinear: "centro", color: PDFLib.rgb(0, 0, 0), vInicial: h + separacion, caja });
        }
        if (alAvanzar && (n % 10 === 9 || n === filas.length - 1)) { alAvanzar(n + 1, filas.length); await new Promise(r => setTimeout(r, 0)); }
    }

    let bytes = await doc.save();
    let pliegos = null;
    if (imposicion) {
        bytes = await imponer(bytes, { ...imposicion, modo: "nup" });
        pliegos = (await PDFLib.PDFDocument.load(bytes)).getPageCount();
    }
    const avisos = vacios.map((v, k) => v ? `El campo ${k + 1} (${NOMBRE_TIPO_CAMPO[campos[k].tipo]}) quedó vacío en ${v} fila${v === 1 ? "" : "s"} y no se dibujó.` : null).filter(Boolean);
    return { bytes, paginas: filas.length, pliegos, avisos };
}
