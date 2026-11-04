# Arma los íconos de la app (icons/*.png): código de barras blanco sobre fondo azul oscuro.
# Uso: python3 -I herramientas/hacer_iconos.py <carpeta_icons>
import sys
from PIL import Image, ImageDraw

salida = sys.argv[1]
FONDO, TINTA = (17, 23, 51), (255, 255, 255)
BARRAS = [3, 1, 2, 1, 1, 3, 1, 2, 2, 1, 3, 1, 1, 2, 1, 3]  # ancho de cada barra, alternando barra/espacio


def icono(lado, zona):
    """zona: proporción del lado que ocupa el dibujo (más chica en los maskable, que se recortan)."""
    img = Image.new("RGB", (lado, lado), FONDO)
    d = ImageDraw.Draw(img)
    ancho, alto = lado * zona, lado * zona * 0.62
    x0, y0 = (lado - ancho) / 2, (lado - alto) / 2
    unidad = ancho / sum(BARRAS)
    x = x0
    for i, w in enumerate(BARRAS):
        if i % 2 == 0:
            d.rectangle([x, y0, x + w * unidad - 1, y0 + alto], fill=TINTA)
        x += w * unidad
    return img


for lado in (192, 512):
    icono(lado, 0.62).save(f"{salida}/icon-{lado}.png")
    icono(lado, 0.46).save(f"{salida}/icon-maskable-{lado}.png")
icono(180, 0.62).save(f"{salida}/apple-touch-icon.png")
