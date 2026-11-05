#!/usr/bin/env python3
"""Baut app/inhalte.json aus inhalte/karten.json und holt freie Bilder von der deutschen Wikipedia.

Die deutsche Wikipedia nutzt nur frei lizenzierte Bilder. Für jedes Bild werden Urheber und
Lizenz mitgespeichert, damit die App sie anzeigen kann. Bereits geholte Bilder liegen in
inhalte/bilder_cache.json und werden nicht erneut abgefragt.
"""
import json, re, subprocess, time, urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "inhalte" / "bilder_cache.json"
UA = "WissenApp-Eigenbau/0.1 (private Lern-App)"
API = "https://de.wikipedia.org/w/api.php?action=query&format=json"


def holen(url):
    """Holt JSON höflich: Pause zwischen den Abrufen, bei Bremsung länger warten."""
    for versuch in range(5):
        time.sleep(1 + versuch * 8)
        r = subprocess.run(["curl", "-sL", "-m", "25", "-A", UA, url], capture_output=True, text=True)
        if r.stdout.strip().startswith("{"):
            return json.loads(r.stdout)
    return {}


def ohne_html(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s or "")).strip()


def bild_zu(seite):
    q = urllib.parse.quote(seite)
    d = holen(f"{API}&redirects=1&prop=pageimages&piprop=thumbnail|name&pithumbsize=1000&pilicense=free&titles={q}")
    seiten = list((d.get("query", {}).get("pages") or {}).values())
    if not seiten or "pageimage" not in seiten[0]:
        return None
    datei = seiten[0]["pageimage"]
    url = seiten[0]["thumbnail"]["source"].split("?")[0]
    info = holen(f"{API}&prop=imageinfo&iiprop=extmetadata&titles=" + urllib.parse.quote("File:" + datei))
    meta = {}
    for p in (info.get("query", {}).get("pages") or {}).values():
        meta = (p.get("imageinfo") or [{}])[0].get("extmetadata", {})
    return {
        "url": url,
        "urheber": ohne_html(meta.get("Artist", {}).get("value"))[:80] or "unbekannt",
        "lizenz": ohne_html(meta.get("LicenseShortName", {}).get("value")) or "siehe Bildseite",
        "seite": "https://commons.wikimedia.org/wiki/" + urllib.parse.quote("File:" + datei),
    }


def main():
    karten = json.loads((ROOT / "inhalte" / "karten.json").read_text())
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    for k in karten:
        seite = k.pop("wiki", None)
        if not seite:
            continue
        if not cache.get(seite):
            cache[seite] = bild_zu(seite)
        if cache[seite]:
            k["bild"] = cache[seite]
        else:
            print("kein Bild:", k["id"], seite)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1))
    ziel = ROOT / "app" / "inhalte.json"
    ziel.write_text(json.dumps({"stand": max(k.get("datum", "") for k in karten), "karten": karten}, ensure_ascii=False))
    print(len(karten), "Karten,", sum("bild" in k for k in karten), "mit Bild")


if __name__ == "__main__":
    main()
