const toggle = document.getElementById("toggle");
const count = document.getElementById("count");
const resetBtn = document.getElementById("reset");

async function render() {
  const { enabled, blockedCount } = await chrome.storage.local.get({
    enabled: true,
    blockedCount: 0
  });
  toggle.checked = enabled !== false;
  count.textContent = blockedCount || 0;
}

toggle.addEventListener("change", async () => {
  await chrome.storage.local.set({ enabled: toggle.checked });
});

resetBtn.addEventListener("click", async () => {
  await chrome.storage.local.set({ blockedCount: 0 });
  render();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") render();
});

render();
