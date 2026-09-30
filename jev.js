// Ask Jev (TypeSafe AI) how good a reply is. A port of jev.review() from petrzpav.mail.

export const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
export const DEFAULT_MODEL = "jev-latest";

export class JevError extends Error {}

// One thing a reply is judged on, graded good / ok / poor. replyOnly: needs the message being answered.
export const CRITERIA = [
  {name: "clear", question: "Is the reply clear and easy to understand",
   good: "Clear and easy to follow", ok: "Understandable but somewhat vague or confusing", poor: "Unclear or confusing"},
  {name: "tone", question: "Is the tone right for this conversation",
   good: "Polite and fits the conversation", ok: "Acceptable but a bit off: too curt, too formal or too casual",
   poor: "Rude, cold or inappropriate"},
  {name: "length", question: "Is the reply a good length for what it needs to say",
   good: "The right length", ok: "Somewhat too long or too short", poor: "Far too long or too short"},
  {name: "next step", question: "Is it clear what happens next",
   good: "The next step or outcome is clear, or nothing further is needed", ok: "Only somewhat clear",
   poor: "Unclear what happens next or who should act"},
  {name: "language", question: "Is the spelling and grammar correct",
   good: "No mistakes", ok: "A few small mistakes", poor: "Many mistakes"},
];

const SENTENCE_CHECK = {
  answered: "It asks or requests something and the reply answers or handles it",
  missed: "It asks or requests something and the reply ignores it",
  none: "It is not a question or request (greeting, thanks, information, sign-off)",
};
const MAX_SENTENCES = 25;

/** The criteria that apply: `custom` if given, else CRITERIA; reply-only ones only for replies. */
export function criteriaFor(custom, isReply) {
  return (custom?.length ? custom : CRITERIA).filter(c => isReply || !c.replyOnly);
}

const QUOTE_START = new RegExp("^(?:" + [
  String.raw`On [^\n]{3,160}(?:\n[^\n]{0,120})?wrote:\s*$`,                       // Gmail/Apple, English (may wrap)
  String.raw`Dne [^\n]{3,160}(?:\n[^\n]{0,120})?napsal(?:\(a\)|a)?:?\s*$`,          // Czech Seznam/Outlook
  String.raw`[^\n]{0,40}odesílatel [^\n]{3,160}(?:\n[^\n]{0,120})?napsal(?:\(a\)|a)?:\s*$`,  // Czech Gmail
  String.raw`Am .{3,120}schrieb.*:\s*$`,                                          // German
  String.raw`-{2,}\s*(?:Original Message|Původní zpráva|Forwarded message|Přeposlaná zpráva)\s*-{2,}`,
  String.raw`_{10,}\s*$`,                                                         // Outlook separator
  String.raw`(?:\*\*)?(?:From|Od):(?:\*\*)? .+\n(?:.*\n){0,3}?(?:\*\*)?(?:Sent|Date|Odesláno|Datum):`,  // Outlook headers
].join("|") + ")", "im");

/** What a message says itself: without the history quoted below it, or any "> " quoted lines. */
export function ownText(text) {
  const m = QUOTE_START.exec(text);
  if (m && m.index > 0) text = text.slice(0, m.index);
  return text.split("\n").filter(l => !l.trimStart().startsWith(">")).join("\n").trim();
}

const URL = /\b(?:https?:\/\/|www\.)\S+/gi;

/** The original split into sentences, each one a candidate question for SENTENCE_CHECK. */
export function sentences(s) {
  let out = s.split(/(?<=[.?!])\s+|\n\s*\n|\n(?=\s*[-*•\d^])/)
    .map(p => p.split(/\s+/).filter(Boolean).join(" "))
    .filter(p => p.replace(URL, "").replace(/[^\p{L}\p{N}]+/gu, "").length >= 6);   // not just a link or punctuation
  if (out.length > MAX_SENTENCES)   // a long email: questions first
    out = [...out.filter(p => p.includes("?")), ...out.filter(p => !p.includes("?"))].slice(0, MAX_SENTENCES);
  return out;
}

async function post({key, model}, state, questions) {
  if (!key) throw new JevError("Add your TypeSafe API key in the extension options");
  let r;
  try {
    r = await fetch(ENDPOINT, {
      method: "POST",
      headers: {"Content-Type": "application/json", "Authorization": `Bearer ${key}`},
      body: JSON.stringify({model: model || DEFAULT_MODEL, state, questions}),
    });
  } catch (e) {
    throw new JevError(`Jev unreachable: ${e.message}`);
  }
  if (r.status !== 200) throw new JevError(`Jev ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

function verdict(data, q) {
  const ans = data.answers[q];
  return {choice: ans.choice, probabilities: ans.probabilities || {}};
}

/**
 * Grade a reply (or a new message, without `original`) on every criterion, and check each
 * sentence of the original for a question or request the reply forgot. One request.
 * Returns {grades: {name: {choice, score}}, asked, missed: [sentence]}; score is P(good) + P(ok) / 2.
 */
export async function review(opts, {reply, subject = "", original = ""}) {
  original = ownText(original);
  const crits = criteriaFor(opts.criteria, !!original);
  const state = {subject, reply: reply.slice(0, 4000)};
  const questions = {};
  for (const c of crits)
    questions[c.name] = {type: "choice", instructions: c.question, criteria: {good: c.good, ok: c.ok, poor: c.poor}};
  const sents = original ? sentences(original) : [];
  if (original) state["original email"] = original.slice(0, 3000);
  sents.forEach((sent, i) => {
    questions[`sentence ${i}`] = {
      type: "choice", criteria: SENTENCE_CHECK,
      instructions: `This sentence is from the original email: "${sent}". Does the reply answer it`};
  });
  const data = await post(opts, state, questions);
  const out = {grades: {}, asked: 0, missed: []};
  for (const c of crits) {
    const v = verdict(data, c.name);
    out.grades[c.name] = {choice: v.choice, score: (v.probabilities.good || 0) + (v.probabilities.ok || 0) / 2};
  }
  sents.forEach((sent, i) => {
    const v = verdict(data, `sentence ${i}`);
    if (v.choice !== "none") {
      out.asked++;
      if (v.choice === "missed") out.missed.push(sent);
    }
  });
  return out;
}
