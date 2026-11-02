#!/usr/bin/env python3
"""Serveur de test local : sert les pages et enregistre les modifications faites dans le navigateur.

Les fichiers JSON modifiés sont écrits dans le dossier local/ (ignoré par git) et non dans les vrais
evenements.json et idees.json : on peut tester sans rien abîmer. Une fois un fichier présent dans local/,
c'est lui que les pages lisent. Pour repartir des vraies données, supprimer le dossier local/.

    python3 serveur.py          # puis ouvrir http://localhost:8000
    python3 serveur.py 8080     # sur un autre port
"""

import json
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DOSSIER = Path(__file__).resolve().parent
LOCAL = DOSSIER / "local"
FICHIERS = {"evenements.json", "idees.json"}


class Gestionnaire(SimpleHTTPRequestHandler):
    def fichier_demande(self):
        nom = self.path.split("?", 1)[0].lstrip("/")
        return nom if nom in FICHIERS else None

    def translate_path(self, path):
        nom = self.fichier_demande()
        if nom and (LOCAL / nom).exists():
            return str(LOCAL / nom)
        return super().translate_path(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_PUT(self):
        nom = self.fichier_demande()
        if not nom:
            return self.send_error(403, "Seuls evenements.json et idees.json peuvent être enregistrés")
        corps = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        try:
            json.loads(corps)
        except ValueError:
            return self.send_error(400, "JSON invalide")
        LOCAL.mkdir(exist_ok=True)
        provisoire = LOCAL / f"{nom}.tmp"
        provisoire.write_bytes(corps)
        provisoire.replace(LOCAL / nom)
        self.send_response(204)
        self.end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    serveur = ThreadingHTTPServer(("127.0.0.1", port), partial(Gestionnaire, directory=str(DOSSIER)))
    print(f"Planning : http://localhost:{port}/  (modifications enregistrées dans {LOCAL})", flush=True)
    serveur.serve_forever()
