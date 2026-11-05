#!/usr/bin/env python3
"""Prüft inhalte/quiz.json: Aufbau jeder Frage und ob ihre Belege in der Wikipedia-Quelle stehen.

Belege sind reguläre Ausdrücke, die im Quelltext vorkommen müssen. Fehlt einer, wird die Frage
zum Nachprüfen von Hand gelistet. Das ersetzt keine Prüfung durch einen Menschen.
"""
import json, re, subprocess, sys, time, urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "inhalte" / "quellen_cache.json"
UA = "WissenApp-Eigenbau/0.1 (private Lern-App)"


def text(url):
    speicher = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    if speicher.get(url):
        return speicher[url]
    m = re.match(r"https://(de|en)\.wikipedia\.org/wiki/(.+)", url)
    api = f"https://{m.group(1)}.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&explaintext=1&redirects=1&titles=" + urllib.parse.quote(m.group(2), safe="")
    for v in range(6):
        time.sleep(3 + v * 12)
        r = subprocess.run(["curl", "-sL", "-m", "30", "-A", UA, api], capture_output=True, text=True).stdout
        if r.startswith("{"):
            t = next(iter(json.loads(r)["query"]["pages"].values())).get("extract", "")
            speicher[url] = t
            CACHE.write_text(json.dumps(speicher, ensure_ascii=False))
            return t
    return None


def main():
    fragen = json.loads((ROOT / "inhalte" / "quiz.json").read_text())
    ids = [f["id"] for f in fragen]
    assert len(ids) == len(set(ids)), "doppelte id"
    for f in fragen:
        assert len(f["falsch"]) == 3 and f["antwort"] not in f["falsch"] and len(set(f["falsch"])) == 3, f["id"]
        if "jahr" in f:
            assert str(f["jahr"]) == f["antwort"], f["id"]
    if "--ohne-netz" in sys.argv:
        print(len(fragen), "Fragen, Aufbau in Ordnung")
        return
    offen = 0
    for f in fragen:
        t = text(f["quelle"][1])
        if not t:
            print(f["id"], "Quelle nicht lesbar", flush=True)
            offen += 1
            continue
        fehlt = [b for b in f["beleg"] if not re.search(b, t)]
        if fehlt:
            offen += 1
            print(f["id"], "fehlt", fehlt, flush=True)
    print(len(fragen), "Fragen,", offen, "zum Nachprüfen", flush=True)


if __name__ == "__main__":
    main()
