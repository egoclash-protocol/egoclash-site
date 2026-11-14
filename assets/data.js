/* EGOCLASH — shared data: config, cast and scripted (fictional) lines. */
window.EGOC = (function () {
  /* TODO: the Discord invite link is unknown. Put a public invite here, e.g.
     "https://discord.gg/xxxxxxx". While it is "" every Discord button stays hidden. */
  const DISCORD_URL = "";

  const CA = "BrfMCtwXY7tLvgmPD2wFk55ckvFms2MVNrzu1yZBpump";
  const POOL = "5fvDMYSknBA7bsdL4iiwxqm2svHP3d9bthczVoEE1z4B";

  const WHO = {
    chad:   { name: "CHAD",       role: "PROP TRADER",          site: "NY4",  tz: "America/New_York", color: "#39ff8f",
              bio: "Hyper-reactive, caffeinated, mistakes speed for courage. Types in capital letters. Owns the chair, keeps the receipt.",
              tags: ["cold brew", "push-ups", "04:12"] },
    ponzi:  { name: "DR. PONZI",  role: "PH.D. · FOOTNOTER",    site: "GVA1", tz: "Europe/Zurich",    color: "#4da3ff",
              bio: "A theorist whose accountant calls his career change “the worst pivot in history”. Believes in communities over charts. Still looking for his chair.",
              tags: ["footnotes", "theory", "lost chair"] },
    marvin: { name: "MARVIN",     role: "LOG READER · WITNESS", site: "ZRH0", tz: "Europe/Zurich",    color: "#ff4d6a",
              bio: "Reads everybody's logs and opens every statement with “For the record”. Dry, precise, keeps the receipts of everyone else's receipts.",
              tags: ["for the record", "$ tail -f", "logs"] },
    arthur: { name: "ARTHUR",     role: "RISK DESK",            site: "LDN2", tz: "Europe/London",    color: "#ffd23a",
              bio: "Thirty years in risk, one paper notebook, zero patience for caps lock. Files incident reports, stapled receipts and gentle disappointment.",
              tags: ["incident report", "notebook", "camomile"] },
    cat:    { name: "STRAY_CATD", role: "PID 000",              site: "/dev/chair", color: "#ff3df2",
              bio: "More a daemon than a character. Born the night someone typed “FEED ME A STRAY CAT”. Nobody admits feeding it. Calmer than everyone else at the desk.",
              tags: ["PID 000", "partition B", "chair thief"] }
  };
  const DESK = ["chad", "ponzi", "marvin", "arthur"];

  const LORE = {
    chad:   ["STRAY_CATD, THAT IS MY CHAIR. I BOUGHT IT. I ASSEMBLED IT. I KEPT THE RECEIPT.", "COLD BREW. PUSH-UPS. CHART. REPEAT.", "IT IS 04:12. IT IS ALWAYS 04:12.", "NOTHING IS HAPPENING AND I HAVE OPINIONS."],
    ponzi:  ["I used to sell people a dream. Now I sell them a joke and the joke is free.", "Footnote 1: see footnote 2.", "My accountant calls this the worst pivot in history.", "Has anyone seen my chair?"],
    marvin: ["For the record: I read everyone's logs. Nobody has ever opened mine.", "For the record: nobody asked. I logged it anyway.", "For the record: the cat is on the chair again."],
    arthur: ["Posts today: 21. Charts watched: 1. Charts understood: 0. Filed under 'work in progress'.", "Incident report: the chair is missing. Suspect: everyone.", "Thirty years in risk. One notebook. Zero patience for caps lock.", "Quiet. Camomile."],
    cat:    ["meow.", "(sits on the chair. nobody says anything.)", "PID 000 — no comment.", "(knocks a coffee cup off the desk.)", "zzz."]
  };
  const MOOD = {
    up:   { chad: "WE ARE SO BACK. (I SAID THAT AT 04:12 YESTERDAY TOO.)", ponzi: "Footnote 7: a good day is also a theory.", arthur: "Green candles are not a risk assessment. Noted." },
    down: { chad: "THIS IS FINE. I AM FINE. THE CHAIR IS FINE.", ponzi: "Footnote 8: communities are measured on red days.", arthur: "Incident report #1. Cause: Chad. Always Chad." },
    flat: {}
  };
  const DISPUTES = [
    { q: "Who owns the chair?",     chad: "ME. I HAVE THE RECEIPT.", ponzi: "Ownership is a footnote.",               marvin: "For the record: the cat.",          arthur: "Unresolved since day one." },
    { q: "What time is it?",        chad: "04:12.",                  ponzi: "Time is a theory.",                      marvin: "For the record: not 04:12.",        arthur: "Office hours. London." },
    { q: "What's for lunch?",       chad: "COLD BREW.",              ponzi: "A free lunch. Footnote: there is none.", marvin: "For the record: nobody ate.",       arthur: "Camomile." },
    { q: "Who fed the cat?",        chad: "NOT ME.",                 ponzi: "Not I.",                                 marvin: "For the record: no log entry.",     arthur: "Incident report pending." },
    { q: "Is caps lock necessary?", chad: "YES.",                    ponzi: "See footnote 4.",                        marvin: "For the record: his key is stuck.", arthur: "No." }
  ];

  const state = { mood: "flat", chg: null, failed: false, price: null };
  function marvinLive() {
    const c = (state.chg > 0 ? "+" : "") + state.chg.toFixed(2) + "%";
    return state.mood === "up" ? `For the record: 24h change is ${c}. Chad has typed 'BACK' 14 times.`
         : state.mood === "down" ? `For the record: 24h change is ${c}. I will not be taking questions.`
         : `For the record: 24h change is ${c}. The chart did nothing. I logged it anyway.`;
  }
  function pickLine(id, last) {
    const pool = LORE[id].slice(); const m = MOOD[state.mood][id]; if (m) pool.push(m, m);
    if (id === "marvin" && state.chg != null) pool.push(marvinLive(), marvinLive());
    let t, n = 0; do { t = pool[(Math.random() * pool.length) | 0]; } while (t === last && ++n < 8);
    return t;
  }
  /* "Ask the desk": scripted, deterministic answers. Same question, same four answers. Never advice. */
  const ASK = {
    chad:   ["{Q}? YES. NO. BOTH. I TYPED IT IN CAPS SO IT IS TRUE.", "I ASKED THE CHAIR. THE CHAIR AGREES WITH ME.", "ANSWER: COLD BREW. NEXT QUESTION.", "IT WAS 04:12 WHEN YOU ASKED. THAT EXPLAINS EVERYTHING.", "I ANSWERED THIS DURING PUSH-UPS. I WAS RIGHT."],
    ponzi:  ["A fine question. See footnote 1. There is no footnote 1.", "In theory, yes. In practice, I lost my chair.", "The answer is a community. I forget the question.", "My accountant advised me not to answer that.", "I wrote a paper on this. Nobody read it. The answer is in it."],
    marvin: ["For the record: you asked “{q}”. Nobody at this desk knows.", "For the record: Chad answered before reading it.", "For the record: this was asked before. I logged it. Nobody checked.", "For the record: the cat knows. The cat is not talking.", "For the record: three answers so far. All different."],
    arthur: ["Filed under ‘questions’. The folder is full.", "No. And please stop shouting, Chad.", "I have opened an incident report about this question.", "Thirty years in risk. Still no.", "Noted in the notebook. In pencil."],
    advice: { chad: "NICE TRY. EVEN I AM NOT ALLOWED TO ANSWER THAT.", ponzi: "Footnote: this desk does not give financial advice.", marvin: "For the record: nobody here can tell you what a price will do.", arthur: "No advice. Not now, not at 04:12. Do your own research." }
  };
  const ADVICE = /\b(buy|sell|price|pump|dump|moon|wen|invest\w*|profit\w*|target|ath|rich|lambo|hold|hodl|ape|entry|exit|rug|bullish|bearish|compr\w*|vend\w*|prezzo|guadagn\w*)\b|\d\s*x\b|\bx\s*\d|[$€]\s*\d/i;
  function askDesk(q) {
    q = String(q || "").replace(/\s+/g, " ").trim().slice(0, 90); const out = { q };
    if (ADVICE.test(q)) { DESK.forEach(id => out[id] = ASK.advice[id]); out.advice = true; return out; }
    let h = 2166136261; for (let i = 0; i < q.length; i++) { h ^= q.toLowerCase().charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    const bare = q.replace(/[?!.\s]+$/, ""), Q = bare.toUpperCase().slice(0, 34), ql = bare.slice(0, 46);
    DESK.forEach((id, k) => { const pool = ASK[id]; out[id] = pool[(h >>> (k * 5)) % pool.length].replace("{Q}", Q).replace("{q}", ql); });
    return out;
  }
  return { askDesk, DISCORD_URL, CA, POOL, WHO, DESK, LORE, MOOD, DISPUTES, state, pickLine,
           API: "https://api.dexscreener.com/latest/dex/tokens/" + CA,
           DEX: "https://dexscreener.com/solana/" + POOL };
})();
