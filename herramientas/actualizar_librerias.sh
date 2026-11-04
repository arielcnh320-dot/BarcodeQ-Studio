#!/usr/bin/env bash
# Baja las librerías de la app desde npm y las copia a lib/ (la app las usa desde ahí, sin CDN).
# Uso: bash herramientas/actualizar_librerias.sh        (desde la carpeta del proyecto)
# Después: correr `node pruebas/correr.js`, subir VERSION_APP en index.html y VERSION en sw.js.
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cd "$TMP"
npm init -y >/dev/null
# Versiones fijas: si se cambia una, correr las pruebas antes de subir.
npm i --silent pdf-lib@1.17.1 pdfjs-dist@3.11.174 jsbarcode@3.11.6 qrcode-generator@1.4.4 jszip@3.10.1 @zxing/library@0.21.3
N="$TMP/node_modules"
cp "$N/pdf-lib/dist/pdf-lib.min.js"            "$RAIZ/lib/pdf-lib.min.js"
cp "$N/pdfjs-dist/build/pdf.min.js"            "$RAIZ/lib/pdf.min.js"
cp "$N/pdfjs-dist/build/pdf.worker.min.js"     "$RAIZ/lib/pdf.worker.min.js"
cp "$N/jsbarcode/dist/JsBarcode.all.min.js"    "$RAIZ/lib/JsBarcode.all.min.js"
cp "$N/qrcode-generator/qrcode.js"             "$RAIZ/lib/qrcode.js"
cp "$N/jszip/dist/jszip.min.js"                "$RAIZ/lib/jszip.min.js"
cp "$N/@zxing/library/umd/index.min.js"        "$RAIZ/lib/zxing.min.js"
echo "Librerías copiadas a lib/"
