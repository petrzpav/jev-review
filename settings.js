// What the options page stores, with defaults.

export const DEFAULTS = {key: "", model: "jev-latest", auto: true, criteria: []};

export async function load() {
  return {...DEFAULTS, ...await chrome.storage.local.get(Object.keys(DEFAULTS))};
}
