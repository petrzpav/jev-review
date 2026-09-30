// node test/jev.test.mjs — the sentence splitter, plus a live review when TYPESAFE_API_KEY is set.
import assert from "node:assert/strict";
import {ownText, review, sentences} from "../jev.js";

assert.deepEqual(sentences("Hi Pavel.\n\nCan you send the invoice by Friday? Also, is the meeting still on?\n- one more item here"),
  ["Hi Pavel.", "Can you send the invoice by Friday?", "Also, is the meeting still on?", "- one more item here"]);
const long = Array.from({length: 30}, (_, i) => `Sentence number ${i}.`).join(" ") + " Is this kept?";
assert.equal(sentences(long).length, 25);
assert.equal(sentences(long)[0], "Is this kept?");

const notes = `## IDLE
-- GC (jp)
^ dokončit testování, ať to můžeme nasadit asap
https://trello.com/c/0tecyYs3/117-gcsg-sept-2026
^ [TBD] co dal?
> ^ [jp] pripominky zapracovany -- je to ok?
> asi uz neni aktualni?

Dne 29. 9. 2026 v 10:00 Jonas <j@example.com> napsal(a):
> ^ jednou za dva mesice tam ma udrzbu?`;
assert.deepEqual(sentences(ownText(notes)), [   // no quoted lines, headings too short to ask anything
  "^ dokončit testování, ať to můžeme nasadit asap https://trello.com/c/0tecyYs3/117-gcsg-sept-2026",
  "^ [TBD] co dal?"]);
assert.equal(ownText("Hi\n\nOn Mon, 1 Sep 2026, Jonas wrote:\n> old?"), "Hi");
console.log("sentences ok");

if (process.env.TYPESAFE_API_KEY) {
  const r = await review({key: process.env.TYPESAFE_API_KEY}, {
    subject: "Re: Invoice",
    original: "Hi, can you send the invoice by Friday? Also, is the meeting on Tuesday still on? Thanks, Jonas",
    reply: "Hi Jonas, I'll send the invoice tomorrow morning. Best, Pavel",
  });
  assert.deepEqual(Object.keys(r.grades), ["clear", "tone", "length", "next step", "language"]);
  assert.equal(r.asked, 2);
  assert.deepEqual(r.missed, ["Also, is the meeting on Tuesday still on?"]);
  console.log("live review ok");
}
