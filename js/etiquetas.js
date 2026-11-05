// Etiquetas en serie: una etiqueta con código (QR o de barras) por cada fila de un CSV, ordenadas en hojas.
// Medidas en milímetros. La grilla empieza en el margen de arriba a la izquierda, como en una hoja de
// etiquetas adhesivas: margen y calle se ajustan a la hoja que se use.

const MAX_ETIQUETAS = 20000;

// Cuántas etiquetas entran por hoja
function grillaDeEtiquetas({ pliego, horizontal = false, ancho, alto, margen, calle }) {
    let [sw, sh] = Array.isArray(pliego) ? pliego : PLIEGOS[pliego];
    if (!sw) throw new Error("Tamaño de pliego desconocido");
    if (horizontal) [sw, sh] = [Math.max(sw, sh), Math.min(sw, sh)];
    const columnas = Math.floor((sw - 2 * margen + calle) / (ancho + calle) + 1e-9);
    const filas = Math.floor((sh - 2 * margen + calle) / (alto + calle) + 1e-9);
    return { sw, sh, columnas: Math.max(0, columnas), filas: Math.max(0, filas) };
}

// De las filas del CSV a una lista de { fila, codigo, texto }. `fila` es el número de fila en la planilla.
// `colTexto`: una columna, una lista de columnas (se juntan con un espacio) o -1 para ninguna.
function registrosDeCSV(filasCSV, { tieneEncabezado = true, colCodigo = 0, colTexto = -1 } = {}) {
    const columnasTexto = (Array.isArray(colTexto) ? colTexto : [colTexto]).filter(c => c >= 0);
    const registros = [];
    let omitidas = 0;
    for (let i = tieneEncabezado ? 1 : 0; i < filasCSV.length; i++) {
        const celdas = filasCSV[i];
        const codigo = (celdas[colCodigo] || "").trim();
        if (!codigo) {
            if (celdas.some(c => c.trim() !== "")) omitidas++; // tenía datos pero no código
            continue;
        }
        const texto = columnasTexto.map(c => (celdas[c] || "").trim()).filter(Boolean).join(" ");
        registros.push({ fila: i + 1, codigo, texto });
    }
    return { registros, omitidas };
}

const _esperar = () => new Promise(r => setTimeout(r, 0));

// o: tipo ("qr" o un tipo de código de barras), ancho, alto, pliego, horizontal, margen, calle, copias,
//    contorno (dibujar el borde de cada etiqueta), mostrarTexto
async function generarEtiquetas(registros, o, alAvanzar) {
    const { tipo, ancho, alto, calle, margen, copias = 1, contorno = false, mostrarTexto = true } = o;
    if (!(ancho > 0 && alto > 0)) throw new Error("El ancho y el alto de la etiqueta tienen que ser mayores a 0");
    if (!registros.length) throw new Error("No hay ningún código para imprimir. Revisá que hayas elegido la columna correcta.");
    const total = registros.length * copias;
    if (total > MAX_ETIQUETAS) throw new Error(`Son ${total} etiquetas: el máximo es ${MAX_ETIQUETAS}. Dividí el archivo en partes.`);
    const g = grillaDeEtiquetas(o);
    if (g.columnas < 1 || g.filas < 1) {
        throw new Error(`Una etiqueta de ${ancho}×${alto} mm no entra en el pliego con ese margen. Achicá la etiqueta o el margen.`);
    }
    const porHoja = g.columnas * g.filas;

    const doc = await PDFLib.PDFDocument.create();
    const fuente = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
    const apto = s => Array.from(s).map(c => { try { fuente.encodeText(c); return c; } catch (e) { return "?"; } }).join("");

    const cw = ancho * MM_A_PT, ch = alto * MM_A_PT;
    const calleP = calle * MM_A_PT, margenP = margen * MM_A_PT;
    const sw = g.sw * MM_A_PT, sh = g.sh * MM_A_PT;
    const pad = Math.min(1.5, ancho * 0.05, alto * 0.05) * MM_A_PT;
    const altoTexto = mostrarTexto ? Math.min(4, alto * 0.22) * MM_A_PT : 0;

    const imagenes = new Map(); // el mismo código no se genera dos veces
    const imagenDe = async r => {
        if (!imagenes.has(r.codigo)) {
            const cod = tipo === "qr"
                ? await generarQR(r.codigo, { formato: "png", caja: 12 })
                : await generarBarras(tipo, r.codigo, { formato: "png", dpi: 300, mostrarTexto: false, margenV: 0.5 });
            imagenes.set(r.codigo, await doc.embedPng(new Uint8Array(await cod.blob.arrayBuffer())));
        }
        return imagenes.get(r.codigo);
    };

    const lista = [];
    for (const r of registros) for (let k = 0; k < copias; k++) lista.push(r);

    let pagina = null;
    for (let i = 0; i < lista.length; i++) {
        const r = lista[i];
        const lugar = i % porHoja;
        if (lugar === 0) pagina = doc.addPage([sw, sh]);
        const col = lugar % g.columnas, fil = Math.floor(lugar / g.columnas);
        const x = margenP + col * (cw + calleP);
        const yAbajo = sh - (margenP + fil * (ch + calleP) + ch); // esquina inferior izquierda, en coordenadas de PDF

        if (contorno) pagina.drawRectangle({ x, y: yAbajo, width: cw, height: ch, borderWidth: 0.25, borderColor: PDFLib.rgb(0.5, 0.5, 0.5) });

        let img;
        try { img = await imagenDe(r); } catch (e) {
            throw new Error(`Fila ${r.fila}: ${(e && e.message) || e}`);
        }
        const areaW = cw - 2 * pad, areaH = ch - 2 * pad - altoTexto;
        const escala = Math.min(areaW / img.width, areaH / img.height);
        const w = img.width * escala, h = img.height * escala;
        pagina.drawImage(img, { x: x + pad + (areaW - w) / 2, y: yAbajo + pad + altoTexto + (areaH - h) / 2, width: w, height: h });

        if (mostrarTexto) {
            let txt = apto(r.texto || r.codigo);
            let tam = Math.min(8, altoTexto / 1.25);
            while (fuente.widthOfTextAtSize(txt, tam) > areaW && tam > 4) tam -= 0.5;
            while (txt.length > 3 && fuente.widthOfTextAtSize(txt, tam) > areaW) txt = txt.slice(0, -4) + "...";
            const anchoTxt = fuente.widthOfTextAtSize(txt, tam);
            pagina.drawText(txt, { x: x + (cw - anchoTxt) / 2, y: yAbajo + pad + (altoTexto - tam) / 2 + tam * 0.2, size: tam, font: fuente });
        }

        if (alAvanzar && (i % 25 === 24 || i === lista.length - 1)) { alAvanzar(i + 1, lista.length); await _esperar(); }
    }
    return { bytes: await doc.save(), etiquetas: lista.length, hojas: Math.ceil(lista.length / porHoja), columnas: g.columnas, filas: g.filas };
}
