"use strict";
// Wissens-Quiz: Jahreszahlen, Erde & Natur, Bauwerke & Rekorde.
// Gleiche Wiederholung wie bei den Flaggen (TAGE, SICHER_AB aus flaggen.js).

const QZ_THEMEN = [
  ["daten", "Jahreszahlen", "Wann war was? Von Kolumbus bis heute."],
  ["erde", "Erde & Natur", "Kontinente, Flüsse, Meere, Gebirge."],
  ["bauwerke", "Bauwerke & Rekorde", "Berühmte Bauten und was am höchsten ist."],
];
const QZ_NAMEN = Object.fromEntries(QZ_THEMEN.map(([k, n]) => [k, n]));
let qzFragen = [];

async function qzLaden() {
  qzFragen = (await fetch("quiz.json", { cache: "no-cache" }).then((r) => r.json())).fragen;
}

const qzStand = (id) => zustand.quiz[id];
const qzImThema = (t) => qzFragen.filter((f) => f.thema === t);
const qzSicher = (liste) => liste.filter((f) => (qzStand(f.id)?.stufe ?? 0) >= SICHER_AB).length;
const qzFaellige = (liste) => liste
  .filter((f) => qzStand(f.id) && qzStand(f.id).faellig <= Date.now())
  .sort((a, b) => qzStand(a.id).faellig - qzStand(b.id).faellig);
const qzNeue = (liste) => liste.filter((f) => !qzStand(f.id));

function qzMerken(frage, richtig) {
  const alt = qzStand(frage.id) || { stufe: 0, richtig: 0, falsch: 0 };
  const stufe = richtig ? Math.min(alt.stufe + 1, TAGE.length - 1) : Math.max(alt.stufe - 2, 0);
  zustand.quiz[frage.id] = {
    stufe,
    richtig: alt.richtig + (richtig ? 1 : 0),
    falsch: alt.falsch + (richtig ? 0 : 1),
    faellig: Date.now() + (richtig ? TAGE[stufe] * TAG_MS : 0),
  };
  sichern();
}

// Jahreszahlen werden ab der dritten Stufe eingetippt statt ausgewählt.
function qzFrageBauen(frage, fertig) {
  const stufe = qzStand(frage.id)?.stufe ?? 0;
  const tippen = frage.jahr && stufe >= 2;
  const kopf = el("div", { class: "fl-frage" }, el("p", { class: "fl-aufgabe", text: frage.frage }));
  let erledigt = false;
  const abschliessen = (richtig, gewaehlt, markieren) => {
    if (erledigt) return;
    erledigt = true;
    markieren();
    qzMerken(frage, richtig);
    setTimeout(() => fertig(richtig, gewaehlt), 550);
  };

  if (tippen) {
    const feld = el("input", {
      class: "qz-eingabe", type: "text", inputmode: "numeric", autocomplete: "off",
      placeholder: "Jahr eintippen", "aria-label": "Jahr",
    });
    const knopf = el("button", { class: "mehr qz-pruefen", type: "submit", text: "Prüfen" });
    const form = el("form", {
      class: "qz-form",
      onsubmit: (e) => {
        e.preventDefault();
        const wert = feld.value.trim();
        if (!wert) return;
        const richtig = wert === String(frage.jahr);
        abschliessen(richtig, wert, () => {
          feld.disabled = true;
          knopf.disabled = true;
          feld.classList.add(richtig ? "richtig" : "falsch");
          feld.blur();
        });
      },
    }, feld, knopf);
    return el("div", { class: "fl-block" }, kopf, el("p", { class: "qz-hinweis", text: "Diesmal ohne Auswahl." }), form);
  }

  const optionen = flMischen([frage.antwort, ...frage.falsch]);
  const raster = el("div", { class: "fl-optionen" });
  const knoepfe = optionen.map((o) => {
    const k = el("button", {
      class: "fl-option", type: "button",
      onclick: () => abschliessen(o === frage.antwort, o, () => knoepfe.forEach((n) => {
        n.disabled = true;
        if (n.textContent === frage.antwort) n.classList.add("richtig");
        else if (n === k) n.classList.add("falsch");
      })),
    }, el("span", { text: o }));
    raster.append(k);
    return k;
  });
  return el("div", { class: "fl-block" }, kopf, raster);
}

function qzAufloesung(frage, ergebnis, gewaehlt, weiter) {
  const teile = [];
  if (ergebnis !== undefined) {
    teile.push(el("p", { class: "fl-ergebnis " + (ergebnis ? "gut" : "schlecht"), text: ergebnis ? "Richtig!" : "Nicht ganz." }));
  }
  teile.push(
    el("div", { class: "marke", style: "color:var(--flaggen)", text: QZ_NAMEN[frage.thema] }),
    el("p", { class: "qz-frage-klein", text: frage.frage }),
    el("h2", { id: "blatt-titel", class: "qz-antwort", text: frage.antwort }),
  );
  if (ergebnis === false && gewaehlt) teile.push(el("p", { class: "qz-deine", text: `Deine Antwort: ${gewaehlt}` }));
  teile.push(
    el("p", { text: frage.erklaerung }),
    el("div", { class: "merkkasten" }, el("b", { text: "Merk dir" }), el("p", { text: frage.merke })),
    el("h3", { text: "Quelle" }),
    el("ul", { class: "quellen" }, el("li", {}, el("a", { href: frage.quelle[1], target: "_blank", rel: "noopener", text: "Wikipedia: " + frage.quelle[0] }))),
  );
  if (weiter) {
    teile.push(el("button", { class: "mehr fl-weiter", type: "button", text: "Weiter", onclick: () => $("blatt").close() }));
    $("blatt").addEventListener("close", weiter, { once: true });
  }
  $("blatt-inhalt").replaceChildren(...teile);
  $("blatt-inhalt").scrollTop = 0;
  $("blatt").showModal();
}

// ---------- Übersichten ----------
function zurueckKnopf() {
  return el("button", { class: "qz-zurueck", type: "button", text: "‹ Quiz", onclick: quizStart });
}

function deckKarte(name, text, sicher, gesamt, faellig, oeffnen) {
  return el("li", {}, el("button", { class: "qz-deck", type: "button", onclick: oeffnen },
    el("strong", { text: name }),
    el("span", { class: "qz-deck-text", text }),
    el("div", { class: "fl-balken" }, el("span", { style: `width:${gesamt ? (sicher / gesamt) * 100 : 0}%` })),
    el("span", { class: "qz-deck-stand", text: `${sicher} von ${gesamt} sicher` + (faellig ? ` · ${faellig} fällig` : "") }),
  ));
}

function quizStart() {
  const decks = [];
  if (flLaender.length) {
    decks.push(deckKarte("Flaggen Europa", "Flagge, Lage und Fakten zu 46 Ländern.", flSicher(), flLaender.length, flFaellige().length, flUebersicht));
  }
  for (const [key, name, text] of QZ_THEMEN) {
    const liste = qzImThema(key);
    if (liste.length) decks.push(deckKarte(name, text, qzSicher(liste), liste.length, qzFaellige(liste).length, () => qzUebersicht(key)));
  }
  flBereich().replaceChildren(
    el("h1", { text: "Quiz" }),
    el("p", { class: "bilanz", text: "Erst antworten, dann lernen. Was du falsch hast, kommt bald wieder." }),
    el("ul", { class: "qz-decks" }, ...decks),
  );
  flBereich().scrollTop = 0;
}

function qzUebersicht(thema) {
  const liste = qzImThema(thema);
  const faellig = qzFaellige(liste).length;
  const neu = qzNeue(liste).length;
  const zeilen = liste.map((f) => {
    const s = qzStand(f.id);
    if (!s) return el("li", { class: "qz-zeile unbekannt" }, el("span", { text: f.frage }), el("b", { text: "?" }));
    return el("li", {}, el("button", {
      class: "qz-zeile " + (s.stufe >= SICHER_AB ? "sicher" : "lernt"), type: "button",
      onclick: () => qzAufloesung(f),
    }, el("span", { text: f.frage }), el("b", { text: f.antwort })));
  });
  flBereich().replaceChildren(
    zurueckKnopf(),
    el("h1", { text: QZ_NAMEN[thema] }),
    el("p", { class: "bilanz", text: `${qzSicher(liste)} von ${liste.length} sicher` }),
    el("div", { class: "fl-balken" }, el("span", { style: `width:${(qzSicher(liste) / liste.length) * 100}%` })),
    faellig + neu
      ? el("button", { class: "mehr fl-start", type: "button", text: faellig ? `${faellig} wiederholen` : "Neue Fragen lernen", onclick: () => qzRundeStarten(thema) })
      : el("p", { class: "leer", text: "Für heute ist hier nichts fällig." }),
    el("ul", { class: "qz-zeilen" }, ...zeilen),
  );
  flBereich().scrollTop = 0;
}

function qzRundeStarten(thema) {
  const liste = qzImThema(thema);
  const faellige = qzFaellige(liste).slice(0, RUNDE_LAENGE);
  const neue = flMischen(qzNeue(liste)).slice(0, Math.min(NEUE_PRO_RUNDE, RUNDE_LAENGE - faellige.length));
  qzRundeWeiter({ thema, warte: [...flMischen(faellige), ...neue], gesamt: faellige.length + neue.length, falsch: 0, erledigt: 0 });
}

function qzRundeWeiter(runde) {
  const frage = runde.warte.shift();
  if (!frage) {
    flBereich().replaceChildren(el("div", { class: "fl-ende" },
      el("h1", { text: "Runde geschafft" }),
      el("p", { class: "bilanz", text: runde.falsch ? `${runde.gesamt} Fragen, ${runde.falsch}-mal daneben. Die kommen bald wieder.` : `${runde.gesamt} Fragen, alle beim ersten Versuch richtig.` }),
      el("button", { class: "mehr", type: "button", text: "Zur Übersicht", onclick: () => qzUebersicht(runde.thema) }),
    ));
    return;
  }
  flBereich().replaceChildren(
    el("div", { class: "fl-rundenkopf" },
      el("span", { text: `${runde.erledigt + 1} von ${runde.gesamt}` }),
      el("button", { class: "fl-abbruch", type: "button", text: "Beenden", onclick: () => qzUebersicht(runde.thema) }),
    ),
    qzFrageBauen(frage, (richtig, gewaehlt) => {
      if (richtig) runde.erledigt++;
      else {
        runde.falsch++;
        runde.warte.splice(Math.min(3, runde.warte.length), 0, frage);
      }
      qzAufloesung(frage, richtig, gewaehlt, () => qzRundeWeiter(runde));
    }),
  );
  flBereich().scrollTop = 0;
  flBereich().querySelector(".qz-eingabe")?.focus();
}

// ---------- Fragen im Feed: Flaggen und Wissen abwechselnd ----------
function qzFeedKarten(anzahl) {
  if (!qzFragen.length) return [];
  return [...flMischen(qzFaellige(qzFragen)), ...flMischen(qzNeue(qzFragen))].slice(0, anzahl).map((frage) => {
    const koerper = el("div", { class: "koerper" }, el("div", { class: "marke" }, el("span", { text: "Quiz · " + QZ_NAMEN[frage.thema] })));
    koerper.append(qzFrageBauen(frage, (richtig, gewaehlt) => {
      koerper.append(el("button", { class: "mehr fl-nochmal", type: "button", text: "Auflösung ansehen", onclick: () => qzAufloesung(frage, richtig, gewaehlt) }));
      qzAufloesung(frage, richtig, gewaehlt);
    }));
    return el("article", { class: "karte fl-feedkarte", "data-kat": "flaggen" }, koerper);
  });
}

function feedFragen(anzahl) {
  const q = qzFeedKarten(Math.ceil(anzahl / 2));
  const f = flFeedKarten(anzahl - q.length);
  const aus = [];
  for (let i = 0; i < Math.max(q.length, f.length); i++) {
    if (q[i]) aus.push(q[i]);
    if (f[i]) aus.push(f[i]);
  }
  return aus;
}
