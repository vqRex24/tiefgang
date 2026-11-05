#!/usr/bin/env python3
"""Zeichnet das App-Icon ohne Zusatzpakete: gestapelte Karten auf dunklem Grund."""
import struct, zlib
from pathlib import Path

ZIEL = Path(__file__).resolve().parent.parent / "app" / "icons"
GRUND = (14, 15, 17)
# (x0, y0, x1, y1, Radius, Farbe) in Anteilen der Kantenlänge, von hinten nach vorn
KARTEN = [
    (0.30, 0.20, 0.70, 0.40, 0.05, (90, 72, 40)),
    (0.25, 0.28, 0.75, 0.52, 0.05, (160, 118, 54)),
    (0.20, 0.38, 0.80, 0.80, 0.06, (232, 169, 74)),
]


def in_karte(x, y, k):
    x0, y0, x1, y1, r, _ = k
    if not (x0 <= x <= x1 and y0 <= y <= y1):
        return False
    dx = max(x0 + r - x, 0, x - (x1 - r))
    dy = max(y0 + r - y, 0, y - (y1 - r))
    return dx * dx + dy * dy <= r * r


def farbe(x, y):
    for k in reversed(KARTEN):
        if in_karte(x, y, k):
            return k[5]
    return GRUND


def png(n, pfad):
    ss = 3
    zeilen = bytearray()
    for j in range(n):
        zeilen.append(0)
        for i in range(n):
            r = g = b = 0
            for a in range(ss):
                for c in range(ss):
                    f = farbe((i + (a + .5) / ss) / n, (j + (c + .5) / ss) / n)
                    r += f[0]; g += f[1]; b += f[2]
            zeilen += bytes((r // ss**2, g // ss**2, b // ss**2))

    def block(typ, daten):
        return struct.pack(">I", len(daten)) + typ + daten + struct.pack(">I", zlib.crc32(typ + daten))

    pfad.write_bytes(b"\x89PNG\r\n\x1a\n" + block(b"IHDR", struct.pack(">IIBBBBB", n, n, 8, 2, 0, 0, 0))
                     + block(b"IDAT", zlib.compress(bytes(zeilen), 9)) + block(b"IEND", b""))


for groesse in (180, 192, 512):
    png(groesse, ZIEL / f"icon-{groesse}.png")
