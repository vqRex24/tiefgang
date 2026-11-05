"use strict";

const THEMEN = [
  ["alle", "Alle"],
  ["aktuell", "Aktuell"],
  ["weltkriege", "Weltkriege"],
  ["geschichte", "Geschichte"],
  ["bauwerke", "Bauwerke"],
  ["politik", "Politik"],
];
const NAMEN = Object.fromEntries(THEMEN);
const SPEICHER = "tiefgang.v1";

const $ = (id) => document.getElementById(id);
const feed = $("feed");

// ---------- Gespeicherter Zustand ----------
function laden() {
  try {
    const s = JSON.parse(localStorage.getItem(SPEICHER));
    if (s && Array.isArray(s.merk) && s.gesehen) return { flaggen: {}, quiz: {}, ...s };
  } catch (e) { /* privat oder gesperrt: dann ohne Speicher */ }
  return { merk: [], gesehen: {}, flaggen: {}, quiz: {} };
}
const zustand = laden();
function sichern() {
  try { localStorage.setItem(SPEICHER, JSON.stringify(zustand)); } catch (e) { /* siehe laden */ }
}

// ---------- Kleine Helfer ----------
function el(tag, attrs = {}, ...kinder) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "text") n.textContent = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  n.append(...kinder);
  return n;
}
function svg(pfad) {
  const t = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  t.setAttribute("viewBox", "0 0 24 24");
  t.setAttribute("width", "24");
  t.setAttribute("height", "24");
  t.setAttribute("aria-hidden", "true");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", pfad);
  t.append(p);
  return t;
}
const datumText = (d) => new Date(d + "T12:00:00").toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });

// ---------- Reihenfolge ----------
// Themen wechseln sich ab, Serien bleiben in ihrer Reihenfolge. Ungesehenes kommt zuerst,
// so geht eine Serie beim nächsten Öffnen am richtigen Teil weiter.
function reihenfolge(karten) {
  const ungesehen = karten.filter((k) => !zustand.gesehen[k.id]);
  const gesehen = karten.filter((k) => zustand.gesehen[k.id]);
  const stapel = new Map();
  for (const k of ungesehen) {
    if (!stapel.has(k.kat)) stapel.set(k.kat, []);
    stapel.get(k.kat).push(k);
  }
  const aus = [];
  while (stapel.size) {
    for (const [kat, liste] of stapel) {
      aus.push(liste.shift());
      if (!liste.length) stapel.delete(kat);
    }
  }
  return [...aus, ...gesehen];
}

// ---------- Karte ----------
let alleKarten = [];
let thema = "alle";

function karteBauen(k) {
  const ist = zustand.merk.includes(k.id);
  const merkKnopf = el("button", {
    class: "aktion", type: "button", "aria-pressed": String(ist),
    "aria-label": "Speichern",
    onclick: () => {
      const an = umschalten(k.id);
      merkKnopf.setAttribute("aria-pressed", String(an));
    },
  }, svg("M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1z"));

  const teilenKnopf = el("button", {
    class: "aktion", type: "button", "aria-label": "Teilen",
    onclick: () => teilen(k),
  }, svg("M12 15V3m0 0L8 7m4-4l4 4M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8"));

  const marke = el("div", { class: "marke" }, el("span", { text: NAMEN[k.kat] }));
  if (k.serie) marke.append(el("span", { class: "serie", text: `${k.serie}, Teil ${k.teil} von ${k.von}` }));
  if (k.datum) marke.append(el("span", { class: "serie", text: datumText(k.datum) }));

  const artikel = el("article", {
    class: "karte" + (k.bild ? "" : " ohne-bild"),
    "data-kat": k.kat, "data-id": k.id,
  });
  if (k.bild) {
    artikel.append(
      el("img", {
        class: "bild", src: k.bild.url, alt: "", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer",
        // Ohne Netz oder bei einem Fehler zeigt die Karte stattdessen die Farbfläche.
        onerror: () => {
          artikel.classList.add("ohne-bild");
          artikel.querySelectorAll(".bild, .bild-verlauf").forEach((n) => n.remove());
        },
      }),
      el("div", { class: "bild-verlauf" }),
    );
  }
  artikel.append(
    el("div", { class: "koerper" },
      marke,
      el("h2", { text: k.titel }),
      el("p", { class: "hook", text: k.hook }),
      el("p", { class: "merke", text: k.merke }),
      el("button", { class: "mehr", type: "button", text: "Weiterlesen", onclick: () => blattOeffnen(k) }),
    ),
    el("div", { class: "aktionen" }, merkKnopf, teilenKnopf),
  );
  return artikel;
}

function endeBauen(anzahl) {
  return el("article", { class: "karte ende" },
    el("h2", { text: "Du bist durch." }),
    el("p", { text: `${anzahl} Karten in diesem Bereich. Neue kommen dazu, sobald sie geschrieben sind. Geh ruhig kurz raus.` }),
    el("button", { class: "mehr", type: "button", text: "Von vorn", onclick: () => feed.scrollTo({ top: 0 }) }),
  );
}

function feedZeigen() {
  const auswahl = thema === "alle" ? alleKarten : alleKarten.filter((k) => k.kat === thema);
  const karten = reihenfolge(auswahl).map(karteBauen);
  // Im gemischten Feed unterbricht etwa jede fünfte Karte das reine Lesen mit einer Frage.
  if (thema === "alle") {
    feedFragen(Math.floor(karten.length / 5)).forEach((f, i) => karten.splice((i + 1) * 5 + i, 0, f));
  }
  feed.replaceChildren(...karten, endeBauen(auswahl.length));
  feed.scrollTop = 0;
  feed.querySelectorAll(".karte[data-id]").forEach((n) => beobachter.observe(n));
}

// ---------- Gesehen zählt erst nach kurzem Lesen ----------
const timer = new Map();
const beobachter = new IntersectionObserver((eintraege) => {
  for (const e of eintraege) {
    const id = e.target.dataset.id;
    if (e.isIntersecting) {
      timer.set(id, setTimeout(() => {
        zustand.gesehen[id] = new Date().toISOString().slice(0, 10);
        sichern();
      }, 3000));
    } else {
      clearTimeout(timer.get(id));
    }
  }
}, { threshold: 0.6 });

// ---------- Aktionen ----------
function umschalten(id) {
  const i = zustand.merk.indexOf(id);
  if (i >= 0) zustand.merk.splice(i, 1); else zustand.merk.unshift(id);
  sichern();
  return i < 0;
}

async function teilen(k) {
  const url = k.quellen[0][1];
  try {
    if (navigator.share) await navigator.share({ title: k.titel, text: k.hook, url });
    else await navigator.clipboard.writeText(`${k.titel}\n${k.hook}\n${url}`);
  } catch (e) { /* abgebrochen */ }
}

function blattOeffnen(k) {
  const inhalt = $("blatt-inhalt");
  const teile = [
    el("div", { class: "marke", style: `color:var(--${k.kat})`, text: k.serie ? `${k.serie}, Teil ${k.teil} von ${k.von}` : NAMEN[k.kat] }),
    el("h2", { id: "blatt-titel", text: k.titel }),
    el("p", { text: k.hook }),
    ...k.text.map((t) => el("p", { text: t })),
    el("div", { class: "merkkasten" }, el("b", { text: "Merk dir" }), el("p", { text: k.merke })),
    el("h3", { text: "Quellen" }),
    el("ul", { class: "quellen" }, ...k.quellen.map(([name, url]) =>
      el("li", {}, el("a", { href: url, target: "_blank", rel: "noopener", text: name })))),
  ];
  if (k.bild) {
    teile.push(el("p", { class: "nachweis" },
      "Bild: ", el("a", { href: k.bild.seite, target: "_blank", rel: "noopener", text: k.bild.urheber }), `, ${k.bild.lizenz}`));
  }
  inhalt.replaceChildren(...teile);
  inhalt.scrollTop = 0;
  $("blatt").showModal();
}

// ---------- Merkliste ----------
function merklisteZeigen() {
  const nachId = new Map(alleKarten.map((k) => [k.id, k]));
  const liste = zustand.merk.map((id) => nachId.get(id)).filter(Boolean);
  const gesehen = alleKarten.filter((k) => zustand.gesehen[k.id]).length;
  $("bilanz").textContent = `${gesehen} von ${alleKarten.length} Karten gelesen`;
  $("zeilen").replaceChildren(...(liste.length ? liste.map((k) =>
    el("li", {}, el("button", { class: "zeile", type: "button", onclick: () => blattOeffnen(k) },
      k.bild ? el("img", { src: k.bild.url, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }) : el("div", { class: "platz" }),
      el("div", {}, el("strong", { text: k.titel }), el("span", { text: NAMEN[k.kat] })),
    ))) : [el("li", { class: "leer", text: "Noch nichts gespeichert. Tippe auf einer Karte auf das Lesezeichen, um sie hier wiederzufinden." })]));
}

function bereich(name) {
  const istFeed = name === "feed";
  feed.hidden = !istFeed;
  $("kopf").hidden = !istFeed;
  $("merkliste").hidden = name !== "merk";
  $("flaggen").hidden = name !== "flaggen";
  for (const n of ["feed", "flaggen", "merk"]) $("tab-" + n).classList.toggle("aktiv", n === name);
  if (istFeed) feedZeigen();
  else if (name === "merk") merklisteZeigen();
  else quizStart();
}

// ---------- Start ----------
function chipsBauen() {
  $("chips").replaceChildren(...THEMEN.map(([key, name]) =>
    el("button", {
      class: "chip", type: "button", "aria-pressed": String(key === thema), text: name,
      onclick: (e) => {
        thema = key;
        $("chips").querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
        e.currentTarget.setAttribute("aria-pressed", "true");
        feedZeigen();
      },
    })));
}

async function start() {
  chipsBauen();
  $("tab-feed").addEventListener("click", () => bereich("feed"));
  $("tab-merk").addEventListener("click", () => bereich("merk"));
  $("tab-flaggen").addEventListener("click", () => bereich("flaggen"));
  $("blatt-zu").addEventListener("click", () => $("blatt").close());
  $("blatt").addEventListener("click", (e) => { if (e.target === $("blatt")) $("blatt").close(); });
  try {
    const [r] = await Promise.all([
      fetch("inhalte.json", { cache: "no-cache" }),
      // Ohne Flaggen-Daten bleibt der Feed trotzdem nutzbar.
      flaggenLaden().catch(() => {}),
      qzLaden().catch(() => {}),
    ]);
    alleKarten = (await r.json()).karten;
    feedZeigen();
  } catch (e) {
    feed.replaceChildren(el("article", { class: "karte ende" },
      el("h2", { text: "Keine Verbindung" }),
      el("p", { text: "Die Karten konnten nicht geladen werden. Sobald du online bist, sind sie wieder da." }),
      el("button", { class: "mehr", type: "button", text: "Neu laden", onclick: () => location.reload() })));
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}
start();
