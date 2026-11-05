"use strict";
// Flaggen-Quiz: Frage zuerst, danach die Auflösung. Falsches kommt bald wieder, Sicheres später.
// Nutzt zustand, sichern, el und $ aus app.js.

const TAGE = [0, 1, 3, 7, 21, 60]; // Abstand je Stufe in Tagen
const TAG_MS = 86400000;
const SICHER_AB = 3;
const NEUE_PRO_RUNDE = 5;
const RUNDE_LAENGE = 10;

let flLaender = [];
let flKarte = null;
const flNachIso = new Map();

async function flaggenLaden() {
  const [d, k] = await Promise.all([
    fetch("flaggen.json", { cache: "no-cache" }).then((r) => r.json()),
    fetch("karte.json", { cache: "no-cache" }).then((r) => r.json()),
  ]);
  flLaender = d.laender;
  flKarte = k;
  flLaender.forEach((l) => flNachIso.set(l.iso, l));
}

const flMischen = (a) => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};
const flStand = (iso) => zustand.flaggen[iso];
const flBild = (iso) => `flaggen/${iso}.svg`;
const flSicher = () => flLaender.filter((l) => (flStand(l.iso)?.stufe ?? 0) >= SICHER_AB).length;
const flFaellige = () => flLaender
  .filter((l) => flStand(l.iso) && flStand(l.iso).faellig <= Date.now())
  .sort((a, b) => flStand(a.iso).faellig - flStand(b.iso).faellig);
const flNeue = () => flLaender.filter((l) => !flStand(l.iso));

function flAntwortMerken(land, richtig) {
  const alt = flStand(land.iso) || { stufe: 0, richtig: 0, falsch: 0 };
  const stufe = richtig ? Math.min(alt.stufe + 1, TAGE.length - 1) : Math.max(alt.stufe - 2, 0);
  zustand.flaggen[land.iso] = {
    stufe,
    richtig: alt.richtig + (richtig ? 1 : 0),
    falsch: alt.falsch + (richtig ? 0 : 1),
    faellig: Date.now() + (richtig ? TAGE[stufe] * TAG_MS : 0),
  };
  sichern();
}

// Falsche Antworten: am Anfang eine ähnliche Flagge, danach nur noch ähnliche.
function flFalsche(land, stufe) {
  const aehnlich = flMischen(land.aehnlich).map((i) => flNachIso.get(i)).filter(Boolean);
  const rest = flMischen(flLaender.filter((l) => l !== land && !land.aehnlich.includes(l.iso)));
  const start = stufe === 0 ? aehnlich.slice(0, 1) : aehnlich.slice(0, 3);
  return [...start, ...rest].slice(0, 3);
}

// Mit wachsender Sicherheit wird die Frage schwerer.
function flFrageArt(stufe) {
  if (stufe <= 1) return "flagge";
  return stufe === 2 || stufe === 4 ? "land" : "karte";
}

function flKarteSvg(iso, zoom = false) {
  const voll = flKarte.ansicht;
  const box = zoom ? flKarte.zoom[iso] : voll;
  const t = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  t.setAttribute("viewBox", box.join(" "));
  t.setAttribute("class", "landkarte");
  t.setAttribute("role", "img");
  t.setAttribute("aria-label", zoom ? "Ausschnitt mit dem markierten Land" : "Europakarte mit dem markierten Land");
  const pfad = (d, klasse) => {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", d);
    p.setAttribute("class", klasse);
    t.append(p);
  };
  pfad(zoom ? flKarte.nah[iso] : flKarte.hintergrund, "kl-land");
  pfad(flKarte.pfade[iso], "kl-ziel");
  // Sehr kleine Länder wären sonst kaum zu finden, darum immer ein Ring drumherum.
  if (flKarte.zoom[iso]) {
    const [x, y] = flKarte.mitte[iso];
    const r = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    r.setAttribute("cx", x);
    r.setAttribute("cy", y);
    r.setAttribute("r", zoom ? box[2] * 0.09 : 22);
    r.setAttribute("class", "kl-ring");
    t.append(r);
  }
  return t;
}

// Baut eine Frage. fertig(richtig, gewaehltesLand) läuft nach der Antwort.
function flFrageBauen(land, fertig) {
  const stufe = flStand(land.iso)?.stufe ?? 0;
  const art = flFrageArt(stufe);
  const optionen = flMischen([land, ...flFalsche(land, stufe)]);
  const raster = el("div", { class: "fl-optionen" + (art === "land" ? " mit-bild" : "") });
  const kopf = el("div", { class: "fl-frage" });

  if (art === "flagge") {
    kopf.append(
      el("p", { class: "fl-aufgabe", text: "Welches Land ist das?" }),
      el("img", { class: "fl-gross", src: flBild(land.iso), alt: "Gesuchte Flagge" }),
    );
  } else if (art === "land") {
    kopf.append(
      el("p", { class: "fl-aufgabe", text: "Welche Flagge gehört zu" }),
      el("p", { class: "fl-name", text: land.name }),
    );
  } else {
    kopf.append(el("p", { class: "fl-aufgabe", text: "Welches Land ist markiert?" }), flKarteSvg(land.iso));
  }

  const knoepfe = optionen.map((o) => {
    const k = el("button", {
      class: "fl-option", type: "button",
      onclick: () => {
        if (raster.dataset.fertig) return;
        raster.dataset.fertig = "1";
        const richtig = o === land;
        knoepfe.forEach(([n, x]) => {
          n.disabled = true;
          if (x === land) n.classList.add("richtig");
          else if (x === o) n.classList.add("falsch");
        });
        flAntwortMerken(land, richtig);
        setTimeout(() => fertig(richtig, o), 550);
      },
    });
    if (art === "land") k.append(el("img", { src: flBild(o.iso), alt: `Flagge ${optionen.indexOf(o) + 1}` }));
    else k.append(el("span", { text: o.name }));
    raster.append(k);
    return [k, o];
  });

  return el("div", { class: "fl-block" }, kopf, raster);
}

function flFakt(name, wert) {
  return el("div", { class: "fl-fakt" }, el("dt", { text: name }), el("dd", { text: wert }));
}

// Zeigt alles zum Land. Mit ergebnis (true/false) als Auflösung, ohne als Nachschlagen.
function flAufloesung(land, ergebnis, gewaehlt, weiter) {
  const inhalt = $("blatt-inhalt");
  const teile = [];
  if (ergebnis !== undefined) {
    teile.push(el("p", {
      class: "fl-ergebnis " + (ergebnis ? "gut" : "schlecht"),
      text: ergebnis ? "Richtig!" : "Nicht ganz.",
    }));
  }
  if (ergebnis === false && gewaehlt) {
    teile.push(el("div", { class: "fl-vergleich" },
      el("figure", {}, el("img", { src: flBild(land.iso), alt: `Flagge von ${land.name}` }), el("figcaption", { text: land.name })),
      el("figure", {}, el("img", { src: flBild(gewaehlt.iso), alt: `Flagge von ${gewaehlt.name}` }), el("figcaption", { text: `${gewaehlt.name} (deine Antwort)` })),
    ));
  } else {
    teile.push(el("img", { class: "fl-gross", src: flBild(land.iso), alt: `Flagge von ${land.name}` }));
  }
  teile.push(
    el("h2", { id: "blatt-titel", text: land.name }),
    el("dl", { class: "fl-fakten" },
      flFakt("Kontinent", land.kontinent),
      flFakt("Region", land.region),
      flFakt("Hauptstadt", land.hauptstadt),
      flFakt("Einwohner", land.einwohnerText),
      flFakt("Fläche", land.flaecheText),
    ),
    flKarteSvg(land.iso),
  );
  if (flKarte.zoom[land.iso]) {
    teile.push(el("p", { class: "fl-karteninfo", text: "Sehr klein, darum hier noch einmal vergrößert:" }), flKarteSvg(land.iso, true));
  }
  teile.push(el("div", { class: "merkkasten" }, el("b", { text: "Eselsbrücke" }), el("p", { text: land.esel })));
  teile.push(el("h3", { text: "Das bedeutet die Flagge" }), el("p", { text: land.bedeutung }));
  if (land.hinweis) teile.push(el("h3", { text: "Gut zu wissen" }), el("p", { text: land.hinweis }));
  teile.push(
    el("h3", { text: "Quellen" }),
    el("ul", { class: "quellen" },
      el("li", {}, el("a", { href: land.quelle, target: "_blank", rel: "noopener", text: "Wikipedia: " + land.wiki })),
    ),
    el("p", { class: "nachweis", text: `${land.quelleEinwohner}. Flagge: ${land.bildUrheber}, ${land.bildLizenz}. Karte: Natural Earth.` }),
  );
  if (weiter) {
    teile.push(el("button", { class: "mehr fl-weiter", type: "button", text: "Weiter", onclick: () => $("blatt").close() }));
    $("blatt").addEventListener("close", weiter, { once: true });
  }
  inhalt.replaceChildren(...teile);
  inhalt.scrollTop = 0;
  $("blatt").showModal();
}

// ---------- Übersicht und Runde ----------
const flBereich = () => $("flaggen");

function flUebersicht() {
  const faellig = flFaellige().length;
  const neu = flNeue().length;
  const offen = faellig + neu;
  const knopfText = faellig ? `${faellig} wiederholen` : neu ? "Neue Flaggen lernen" : "Üben";
  const raster = el("ul", { class: "fl-raster" }, ...flLaender.map((l) => {
    const s = flStand(l.iso);
    if (!s) return el("li", {}, el("div", { class: "fl-kachel unbekannt", "aria-label": "Noch nicht gelernt", text: "?" }));
    const status = s.stufe >= SICHER_AB ? "sicher" : "lernt";
    return el("li", {}, el("button", {
      class: "fl-kachel " + status, type: "button", "aria-label": `${l.name} ansehen`,
      onclick: () => flAufloesung(l),
    }, el("img", { src: flBild(l.iso), alt: "" })));
  }));
  flBereich().replaceChildren(
    zurueckKnopf(),
    el("h1", { text: "Flaggen Europa" }),
    el("p", { class: "bilanz", text: `Europa: ${flSicher()} von ${flLaender.length} sicher` }),
    el("div", { class: "fl-balken", role: "img", "aria-label": `${flSicher()} von ${flLaender.length} sicher` },
      el("span", { style: `width:${(flSicher() / flLaender.length) * 100}%` })),
    offen
      ? el("button", { class: "mehr fl-start", type: "button", text: knopfText, onclick: flRundeStarten })
      : el("p", { class: "leer", text: "Für heute ist nichts fällig. Morgen kommen die nächsten Wiederholungen." }),
    raster,
    el("p", { class: "nachweis", text: "Sicher heißt: mindestens dreimal in Folge richtig. Gelernte Flaggen kannst du antippen." }),
  );
}

function flRundeStarten() {
  const faellige = flFaellige().slice(0, RUNDE_LAENGE);
  const neue = flNeue().slice(0, Math.min(NEUE_PRO_RUNDE, RUNDE_LAENGE - faellige.length));
  const runde = { warte: [...flMischen(faellige), ...neue], gesamt: faellige.length + neue.length, richtig: 0, falsch: 0, erledigt: 0 };
  flRundeWeiter(runde);
}

function flRundeWeiter(runde) {
  const land = runde.warte.shift();
  if (!land) return flRundeEnde(runde);
  flBereich().replaceChildren(
    el("div", { class: "fl-rundenkopf" },
      el("span", { text: `${runde.erledigt + 1} von ${runde.gesamt}` }),
      el("button", { class: "fl-abbruch", type: "button", text: "Beenden", onclick: flUebersicht }),
    ),
    flFrageBauen(land, (richtig, gewaehlt) => {
      if (richtig) {
        runde.richtig++;
        runde.erledigt++;
      } else {
        runde.falsch++;
        // Kommt in dieser Runde noch einmal, aber nicht sofort.
        runde.warte.splice(Math.min(3, runde.warte.length), 0, land);
      }
      flAufloesung(land, richtig, gewaehlt, () => flRundeWeiter(runde));
    }),
  );
  flBereich().scrollTop = 0;
}

function flRundeEnde(runde) {
  flBereich().replaceChildren(
    el("div", { class: "fl-ende" },
      el("h1", { text: "Runde geschafft" }),
      el("p", { class: "bilanz", text: runde.falsch
        ? `${runde.gesamt} Flaggen, ${runde.falsch}-mal daneben. Die kommen bald wieder.`
        : `${runde.gesamt} Flaggen, alle beim ersten Versuch richtig.` }),
      el("p", { class: "bilanz", text: `Europa: ${flSicher()} von ${flLaender.length} sicher` }),
      el("button", { class: "mehr", type: "button", text: "Zur Übersicht", onclick: flUebersicht }),
    ),
  );
}

// ---------- Fragen im Feed ----------
// Fällige zuerst, sonst neue. Jede Flagge höchstens einmal pro Aufbau.
function flFeedKarten(anzahl) {
  if (!flLaender.length) return [];
  return [...flMischen(flFaellige()), ...flNeue()].slice(0, anzahl).map((land) => {
    const artikel = el("article", { class: "karte fl-feedkarte", "data-kat": "flaggen" });
    const koerper = el("div", { class: "koerper" }, el("div", { class: "marke" }, el("span", { text: "Flaggen-Quiz" })));
    koerper.append(flFrageBauen(land, (richtig, gewaehlt) => {
      koerper.append(el("button", {
        class: "mehr fl-nochmal", type: "button", text: "Auflösung ansehen",
        onclick: () => flAufloesung(land, richtig, gewaehlt),
      }));
      flAufloesung(land, richtig, gewaehlt);
    }));
    artikel.append(koerper);
    return artikel;
  });
}
