# Jev Review

A Chrome extension that grades your Gmail replies while you write them. Beside every compose
window and inline reply, a card shows how **Jev** (TypeSafe AI) rates the message on each of your
criteria, and for a reply, which questions from the other person's email you haven't answered yet.

It's the live review from [omarchy-mail](https://github.com/petrzpav/omarchy-mail) on its own, for Gmail in the browser.

## Install

1. Get a TypeSafe AI API key.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick this folder.
3. Click the extension's icon to open the options, paste the key and press **Test**, then **Save**.
4. Reload Gmail.

## Use

Start writing. When you stop typing for a few seconds, Jev grades the message:

- a bar per criterion (green good, yellow ok, red poor; hover for Jev's choice),
- **answered** `3/5`: of the questions and requests in the email you're answering, how many your reply handles,
- **Not answered**: the ones it doesn't yet.

The card sits beside the message box. Where there's no room for it (a narrow window), it's a small
badge above the box's top-right corner instead: your answered count and a dot for the weakest grade.
Click it to open the full card; it folds back as soon as you type.

`Alt+J` in the message (or ↻ on the card) reviews right away. `–` shrinks the card to the badge.

Quoted text doesn't count as questions to answer: the history below the other person's message and
any `>` quoted lines are left out, and so are lines that are only a link.
The card dims when you've changed the text since the last review.

## Options

- **API key** and **model** (`jev-latest`).
- **Review automatically**: turn it off to review only on `Alt+J` / ↻.
- **Criteria**: edit, add or remove. Each is a question with what good, ok and poor mean.
  "Replies only" criteria are skipped for new messages. **Reset to defaults** brings back
  clear, tone, length, next step and language.

## Privacy

To grade a message, the extension sends api.typesafe.ai your draft, its subject and the email you're
replying to (the last message shown above an inline reply, or the quoted one). Nothing else, and
nothing is sent while you're not writing. The key is kept in the extension's local storage and
only the extension's background worker uses it; Gmail's page never sees it.

## How it finds things in Gmail

Gmail has no API for its page, so `content.js` relies on attributes that have been stable for years:
the editable message body (`g_editable`), the `subjectbox` / `subject` inputs, and `div.a3s` for
messages in a thread. If Gmail changes them, those selectors at the top of `content.js` are the place to fix.

## Development

- `node test/jev.test.mjs`: the sentence splitter; with `TYPESAFE_API_KEY` set, also a live review.
- `test/harness.html`: a fake Gmail thread with a canned review, to check the card without Gmail
  (open it in a browser, or `chromium --headless --screenshot --virtual-time-budget=8000 test/harness.html`).

After changing the code, press reload on `chrome://extensions` and reload Gmail.

## License

MIT
