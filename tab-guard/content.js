(function () {
  const EVENTS = ["pointerdown", "mousedown", "click", "auxclick", "keydown", "contextmenu"];

  function findAnchorHref(event) {
    let path = [];
    try {
      path = typeof event.composedPath === "function" ? event.composedPath() : [];
    } catch (e) {
      path = [];
    }
    for (const node of path) {
      if (node && node.tagName === "A" && node.href) {
        return node.href;
      }
    }
    let el = event.target;
    while (el && el.nodeType === 1) {
      if (el.tagName === "A" && el.href) return el.href;
      el = el.parentElement;
    }
    return null;
  }

  function handler(event) {
    if (!event.isTrusted) return;
    if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
    const href = findAnchorHref(event);
    try {
      chrome.runtime.sendMessage({
        type: "tg_gesture",
        href: href,
        eventType: event.type,
        ts: Date.now()
      });
    } catch (e) {}
  }

  for (const ev of EVENTS) {
    document.addEventListener(ev, handler, { capture: true, passive: true });
  }
})();
