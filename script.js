(function(){
  // ---------- Immersive alert/toast UI ----------
  (function initImmersiveUI(){
    if (document.getElementById('immersive-ui-root')) return;
    const root = document.createElement('div');
    root.id = 'immersive-ui-root';
    root.innerHTML = `
      <div id="immersive-modal" class="iu-hidden" role="dialog" aria-modal="true" aria-labelledby="iu-title">
        <div class="iu-modal-backdrop"></div>
        <div class="iu-modal-card" role="document">
          <div class="iu-modal-header">
            <div id="iu-title" class="iu-title">Confirm</div>
          </div>
          <div id="iu-message" class="iu-message"></div>
          <div class="iu-modal-actions">
            <button id="iu-cancel" class="iu-btn iu-btn-cancel">Cancel</button>
            <button id="iu-confirm" class="iu-btn iu-btn-confirm">OK</button>
          </div>
        </div>
      </div>
      <div id="immersive-toasts" aria-live="polite" aria-atomic="false"></div>
    `;
    document.body.appendChild(root);
  })();

  function showToast(message, options = {}) {
    window.dispatchEvent(new CustomEvent('popUp'));
    const root = document.getElementById('immersive-toasts');
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'iu-toast';
    if (options.red) el.classList.add('iu-toast-red');
    el.innerHTML = `<div style="flex:1">${message}</div><button class="iu-close" title="Dismiss">✕</button>`;
    root.appendChild(el);

    const closeBtn = el.querySelector('.iu-close');
    let removed = false;
    const remove = () => { if (removed) return; removed = true; try { el.remove(); } catch(e){} };
    closeBtn.onclick = remove;

    const duration = (typeof options.duration === 'number') ? options.duration : 3500;
    if (duration > 0) setTimeout(remove, duration);

    return { remove };
  }

  function showConfirm(message, opts = {}) {
    // returns Promise<boolean>
    return new Promise(resolve => {
      const modal = document.getElementById('immersive-modal');
      const titleEl = document.getElementById('iu-title');
      const msgEl = document.getElementById('iu-message');
      const btnConfirm = document.getElementById('iu-confirm');
      const btnCancel = document.getElementById('iu-cancel');

      titleEl.textContent = opts.title || 'Confirm';
      msgEl.textContent = message;
      btnConfirm.textContent = opts.confirmText || 'OK';
      btnCancel.textContent = opts.cancelText || 'Cancel';

      function cleanup() {
        modal.classList.add('iu-hidden');
        btnConfirm.removeEventListener('click', onConfirm);
        btnCancel.removeEventListener('click', onCancel);
        document.removeEventListener('keydown', onKey);
      }
      function onConfirm() { cleanup(); resolve(true); }
      function onCancel() { cleanup(); resolve(false); }
      function onKey(e) {
        if (e.key === 'Escape') { onCancel(); }
        if (e.key === 'Enter') { onConfirm(); }
      }

      btnConfirm.addEventListener('click', onConfirm);
      btnCancel.addEventListener('click', onCancel);
      document.addEventListener('keydown', onKey);

      // show and focus confirm button
      modal.classList.remove('iu-hidden');
      btnConfirm.focus();
    });
  }

  function showAlert(message, opts = {}) {
    // One-button modal. Returns Promise when dismissed.
    return new Promise(resolve => {
      const modal = document.getElementById('immersive-modal');
      const titleEl = document.getElementById('iu-title');
      const msgEl = document.getElementById('iu-message');
      const btnConfirm = document.getElementById('iu-confirm');
      const btnCancel = document.getElementById('iu-cancel');

      titleEl.textContent = opts.title || 'Notice';
      msgEl.textContent = message;
      btnConfirm.textContent = opts.okText || 'OK';
      btnCancel.style.display = 'none';

      function cleanup() {
        modal.classList.add('iu-hidden');
        btnConfirm.removeEventListener('click', onOk);
        document.removeEventListener('keydown', onKey);
        btnCancel.style.display = ''; // restore
      }
      function onOk() { cleanup(); resolve(); }
      function onKey(e) { if (e.key === 'Enter' || e.key === 'Escape') { onOk(); } }

      btnConfirm.addEventListener('click', onOk);
      document.addEventListener('keydown', onKey);
      modal.classList.remove('iu-hidden');
      btnConfirm.focus();
    });
  }

  // ---------- Difficulty system ----------
  const DIFFICULTY_PRESETS = {
    'Easy': {
      damageMultiplier: 0.8,
      startSupplies: 90,
      eventDelayMinMs: 25000,
      eventDelayMaxMs: 45000,
      taskTimeMult: 0.9,
      eventWeights: { hullBreach: 0.5, fire: 0.9, electrical: 0.9, supplyCache: 1.5, calmWaters: 1.2 }
    },
    'Normal': {
      damageMultiplier: 1.0,
      startSupplies: 50,
      eventDelayMinMs: 15000,
      eventDelayMaxMs: 35000,
      taskTimeMult: 1.0,
      eventWeights: { hullBreach: 0.8, fire: 1.0, electrical: 1.0, supplyCache: 1.0, calmWaters: 1.0 }
    },
    'Hard': {
      damageMultiplier: 1.6,
      startSupplies: 30,
      eventDelayMinMs: 8000,
      eventDelayMaxMs: 20000,
      taskTimeMult: 1.1,
      eventWeights: { hullBreach: 1.4, fire: 1.6, electrical: 1.4, supplyCache: 0.6, calmWaters: 0.6 }
    },
    'Nightmare': {
      damageMultiplier: 2.6,
      startSupplies: 20,
      eventDelayMinMs: 5000,
      eventDelayMaxMs: 12000,
      taskTimeMult: 1.2,
      eventWeights: { hullBreach: 2.0, fire: 2.2, electrical: 1.8, supplyCache: 0.4, calmWaters: 0.3 }
    }
  };

  // default difficulty
  let currentDifficultyName = 'Normal';

  // persistent save key
  const SAVE_KEY = 'sub_demo_upgrades_v1';

  // these will be set by applyDifficulty
  let DAMAGE_MULTIPLIER = 1.0;
  let EVENT_DELAY_MIN_MS = 15000;
  let EVENT_DELAY_MAX_MS = 35000;
  let START_SUPPLIES = 50;
  let TASK_TIME_MULT = 1.0;
  let EVENT_WEIGHTS = DIFFICULTY_PRESETS['Normal'].eventWeights;

  // supplies default (overridden by load or difficulty)
  let supplies = 50;

  // Medic base heal per second (before upgrades)
  const MEDIC_BASE_HEAL = 2.0; // heals 2 HP/s base

  // crew definitions
  const crew = [
    { id:'capt', name:'Anthony (Capt)', role:'Captain', health:100, maxHealth:100, repairing:null, repairSpeedMult:1.0, damageReduction:0.0, upgrades: {speed:0, armor:0, med:0, autoHeal:0, engineer:0} },
    { id:'xo', name:'John (XO)', role:'XO', health:100, maxHealth:100, repairing:null, repairSpeedMult:1.0, damageReduction:0.0, upgrades: {speed:0, armor:0, med:0, autoHeal:0, engineer:0, fireSuppression:0} },
    { id:'eo', name:'Gabe (EO)', role:'Engineer', health:90, maxHealth:100, repairing:null, repairSpeedMult:1.6, damageReduction:0.0, upgrades: {speed:0, armor:0, med:0, autoHeal:0, engineer:0} },
    { id:'med', name:'Rin (Medic)', role:'Medic', health:100, maxHealth:100, repairing:null, repairSpeedMult:1.0, damageReduction:0.0, healRate:MEDIC_BASE_HEAL, upgrades: {speed:0, armor:0, med:0, autoHeal:0, engineer:0}, healTarget:null },
  ];

  // tasks (we will multiply baseTime by TASK_TIME_MULT when using)
  const tasks = [
    { id:'hull', title:'Hull Breach', baseTime: 57.0, progress:20, assigned:null, extinguisherAssigned:null, baseDamagePerSec:1.5, complete:false, eventDamageMult:1.0, eventSpeedMult:0.3, events:[] },
    { id:'flood', title:'Flooding', baseTime: 24.0, progress:0, assigned:null, extinguisherAssigned:null, baseDamagePerSec:1, complete:false, eventDamageMult:1.0, eventSpeedMult:0.6, events:[] },
    { id:'reactor', title:'Reactor Room', baseTime: 16.0, progress:0, assigned:null, extinguisherAssigned:null, baseDamagePerSec:6.5, complete:false, eventDamageMult:1.0, eventSpeedMult:1.0, events:[] },
    { id:'command', title:'Command Systems', baseTime: 14.0, progress:0, assigned:null, extinguisherAssigned:null, baseDamagePerSec:5.0, complete:false, eventDamageMult:1.0, eventSpeedMult:1.0, events:[] },
    { id:'sonar', title:'Sonar Array', baseTime: 12.0, progress:0, assigned:null, extinguisherAssigned:null, baseDamagePerSec:3.5, complete:false, eventDamageMult:1.0, eventSpeedMult:1.0, events:[] },
    { id:'comms', title:'Communications', baseTime: 10.0, progress:0, assigned:null, extinguisherAssigned:null, baseDamagePerSec:2.5, complete:false, eventDamageMult:1.0, eventSpeedMult:1.0, events:[] },
  ];

  // ---------- Upgrades ----------
  const UPGRADES = {
    speed: {
      name: 'Tool Kit',
      description: 'Increase repair speed by 10% per level.',
      costBase: 20,
      applyTo: 'self',
      effects: [
        { type: 'repairRate', perLevel: 0.10 }
      ]
    },
    armor: {
      name: 'Reinforced Suit',
      description: 'Reduce damage taken while repairing by 8% per level.',
      costBase: 25,
      applyTo: 'self',
      effects: [
        { type: 'damageRate', perLevel: 0.08 }
      ]
    },
    med: {
      name: 'Med Training',
      description: 'Increase Medic healing rate by +50% of base per level.',
      costBase: 30,
      roleRestriction: 'Medic',
      applyTo: 'self',
      effects: [
        { type: 'healRate', perLevel: 0.5 }
      ]
    },
    autoHeal: {
      name: 'Auto-Heal Module',
      description: 'Automatically heal idle crew members when the Medic is idle. Level 2 allows medic to self-heal.',
      costBase: 40,
      roleRestriction: 'Medic',
      applyTo: 'self',
      effects: [
        { type: 'autoHeal', perLevel: 1 }
      ]
    },
    engineer: {
      name: 'Field Expertise',
      description: 'Engineers gain +25% repair speed per level.',
      costBase: 35,
      roleRestriction: 'Engineer',
      applyTo: 'self',
      effects: [
        { type: 'repairRate', perLevel: 0.25 }
      ]
    },
    // NEW: XO-only fire suppression upgrade
    fireSuppression: {
      name: 'Fire Suppression Training',
      description: 'XO reduces fire spread chance and spread rate by 15% per level.',
      costBase: 30,
      roleRestriction: 'XO',
      applyTo: 'self',
      effects: [
        { type: 'fireSuppress', perLevel: 0.15 }
      ]
    }
  };

  // Random event system state
  let activeEvents = []; // { id, type, target, startedAt, duration, meta }
  let nextEventTimer = null;
  let eventsEnabled = true; // toggleable if desired

  // Event definitions
  const EVENT_DEFS = {
    hullBreach: {
      id: 'hullBreach',
      name: 'Hull Breach',
      description: 'A hull breach sprays debris — all crew take a burst of damage and extra pressure damage for a short time.',
      duration: 12, // seconds
      apply(meta){
        meta.oldGlobalDamageBoost = meta.globalDamageBoost || 0;
        meta.globalDamageBoost = 0.6; // +60% damage while active
        crew.forEach(c=>{
          if (c.health>0){
            const burst = 6 + Math.random()*8;
            c.health = Math.max(0, c.health - burst);
          }
        });
        broadcastEvent('Hull Breach — immediate damage and pressure!');
      },
      revert(meta){
        broadcastEvent('Hull breach sealed.');
      }
    },
    fire: {
      id: 'fire',
      name: 'Fire',
      description: 'A fire has started in a system — it must be extinguished before repairs can begin. Assign a crew member to fight it.',
      duration: 28,
      apply(meta){
        const t = tasks.find(x=>x.id === meta.target);
        if (!t) return;
        meta.fireHealth = (typeof meta.fireHealth === 'number') ? meta.fireHealth : 100;
        meta.fireMax = (typeof meta.fireMax === 'number') ? meta.fireMax : (meta.fireHealth || 100);
        meta.startedAt = meta.startedAt || (Date.now() / 1000);
        t.events.push(meta);
        t.eventDamageMult = (t.eventDamageMult || 1) * 1.6;
        t.eventSpeedMult = (t.eventSpeedMult || 1) * 0.6;
        if (t.assigned){
          const c = crew.find(x=>x.id===t.assigned);
          if (c) c.repairing = null;
          t.assigned = null;
        }
        // no transient toast for fire — task shows bar and extinguisher UI
      },
      revert(meta){
        const t = tasks.find(x=>x.id === meta.target);
        if (!t) return;
        t.events = (t.events || []).filter(e=> e.id !== meta.id);
        let dmg = 1, spd = 1;
        t.events.forEach(e=>{
          if (e.type === 'fire'){ dmg *= 1.6; spd *= 0.6; }
          if (e.type === 'electrical') dmg *= 1.5;
        });
        t.eventDamageMult = dmg;
        t.eventSpeedMult = spd;
      }
    },
    electrical: {
      id: 'electrical',
      name: 'Electrical Surge',
      description: 'An electrical surge damages systems — repairs become more dangerous and slightly slower.',
      duration: 10,
      apply(meta){
        const t = tasks.find(x=>x.id === meta.target);
        if (!t) return;
        t.eventDamageMult = (t.eventDamageMult || 1) * 1.5;
        t.eventSpeedMult = (t.eventSpeedMult || 1) * 0.85;
        t.events.push(meta);
        broadcastEvent(`${t.title} electrical surge! Repair danger increased.`);
      },
      revert(meta){
        const t = tasks.find(x=>x.id === meta.target);
        if (!t) return;
        t.events = (t.events || []).filter(e=> e.id !== meta.id);
        let dmg = 1, spd = 1;
        t.events.forEach(e=>{
          if (e.type === 'fire'){ dmg *= 1.6; spd *= 0.6; }
          if (e.type === 'electrical') dmg *= 1.5;
        });
        t.eventDamageMult = dmg;
        t.eventSpeedMult = spd;
        broadcastEvent(`${t.title} electrical surge ended.`);
      }
    },
    supplyCache: {
      id: 'supplyCache',
      name: 'Supply Cache',
      description: 'A hidden cache is found — immediate supply bonus.',
      duration: 0,
      apply(meta){
        const reward = 18 + Math.round(Math.random()*24);
        supplies += reward;
        broadcastEvent(`Supply cache found! +${reward} supplies.`);
      },
      revert(meta){
      }
    },
    calmWaters: {
      id: 'calmWaters',
      name: 'Calm Waters',
      description: 'A temporary lull — damage taken is reduced for a short time.',
      duration: 12,
      apply(meta){
        meta.oldGlobalDamageBoost = meta.globalDamageBoost || 0;
        meta.globalDamageBoost = -0.3; // reduce damage by 30%
        broadcastEvent('Calm waters: damage reduced temporarily.');
      },
      revert(meta){
        broadcastEvent('Calm waters ended.');
      }
    }
  };

  // helper to broadcast a short notification in event log area
  function broadcastEvent(text){
    const log = document.getElementById('eventLog');
    if (!log) return;
    const el = document.createElement('div');
    el.className = 'event-badge event-muted';
    el.textContent = text;
    log.prepend(el);
    setTimeout(()=> {
      try { el.remove(); } catch(e){}
    }, 6000);
    renderEventList();
  }

  // ---------- Save / Load ----------
  function loadSave(){
    try{
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);

      if (parsed.difficulty) {
        currentDifficultyName = parsed.difficulty;
        applyDifficulty(currentDifficultyName, /*persistUI*/ false);
        const sel = document.getElementById('difficultySelect');
        if (sel) sel.value = currentDifficultyName;
      }
      if (parsed.supplies !== undefined) supplies = parsed.supplies;
      if (typeof supplies !== 'number') supplies = START_SUPPLIES;

      if (parsed.crew){
        for (const saved of parsed.crew){
          const c = crew.find(x => x.id === saved.id);
          if (c && saved.upgrades){
            c.upgrades = Object.assign({ speed:0, armor:0, med:0, autoHeal:0, engineer:0, fireSuppression:0 }, saved.upgrades);
            applyCrewUpgradeStats(c);
          }
        }
      }
      if (parsed.tasks){
        for (const saved of parsed.tasks){
          const t = tasks.find(x=>x.id === saved.id);
          if (t){
            t.progress = (typeof saved.progress === 'number') ? saved.progress : t.progress;
            t.complete = !!saved.complete;
            if (t.complete) t.progress = t.baseTime * TASK_TIME_MULT;
            t.extinguisherAssigned = saved.extinguisherAssigned || null;
          }
        }
      }

      // Load active events (fires etc) and re-apply their effects
      if (parsed.activeEvents && Array.isArray(parsed.activeEvents)){
        activeEvents = [];
        tasks.forEach(t=> t.events = []);
        parsed.activeEvents.forEach(savedEv => {
          const ev = {
            id: savedEv.id,
            type: savedEv.type,
            target: savedEv.target,
            startedAt: savedEv.startedAt,
            duration: savedEv.duration,
            meta: savedEv.meta || {}
          };
          // ensure fire meta defaults
          if (ev.type === 'fire'){
            ev.meta.fireHealth = (typeof ev.meta.fireHealth === 'number') ? ev.meta.fireHealth : 100;
            ev.meta.fireMax = (typeof ev.meta.fireMax === 'number') ? ev.meta.fireMax : (ev.meta.fireHealth || 100);
          }
          activeEvents.push(ev);
          const def = EVENT_DEFS[ev.type];
          try {
            if (def && typeof def.apply === 'function') {
              def.apply(ev.meta);
            }
          } catch(e){ console.warn('Error applying saved event', e); }
        });
        // restore extinguisherAssigned -> mark crew as extinguishing
        tasks.forEach(t => {
          if (t.extinguisherAssigned){
            const c = crew.find(x=>x.id === t.extinguisherAssigned);
            if (c && c.health > 0){
              c.repairing = 'extinguish:' + t.id;
            } else {
              t.extinguisherAssigned = null;
            }
          }
        });
      }

    }catch(e){
      console.warn('Failed to load save', e);
    }
  }

  function save(){
    try{
      const data = {
        difficulty: currentDifficultyName,
        supplies,
        crew: crew.map(c => ({ id:c.id, upgrades:c.upgrades })),
        tasks: tasks.map(t => ({ id: t.id, progress: t.progress, complete: t.complete, extinguisherAssigned: t.extinguisherAssigned })),
        activeEvents: activeEvents.map(ev => ({ id: ev.id, type: ev.type, target: ev.target, startedAt: ev.startedAt, duration: ev.duration, meta: ev.meta }))
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    }catch(e){
      console.warn('Save failed', e);
    }
  }

  async function resetUpgrades(){
    const ok = await showConfirm('Reset all saved upgrades and supplies?');
    if (!ok) return;
    localStorage.removeItem(SAVE_KEY);
    supplies = START_SUPPLIES;
    crew.forEach(c => { c.upgrades = {speed:0, armor:0, med:0, autoHeal:0, engineer:0, fireSuppression:0}; applyCrewUpgradeStats(c); c.health=c.maxHealth; c.repairing=null; c.healTarget=null; });
    tasks.forEach(t => { t.progress=0; t.assigned=null; t.extinguisherAssigned=null; t.complete=false; t.eventDamageMult=1; t.eventSpeedMult=1; t.events=[]; });
    activeEvents.length = 0;
    stopNextEventTimer();
    scheduleNextEvent();
    renderAll();
    save();
    showToast('Upgrades and supplies reset.');
  }

  // ---------- Apply crew upgrade stats (handles fire suppression) ----------
  function applyCrewUpgradeStats(c) {
    let repairBonus = 0;
    let damageReduction = 0;
    let healBonus = 0;
    let fireSuppress = 0;
    c.upgrades = c.upgrades || {};

    for (const [key, lvl] of Object.entries(c.upgrades)) {
      if (!lvl || lvl <= 0) continue;
      const def = UPGRADES[key];
      if (!def || !Array.isArray(def.effects)) continue;

      def.effects.forEach(effect => {
        const per = effect.perLevel || 0;
        switch (effect.type) {
          case 'repairRate':
            repairBonus += lvl * per;
            break;
          case 'damageRate':
          case 'damageReduction':
            damageReduction += lvl * per;
            break;
          case 'healRate':
            healBonus += lvl * per;
            break;
          case 'autoHeal':
            break;
          case 'fireSuppress':
            fireSuppress += lvl * per;
            break;
          default:
            console.warn('Unhandled upgrade effect type:', effect.type);
        }
      });
    }

    c.repairSpeedMult = 1 + repairBonus;
    c.damageReduction = Math.min(0.9, damageReduction);
    if (c.role === 'Medic') {
      c.healRate = MEDIC_BASE_HEAL * (1 + healBonus);
      c.autoHealLevel = (c.upgrades.autoHeal || 0);
    } else {
      c.healRate = 0;
      c.autoHealLevel = (c.upgrades.autoHeal || 0);
    }

    c.fireSuppressionLevel = Math.min(0.9, fireSuppress);
  }

  // Apply difficulty settings (call this to change difficulty)
  function applyDifficulty(name, persistUI = true){
    const preset = DIFFICULTY_PRESETS[name] || DIFFICULTY_PRESETS['Normal'];
    DAMAGE_MULTIPLIER = preset.damageMultiplier;
    EVENT_DELAY_MIN_MS = preset.eventDelayMinMs;
    EVENT_DELAY_MAX_MS = preset.eventDelayMaxMs;
    START_SUPPLIES = preset.startSupplies;
    TASK_TIME_MULT = preset.taskTimeMult;
    EVENT_WEIGHTS = preset.eventWeights || {};
    currentDifficultyName = name;
    const el = document.getElementById('currentDifficulty');
    if (el) el.textContent = name;
    if (persistUI) {
      const sel = document.getElementById('difficultySelect');
      if (sel) sel.value = name;
    }
  }

  // helper: build weighted event pool based on EVENT_WEIGHTS
  function getWeightedEventPool(){
    const pool = [];
    for (const key in EVENT_DEFS){
      const weight = (EVENT_WEIGHTS && EVENT_WEIGHTS[key] !== undefined) ? EVENT_WEIGHTS[key] : 1;
      const count = Math.max(0, Math.round(weight * 10));
      for (let i=0;i<count;i++) pool.push(key);
    }
    if (pool.length === 0) pool.push('supplyCache','fire','electrical');
    return pool;
  }

  // ---------- Rendering ----------
  const crewContainer = document.getElementById('crewContainer');
  const tasksContainer = document.getElementById('tasksContainer');
  const upgradePanel = document.getElementById('upgradePanel');
  const suppliesLabel = document.getElementById('supplies');

  // small helper to show a transient popover picker for extinguish assignment
  function showExtinguishPicker(taskId, buttonEl){
    // remove any existing picker
    const existing = document.getElementById('extinguish-picker');
    if (existing) existing.remove();

    const picker = document.createElement('div');
    picker.id = 'extinguish-picker';
    picker.style.position = 'absolute';
    picker.style.zIndex = 9999;
    picker.style.background = '#081018';
    picker.style.border = '1px solid rgba(255,255,255,0.06)';
    picker.style.padding = '8px';
    picker.style.borderRadius = '6px';
    picker.style.minWidth = '220px';
    picker.style.boxShadow = '0 6px 20px rgba(0,0,0,0.6)';

    // position near buttonEl if given
    if (buttonEl) {
      const rect = buttonEl.getBoundingClientRect();
      picker.style.left = Math.max(8, rect.left) + 'px';
      picker.style.top = (rect.bottom + window.scrollY + 6) + 'px';
    } else {
      picker.style.left = '50%';
      picker.style.top = '50%';
      picker.style.transform = 'translate(-50%,-50%)';
    }

    const available = crew.filter(c => c.health>0 && !c.repairing);
    if (available.length === 0){
      picker.innerHTML = `<div class="small-muted">No available crew to extinguish</div><div style="margin-top:8px;text-align:right"><button id="ext-close" class="small">Close</button></div>`;
      document.body.appendChild(picker);
      picker.querySelector('#ext-close').onclick = ()=> picker.remove();
      setTimeout(()=> window.addEventListener('click', onDocClick));
      function onDocClick(e){ if (!picker.contains(e.target)) { picker.remove(); window.removeEventListener('click', onDocClick); } }
      return;
    }

    picker.innerHTML = `
      <div style="font-weight:700;margin-bottom:6px">Assign Extinguisher</div>
      <div>
        <select id="ext-select" style="width:100%;padding:6px;border-radius:4px;background:#071018;border:1px solid rgba(255,255,255,0.04)">
          ${available.map(c=>`<option value="${c.id}">${c.name} ${c.role === 'Engineer' ? ' (Eng)' : ''}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
        <button id="ext-quick" class="small">Quick</button>
        <button id="ext-assign" class="small">Assign</button>
        <button id="ext-cancel" class="small">Cancel</button>
      </div>
    `;

    document.body.appendChild(picker);

    // event handlers
    picker.querySelector('#ext-cancel').onclick = ()=> picker.remove();
    picker.querySelector('#ext-assign').onclick = ()=> {
      const sel = picker.querySelector('#ext-select');
      const crewId = sel.value;
      assignCrewToExtinguish(crewId, taskId);
      picker.remove();
    };
    picker.querySelector('#ext-quick').onclick = ()=> {
      // prefer Engineer then healthiest
      available.sort((a,b) => {
        if (a.role === 'Engineer' && b.role !== 'Engineer') return -1;
        if (b.role === 'Engineer' && a.role !== 'Engineer') return 1;
        return b.health - a.health;
      });
      assignCrewToExtinguish(available[0].id, taskId);
      picker.remove();
    };

    // close on outside click
    setTimeout(()=> window.addEventListener('click', onDocClick));
    function onDocClick(e){ if (!picker.contains(e.target)) { picker.remove(); window.removeEventListener('click', onDocClick); } }
  }

  // --- start: scheduled render helper ---
  let renderScheduled = false;
  function isUserInteracting() {
    const active = document.activeElement;
    if (!active) return false;
    if (active === document.body || active === document.documentElement) return false;
    return crewContainer && crewContainer.contains(active) || tasksContainer && tasksContainer.contains(active) || upgradePanel && upgradePanel.contains(active);
  }
  function scheduleRender(delayMs = 0) {
    if (renderScheduled) return;
    renderScheduled = true;
    const run = () => {
      renderScheduled = false;
      if (isUserInteracting()) { setTimeout(scheduleRender, 150); return; }
      renderAll();
    };
    if (delayMs > 0) setTimeout(() => requestAnimationFrame(run), delayMs);
    else requestAnimationFrame(run);
  }
  // --- end scheduled render helper ---

  let deadCrewIds = new Set();

  function renderCrew() {
    if (!crewContainer) return;
    crewContainer.innerHTML = '';
    crew.forEach(c => {
      const wasDead = deadCrewIds.has(c.id);
      const isDead = c.health <= 0;

      if (isDead && !wasDead) {
        deadCrewIds.add(c.id);
        window.dispatchEvent(new CustomEvent('crewDied', { detail: { id: c.id, name: c.name } }));
      } else if (!isDead && wasDead) {
        deadCrewIds.delete(c.id);
      }
      const medic = crew.find(x => x.role === 'Medic');
      const isHealingTarget = medic && medic.repairing === ('healing:' + c.id);
      const medicIsHealing = medic && medic.repairing && medic.repairing.startsWith('healing:');
      const isWorking = !!(c.repairing && !c.repairing.startsWith('healing:') && c.health > 0);

      const avatarBg = isDead
        ? '#330000'
        : isWorking
          ? 'linear-gradient(90deg,var(--accent),#1f7fb0)'
          : '#081018';

      const el = document.createElement('div');
      el.className = 'crew';

      if (isDead) {
        el.style.border = '1px solid rgba(255,0,0,0.25)';
        el.style.background = 'linear-gradient(180deg,#220000,#110000)';
        el.style.opacity = '0.6';
      } else if (isWorking) {
        el.style.border = '1px solid rgba(43,179,255,0.12)';
        el.style.boxShadow = '0 6px 20px rgba(43,179,255,0.04)';
        el.style.background = 'linear-gradient(180deg,#071018,#041015)';
      } else {
        el.style.border = '';
        el.style.boxShadow = '';
        el.style.background = '';
      }

      el.innerHTML =
        `<div style="width:52px;height:52px;border-radius:8px;background:${avatarBg};display:flex;align-items:center;justify-content:center;font-weight:700">
          ${c.name.split(' ')[0][0]}
        </div>
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div class="name">${c.name}</div>
              <div class="small-muted">${c.role}${isDead ? ' • DEAD' : ''}</div>
            </div>
            <div style="text-align:right">
              <div class="small-muted">HP</div>
              <div class="stat">${Math.max(0, Math.round(c.health))}/${c.maxHealth}</div>
            </div>
          </div>

          <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
            <div style="flex:1">
              <div class="health-bar"><i style="width:${Math.max(0, (c.health / c.maxHealth) * 100)}%"></i></div>
            </div>
            <div style="width:120px;text-align:right">
              ${isDead ? '' : `<button class="small" data-action="openUpgrades" data-id="${c.id}">Upgrades</button>`}
            </div>
          </div>

          <div style="display:flex;gap:8px;margin-top:6px;align-items:center;justify-content:space-between">
            <div class="small-muted">
              ${isDead ? 'Unavailable' : `Speed x${c.repairSpeedMult.toFixed(2)} • Damage reduction ${(c.damageReduction*100).toFixed(0)}%` }
            </div>
            <div>
              ${(!isDead && c.id !== 'med')
                ? `<button class="small" data-action="requestHeal" data-target="${c.id}">${isHealingTarget ? 'Stop Heal' : 'Heal'}</button>`
                : (!isDead && medicIsHealing
                    ? `<span class="small-muted">Healing: ${crew.find(x=>x.id===medic.healTarget)?.name || '—'}</span>`
                    : '')
              }
            </div>
          </div>
        </div>`;

      crewContainer.appendChild(el);
    });

    if (suppliesLabel) suppliesLabel.textContent = supplies;

    crewContainer.querySelectorAll('[data-action="openUpgrades"]').forEach(btn => {
      btn.onclick = () => openUpgradeFor(btn.dataset.id);
    });
    crewContainer.querySelectorAll('[data-action="requestHeal"]').forEach(btn => {
      btn.onclick = () => {
        const targetId = btn.dataset.target;
        requestHeal(targetId);
      };
    });
  }

  // helper: check if a task currently has an active fire event
  function taskHasActiveFire(taskId){
    return activeEvents.some(ev => ev.type === 'fire' && ev.target === taskId);
  }

  function renderTasks(){
    if (!tasksContainer) return;
    tasksContainer.innerHTML = '';
    tasks.forEach(t=>{
      const assignedName = t.assigned ? (crew.find(c=>c.id===t.assigned)?.name || 'Unknown') : '—';
      const extingName = t.extinguisherAssigned ? (crew.find(c=>c.id===t.extinguisherAssigned)?.name || '—') : '—';
      const percent = Math.min(100, Math.round((t.progress / (t.baseTime * TASK_TIME_MULT))*100));
      const completed = t.complete;

      const eventBadges = (t.events || []).map(e=> {
        if (e.type === 'fire') return ''; // handled separately
        if (e.type === 'electrical') return `<span style="color:#ffc857;font-weight:700">E-Surge</span>`;
        if (e.type === 'hullBreach') return `<span style="color:${'var(--danger)'};font-weight:700">BREACH</span>`;
        return `<span>${e.type}</span>`;
      }).filter(Boolean).join(' ');

      const firesOnTask = activeEvents.filter(ev => ev.type === 'fire' && ev.target === t.id);
      // compute average fireHealth / use first fire's fireMax for progress display
      let firePercent = 0;
      let extinguishProgress = 0;
      let extinguisher = null;
      if (firesOnTask.length > 0){
        const first = firesOnTask[0];
        const fh = (first.meta && typeof first.meta.fireHealth === 'number') ? first.meta.fireHealth : 100;
        const fm = (first.meta && typeof first.meta.fireMax === 'number') ? first.meta.fireMax : 100;
        firePercent = Math.max(0, Math.round(fh)); // show remaining intensity as percent
        extinguishProgress = Math.max(0, Math.round( ((fm - fh) / fm) * 100 ));
      }

      if (t.extinguisherAssigned){
        const c = crew.find(cc=>cc.id===t.extinguisherAssigned);
        if (c) extinguisher = c;
      }

      const indicatorColor = completed ? 'var(--good)' : (taskHasActiveFire(t.id) ? 'var(--danger)' : (t.assigned? '#ffc857' : '#444'));

      const taskEl = document.createElement('div');
      taskEl.className = 'task';
      taskEl.innerHTML =
        `<div style="width:12px;height:12px;border-radius:3px;background:${indicatorColor}"></div>
        <div class="info">
          <div style="display:flex;justify-content:space-between">
            <div><strong>${t.title}</strong></div>
            <div class="small-muted">${(t.baseTime * TASK_TIME_MULT).toFixed(0)}s base</div>
          </div>
          <div style="margin-top:8px">
            <div class="repair-bar"><i style="width:${percent}%"></i></div>
          </div>
          ${ firesOnTask.length > 0 ? `
            <div style="margin-top:8px">
              <div class="small-muted">Fire intensity</div>
              <div class="fire-bar" title="Assign crew to extinguish"><i style="width:${firePercent}%"></i></div>
            </div>
            ${ extingName !== '—' ? `
              <div style="margin-top:6px">
                <div class="small-muted">Extinguishing: <strong>${extinguisher ? extinguisher.name : extingName}</strong> • ${extinguishProgress}%</div>
                <div class="extinguish-progress" title="Extinguish progress"><i style="width:${extinguishProgress}%"></i></div>
              </div>` : ''
            }` : '' }
          <div style="margin-top:6px" class="small-muted">Assigned: <strong>${assignedName}</strong> • Extinguisher: <strong>${extingName === '—' ? (firesOnTask.length ? 'None' : '—') : extingName}</strong> • Damage/sec: ${(t.baseDamagePerSec * (t.eventDamageMult || 1)).toFixed(2)} ${eventBadges ? '• ' + eventBadges : ''}</div>
        </div>
        <div class="actions">
          <div style="display:flex;gap:6px;justify-content:flex-end;align-items:center">
            <select data-action="assign" data-id="${t.id}">
              <option value="">Unassigned</option>
              ${crew.map(c=>`<option value="${c.id}" ${t.assigned===c.id ? 'selected':''}>${c.name} ${c.health<=0? ' (dead)':''}</option>`).join('')}
            </select>
            <button class="small" data-action="fastAssign" data-id="${t.id}">Quick</button>
            <button class="small" data-action="cancel" data-id="${t.id}">Cancel</button>
          </div>
          <div style="margin-top:8px;text-align:right">
            ${completed ? `<div style="color:var(--good);font-weight:700">COMPLETE</div>` : `<div class="small-muted">${percent}%</div>`}
            ${ firesOnTask.length
                ? `<div style="margin-top:6px"><button class="small" data-action="assignExtinguish" data-id="${t.id}">${t.extinguisherAssigned ? 'Stop Extinguish' : 'Assign Extinguisher'}</button></div>`
                : '' }
          </div>
        </div>`;
      tasksContainer.appendChild(taskEl);
    });

    // attach listeners
    tasksContainer.querySelectorAll('[data-action="assign"]').forEach(sel=>{
      sel.onchange = ()=> {
        const taskId = sel.dataset.id;
        const crewId = sel.value || null;
        assignCrewToTask(crewId, taskId);
      };
    });
    tasksContainer.querySelectorAll('[data-action="fastAssign"]').forEach(btn=>{
      btn.onclick = ()=> {
        const tId = btn.dataset.id;
        const candidates = crew.filter(c=>c.health>0 && c.repairing==null);
        if (candidates.length===0) { showToast('No available crew to assign', { red: true}); return; }
        candidates.sort((a,b)=>b.health - a.health);
        assignCrewToTask(candidates[0].id, tId);
        renderTasks();
        renderCrew();
      };
    });
    tasksContainer.querySelectorAll('[data-action="cancel"]').forEach(btn=>{
      btn.onclick = ()=> {
        const tId = btn.dataset.id;
        unassignTask(tId);
      };
    });
    tasksContainer.querySelectorAll('[data-action="assignExtinguish"]').forEach(btn=>{
      btn.onclick = async (e)=> {
        const tId = btn.dataset.id;
        const t = tasks.find(x=>x.id===tId);
        if (!t) return;
        // if already has an extinguisher assigned, unassign them
        if (t.extinguisherAssigned){
          const c = crew.find(x=>x.id === t.extinguisherAssigned);
          if (c) { c.repairing = null; }
          t.extinguisherAssigned = null;
          // also clear crew.repairing if it was extinguish
          if (c && c.repairing && c.repairing.startsWith('extinguish:')) c.repairing = null;
          showToast('Extinguisher unassigned.');
          renderAll();
          return;
        }
        // show picker anchored to button
        showExtinguishPicker(tId, e.currentTarget);
      };
    });
  }

 // Define icons for each event type
 const EVENT_ICONS = {
   fire: '🔥',
   hullBreach: '💥',
   calmWaters: '🌊',
   electrical: '⚡',
   supplyCache: '📦',
 };

 function renderEventList() {
   const el = document.getElementById('eventLog');
   if (!el) return;
   el.innerHTML = '';

   // Iterate in chronological order and prepend to ensure newest ends up leftmost
   activeEvents.forEach(ev => {
     if (ev.type === 'fire') return;

     const rem = (ev.duration > 0)
       ? Math.max(0, Math.round(ev.duration - ((Date.now() / 1000) - ev.startedAt)))
       : 0;

     const badge = document.createElement('div');
     badge.className = 'event-badge ' +
       (ev.type === 'hullBreach' ? 'event-danger' :
        (ev.type === 'calmWaters' ? 'event-good' : 'event-muted'));

     const icon = EVENT_ICONS[ev.type] || '❔';
     const targetText = ev.target ? (' — ' + (tasks.find(t => t.id === ev.target)?.title || ev.target)) : '';

     badge.innerHTML =
       `<span class="icon">${icon}</span>
        <div>
          <strong>${EVENT_DEFS[ev.type].name}</strong>${targetText}
          ${ev.duration > 0 ? `<div class="small-muted">(${rem}s)</div>` : ''}
        </div>`;

     // Prepend so newest events occupy the leftmost slot in a left-to-right flex container
     el.prepend(badge);
   });
 }

  // ---------- Upgrades UI & logic (replaces prior simpler versions) ----------
  function renderUpgradePanelContent(selectedCrew) {
    if (!selectedCrew) {
      upgradePanel.innerHTML = `<p class="small-muted">Select a crew to view/purchase upgrades.</p>`;
      return;
    }

    const c = selectedCrew;
    const upgradeHTML = Object.entries(UPGRADES)
      .filter(([key, upg]) => !upg.roleRestriction || upg.roleRestriction === c.role)
      .map(([key, upg]) => {
        const level = c.upgrades[key] || 0;
        const globalMark = upg.applyTo === 'all' ? ' <span class="small-muted">(Global)</span>' : '';
        return `<div class="upgrade">
          <div>
            <div style="font-weight:700">${upg.name} (Level ${level})${globalMark}</div>
            <div class="small-muted">${upg.description}</div>
          </div>
          <div style="text-align:right">
            <div class="small-muted">Cost: <span class="stat">${calcUpgradeCost(key, level)}</span></div>
            <div style="margin-top:8px">
              <button data-action="buy" data-id="${c.id}" data-type="${key}">Buy</button>
            </div>
          </div>
        </div>`;
      }).join('');

    if (document.getElementById('supplies')) document.getElementById('supplies').textContent = supplies;

    upgradePanel.innerHTML =
      `<div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <h3 style="margin:0">${c.name}</h3>
          <div class="small-muted">${c.role}</div>
        </div>
        <div style="text-align:right">
          <div class="small-muted">Supplies</div>
          <div class="currency">${supplies}</div>
        </div>
      </div>

      <div style="margin-top:10px" class="upgrade-list">
        ${upgradeHTML}
      </div>

      <div style="margin-top:12px" class="small-muted">
        Current: Speed x${c.repairSpeedMult.toFixed(2)} • Damage reduction ${(c.damageReduction*100).toFixed(0)}%
        ${c.role === 'Medic' ? '• Heal rate: ' + (c.healRate || 0).toFixed(2) + ' HP/s' + (c.upgrades.autoHeal ? ' • Auto-Heal: ON' : '') : ''}
        ${c.role === 'Engineer' ? ' • Field Expertise lvl: ' + (c.upgrades.engineer || 0) : ''}
        ${c.role === 'XO' ? ' • Fire suppression lvl: ' + (c.upgrades.fireSuppression || 0) : ''}
      </div>
    `;

    upgradePanel.querySelectorAll('[data-action="buy"]').forEach(btn => {
      btn.onclick = () => {
        purchaseUpgrade(btn.dataset.id, btn.dataset.type);
      };
    });
  }

  function renderAll(){
    renderCrew();
    renderTasks();
    renderEventList();
    const openId = upgradePanel.dataset.openCrew;
    if (openId){
      const c = crew.find(x=>x.id===openId);
      renderUpgradePanelContent(c);
    }
  }

  // ---------- Game logic ----------
  function assignCrewToTask(crewId, taskId){
    const t = tasks.find(x=>x.id === taskId);
    if (!t) return;
    // cannot assign to repair if fire active
    if (taskHasActiveFire(taskId)){
      showToast('Fire must be extinguished before repairs may begin.', { red: true });
      renderTasks();
      return;
    }
    // unassign previous
    if (t.assigned && t.assigned !== crewId){
      const prev = crew.find(c=>c.id===t.assigned);
      if (prev) prev.repairing = null;
    }
    if (!crewId){
      t.assigned = null;
      save();
      renderAll();
      return;
    }
    const c = crew.find(x=>x.id===crewId);
    if (!c) return;
    if (c.health <= 0){
      showToast(c.name + ' is dead and cannot be assigned.');
      return;
    }
    // if crew was doing something else, unassign old task
    if (c.repairing && c.repairing !== taskId){
      if (c.role === 'Medic' && c.repairing && c.repairing.startsWith('healing:')) {
        c.healTarget = null;
      }
      // if they were extinguishing, clear that old task's extinguisherAssigned
      if (typeof c.repairing === 'string' && c.repairing.startsWith('extinguish:')) {
        const oldId = c.repairing.split(':')[1];
        const oldTask = tasks.find(t => t.id === oldId);
        if (oldTask && oldTask.extinguisherAssigned === c.id) oldTask.extinguisherAssigned = null;
      }
      const old = tasks.find(x=>x.id===c.repairing);
      if (old) old.assigned = null;
    }
    c.repairing = taskId;
    t.assigned = crewId;
    save();
    renderAll();
  }

  function unassignTask(taskId){
    const t = tasks.find(x=>x.id===taskId);
    if (!t) return;
    if (t.assigned){
      const c = crew.find(x=>x.id===t.assigned);
      if (c) c.repairing = null;
      t.assigned = null;
    }
    // also unassign extinguisher if present
    if (t.extinguisherAssigned){
      const c2 = crew.find(x=>x.id===t.extinguisherAssigned);
      if (c2) c2.repairing = null;
      t.extinguisherAssigned = null;
    }
    save();
    renderAll();
  }

  // Assign a crew member to extinguish a fire on a task.
  // No supplies are spent. Crew must work over time to reduce fireHealth.
  function assignCrewToExtinguish(crewId, taskId){
    const t = tasks.find(x=>x.id===taskId);
    if (!t) return;
    const fires = activeEvents.filter(e=> e.type === 'fire' && e.target === taskId);
    if (fires.length === 0){ showToast('No fire to extinguish on that task.'); return; }

    const c = crew.find(x=>x.id===crewId);
    if (!c) return;
    if (c.health <= 0){ showToast(c.name + ' is dead and cannot extinguish.'); return; }
    if (c.repairing){ showToast(c.name + ' is busy.'); return; }

    // unassign previous extinguishing if they had one
    if (t.extinguisherAssigned){
      const prev = crew.find(x=>x.id === t.extinguisherAssigned);
      if (prev) prev.repairing = null;
    }

    // set crew as extinguishing
    c.repairing = 'extinguish:' + taskId;
    t.extinguisherAssigned = c.id;

    save();
    broadcastEvent(`${c.name} assigned to extinguish ${t.title}.`);
    renderAll();
  }

  // Medic healing: request a Medic to heal a target
  function requestHeal(targetId){
    const medic = crew.find(x=>x.role==='Medic');
    if (!medic) { showToast('No medic present.'); return; }
    if (medic.health <= 0){ showToast('Medic is dead and cannot heal.'); return; }
    if (medic.repairing && medic.repairing === ('healing:' + targetId)){
      medic.repairing = null;
      medic.healTarget = null;
      renderAll();
      return;
    }
    if (medic.repairing && !medic.repairing.startsWith('healing:')){
      const oldTask = tasks.find(t => t.id === medic.repairing);
      if (oldTask) oldTask.assigned = null;
    }
    medic.repairing = 'healing:' + targetId;
    medic.healTarget = targetId;
    renderAll();
  }

  // Direct extinguish by button is deprecated; instruct player to assign crew
  async function extinguishEvent(eventId){
    const ev = activeEvents.find(e => e.id === eventId);
    if (!ev) return;
    if (ev.type !== 'fire'){ showToast('Only fires can be manually extinguished.', { red: true}); return; }
    showToast('Assign crew to extinguish (use Assign Extinguisher).', { red: true });
  }

  // Each loop tick we'll advance progress for assigned tasks and apply damage
  let lastTick = performance.now();
  let gameLoopInterval = null;

  // Auto-save throttle
  let lastAutoSave = performance.now();

  function gameTick(now){
    const dt = Math.min(0.5, (now - lastTick)/1000);
    lastTick = now;
    let anyChange = false;

    // Handle task repairs
    tasks.forEach(t=>{
      if (t.complete) return;
      if (!t.assigned) return;
      if (taskHasActiveFire(t.id)) return; // blocked while a fire exists
      const c = crew.find(x=>x.id === t.assigned);
      if (!c || c.health <= 0){
        t.assigned = null;
        if (c) c.repairing = null;
        anyChange = true;
        return;
      }
      const speed = c.repairSpeedMult * (t.eventSpeedMult || 1);
      const progressBefore = t.progress;
      t.progress += dt * speed;
      anyChange = anyChange || (Math.abs(t.progress - progressBefore) > 0.0001);

      const rawDamage = t.baseDamagePerSec * (t.eventDamageMult || 1) * DAMAGE_MULTIPLIER * dt;
      let globalExtra = 0;
      activeEvents.forEach(ev=>{
        if (ev.type === 'hullBreach'){ globalExtra += 0.6; }
        if (ev.type === 'calmWaters'){ globalExtra -= 0.3; }
      });
      const rawWithGlobal = rawDamage * (1 + globalExtra);
      const mitigated = rawWithGlobal * (1 - c.damageReduction);
      c.health -= mitigated;
      if (c.health <= 0){
        c.health = 0;
        t.assigned = null;
        c.repairing = null;
        anyChange = true;
      }

      if (t.progress >= (t.baseTime * TASK_TIME_MULT)){
        t.complete = true;
        t.progress = t.baseTime * TASK_TIME_MULT;
        const reward = Math.max(12, Math.round((t.baseTime * TASK_TIME_MULT) * 6));
        supplies += reward;
        if (t.assigned){
          const cr = crew.find(x=>x.id===t.assigned);
          if (cr) cr.repairing = null;
          t.assigned = null;
        }
        broadcastEvent(`${t.title} repaired!`);
        const evDetail = { id: t.id, title: t.title, reward: reward };
        if (typeof window.dispatchEvent === 'function') {
          window.dispatchEvent(new CustomEvent('taskCompleted', { detail: evDetail }));
        } else {
          window._queuedTaskCompletedEvents = window._queuedTaskCompletedEvents || [];
          window._queuedTaskCompletedEvents.push(evDetail);
        }
        anyChange = true;
      }
    });

    // Handle extinguishing progress by assigned extinguishers
    const extinguishers = crew.filter(c => typeof c.repairing === 'string' && c.repairing.startsWith('extinguish:') && c.health > 0);
    extinguishers.forEach(c=>{
      const taskId = c.repairing.split(':')[1];
      const t = tasks.find(x=>x.id === taskId);
      if (!t) { c.repairing = null; return; }
      const fires = activeEvents.filter(ev => ev.type === 'fire' && ev.target === taskId);
      if (fires.length === 0){
        c.repairing = null;
        if (t.extinguisherAssigned === c.id) t.extinguisherAssigned = null;
        anyChange = true;
        return;
      }
      // only work on the oldest fire event
      const ev = fires.sort((a,b)=> a.startedAt - b.startedAt)[0];
      // ensure meta defaults
      ev.meta.fireHealth = (typeof ev.meta.fireHealth === 'number') ? ev.meta.fireHealth : 100;
      ev.meta.fireMax = (typeof ev.meta.fireMax === 'number') ? ev.meta.fireMax : (ev.meta.fireHealth || 100);

      // extinguish power base (tuneable): 40 units/sec * repairSpeedMult
      const basePower = 40;
      const reduce = basePower * c.repairSpeedMult * dt;
      const before = ev.meta.fireHealth || 100;
      ev.meta.fireHealth = Math.max(0, before - reduce);
      anyChange = true;

      // FIRE now damages the extinguisher: scale with current intensity (higher intensity -> more damage)
      // Base danger when fire is full intensity
      const EXTINGUISH_DANGER_BASE = 6.0; // HP per second at full intensity
      const intensityFactor = ((ev.meta.fireHealth || 0) / (ev.meta.fireMax || 100)); // 1.0 == full intensity
      const dangerThisTick = EXTINGUISH_DANGER_BASE * intensityFactor * dt;
      // apply damage after mitigation (crew damageReduction applies)
      const damageApplied = dangerThisTick * (1 - (c.damageReduction || 0));
      c.health = Math.max(0, c.health - damageApplied);

      // If crew died while extinguishing
      if (c.health <= 0){
        c.health = 0;
        // clear assignment
        if (t.extinguisherAssigned === c.id) t.extinguisherAssigned = null;
        c.repairing = null;
        broadcastEvent(`${c.name} was incapacitated fighting the fire!`);
      }

      // when reaches zero, remove event and free crew
      if (ev.meta.fireHealth <= 0){
        removeEventById(ev.id, true);
        broadcastEvent(`${c.name} has extinguished the fire in ${t.title}.`);
        if (t.extinguisherAssigned === c.id) t.extinguisherAssigned = null;
        c.repairing = null;
      }
    });

    // ---------- Medic auto-heal behavior ----------
    const medic = crew.find(x=>x.role==='Medic');

    if (medic && (!medic.repairing) && (medic.upgrades && medic.upgrades.autoHeal > 0)){
      const allowSelfHeal = (medic.upgrades.autoHeal || 0) >= 2;
      const candidates = crew.filter(c => {
        const wounded = c.health > 0 && c.health < c.maxHealth;
        const idle = !c.repairing;
        if (!wounded || !idle) return false;
        if (c.id === medic.id) return allowSelfHeal;
        return true;
      });

      if (candidates.length > 0){
        candidates.sort((a,b)=> (a.health / a.maxHealth) - (b.health / b.maxHealth));
        const target = candidates[0];
        medic.repairing = 'healing:' + target.id;
        medic.healTarget = target.id;
        if (target.id === medic.id) {
          broadcastEvent('Medic auto-healing themself');
        } else {
          broadcastEvent('Medic auto-healing ' + target.name);
        }
        anyChange = true;
      }
    }

    // Medic healing
    if (medic && medic.repairing && medic.repairing.startsWith('healing:') && medic.healTarget){
      const target = crew.find(x=>x.id === medic.healTarget);
      if (target && target.health > 0 && target.health < target.maxHealth){
        const healAmount = (medic.healRate || MEDIC_BASE_HEAL) * dt;
        const before = target.health;
        target.health = Math.min(target.maxHealth, target.health + healAmount);
        anyChange = anyChange || (Math.abs(target.health - before) > 0.0001);
        if (target.health >= target.maxHealth - 0.0001){
          medic.repairing = null;
          medic.healTarget = null;
          broadcastEvent(`${target.name} healed to full.`);
          anyChange = true;
        }
      }
      if (target && target.health <= 0){
        medic.repairing = null;
        medic.healTarget = null;
        anyChange = true;
      }
    }

    // Update event timers, expire events
    const nowSec = Date.now() / 1000;
    for (let i = activeEvents.length - 1; i >= 0; i--){
      const ev = activeEvents[i];
      if (ev.duration > 0 && (nowSec - ev.startedAt) >= ev.duration){
        removeEventById(ev.id, false);
        anyChange = true;
      }
    }

    // Fire spread logic for Hard+ with XO suppression
    const difficulty = currentDifficultyName;
    const baseSpread = (difficulty === 'Nightmare') ? 0.06 : (difficulty === 'Hard' ? 0.02 : 0);
    let spreadBase = baseSpread;
    const xo = crew.find(c => c.id === 'xo');
    const xoSuppression = (xo && xo.fireSuppressionLevel) ? xo.fireSuppressionLevel : 0;
    spreadBase = spreadBase * Math.max(0, 1 - xoSuppression);

    if (spreadBase > 0){
      const fires = activeEvents.filter(ev => ev.type === 'fire');
      fires.forEach(ev => {
        const age = nowSec - ev.startedAt;
        if (age < 2) return;
        const spreadProb = spreadBase * dt;
        if (Math.random() < spreadProb){
          const candidates = tasks.filter(t => !t.complete && t.id !== ev.target && !taskHasActiveFire(t.id));
          if (candidates.length > 0){
            const target = candidates[Math.floor(Math.random() * candidates.length)];
            spawnEvent('fire', target.id);
            anyChange = true;
          }
        }
      });
    }

    // Check win
    if (tasks.every(t=>t.complete)){
      showVictory();
      stopLoop();
      anyChange = true;
    }

    if (anyChange) {
      scheduleRender();
      const nowMs = performance.now();
      if (nowMs - lastAutoSave >= 2000){
        save();
        lastAutoSave = nowMs;
      }
    }
  }

  function startLoop(){
    if (gameLoopInterval) return;
    lastTick = performance.now();
    lastAutoSave = performance.now();
    gameLoopInterval = setInterval(()=> gameTick(performance.now()), 120);
    scheduleNextEvent();
  }
  function stopLoop(){
    if (gameLoopInterval){ clearInterval(gameLoopInterval); gameLoopInterval = null; }
    stopNextEventTimer();
  }

  // ---------- Random Events ----------
  let eventCounter = 0;
  function spawnRandomEvent(){
    if (!eventsEnabled) return;
    const pool = getWeightedEventPool();
    const choice = pool[Math.floor(Math.random() * pool.length)];
    const evDef = EVENT_DEFS[choice];
    if (!evDef) return;

    const targetNeeded = (choice === 'fire' || choice === 'electrical');
    const possibleTargets = tasks.filter(t=>!t.complete);
    if (targetNeeded && possibleTargets.length === 0){
      spawnEvent('supplyCache', null);
    } else {
      const target = targetNeeded ? possibleTargets[Math.floor(Math.random()*possibleTargets.length)].id : null;
      spawnEvent(choice, target);
    }

    scheduleNextEvent();
  }

  function spawnEvent(type, target){
    const def = EVENT_DEFS[type];
    if (!def) return;
    const id = 'evt_' + (++eventCounter) + '_' + Date.now();
    const ev = {
      id,
      type,
      target,
      startedAt: Date.now() / 1000,
      duration: def.duration,
      meta: {}
    };
    if (type === 'fire') {
      ev.meta.fireHealth = 100;
      ev.meta.fireMax = 100;
    }
    activeEvents.push(ev);
    try {
      def.apply(Object.assign(ev.meta, { target, globalDamageBoost: 0, id: ev.id }));
    } catch(e){ console.warn('Event apply failed', e); }
    scheduleRender();
    if (def.duration === 0){
      setTimeout(()=> {
        def.revert(ev.meta);
        const idx = activeEvents.findIndex(x => x.id === ev.id);
        if (idx >= 0) activeEvents.splice(idx,1);
        scheduleRender();
      }, 500);
    }
    return ev.id;
  }

  function removeEventById(id, forced){
    const idx = activeEvents.findIndex(x => x.id === id);
    if (idx === -1) return;
    const ev = activeEvents[idx];
    const def = EVENT_DEFS[ev.type];
    if (def && def.revert){
      try { def.revert(ev.meta); } catch(e){ console.warn('Error reverting event', e); }
    }
    // If it's a fire, clear any extinguisher assignments for that task
    if (ev.type === 'fire' && ev.target){
      const t = tasks.find(x=>x.id === ev.target);
      if (t){
        // clear extinguisherAssigned and any crew.repairing referencing extinguish this task
        if (t.extinguisherAssigned){
          const c = crew.find(x=>x.id === t.extinguisherAssigned);
          if (c && c.repairing && c.repairing.startsWith('extinguish:')){
            c.repairing = null;
          }
          t.extinguisherAssigned = null;
        }
      }
    }
    activeEvents.splice(idx,1);
    save();
    scheduleRender();
  }

  function scheduleNextEvent(){
    stopNextEventTimer();
    const delay = EVENT_DELAY_MIN_MS + Math.floor(Math.random() * Math.max(0, EVENT_DELAY_MAX_MS - EVENT_DELAY_MIN_MS));
    nextEventTimer = setTimeout(()=> {
      spawnRandomEvent();
    }, delay);
  }
  function stopNextEventTimer(){
    if (nextEventTimer){ clearTimeout(nextEventTimer); nextEventTimer = null; }
  }

  // ---------- Upgrades ----------
  function calcUpgradeCost(type, currentLevel){
    const def = UPGRADES[type];
    return Math.round(def.costBase * Math.pow(1.5, currentLevel));
  }

  function purchaseUpgrade(crewId, type) {
    const purchaser = crew.find(x => x.id === crewId);
    if (!purchaser) return;
    const def = UPGRADES[type];
    if (!def) return;
    const currentLevel = purchaser.upgrades[type] || 0;
    const cost = calcUpgradeCost(type, currentLevel);
    if (supplies < cost) {
      showToast('Not enough supplies. You need ' + (cost - supplies) + ' more supplies.', { red: true });
      return;
    }

    supplies -= cost;

    if (def.applyTo === 'all') {
      crew.forEach(c => {
        c.upgrades[type] = (c.upgrades[type] || 0) + 1;
        applyCrewUpgradeStats(c);
      });
      save();
      renderAll();
      showToast(`Global upgrade purchased: ${def.name} (all crew now lvl ${crew[0].upgrades[type]})`);
    } else {
      purchaser.upgrades[type] = (purchaser.upgrades[type] || 0) + 1;
      applyCrewUpgradeStats(purchaser);
      save();
      renderAll();
      renderUpgradePanelContent(purchaser);
      showToast(`${purchaser.name} bought ${def.name} (lvl ${purchaser.upgrades[type]})`);
    }
  }

  function openUpgradeFor(crewId){
    const c = crew.find(x=>x.id===crewId);
    if (!c) return;
    upgradePanel.dataset.openCrew = c.id;
    renderUpgradePanelContent(c);
  }

  // ---------- UI events ----------
  document.getElementById('btn-start') && document.getElementById('btn-start').addEventListener('click', ()=>{
    const overlay = document.getElementById('welcome-overlay');
    if (overlay) overlay.style.display = 'none';
    if (typeof supplies !== 'number' || supplies === 0) supplies = START_SUPPLIES;
    startLoop();
    renderAll();
    save();
  });

  document.getElementById('btn-reset-upgrades') && document.getElementById('btn-reset-upgrades').addEventListener('click', async ()=> { await resetUpgrades(); });

  document.getElementById('difficultySelect') && document.getElementById('difficultySelect').addEventListener('change', async (e)=>{
    const newDiff = e.target.value;
    if (document.getElementById('welcome-overlay') && document.getElementById('welcome-overlay').style.display === 'none'){
      const ok = await showConfirm('Change difficulty to ' + newDiff + '? This will immediately alter event frequency and damage.');
      if (!ok) {
        document.getElementById('difficultySelect').value = currentDifficultyName;
        return;
      }
    }
    applyDifficulty(newDiff);
    updateDifficultyDesc();
    if (document.getElementById('welcome-overlay') && document.getElementById('welcome-overlay').style.display !== 'none'){
      supplies = START_SUPPLIES;
    }
    save();
    renderAll();
  });

  function updateDifficultyDesc(){
    const sel = document.getElementById('difficultySelect');
    const desc = document.getElementById('difficultyDesc');
    const name = sel ? (sel.value || 'Normal') : currentDifficultyName;
    const p = DIFFICULTY_PRESETS[name];
    if (desc) desc.textContent = `Damage x${p.damageMultiplier}, Start supplies: ${p.startSupplies}, Event cadence: ${Math.round(p.eventDelayMinMs/1000)}–${Math.round(p.eventDelayMaxMs/1000)}s`;
  }

  function showVictory(){
      try { playWinSound(); } catch(e) { console.warn('Win sound failed', e); }
      const endOverlay = document.getElementById('end-overlay');
      if (endOverlay) endOverlay.style.display = 'flex';
      const endTitle = document.getElementById('end-title');
      const endSub = document.getElementById('end-sub');
      if (endTitle) endTitle.textContent = 'YOU SURFACED — VICTORY';
      if (endSub) endSub.textContent = 'All critical systems repaired. Supplies: ' + supplies + ' • Difficulty: ' + currentDifficultyName;
    }

  function findAvailableCrew(){
    return crew.filter(c=>c.health>0 && c.repairing==null);
  }

  // ---------- Init ----------
  function init(){
    applyDifficulty(currentDifficultyName);
    updateDifficultyDesc();
    loadSave();
    crew.forEach(c => applyCrewUpgradeStats(c));
    renderAll();
    if (document.getElementById('welcome-overlay') && document.getElementById('welcome-overlay').style.display === 'none'){
      startLoop();
    }
    window.addEventListener('keydown', (e)=>{
      if (e.key.toLowerCase() === 'h'){
        const o = document.getElementById('welcome-overlay');
        if (o) o.style.display = (o.style.display === 'none' || !o.style) ? 'flex' : 'none';
      }
    });
  }

  crew.forEach(c => applyCrewUpgradeStats(c));
  init();

  // Expose some functions for debugging in console
  window.__SUB_DEMO = { crew, tasks, save, resetUpgrades, assignCrewToTask, unassignTask, requestHeal, activeEvents, spawnRandomEvent, applyDifficulty, DIFFICULTY_PRESETS };

})();