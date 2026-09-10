const GESTURE_WINDOW_MS = 2000;
const GESTURE_TTL_MS = 10000;
const HANDLED_TTL_MS = 5000;

const gestureMap = new Map();
const handledTabs = new Map();
const pendingEval = new Map();

function markHandled(tabId) {
  const timer = setTimeout(() => handledTabs.delete(tabId), HANDLED_TTL_MS);
  handledTabs.set(tabId, timer);
}

function isHandled(tabId) {
  return handledTabs.has(tabId);
}

async function isEnabled() {
  const { enabled } = await chrome.storage.local.get({ enabled: true });
  return enabled !== false;
}

async function incrementBlocked() {
  const { blockedCount } = await chrome.storage.local.get({ blockedCount: 0 });
  await chrome.storage.local.set({ blockedCount: (blockedCount || 0) + 1 });
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return null;
  }
}

function registrableDomain(host) {
  if (!host) return null;
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  return parts.slice(-2).join(".");
}

function sameSite(hostA, hostB) {
  if (!hostA || !hostB) return false;
  if (hostA === hostB) return true;
  return registrableDomain(hostA) === registrableDomain(hostB);
}

function isIgnorableUrl(url) {
  if (!url) return true;
  return (
    url === "about:blank" ||
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://") ||
    url.startsWith("devtools://")
  );
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === "tg_gesture" && sender.tab && sender.tab.id != null) {
    gestureMap.set(sender.tab.id, {
      href: msg.href || null,
      ts: msg.ts || Date.now(),
      used: false
    });
  }
});

async function doEvaluate(newTabId, sourceTabId, targetUrl) {
  if (!(await isEnabled())) return;
  if (isIgnorableUrl(targetUrl)) return;

  const gesture = sourceTabId != null ? gestureMap.get(sourceTabId) : null;
  const now = Date.now();
  let allow = false;

  if (gesture && !gesture.used && now - gesture.ts <= GESTURE_WINDOW_MS) {
    gesture.used = true;
    if (!gesture.href) {
      allow = false;
    } else {
      const gestureHost = hostOf(gesture.href);
      const targetHost = hostOf(targetUrl);
      allow = !targetHost || sameSite(gestureHost, targetHost);
    }
  } else {
    allow = false;
  }

  markHandled(newTabId);

  if (!allow) {
    try {
      await chrome.tabs.remove(newTabId);
      await incrementBlocked();
    } catch (e) {}
  }
}

async function evaluateAndMaybeBlock(newTabId, sourceTabId, targetUrl) {
  if (newTabId == null) return;
  while (pendingEval.has(newTabId)) {
    await pendingEval.get(newTabId).catch(() => {});
  }
  if (isHandled(newTabId)) return;
  const p = doEvaluate(newTabId, sourceTabId, targetUrl);
  pendingEval.set(newTabId, p);
  try {
    await p;
  } finally {
    pendingEval.delete(newTabId);
  }
}

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.openerTabId == null) return;
  const targetUrl = tab.pendingUrl || tab.url || "";
  evaluateAndMaybeBlock(tab.id, tab.openerTabId, targetUrl);
});

chrome.webNavigation.onCreatedNavigationTarget.addListener((details) => {
  evaluateAndMaybeBlock(details.tabId, details.sourceTabId, details.url);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  const timer = handledTabs.get(tabId);
  if (timer) clearTimeout(timer);
  handledTabs.delete(tabId);
  gestureMap.delete(tabId);
  pendingEval.delete(tabId);
});

setInterval(() => {
  const cutoff = Date.now() - GESTURE_TTL_MS;
  for (const [tabId, g] of gestureMap) {
    if (g.ts < cutoff) gestureMap.delete(tabId);
  }
}, 15000);

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get({ enabled: true, blockedCount: 0 });
  await chrome.storage.local.set(current);
});
