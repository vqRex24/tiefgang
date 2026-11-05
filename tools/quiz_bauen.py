#!/usr/bin/env python3
"""Schreibt app/quiz.json aus inhalte/quiz.json, ohne die internen Prüf-Belege."""
import json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
subprocess.run([sys.executable, str(ROOT / "tools" / "quiz_pruefen.py"), "--ohne-netz"], check=True)
fragen = json.loads((ROOT / "inhalte" / "quiz.json").read_text())
aus = [{k: v for k, v in f.items() if k != "beleg"} for f in fragen]
(ROOT / "app" / "quiz.json").write_text(json.dumps({"fragen": aus}, ensure_ascii=False, separators=(",", ":")))
print(len(aus), "Fragen geschrieben")
