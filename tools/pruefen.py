#!/usr/bin/env python3
"""Vergleicht Zahlen jeder Karte mit dem Text ihrer Quellen.

Listet alle Jahres- und Mengenangaben einer Karte, die in keiner angegebenen Quelle
wörtlich vorkommen, zum Nachprüfen von Hand. Das ist ein Filter und kein Beweis.
"""
import html, json, re, subprocess, sys, time, urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UA = "WissenApp-Eigenbau/0.1 (private Lern-App)"


CACHE = ROOT / "inhalte" / "quellen_cache.json"
speicher = json.loads(CACHE.read_text()) if CACHE.exists() else {}


def curl(url):
    """Holt eine Adresse höflich: eine Sekunde Pause, bei Bremsung länger warten."""
    for versuch in range(5):
        time.sleep(1 + versuch * 8)
        r = subprocess.run(["curl", "-sL", "-m", "30", "-A", UA, "-w", "\n%{http_code}", url], capture_output=True, text=True).stdout
        body, _, code = r.rpartition("\n")
        if code == "200":
            return body
    return ""


def quelltext(url):
    if url not in speicher:
        speicher[url] = quelle_holen(url)
        CACHE.write_text(json.dumps(speicher, ensure_ascii=False))
    return speicher[url]


def quelle_holen(url):
    m = re.match(r"https://(de|en)\.wikipedia\.org/wiki/(.+)", url)
    if m:
        t = urllib.parse.quote(m.group(2), safe="")
        d = curl(f"https://{m.group(1)}.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&explaintext=1&redirects=1&titles={t}")
        try:
            pages = json.loads(d)["query"]["pages"]
        except Exception:
            return None
        p = next(iter(pages.values()))
        return p.get("extract") or None
    m = re.match(r"https://www\.tagesschau\.de/(.+)\.html", url)
    if m:
        try:
            j = json.loads(curl(f"https://www.tagesschau.de/api2u/{m.group(1)}.json"))
        except Exception:
            return None
        return html.unescape(" ".join(re.sub("<[^>]+>", "", c.get("value") or "") for c in j.get("content", [])))
    return None


def zahlen(t):
    return set(re.findall(r"\d[\d.,]*\d|\d", t))


def norm(z):
    return z.replace(".", "").replace(",", "")


def main():
    nur = sys.argv[1:]
    fehler = 0
    for k in json.loads((ROOT / "inhalte" / "karten.json").read_text()):
        if nur and k["id"] not in nur:
            continue
        quellen, kaputt = [], []
        for name, url in k["quellen"]:
            t = quelltext(url)
            (quellen.append(t) if t else kaputt.append(url))
        ganz = norm(" ".join(quellen))
        text = " ".join([k["titel"], k["hook"], k["merke"], *k["text"]])
        offen = sorted(z for z in zahlen(text) if len(norm(z)) >= 2 and norm(z) not in ganz)
        if offen or kaputt:
            fehler += 1
            print(f"{k['id']}: nicht gefunden {offen}" + (f" | Quelle nicht lesbar {kaputt}" if kaputt else ""))
    print("Karten mit offenen Punkten:", fehler)


if __name__ == "__main__":
    main()
