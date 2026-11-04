// Valores fijos de la app: tipos de código de barras, tamaños de pliego y unidades.

const MM_A_PT = 72 / 25.4; // puntos de PDF por milímetro

// id: lo que ve la persona; formato: nombre que usa la librería JsBarcode
const TIPOS_BARRAS = [
    { id: "code128", formato: "CODE128", nombre: "Code 128 (texto y números)", ejemplo: "ABC-12345" },
    { id: "code39", formato: "CODE39", nombre: "Code 39", ejemplo: "ABC-123" },
    { id: "ean13", formato: "EAN13", nombre: "EAN-13 (12 dígitos, calcula el último)", ejemplo: "590123412345" },
    { id: "ean8", formato: "EAN8", nombre: "EAN-8 (7 dígitos, calcula el último)", ejemplo: "9638507" },
    { id: "upca", formato: "UPC", nombre: "UPC-A (11 dígitos, calcula el último)", ejemplo: "01234567890" },
    { id: "itf", formato: "ITF", nombre: "ITF (números, cantidad par)", ejemplo: "12345670" },
    { id: "itf14", formato: "ITF14", nombre: "ITF-14 (cajas, 13 dígitos)", ejemplo: "1234567890123" },
    { id: "codabar", formato: "codabar", nombre: "Codabar", ejemplo: "A1234567B" },
    { id: "msi", formato: "MSI", nombre: "MSI", ejemplo: "123456" },
    { id: "pharmacode", formato: "pharmacode", nombre: "Pharmacode (número 3 a 131070)", ejemplo: "1234" }
];

const NIVELES_QR = { L: "L", M: "M", Q: "Q", H: "H" };

// Tamaños de pliego en milímetros (ancho, alto), en vertical
const PLIEGOS = {
    A5: [148, 210],
    A4: [210, 297],
    A3: [297, 420],
    SRA3: [320, 450],
    Carta: [216, 279],
    Tabloide: [279, 432]
};

const MODOS_IMPOSICION = [
    { id: "step", nombre: "Repetir página (step & repeat)" },
    { id: "nup", nombre: "N-up: varias páginas distintas por pliego" },
    { id: "booklet", nombre: "Cuadernillo (para plegar y grapar)" }
];
