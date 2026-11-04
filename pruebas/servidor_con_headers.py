# Sirve la carpeta del repositorio como Netlify: agrega los encabezados del bloque "/*" de _headers.
# Uso: python3 -I servidor_con_headers.py <carpeta> <puerto>
import sys, os, http.server, functools

carpeta, puerto = sys.argv[1], int(sys.argv[2])
encabezados = []
with open(os.path.join(carpeta, "_headers"), encoding="utf-8") as f:
    dentro = False
    for linea in f:
        if linea.startswith("/*"):
            dentro = True
            continue
        if dentro and linea.startswith("  ") and ":" in linea:
            nombre, valor = linea.strip().split(":", 1)
            encabezados.append((nombre.strip(), valor.strip()))


class Manejador(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        for nombre, valor in encabezados:
            self.send_header(nombre, valor)
        super().end_headers()

    def log_message(self, *args):
        pass


print("encabezados:", [n for n, _ in encabezados], flush=True)
http.server.ThreadingHTTPServer(("127.0.0.1", puerto), functools.partial(Manejador, directory=carpeta)).serve_forever()
