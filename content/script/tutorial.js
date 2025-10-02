// tutorial.js
// Interactive tutorial for the sub demo. Drop this file into your project and include it after the main script.
//
// Public API:
//   SubDemoTutorial.start() - start the tutorial
//   SubDemoTutorial.stop()  - stop & cleanup
//
// The script will attempt to use window.__SUB_DEMO functions where available (assignCrewToTask, requestHeal, applyDifficulty, spawnRandomEvent, etc.)
// It is intentionally defensive: it waits for DOM elements and gracefully degrades if something is missing.

(function () {
  if (window.SubDemoTutorial) return; // already loaded

  function $(sel){ return document.querySelector(sel); }
  function $all(sel){ return Array.from(document.querySelectorAll(sel)); }

  function waitFor(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      const start = Date.now();
      const iv = setInterval(()=> {
        const found = document.querySelector(selector);
        if (found) { clearInterval(iv); resolve(found); }
        if (Date.now() - start > timeout) { clearInterval(iv); reject(new Error('Timeout waiting for ' + selector)); }
      }, 120);
    });
  }

// tutorial steps
const steps = [
  {
    id: 'assign',
    title: 'Assign a Crew Member',
    text: `Assign a crew member to a repair: open the "Assign" select on a task and choose a crew. Use Quick to auto-assign the healthiest available crew.`,
    selector: '[data-action="assign"]',
    position: 'right',
    onEnter: async function(api){
      // nothing
    },
    validate: () => {
      // true when any task has an assigned crew
      const sel = document.querySelectorAll('[data-action="assign"]');
      for (const s of sel){
        if (s.value && s.value !== '') return true;
      }
      return false;
    },
    autoAction: async function(api){
      // prefer to hit the "Quick" button on first task
      const quick = document.querySelector('[data-action="fastAssign"]');
      if (quick) { quick.click(); return true; }
      // else try to programmatically assign: pick first available crew & first task
      const dd = document.querySelector('[data-action="assign"]');
      if (!dd) return false;
      const crewOption = dd.querySelector('option[value]') || dd.options[1];
      if (!crewOption) return false;
      dd.value = dd.querySelector('option[value]') ? dd.querySelector('option[value]').value : dd.options[1].value;
      dd.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
  },
  {
    id: 'upgrades',
    title: 'Open Upgrades Panel',
    text: `You can buy upgrades for each crew member. Click Upgrades on a crew card to open the panel and purchase levels with supplies.`,
    selector: '[data-action="openUpgrades"]',
    position: 'right',
    validate: () => {
      const panel = document.getElementById('upgradePanel');
      return !!(panel && panel.dataset && panel.dataset.openCrew);
    },
    autoAction: async function(api){
      // click the first Upgrades button for an alive crew
      const btn = document.querySelector('[data-action="openUpgrades"]');
      if (btn) { btn.click(); return true; }
      return false;
    }
  },
  {
    id: 'medic',
    title: 'Use Medic — Request Heal',
    text: `Request a Medic to heal a wounded crew member. Click Heal on a crew card to have the Medic start healing.`,
    selector: '[data-action="requestHeal"]',
    position: 'left',
    validate: () => {
      const medic = (window.__SUB_DEMO && window.__SUB_DEMO.crew) ? window.__SUB_DEMO.crew.find(c=>c.role==='Medic') : null;
      if (!medic) return false;
      return !!(medic.repairing && medic.repairing.startsWith('healing:'));
    },
    autoAction: async function(api){
      const btn = document.querySelector('[data-action="requestHeal"]');
      if (btn) { btn.click(); return true; }
      const dd = document.querySelector('[data-action="requestHeal"][data-target]');
      if (dd) {
        const id = dd.dataset.target;
        if (window.__SUB_DEMO && typeof window.__SUB_DEMO.requestHeal === 'function') {
          window.__SUB_DEMO.requestHeal(id);
          return true;
        }
      }
      return false;
    }
  },
  {
    id: 'wrap-up',
    title: 'Wrap Up',
    text: `That's the quick tour! You can replay this tutorial anytime. Press Finish to close the tutorial.`,
    selector: null,
    position: 'center',
    nextText: 'Finish',
    validate: () => true
  }
];


  // Tutorial state
  let currentStep = 0;
  let overlayEl = null;
  let popupEl = null;
  let highlightEl = null;
  let arrowEl = null;
  let running = false;
  let stepTimeout = null;

  function createOverlay() {
    overlayEl = document.createElement('div');
    overlayEl.className = 'tutorial-overlay';
    // ensure overlay covers viewport so getBoundingClientRect coords match
    Object.assign(overlayEl.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: '100%',
      height: '100%',
      zIndex: 99999,
      pointerEvents: 'none' // allow clicks to pass through except popup (we'll enable popup)
    });

    overlayEl.innerHTML = `
      <div class="tutorial-backdrop" id="tutorial-backdrop"></div>
      <div id="tutorial-popup-root"></div>
    `;
    document.body.appendChild(overlayEl);

    // popup holder
    const root = document.getElementById('tutorial-popup-root');

    popupEl = document.createElement('div');
    popupEl.className = 'tutorial-popup';
    popupEl.style.position = 'absolute';
    popupEl.style.left = '16px';
    popupEl.style.top = '16px';
    popupEl.style.pointerEvents = 'auto'; // allow interacting with popup controls
    popupEl.innerHTML = `
      <h3 id="tutorial-title">Title</h3>
      <p id="tutorial-text">Text</p>
      <div class="tutorial-controls" id="tutorial-controls">
        <button class="tutorial-btn small" id="tutorial-prev">Back</button>
        <button class="tutorial-btn small" id="tutorial-auto">Do it for me</button>
        <button class="tutorial-btn" id="tutorial-next">Next</button>
        <button class="tutorial-btn small" id="tutorial-exit">Exit</button>
      </div>
    `;
    root.appendChild(popupEl);

    // arrow for connecting popup to highlight
    arrowEl = document.createElement('div');
    arrowEl.className = 'tutorial-arrow';
    Object.assign(arrowEl.style, {
      position: 'absolute',
      width: '18px',
      height: '18px',
      display: 'none',
      pointerEvents: 'none' // arrow should not block clicks
    });
    overlayEl.appendChild(arrowEl);

    // attach control events
    popupEl.querySelector('#tutorial-next').onclick = ()=> goto(currentStep + 1);
    popupEl.querySelector('#tutorial-prev').onclick = ()=> goto(currentStep - 1);
    popupEl.querySelector('#tutorial-exit').onclick = ()=> stop();
    popupEl.querySelector('#tutorial-auto').onclick = async ()=> {
      const step = steps[currentStep];
      if (step && typeof step.autoAction === 'function'){
        try {
          await step.autoAction();
          setTimeout(()=> { tryAdvanceIfValid(); }, 450);
        } catch(e){ console.warn('Auto action failed', e); }
      } else {
        showTempMessage('No automatic action available for this step');
      }
    };
  }

  function cleanupOverlay() {
    if (!overlayEl) return;
    overlayEl.remove();
    overlayEl = null;
    popupEl = null;
    highlightEl = null;
    arrowEl = null;
  }

  function showTempMessage(msg, ms = 1400){
    const note = document.createElement('div');
    note.style.position = 'fixed';
    note.style.bottom = '18px';
    note.style.left = '50%';
    note.style.transform = 'translateX(-50%)';
    note.style.padding = '8px 12px';
    note.style.borderRadius = '8px';
    note.style.background = '#0b2b3a';
    note.style.color = '#dff3ff';
    note.style.zIndex = 99999;
    note.textContent = msg;
    document.body.appendChild(note);
    setTimeout(()=> note.remove(), ms);
  }

  function highlightElement(el) {
    clearHighlight();
    if (!el) return;
    highlightEl = el;
    el.classList.add('tutorial-highlight');
    // scroll into view (center)
    try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(e){}
    // position popup near element
  }

  function clearHighlight() {
    if (!highlightEl) return;
    highlightEl.classList.remove('tutorial-highlight');
    highlightEl = null;
  }

function placePopupNear(target, position = 'right') {
  if (!popupEl) return;

  // ensure popup is measurable and not influenced by previous left/top
  popupEl.style.visibility = 'hidden';
  popupEl.style.left = '0px';
  popupEl.style.top = '0px';
  // force layout so offsetWidth/Height are correct
  const pW = popupEl.offsetWidth;
  const pH = popupEl.offsetHeight;
  popupEl.style.visibility = '';

  const pad = 12;

  // no target -> center
  if (!target) {
    popupEl.style.left = Math.max(12, (window.innerWidth / 2) - (pW / 2)) + 'px';
    popupEl.style.top  = Math.max(12, (window.innerHeight / 2) - (pH / 2)) + 'px';
    arrowEl.style.display = 'none';
    return;
  }

  const rect = target.getBoundingClientRect();
  const space = {
    left: rect.left,
    right: window.innerWidth - rect.right,
    top: rect.top,
    bottom: window.innerHeight - rect.bottom
  };

  // choose position, but fall back if not enough space
  let usedPos = position;
  if (position === 'left' && space.left < (pW + pad)) {
    if (space.right >= (pW + pad)) usedPos = 'right';
    else if (space.top >= (pH + pad)) usedPos = 'top';
    else if (space.bottom >= (pH + pad)) usedPos = 'bottom';
    else usedPos = 'center';
  } else if (position === 'right' && space.right < (pW + pad)) {
    if (space.left >= (pW + pad)) usedPos = 'left';
    else if (space.top >= (pH + pad)) usedPos = 'top';
    else if (space.bottom >= (pH + pad)) usedPos = 'bottom';
    else usedPos = 'center';
  } else if (position === 'top' && space.top < (pH + pad)) {
    if (space.bottom >= (pH + pad)) usedPos = 'bottom';
    else if (space.right >= (pW + pad)) usedPos = 'right';
    else if (space.left >= (pW + pad)) usedPos = 'left';
    else usedPos = 'center';
  } else if (position === 'bottom' && space.bottom < (pH + pad)) {
    if (space.top >= (pH + pad)) usedPos = 'top';
    else if (space.right >= (pW + pad)) usedPos = 'right';
    else if (space.left >= (pW + pad)) usedPos = 'left';
    else usedPos = 'center';
  }

  let left = 20, top = 20;
  switch (usedPos) {
    case 'right':
      left = Math.min(window.innerWidth - pW - 12, rect.right + pad);
      top = Math.max(12, rect.top + (rect.height / 2) - (pH / 2));
      break;
    case 'left':
      left = Math.max(12, rect.left - pW - pad);
      top = Math.max(12, rect.top + (rect.height / 2) - (pH / 2));
      break;
    case 'bottom':
      left = Math.max(12, rect.left + (rect.width / 2) - (pW / 2));
      top = Math.min(window.innerHeight - pH - 12, rect.bottom + pad);
      break;
    case 'top':
      left = Math.max(12, rect.left + (rect.width / 2) - (pW / 2));
      top = Math.max(12, rect.top - pH - pad);
      break;
    case 'center':
    default:
      left = Math.max(12, (window.innerWidth / 2) - (pW / 2));
      top = Math.max(12, (window.innerHeight / 2) - (pH / 2));
      break;
  }

  popupEl.style.left = left + 'px';
  popupEl.style.top  = top  + 'px';

  // arrow: show/hide + position it near the popup and target
  if (!arrowEl) return;
  if (usedPos === 'center') {
    arrowEl.style.display = 'none';
    return;
  }
  arrowEl.style.display = 'block';

  const px = popupEl.getBoundingClientRect();
  const tx = rect;

  let arrowLeft = px.left;
  let arrowTop  = px.top;

  switch (usedPos) {
    case 'right':
      arrowLeft = px.left - 9;
      arrowTop  = Math.min(window.innerHeight - 18, Math.max(8, tx.top + tx.height / 2 - 9));
      break;
    case 'left':
      arrowLeft = px.right - 9;
      arrowTop  = Math.min(window.innerHeight - 18, Math.max(8, tx.top + tx.height / 2 - 9));
      break;
    case 'top':
      arrowLeft = Math.min(window.innerWidth - 18, Math.max(8, tx.left + tx.width / 2 - 9));
      arrowTop  = px.bottom - 9;
      break;
    case 'bottom':
      arrowLeft = Math.min(window.innerWidth - 18, Math.max(8, tx.left + tx.width / 2 - 9));
      arrowTop  = px.top - 9;
      break;
  }

  arrowEl.style.left = arrowLeft + 'px';
  arrowEl.style.top  = arrowTop  + 'px';
}

  function renderStep() {
      if (!overlayEl) createOverlay();
      const step = steps[currentStep];
      if (!step) return;

      // update popup text/title
      popupEl.querySelector('#tutorial-title').textContent = step.title || '';
      popupEl.querySelector('#tutorial-text').textContent = step.text || '';

      // find element if selector provided (first match)
      let target = null;
      if (step.selector) {
        target = document.querySelector(step.selector);
        if (!target) {
          waitFor(step.selector, 4500).then(el => {
            if (currentStep === steps.findIndex(s=>s.id===step.id)) {
              renderStep();
            }
          }).catch(()=>{ /* no-op */ });
        }
      }

      // highlight element if found
      clearHighlight();
      if (target) highlightElement(target);

      // position popup
      placePopupNear(target, step.position || 'right');

      // call onEnter if present
      if (step.onEnter && typeof step.onEnter === 'function') {
        try { step.onEnter(); } catch(e){ console.warn('tutorial onEnter error', e); }
      }

      // update prev/next button state
      const prevBtn = popupEl.querySelector('#tutorial-prev');
      const nextBtn = popupEl.querySelector('#tutorial-next');
      nextBtn.textContent = step.nextText || 'Next'; // dynamic label

      const autoBtn = popupEl.querySelector('#tutorial-auto');

      prevBtn.disabled = (currentStep <= 0);
      nextBtn.disabled = (currentStep >= steps.length - 1);

      // **Hide Back button if disabled**
      prevBtn.style.display = prevBtn.disabled ? 'none' : 'inline-block';

      // **Hide "Do it for me" if no autoAction exists**
      autoBtn.style.display = (step.autoAction && typeof step.autoAction === 'function') ? 'inline-block' : 'none';

      // small auto-advance if validate already true
      setTimeout(()=> tryAdvanceIfValid(), 750);
  }

  async function tryAdvanceIfValid() {
    const step = steps[currentStep];
    if (!step) return;
    // if validate returns true, enable Next; optionally auto-advance if done
    if (step.validate && typeof step.validate === 'function') {
      try {
        const ok = await step.validate();
        // if ok and we're not last step, enable next. We don't auto-forward by default except for some flows.
        if (ok) {
          // show a hint
          // automatically enable "Next" button
          popupEl.querySelector('#tutorial-next').disabled = false;
        } else {
          // disable Next until satisfied
          popupEl.querySelector('#tutorial-next').disabled = true;
        }
      } catch(e){ console.warn('validate error', e); }
    }
  }

  async function goto(index) {
    if (index < 0) index = 0;
    if (index >= steps.length) index = steps.length - 1;
    currentStep = index;
    renderStep();
  }

  function start() {
    if (running) return;
    running = true;
    currentStep = 0;
    createOverlay();
    renderStep();
    window.addEventListener('resize', onResize);
    // small accessibility: allow Escape to exit
    window.addEventListener('keydown', onKeyDown);
    showTempMessage('Tutorial started — press Esc to exit');
  }

  function stop() {
    running = false;
    cleanupOverlay();

    // ✅ remove highlight from any leftover elements
    document.querySelectorAll('.tutorial-highlight').forEach(el => {
      el.classList.remove('tutorial-highlight');
    });

    clearHighlight();
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onKeyDown);
    showTempMessage('Tutorial closed');
  }

  function onKeyDown(e) {
    if (!running) return;
    if (e.key === 'Escape') stop();
    if (e.key === 'ArrowRight') goto(currentStep+1);
    if (e.key === 'ArrowLeft') goto(currentStep-1);
  }

  function onResize(){
    // re-position current popup / arrow
    renderStep();
  }

  // Expose API
  const API = {
    start,
    stop,
    goto,
    get steps(){ return steps.slice(); }
  };

  window.SubDemoTutorial = API;

})();
