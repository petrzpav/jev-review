// Finds Gmail's compose and reply boxes and shows Jev's review of each one beside it,
// refreshed whenever typing pauses. The request itself goes through background.js.

const DELAY = 4000;   // ms of quiet before Jev grades the message
const MIN = 20;       // characters written before it's worth grading
const WIDTH = 250;

const BODY = '[contenteditable="true"][g_editable="true"]';
const SUBJECT = 'input[name="subjectbox"], input[name="subject"]';
const QUOTED = ".gmail_quote, .gmail_quote_container, .gmail_extra, blockquote";
const SIGNATURE = '.gmail_signature, [data-smartmail="gmail_signature"]';
const MESSAGE = "div.a3s";   // a message shown in a thread
const BLOCK = /^(ADDRESS|ARTICLE|BLOCKQUOTE|DIV|DL|H[1-6]|HR|LI|OL|P|PRE|SECTION|TABLE|TR|UL)$/;

let settings = {auto: true, criteria: []};
const composes = new Map();   // compose body element -> Compose

// -- reading Gmail

/** An element's text with line breaks where the page shows them, leaving out descendants matching `skip`. */
function textOf(el, skip) {
  let out = "";
  const walk = n => {
    if (n.nodeType === Node.TEXT_NODE) { out += n.data; return; }
    if (n.nodeType !== Node.ELEMENT_NODE || /^(STYLE|SCRIPT)$/.test(n.tagName)) return;
    if (n !== el && skip && n.matches(skip)) return;
    if (n.tagName === "BR") { out += "\n"; return; }
    const block = BLOCK.test(n.tagName);
    if (block && out && !out.endsWith("\n")) out += "\n";
    n.childNodes.forEach(walk);
    if (block && out && !out.endsWith("\n")) out += "\n";
  };
  walk(el);
  return out.replace(/ /g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

const visible = el => el.getClientRects().length > 0;
const before = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
const bare = s => s.replace(/^\s*((re|fwd?|aw|wg|odp|sv|vs)\s*:\s*)+/i, "").trim().toLowerCase();

/** The compose window or inline reply around a body: the nearest ancestor holding its subject field. */
function containerOf(body) {
  for (let el = body.parentElement, i = 0; el && i < 20; el = el.parentElement, i++)
    if (el.querySelector(SUBJECT)) return el;
  return body.parentElement;
}

function threadTitle() {
  const h = document.querySelector("h2.hP");
  return h && visible(h) ? h.textContent.trim() : "";
}

function subjectOf(container) {
  for (const input of container.querySelectorAll(SUBJECT))
    if (input.value.trim()) return input.value.trim();
  return threadTitle();
}

/** What the message answers: the quote inside it, or else the last message of the open thread
 *  above an inline reply (or above a popped-out one with the thread's subject). "" for new mail. */
function originalOf(body, container, subject) {
  if (/^\s*fwd?\s*:/i.test(subject)) return "";
  const quote = body.querySelector("blockquote");
  if (quote) return textOf(quote, QUOTED);
  const main = container.closest('[role="main"]');
  const title = threadTitle();
  if (!main && !(title && bare(title) === bare(subject))) return "";
  const shown = [...(main || document).querySelectorAll(MESSAGE)]
    .filter(m => visible(m) && !container.contains(m) && (!main || before(m, container)));
  const last = shown.at(-1);
  return last ? textOf(last, `${QUOTED}, ${SIGNATURE}`) : "";
}

// -- the card beside each compose

const STYLE = `
:host { all: initial; }
.card { position: fixed; z-index: 2147483000; width: ${WIDTH}px; box-sizing: border-box;
  font: 13px/1.45 system-ui, sans-serif; color: var(--fg); background: var(--bg);
  border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 4px 18px rgba(0,0,0,.18);
  padding: 10px 12px; transition: opacity .2s;
  --fg: #1f2328; --dim: #8b949e; --bg: #ffffff; --line: #d0d7de; --track: #e6e9ed;
  --good: #1a7f37; --ok: #bf8700; --poor: #cf222e; }
@media (prefers-color-scheme: dark) {
  .card { --fg: #e6edf3; --dim: #8b949e; --bg: #161b22; --line: #30363d; --track: #30363d;
    --good: #3fb950; --ok: #d29922; --poor: #f85149; } }
.card.stale .body { opacity: .5; }
.head { display: flex; align-items: center; gap: 6px; font-weight: 600; }
.head .title { flex: 1; }
.head .sum { font-weight: 500; }
button { all: unset; cursor: pointer; color: var(--dim); padding: 0 4px; border-radius: 4px; font-size: 14px; }
button:hover { color: var(--fg); background: var(--track); }
.body { margin-top: 8px; }
.card { display: flex; flex-direction: column; max-height: calc(100vh - 16px); }
.body { overflow-y: auto; overscroll-behavior: contain; min-height: 0; }
.card.min { width: auto; padding: 3px 4px 3px 10px; border-radius: 14px; cursor: pointer; }
.card.min .body, .card.min .status, .card.min .refresh { display: none; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--track); }
.dot.good { background: var(--good); } .dot.ok { background: var(--ok); } .dot.poor { background: var(--poor); }
.row { display: grid; grid-template-columns: 78px 1fr; align-items: center; gap: 8px; margin: 3px 0; }
.bar { display: grid; grid-template-columns: repeat(5, 1fr); gap: 2px; }
.bar i { height: 5px; border-radius: 2px; background: var(--track); }
.good { color: var(--good); } .ok { color: var(--ok); } .poor { color: var(--poor); }
.bar i.good { background: var(--good); } .bar i.ok { background: var(--ok); } .bar i.poor { background: var(--poor); }
.none { color: var(--dim); }
.missed { margin-top: 10px; }
.missed b { color: var(--poor); }
.missed li { list-style: none; margin: 5px 0; display: grid; grid-template-columns: 14px 1fr; }
.missed li::before { content: "✗"; color: var(--poor); }
.missed li span { overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical;
  -webkit-line-clamp: 3; overflow: hidden; }
ul { margin: 4px 0 0; padding: 0; }
.status { margin-top: 6px; color: var(--dim); font-size: 12px; }
.status:empty { display: none; }
.status.error { color: var(--poor); }
.status a { color: inherit; }
`;

const level = score => score >= 0.7 ? "good" : score >= 0.4 ? "ok" : "poor";

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  Object.assign(e, attrs);
  e.append(...children);
  return e;
}

class Compose {
  constructor(body) {
    this.body = body;
    this.container = containerOf(body);
    this.reviewed = null;     // the text the shown review is of
    this.result = null;
    this.seq = 0;
    this.timer = null;

    this.host = el("div");
    const root = this.host.attachShadow({mode: "open"});
    this.card = el("div", {className: "card"});
    this.userMin = null;      // the reader's choice; null: open only where there's room beside the message
    this.sum = el("span", {className: "sum"});
    this.dot = el("span", {className: "dot"});
    const refresh = el("button", {className: "refresh", title: "Review now (Alt+J)", textContent: "↻",
      onclick: () => this.review(true)});
    this.toggle = el("button", {title: "Minimize", textContent: "–"});
    this.toggle.onclick = e => { e.stopPropagation(); this.userMin = !this.card.classList.contains("min"); this.place(); };
    this.card.onclick = () => { if (this.card.classList.contains("min")) { this.userMin = false; this.place(); } };
    this.content = el("div", {className: "body"});
    this.status = el("div", {className: "status"});
    this.card.append(el("div", {className: "head"}, el("span", {className: "title", textContent: "Jev"}), this.sum, this.dot, refresh, this.toggle),
      this.content, this.status);
    root.append(el("style", {textContent: STYLE}), this.card);
    document.body.append(this.host);

    this.onInput = () => this.changed();
    this.onKey = e => {
      if (e.altKey && e.code === "KeyJ") { e.preventDefault(); e.stopPropagation(); this.review(true); }
    };
    body.addEventListener("input", this.onInput);
    body.addEventListener("keydown", this.onKey, true);
    this.render();
    this.place();
    this.changed();
  }

  text() { return textOf(this.body, `${QUOTED}, ${SIGNATURE}`); }

  changed() {
    if (this.cramped && this.userMin === false) { this.userMin = null; this.place(); }   // typing: out of the way
    this.card.classList.toggle("stale", this.reviewed !== null && this.text() !== this.reviewed);
    clearTimeout(this.timer);
    if (settings.auto) this.timer = setTimeout(() => this.review(false), DELAY);
  }

  async review(asked) {
    clearTimeout(this.timer);
    const reply = this.text();
    if (reply.length < MIN || reply === this.reviewed) {
      if (asked) this.say(reply.length < MIN ? "Write a bit more first" : "Jev already graded this text");
      return;
    }
    const subject = subjectOf(this.container);
    const original = originalOf(this.body, this.container, subject);
    const seq = ++this.seq;
    this.isReply = !!original;
    this.say("reading…");
    let res;
    try {
      res = await chrome.runtime.sendMessage({type: "review", reply, subject, original});
    } catch {
      res = {error: "The extension was updated: reload Gmail"};
    }
    if (seq !== this.seq || !this.body.isConnected) return;   // a newer review took over
    if (res.error) {
      this.say(res.error, true);
      return;
    }
    this.reviewed = reply;
    this.result = res.result;
    this.say("");
    this.render();
    this.card.classList.toggle("stale", this.text() !== reply);
  }

  say(msg, error = false) {
    this.status.className = "status" + (error ? " error" : "");
    this.status.textContent = msg;
    if (error && /options/.test(msg)) {
      this.status.textContent = "";
      this.status.append(el("a", {href: "#", textContent: msg,
        onclick: e => { e.preventDefault(); chrome.runtime.sendMessage({type: "options"}); }}));
    }
  }

  render() {
    const r = this.result;
    const reply = this.isReply ?? !!originalOf(this.body, this.container, subjectOf(this.container));
    const rows = [];
    let sum = "";
    if (reply) {
      let value = el("span", {className: "none", textContent: r ? "–" : "·"});
      if (r?.asked) {
        const ok = r.asked - r.missed.length;
        value = el("span", {className: r.missed.length ? "poor" : "good", textContent: `${ok}/${r.asked}`});
        sum = `${ok}/${r.asked}`;
      }
      rows.push(el("div", {className: "row"}, el("span", {textContent: "answered"}), value));
    }
    for (const c of settings.criteria.filter(c => reply || !c.replyOnly)) {
      const g = r?.grades[c.name];
      const filled = g ? Math.round(g.score * 5) : 0;
      const bar = el("div", {className: "bar", title: g ? `${g.choice} (${Math.round(g.score * 100)} %)` : ""},
        ...Array.from({length: 5}, (_, i) => el("i", {className: i < filled ? level(g.score) : ""})));
      rows.push(el("div", {className: "row"}, el("span", {textContent: c.name}), bar));
    }
    if (r?.missed.length)
      rows.push(el("div", {className: "missed"}, el("b", {textContent: "Not answered"}),
        el("ul", {}, ...r.missed.map(s => el("li", {title: s}, el("span", {textContent: s}))))));
    this.content.replaceChildren(...rows);
    this.sum.textContent = sum;
    this.sum.className = "sum " + (r?.missed.length ? "poor" : "good");
    const scores = Object.values(r?.grades || {}).map(g => g.score);
    this.dot.className = "dot " + (scores.length ? level(Math.min(...scores)) : "");
    this.dot.title = scores.length ? "the weakest grade" : "";
  }

  /** Beside the message box, left if there's room, else right. Where there's no room beside it,
   *  a badge above its top-right corner that opens over the message when clicked. */
  place() {
    const rect = this.body.getBoundingClientRect();
    const shown = rect.width > 0 && rect.bottom > 0 && rect.top < innerHeight;
    this.card.style.display = shown ? "" : "none";
    if (!shown) return;
    const gap = 12;
    let left = rect.left - WIDTH - gap >= 8 ? rect.left - WIDTH - gap
      : rect.right + gap + WIDTH <= innerWidth - 8 ? rect.right + gap : null;
    const beside = left !== null;
    this.cramped = !beside;
    const min = this.userMin ?? !beside;
    this.card.classList.toggle("min", min);
    this.toggle.textContent = min ? "+" : "–";
    this.toggle.title = min ? "Open" : "Minimize";
    const w = this.card.offsetWidth, h = this.card.offsetHeight;
    let top = rect.top;
    if (!beside) {
      left = rect.right - w;
      if (min) top = rect.top - h - 6;
    }
    this.card.style.left = `${Math.max(8, Math.min(left, innerWidth - w - 8))}px`;
    this.card.style.top = `${Math.max(8, Math.min(top, innerHeight - h - 8))}px`;
  }

  remove() {
    clearTimeout(this.timer);
    this.seq++;
    this.body.removeEventListener("input", this.onInput);
    this.body.removeEventListener("keydown", this.onKey, true);
    this.host.remove();
  }
}

// -- keeping up with Gmail

function scan() {
  for (const [body, c] of composes)
    if (!body.isConnected) { c.remove(); composes.delete(body); }
  for (const body of document.querySelectorAll(BODY))
    if (!composes.has(body)) composes.set(body, new Compose(body));
}

function placeAll() {
  for (const c of composes.values()) c.place();
}

async function loadSettings() {
  try {
    settings = await chrome.runtime.sendMessage({type: "settings"});
  } catch {
    return;
  }
  for (const c of composes.values()) { c.render(); c.changed(); }
}

let scanTimer;
new MutationObserver(() => {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(scan, 300);
}).observe(document.body, {childList: true, subtree: true});
addEventListener("resize", placeAll);
addEventListener("scroll", placeAll, true);
setInterval(placeAll, 400);   // compose windows move when others open or close
chrome.storage.onChanged.addListener(loadSettings);
loadSettings().then(scan);
