#!/usr/bin/env python3
"""Baut die Flaggen-Daten der App aus inhalte/laender_europa.json.

Holt Einwohnerzahlen von der Weltbank, Flaggen von Wikimedia Commons und Ländergrenzen
aus Natural Earth (Paket world-atlas) und schreibt app/flaggen.json, app/karte.json
und app/flaggen/*.svg. Downloads liegen in inhalte/roh/ und werden wiederverwendet.
"""
import json, math, re, subprocess, time, urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROH = ROOT / "inhalte" / "roh"
UA = "WissenApp-Eigenbau/0.1 (private Lern-App)"
ATLAS = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-10m.json"
# Weltbank führt den Vatikan nicht.
VATIKAN = (882, "Stand 2024")

# ISO-Kürzel zu Länderkennung im Atlas (ISO-numerisch). Kosovo hat dort keine Kennung.
NUM = dict(al=8, ad=20, at=40, by=112, be=56, ba=70, bg=100, hr=191, cy=196, cz=203, dk=208, ee=233, fi=246, fr=250,
           de=276, gr=300, hu=348, is_=352, ie=372, it=380, lv=428, li=438, lt=440, lu=442, mt=470, md=498, mc=492,
           me=499, nl=528, mk=807, no=578, pl=616, pt=620, ro=642, ru=643, sm=674, rs=688, sk=703, si=705, es=724,
           se=752, ch=756, ua=804, gb=826, va=336)


def curl(url, ziel=None):
    for versuch in range(6):
        time.sleep(1.5 + versuch * 12)
        cmd = ["curl", "-sL", "-m", "90", "-A", UA, "-w", "%{http_code}", "-o", str(ziel or "/dev/stdout"), url]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if ziel:
            if r.stdout.strip() == "200":
                return True
        elif r.stdout.endswith("200"):
            return r.stdout[:-3]
    raise SystemExit(f"Abruf fehlgeschlagen: {url}")


def einwohner(laender):
    datei = ROH / "weltbank.json"
    if not datei.exists():
        codes = ";".join(l["iso"] for l in laender if l["iso"] != "va").upper()
        curl(f"https://api.worldbank.org/v2/country/{codes}/indicator/SP.POP.TOTL?format=json&mrnev=1&per_page=100", datei)
    zeilen = json.loads(datei.read_text())[1]
    return {z["country"]["id"].lower(): (z["value"], z["date"]) for z in zeilen}


def zahl_text(n):
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}".replace(".", ",") + " Mio."
    return f"{round(n, -2 if n >= 10000 else -1):,}".replace(",", ".")


def flaggen(laender):
    ziel = ROOT / "app" / "flaggen"
    ziel.mkdir(exist_ok=True)
    meta_datei = ROH / "flaggen_meta.json"
    meta = json.loads(meta_datei.read_text()) if meta_datei.exists() else {}
    for l in laender:
        datei = ziel / f"{l['iso']}.svg"
        if not datei.exists():
            curl("https://commons.wikimedia.org/wiki/Special:FilePath/" + urllib.parse.quote(l["commons"]), datei)
        if l["iso"] not in meta:
            d = json.loads(curl("https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata&titles=" + urllib.parse.quote("File:" + l["commons"])))
            m = next(iter(d["query"]["pages"].values())).get("imageinfo", [{}])[0].get("extmetadata", {})
            ohne = lambda s: re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s or "")).strip()
            meta[l["iso"]] = {"urheber": ohne(m.get("Artist", {}).get("value"))[:60] or "Wikimedia Commons",
                              "lizenz": ohne(m.get("LicenseShortName", {}).get("value")) or "siehe Commons"}
            meta_datei.write_text(json.dumps(meta, ensure_ascii=False))
    return meta


# ---------- Karte ----------
def projektion(lon, lat, lon0=15.0, lat0=52.0):
    """Flächentreue Azimutalprojektion, passend für Europa."""
    l, p, l0, p0 = map(math.radians, (lon, lat, lon0, lat0))
    k = math.sqrt(2 / max(1e-9, 1 + math.sin(p0) * math.sin(p) + math.cos(p0) * math.cos(p) * math.cos(l - l0)))
    return (k * math.cos(p) * math.sin(l - l0), k * (math.cos(p0) * math.sin(p) - math.sin(p0) * math.cos(p) * math.cos(l - l0)))


def bogen_decoder(topo):
    sx, sy = topo["transform"]["scale"]
    tx, ty = topo["transform"]["translate"]
    boegen = []
    for a in topo["arcs"]:
        x = y = 0
        punkte = []
        for dx, dy in a:
            x += dx
            y += dy
            punkte.append((x * sx + tx, y * sy + ty))
        boegen.append(punkte)

    def ring(indizes):
        aus = []
        for i in indizes:
            teil = boegen[i] if i >= 0 else boegen[~i][::-1]
            aus.extend(teil if not aus else teil[1:])
        return aus
    return ring


def polygone(geo, ring):
    if geo["type"] == "Polygon":
        return [[ring(r) for r in geo["arcs"]]]
    if geo["type"] == "MultiPolygon":
        return [[ring(r) for r in p] for p in geo["arcs"]]
    return []


def karte(laender):
    datei = ROH / "countries-10m.json"
    if not datei.exists():
        curl(ATLAS, datei)
    topo = json.loads(datei.read_text())
    ring = bogen_decoder(topo)
    # Ansicht in Karten-Einheiten: Island bis zum Ural, Nordafrika-Küste bis Nordkap
    BREITE = 1000
    x0, y1 = projektion(-25, 62)[0], projektion(15, 72)[1]
    x1 = projektion(50, 52)[0]
    m = BREITE / (x1 - x0)
    # Unten muss alles bis Malta und Zypern passen.
    HOEHE = round((y1 - min(projektion(15, 34.5)[1], projektion(35, 34)[1])) * m)

    def xy(lon, lat):
        x, y = projektion(lon, lat)
        return (x - x0) * m, (y1 - y) * m

    def beschneiden(pts, box):
        """Schneidet einen Ring auf ein Rechteck zu (Sutherland-Hodgman)."""
        x, y, w, h = box
        kanten = [(lambda p: p[0] >= x, lambda a, b: (x, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]))),
                  (lambda p: p[0] <= x + w, lambda a, b: (x + w, a[1] + (b[1] - a[1]) * (x + w - a[0]) / (b[0] - a[0]))),
                  (lambda p: p[1] >= y, lambda a, b: (a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]), y)),
                  (lambda p: p[1] <= y + h, lambda a, b: (a[0] + (b[0] - a[0]) * (y + h - a[1]) / (b[1] - a[1]), y + h))]
        for innen, schnitt in kanten:
            aus = []
            for i, q in enumerate(pts):
                v = pts[i - 1]
                if innen(q):
                    if not innen(v):
                        aus.append(schnitt(v, q))
                    aus.append(q)
                elif innen(v):
                    aus.append(schnitt(v, q))
            pts = aus
            if not pts:
                break
        return pts

    laender_iso = {l["iso"] for l in laender}
    ziel_von_num = {str(v).zfill(3): k.rstrip("_") for k, v in NUM.items() if k.rstrip("_") in laender_iso}

    def pfad(poly_liste, mindest, box=None, ohne_winzige=False):
        box = box or (-20, -20, BREITE + 40, HOEHE + 40)
        stellen = 2 if mindest < 0.3 else 1
        teile, gesamt = [], []
        for poly in poly_liste:
            for r in poly:
                pts = beschneiden([xy(*p) for p in r], box)
                if len(pts) < 3:
                    continue
                xs, ys = [p[0] for p in pts], [p[1] for p in pts]
                if ohne_winzige and max(max(xs) - min(xs), max(ys) - min(ys)) < 2.5:
                    continue
                aus = [pts[0]]
                for p in pts[1:]:
                    if math.dist(p, aus[-1]) >= mindest:
                        aus.append(p)
                if len(aus) < 3:
                    aus = pts
                gesamt.extend(aus)
                teile.append("M" + "L".join(f"{round(a, stellen):g},{round(b, stellen):g}" for a, b in aus) + "Z")
        return "".join(teile), gesamt

    roh = {}
    hintergrund = []
    for g in topo["objects"]["countries"]["geometries"]:
        name = g["properties"].get("name", "")
        polys = polygone(g, ring)
        if name == "Russia":
            # Natural Earth zeichnet die Krim bei Russland ein. Völkerrechtlich gehört sie zur Ukraine.
            krim = [p for p in polys if 32 < sum(q[0] for q in p[0]) / len(p[0]) < 37 and 44 < sum(q[1] for q in p[0]) / len(p[0]) < 46.5]
            polys = [p for p in polys if p not in krim]
            roh.setdefault("krim", []).extend(krim)
            print("Krim-Polygone umgehängt:", len(krim))
        iso = ziel_von_num.get(str(g.get("id", "")))
        if name == "Kosovo":
            iso = "xk"
        if name in ("N. Cyprus", "Northern Cyprus", "Cyprus U.N. Buffer Zone"):
            roh.setdefault("zypern_rest", []).extend(polys)
        if iso:
            roh[iso] = roh.get(iso, []) + polys
        hintergrund.extend(polys)
    roh["ua"] = roh.get("ua", []) + roh.get("krim", [])
    roh["cy"] = roh.get("cy", []) + roh.get("zypern_rest", [])
    hintergrund.extend(roh.get("krim", []))

    hinter, _ = pfad(hintergrund, 1.6, ohne_winzige=True)
    pfade, zoom, mitte, nah = {}, {}, {}, {}
    for iso in sorted(laender_iso):
        d, pts = pfad(roh[iso], 1.0)
        if not pts:
            raise SystemExit(f"Keine Kartenform für {iso}: {len(roh[iso])} Polygone")
        # Kleine Länder: volle Genauigkeit und vergrößerter Ausschnitt
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        if max(max(xs) - min(xs), max(ys) - min(ys)) < 16:
            d, pts = pfad(roh[iso], 0)
            xs, ys = [p[0] for p in pts], [p[1] for p in pts]
            mx, my = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
            b = max(45, 7 * max(max(xs) - min(xs), max(ys) - min(ys)))
            h = b * 0.6
            zoom[iso] = [round(mx - b / 2, 1), round(my - h / 2, 1), round(b, 1), round(h, 1)]
            nah[iso] = pfad(hintergrund, b / 300, box=zoom[iso])[0]
            mitte[iso] = [round(mx, 1), round(my, 1)]
        pfade[iso] = d
    (ROOT / "app" / "karte.json").write_text(json.dumps(
        {"ansicht": [0, 0, BREITE, HOEHE], "hintergrund": hinter, "pfade": pfade, "zoom": zoom, "mitte": mitte, "nah": nah}, separators=(",", ":")))
    print("klein mit Zoom:", sorted(zoom))


def main():
    ROH.mkdir(exist_ok=True)
    laender = json.loads((ROOT / "inhalte" / "laender_europa.json").read_text())
    ew = einwohner(laender)
    meta = flaggen(laender)
    karte(laender)
    aus = []
    for l in laender:
        wert, jahr = ew.get(l["iso"], (None, None))
        if l["iso"] == "va":
            text, quelle = f"rund {VATIKAN[0]} ({VATIKAN[1][-4:]})", f"Einwohner: Wikipedia, {VATIKAN[1]}"
        else:
            if wert is None:
                raise SystemExit(f"Keine Einwohnerzahl für {l['iso']}")
            text, quelle = f"{zahl_text(wert)} ({jahr})", f"Einwohner: Weltbank, {jahr}"
        aus.append({**l, "kontinent": "Europa", "einwohnerText": text, "quelleEinwohner": quelle,
                    "quelle": "https://de.wikipedia.org/wiki/" + urllib.parse.quote(l["wiki"].replace(" ", "_")),
                    "bildUrheber": meta[l["iso"]]["urheber"], "bildLizenz": meta[l["iso"]]["lizenz"]})
    (ROOT / "app" / "flaggen.json").write_text(json.dumps({"laender": aus}, ensure_ascii=False, separators=(",", ":")))
    print(len(aus), "Länder geschrieben")


if __name__ == "__main__":
    main()
