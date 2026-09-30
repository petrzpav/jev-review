// Calls Jev for the Gmail tab: the content script can't reach api.typesafe.ai across origins,
// and the API key stays out of the page.

import {criteriaFor, review} from "./jev.js";
import {load} from "./settings.js";

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (msg.type === "review") {
    load()
      .then(opts => review(opts, msg))
      .then(result => respond({result}), e => respond({error: e.message}));
    return true;   // responds asynchronously
  }
  if (msg.type === "options") chrome.runtime.openOptionsPage();
  if (msg.type === "settings") {
    load().then(({auto, criteria}) =>
      respond({auto, criteria: criteriaFor(criteria, true).map(({name, replyOnly}) => ({name, replyOnly}))}));
    return true;
  }
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
