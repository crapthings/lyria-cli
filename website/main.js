/** Copy a visible code example and announce the result without hiding the source text. */
async function copyExample(button) {
  const target = document.getElementById(button.dataset.copy);
  const status = document.getElementById('copy-status');
  try {
    await navigator.clipboard.writeText(target.textContent.trim());
    button.textContent = 'Copied';
    status.textContent = 'Command copied to clipboard.';
  } catch {
    button.textContent = 'Select text';
    status.textContent = 'Copy unavailable. Select the command and copy it manually.';
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(target);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  setTimeout(() => { button.textContent = 'Copy'; }, 2000);
}

/** Activate one accessible example tab while keeping the other panels out of the tab order. */
function selectExample(selected, focus = false) {
  for (const tab of document.querySelectorAll('[role="tab"]')) {
    const active = tab === selected;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
  }
  if (focus) selected.focus();
}

// Reveal clipboard buttons only when JavaScript can handle their interactions.
for (const button of document.querySelectorAll('[data-copy]')) {
  button.hidden = false;
  button.addEventListener('click', () => copyExample(button));
}

// Add pointer and keyboard navigation to the static, progressively enhanced examples.
for (const tab of document.querySelectorAll('[role="tab"]')) {
  tab.addEventListener('click', () => selectExample(tab));
  tab.addEventListener('keydown', event => {
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    const index = tabs.indexOf(tab);
    let next;
    if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
    if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
    if (event.key === 'Home') next = tabs[0];
    if (event.key === 'End') next = tabs.at(-1);
    if (next) { event.preventDefault(); selectExample(next, true); }
  });
}

// Initialize the first example only after JavaScript is available so all examples survive without it.
selectExample(document.getElementById('tab-prompt'));
