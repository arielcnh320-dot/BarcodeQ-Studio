// Lectura de archivos CSV (Excel, Google Sheets, etc.). Maneja lo típico de Excel en español:
// separador ";" , tabulador o ",", comillas, saltos de línea dentro de una celda, y acentos guardados
// en el formato viejo de Windows (windows-1252) en lugar de UTF-8.

function decodificarCSV(bytes) {
    let texto;
    try {
        texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (e) {
        texto = new TextDecoder("windows-1252").decode(bytes); // "CSV (delimitado por comas)" de Excel en Windows
    }
    return texto.replace(/^﻿/, "");
}

// Adivina el separador mirando la primera línea (sin contar lo que está entre comillas)
function detectarSeparador(texto) {
    const cuentas = { ";": 0, "\t": 0, ",": 0 };
    let entre = false;
    for (const c of texto) {
        if (c === '"') entre = !entre;
        else if (!entre && (c === "\n" || c === "\r")) break;
        else if (!entre && c in cuentas) cuentas[c]++;
    }
    let mejor = ",", max = 0;
    for (const s of [";", "\t", ","]) if (cuentas[s] > max) { mejor = s; max = cuentas[s]; }
    return mejor;
}

// Devuelve una lista de filas; cada fila, una lista de celdas. Las líneas vacías se conservan (para que el
// número de fila coincida con el de la planilla); solo se descarta el final vacío.
function parsearCSV(texto, separador) {
    const sep = separador || detectarSeparador(texto);
    const filas = [];
    let fila = [], campo = "", entre = false;
    for (let i = 0; i < texto.length; i++) {
        const c = texto[i];
        if (entre) {
            if (c === '"') {
                if (texto[i + 1] === '"') { campo += '"'; i++; } else entre = false;
            } else campo += c;
        } else if (c === '"' && campo === "") {
            entre = true;
        } else if (c === sep) {
            fila.push(campo); campo = "";
        } else if (c === "\n" || c === "\r") {
            if (c === "\r" && texto[i + 1] === "\n") i++;
            fila.push(campo); campo = "";
            filas.push(fila); fila = [];
        } else campo += c;
    }
    if (campo !== "" || fila.length) { fila.push(campo); filas.push(fila); }
    return filas;
}

async function leerArchivoCSV(archivo) {
    const filas = parsearCSV(decodificarCSV(await leerBytes(archivo)));
    if (!filas.some(f => f.some(c => c.trim() !== ""))) throw new Error("El archivo está vacío");
    return filas;
}
