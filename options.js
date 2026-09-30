import {CRITERIA, review} from "./jev.js";
import {DEFAULTS, load} from "./settings.js";

const $ = id => document.getElementById(id);
const FIELDS = [["question", "Question"], ["good", "Good means"], ["ok", "Ok means"], ["poor", "Poor means"]];

function message(id, text, ok) {
  $(id).textContent = text;
  $(id).className = "msg " + (ok ? "ok" : "err");
}

function criterionEl(c = {name: "", question: "", good: "", ok: "", poor: "", replyOnly: false}) {
  const box = document.createElement("div");
  box.className = "crit";
  box.innerHTML = `
    <div class="top">
      <input type="text" data-f="name" placeholder="Name (shown on the card)">
      <label class="check"><input type="checkbox" data-f="replyOnly"> Replies only</label>
      <button type="button" data-remove>Remove</button>
    </div>
    <label>Question</label><textarea data-f="question" rows="1"></textarea>
    <div class="grades">${FIELDS.slice(1).map(([f, label]) =>
      `<div><label>${label}</label><textarea data-f="${f}" rows="2"></textarea></div>`).join("")}</div>`;
  for (const input of box.querySelectorAll("[data-f]")) {
    if (input.type === "checkbox") input.checked = !!c[input.dataset.f];
    else input.value = c[input.dataset.f] ?? "";
  }
  box.querySelector("[data-remove]").onclick = () => box.remove();
  return box;
}

function showCriteria(list) {
  $("criteria").replaceChildren(...list.map(criterionEl));
}

function readCriteria() {
  const list = [...$("criteria").children].map(box => {
    const c = {};
    for (const input of box.querySelectorAll("[data-f]"))
      c[input.dataset.f] = input.type === "checkbox" ? input.checked : input.value.trim();
    return c;
  });
  const names = new Set();
  for (const c of list) {
    if (!c.name) throw new Error("Every criterion needs a name");
    if (names.has(c.name)) throw new Error(`Two criteria are called "${c.name}"`);
    names.add(c.name);
    for (const [f, label] of FIELDS)
      if (!c[f]) throw new Error(`"${c.name}": ${label} is empty`);
  }
  if (!list.length) throw new Error("Keep at least one criterion, or reset to the defaults");
  return list;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const normal = list => list.map(({name, question, good, ok, poor, replyOnly}) =>
  ({name, question, good, ok, poor, replyOnly: !!replyOnly}));

$("show").onclick = () => {
  const hidden = $("key").type === "password";
  $("key").type = hidden ? "text" : "password";
  $("show").textContent = hidden ? "Hide" : "Show";
};

$("test").onclick = async () => {
  message("test-msg", "Asking Jev…", true);
  try {
    const r = await review({key: $("key").value.trim(), model: $("model").value.trim(), criteria: CRITERIA.slice(0, 1)},
      {reply: "Thanks, Tuesday at 10 works for me. See you then!"});
    message("test-msg", `The key works: Jev graded a test reply "${r.grades.clear.choice}".`, true);
  } catch (e) {
    message("test-msg", e.message, false);
  }
};

$("add").onclick = () => {
  const box = criterionEl();
  $("criteria").append(box);
  box.querySelector("input").focus();
};
$("reset").onclick = () => showCriteria(CRITERIA);

$("save").onclick = async () => {
  let criteria;
  try {
    criteria = readCriteria();
  } catch (e) {
    message("save-msg", e.message, false);
    return;
  }
  await chrome.storage.local.set({
    key: $("key").value.trim(),
    model: $("model").value.trim() || DEFAULTS.model,
    auto: $("auto").checked,
    criteria: same(normal(criteria), normal(CRITERIA)) ? [] : criteria,   // [] follows the defaults
  });
  message("save-msg", "Saved. Open compose windows pick it up right away.", true);
};

const s = await load();
$("key").value = s.key;
$("model").value = s.model;
$("auto").checked = s.auto;
showCriteria(s.criteria.length ? s.criteria : CRITERIA);
