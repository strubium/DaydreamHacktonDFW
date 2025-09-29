

    (function(){
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
        { id:'xo', name:'John (XO)', role:'XO', health:100, maxHealth:100, repairing:null, repairSpeedMult:1.0, damageReduction:0.0, upgrades: {speed:0, armor:0, med:0, autoHeal:0, engineer:0} },
        // Engineer (Gabe) — has an engineer-specific upgrade slot
        { id:'eo', name:'Gabe (EO)', role:'Engineer', health:90, maxHealth:100, repairing:null, repairSpeedMult:1.6, damageReduction:0.0, upgrades: {speed:0, armor:0, med:0, autoHeal:0, engineer:0} },
        { id:'med', name:'Rin (Medic)', role:'Medic', health:100, maxHealth:100, repairing:null, repairSpeedMult:1.0, damageReduction:0.0, healRate:MEDIC_BASE_HEAL, upgrades: {speed:0, armor:0, med:0, autoHeal:0, engineer:0}, healTarget:null },
      ];

      // tasks (we will multiply baseTime by TASK_TIME_MULT when using)
      const tasks = [
        { id:'hull', title:'Hull Breach', baseTime: 57.0, progress:20, assigned:null, baseDamagePerSec:1.5, complete:false, eventDamageMult:1.0, eventSpeedMult:0.3, events:[] },
        { id:'flood', title:'Flooding', baseTime: 24.0, progress:0, assigned:null, baseDamagePerSec:1, complete:false, eventDamageMult:1.0, eventSpeedMult:0.6, events:[] },
        { id:'reactor', title:'Reactor Room', baseTime: 16.0, progress:0, assigned:null, baseDamagePerSec:6.5, complete:false, eventDamageMult:1.0, eventSpeedMult:1.0, events:[] },
        { id:'command', title:'Command Systems', baseTime: 14.0, progress:0, assigned:null, baseDamagePerSec:5.0, complete:false, eventDamageMult:1.0, eventSpeedMult:1.0, events:[] },
        { id:'sonar', title:'Sonar Array', baseTime: 12.0, progress:0, assigned:null, baseDamagePerSec:3.5, complete:false, eventDamageMult:1.0, eventSpeedMult:1.0, events:[] },
        { id:'comms', title:'Communications', baseTime: 10.0, progress:0, assigned:null, baseDamagePerSec:2.5, complete:false, eventDamageMult:1.0, eventSpeedMult:1.0, events:[] },
      ];

      // Upgrade definitions (added autoHeal + engineer-only)
      const UPGRADES = {
        speed: {
          name: 'Tool Kit',
          description: 'Increase repair speed by 10% per level.',
          costBase: 20,
          effectPerLevel: 0.10
        },
        armor: {
          name: 'Reinforced Suit',
          description: 'Reduce damage taken while repairing by 8% per level.',
          costBase: 25,
          effectPerLevel: 0.08
        },
        med: {
          name: 'Med Training',
          description: 'Increase Medic healing rate by +50% of base per level (applies to Medic only).',
          costBase: 30,
          effectPerLevel: 0.5
        },
        autoHeal: {
          name: 'Auto-Heal Module',
          description: 'When equipped on the Medic, they will automatically heal idle crew members when the Medic is not doing anything. (Medic must be alive and idle.)',
          costBase: 40,
          effectPerLevel: 0 // effect is binary: level > 0 enables auto-heal; higher levels may be used for future enhancements
        },
        // --- Engineer-only upgrade ---
        engineer: {
          name: 'Field Expertise',
          description: 'Engineers gain +25% repair speed per level (stacks with Tool Kit). Exclusive to the Engineer.',
          costBase: 35,
          effectPerLevel: 0.25
        }
      };

      // Random event system state
      const activeEvents = []; // { id, type, target, startedAt, duration, meta }
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
            // immediate burst to each alive crew; and apply global extra damage multiplier
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
            // nothing special beyond removing global boost
            broadcastEvent('Hull breach sealed.');
          }
        },
        fire: {
          id: 'fire',
          name: 'Fire',
          description: 'A fire has started in a system — increases damage taken and slows repairs. Can be extinguished (costs supplies).',
          duration: 18,
          apply(meta){
            // target is a task id
            const t = tasks.find(x=>x.id === meta.target);
            if (!t) return;
            // increase task damage and slow speed
            t.eventDamageMult = (t.eventDamageMult || 1) * 1.6;
            t.eventSpeedMult = (t.eventSpeedMult || 1) * 0.6; // repairs 40% slower
            t.events.push(meta);
            broadcastEvent(`Fire in ${t.title}! Extinguish with supplies or wait.`);
          },
          revert(meta){
            const t = tasks.find(x=>x.id === meta.target);
            if (!t) return;
            // remove this specific event from t.events and recalc multipliers by recomputing from remaining events
            t.events = (t.events || []).filter(e=> e.id !== meta.id);
            // recompute multipliers
            let dmg = 1, spd = 1;
            t.events.forEach(e=>{
              if (e.type === 'fire'){ dmg *= 1.6; spd *= 0.6; }
              if (e.type === 'electrical') dmg *= 1.5;
            });
            t.eventDamageMult = dmg;
            t.eventSpeedMult = spd;
            broadcastEvent(`${t.title} fire extinguished (or burned out).`);
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
            // no-op
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
        // create a temporary notification in the event log
        const log = document.getElementById('eventLog');
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
            document.getElementById('difficultySelect').value = currentDifficultyName;
          }
          if (parsed.supplies !== undefined) supplies = parsed.supplies;
          // if no supplies found in save, use starting supplies for difficulty
          if (typeof supplies !== 'number') supplies = START_SUPPLIES;

          if (parsed.crew){
            for (const saved of parsed.crew){
              const c = crew.find(x => x.id === saved.id);
              if (c && saved.upgrades){
                c.upgrades = Object.assign({ speed:0, armor:0, med:0, autoHeal:0, engineer:0 }, saved.upgrades);
                applyCrewUpgradeStats(c);
              }
            }
          }
          if (parsed.tasks){
            for (const saved of parsed.tasks){
              const t = tasks.find(x => x.id === saved.id);
              if (t){
                t.progress = (typeof saved.progress === 'number') ? saved.progress : t.progress;
                t.complete = !!saved.complete;
                if (t.complete) t.progress = t.baseTime;
              }
            }
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
            tasks: tasks.map(t => ({ id: t.id, progress: t.progress, complete: t.complete }))
          };
          localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        }catch(e){
          console.warn('Save failed', e);
        }
      }

      function resetUpgrades(){
        if (!confirm('Reset all saved upgrades and supplies?')) return;
        localStorage.removeItem(SAVE_KEY);
        // reset to difficulty start supplies
        supplies = START_SUPPLIES;
        crew.forEach(c => { c.upgrades = {speed:0, armor:0, med:0, autoHeal:0, engineer:0}; applyCrewUpgradeStats(c); c.health=c.maxHealth; c.repairing=null; c.healTarget=null; });
        tasks.forEach(t => { t.progress=0; t.assigned=null; t.complete=false; t.eventDamageMult=1; t.eventSpeedMult=1; t.events=[]; });
        activeEvents.length = 0;
        stopNextEventTimer();
        scheduleNextEvent();
        renderAll();
        save();
      }

      // Update crew's derived stats from upgrades
      function applyCrewUpgradeStats(c){
        // base speed from global "Tool Kit"
        const globalSpeedFromToolKit = (c.upgrades.speed || 0) * UPGRADES.speed.effectPerLevel;
        // engineer-specific extra speed
        const engineerBonus = (c.role === 'Engineer') ? ((c.upgrades.engineer || 0) * UPGRADES.engineer.effectPerLevel) : 0;
        c.repairSpeedMult = 1 + globalSpeedFromToolKit + engineerBonus;

        // damage reduction from armor upgrades
        c.damageReduction = Math.min(0.9, (c.upgrades.armor || 0) * UPGRADES.armor.effectPerLevel);

        if (c.role === 'Medic'){
          const lvl = (c.upgrades.med || 0);
          c.healRate = MEDIC_BASE_HEAL * (1 + lvl * UPGRADES.med.effectPerLevel);
          c.autoHealLevel = (c.upgrades.autoHeal || 0);
        } else {
          c.healRate = 0;
          c.autoHealLevel = (c.upgrades.autoHeal || 0);
        }
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
        document.getElementById('currentDifficulty').textContent = name;
        if (persistUI) {
          document.getElementById('difficultySelect').value = name;
        }
      }

      // helper: build weighted event pool based on EVENT_WEIGHTS
      function getWeightedEventPool(){
        const pool = [];
        for (const key in EVENT_DEFS){
          const weight = (EVENT_WEIGHTS && EVENT_WEIGHTS[key] !== undefined) ? EVENT_WEIGHTS[key] : 1;
          const count = Math.max(0, Math.round(weight * 10)); // scale to integer counts
          for (let i=0;i<count;i++) pool.push(key);
        }
        // fallback
        if (pool.length === 0) pool.push('supplyCache','fire','electrical');
        return pool;
      }

      // ---------- Rendering ----------
      const crewContainer = document.getElementById('crewContainer');
      const tasksContainer = document.getElementById('tasksContainer');
      const upgradePanel = document.getElementById('upgradePanel');
      const suppliesLabel = document.getElementById('supplies');

      // --- start: scheduled render helper ---
      let renderScheduled = false;

      function isUserInteracting() {
        const active = document.activeElement;
        if (!active) return false;
        // ignore page-level focus
        if (active === document.body || active === document.documentElement) return false;
        // if the focused element lives inside those containers, consider user is interacting
        return crewContainer.contains(active) || tasksContainer.contains(active) || upgradePanel.contains(active);
      }

      /**
       * scheduleRender() - call this instead of renderAll() from non-user-initiated code (game ticks, events).
       * It uses requestAnimationFrame, but if the user is interacting it postpones slightly to avoid stomping the input.
       */
      function scheduleRender(delayMs = 0) {
        if (renderScheduled) return;
        renderScheduled = true;

        const run = () => {
          renderScheduled = false;
          // if the user is interacting (select/input focused) postpone a bit rather than re-render now
          if (isUserInteracting()) {
            // try again shortly so player input isn't lost
            setTimeout(scheduleRender, 150);
            return;
          }
          renderAll();
        };

        if (delayMs > 0) {
          setTimeout(() => requestAnimationFrame(run), delayMs);
        } else {
          requestAnimationFrame(run);
        }
      }
      // --- end: scheduled render helper ---

    let deadCrewIds = new Set();

    function renderCrew() {
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

        // Avatar background
        const avatarBg = isDead
          ? '#330000'
          : isWorking
            ? 'linear-gradient(90deg,var(--accent),#1f7fb0)'
            : '#081018';

        const el = document.createElement('div');
        el.className = 'crew';

        // style box
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

        el.innerHTML = `
          <div style="width:52px;height:52px;border-radius:8px;background:${avatarBg};display:flex;align-items:center;justify-content:center;font-weight:700">
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
                ${isDead ? 'Unavailable' : `Speed x${c.repairSpeedMult.toFixed(2)} • Damage reduction ${(c.damageReduction*100).toFixed(0)}%`}
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
          </div>
        `;
        crewContainer.appendChild(el);
      });

      suppliesLabel.textContent = supplies;

      // attach events only for alive crew
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

      function renderTasks(){
        tasksContainer.innerHTML = '';
        tasks.forEach(t=>{
          const assignedName = t.assigned ? (crew.find(c=>c.id===t.assigned)?.name || 'Unknown') : '—';
          // compute percent using TASK_TIME_MULT effect: progress is stored in 'seconds progressed' against baseTime * TASK_TIME_MULT
          const percent = Math.min(100, Math.round((t.progress / (t.baseTime * TASK_TIME_MULT))*100));
          const completed = t.complete;

          // prepare event summary for display
          const eventBadges = (t.events || []).map(e=> {
            if (e.type === 'fire') return `<span style="color:${'var(--danger)'};font-weight:700">FIRE</span>`;
            if (e.type === 'electrical') return `<span style="color:#ffc857;font-weight:700">E-Surge</span>`;
            return `<span>${e.type}</span>`;
          }).join(' ');

          const taskEl = document.createElement('div');
          taskEl.className = 'task';
          taskEl.innerHTML = `
            <div style="width:12px;height:12px;border-radius:3px;background:${completed? 'var(--good)' : (t.assigned? '#ffc857' : '#444')};"></div>
            <div class="info">
              <div style="display:flex;justify-content:space-between">
                <div><strong>${t.title}</strong></div>
                <div class="small-muted">${(t.baseTime * TASK_TIME_MULT).toFixed(0)}s base</div>
              </div>
              <div style="margin-top:8px">
                <div class="repair-bar"><i style="width:${percent}%"></i></div>
              </div>
              <div style="margin-top:6px" class="small-muted">Assigned: <strong>${assignedName}</strong> • Damage/sec: ${(t.baseDamagePerSec * (t.eventDamageMult || 1)).toFixed(2)} ${eventBadges ? '• ' + eventBadges : ''}</div>
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
                ${ (t.events || []).some(e=> e.type === 'fire') ? `<div style="margin-top:6px"><button class="small" data-action="extinguish" data-id="${t.id}">Extinguish (10 supplies)</button></div>` : '' }
              </div>
            </div>
          `;
          tasksContainer.appendChild(taskEl);
        });

        // attach listeners
        tasksContainer.querySelectorAll('[data-action="assign"]').forEach(sel=>{
          sel.onchange = ()=> {
            const taskId = sel.dataset.id;
            const crewId = sel.value || null;
            assignCrewToTask(crewId, taskId);
          }
        });
        tasksContainer.querySelectorAll('[data-action="fastAssign"]').forEach(btn=>{
          btn.onclick = ()=> {
            // quick assign the healthiest alive crew who is not the Medic or is allowed
            const tId = btn.dataset.id;
            const candidates = crew.filter(c=>c.health>0 && c.repairing==null);
            if (candidates.length===0) { alert('No available crew alive to assign'); return; }
            candidates.sort((a,b)=>b.health - a.health);
            assignCrewToTask(candidates[0].id, tId);
            renderTasks();
            renderCrew();
          }
        });
        tasksContainer.querySelectorAll('[data-action="cancel"]').forEach(btn=>{
          btn.onclick = ()=> {
            const tId = btn.dataset.id;
            unassignTask(tId);
          }
        });
        tasksContainer.querySelectorAll('[data-action="extinguish"]').forEach(btn=>{
          btn.onclick = ()=> {
            const tId = btn.dataset.id;
            extinguishFireOnTask(tId);
          }
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
  el.innerHTML = '';

  // Reverse chronological order
  activeEvents.slice().reverse().forEach(ev => {
    const rem = Math.max(0, Math.round(ev.duration - ((Date.now() / 1000) - ev.startedAt)));
    const badge = document.createElement('div');
    badge.className = 'event-badge ' +
      (ev.type === 'fire' || ev.type === 'hullBreach' ? 'event-danger' :
       (ev.type === 'calmWaters' ? 'event-good' : 'event-muted'));

    const icon = EVENT_ICONS[ev.type] || '❔';
    const targetText = ev.target ? (' — ' + (tasks.find(t => t.id === ev.target)?.title || ev.target)) : '';

    badge.innerHTML = `
      <span class="icon">${icon}</span>
      <div>
        <strong>${EVENT_DEFS[ev.type].name}</strong>${targetText}
        ${ev.duration > 0 ? `<div class="small-muted">(${rem}s)</div>` : ''}
      </div>
    `;

    // Add extinguish button for fire events
    if (ev.type === 'fire') {
      const btn = document.createElement('button');
      btn.className = 'small';
      btn.textContent = 'Extinguish (10)';
      btn.onclick = (e) => { e.stopPropagation(); extinguishEvent(ev.id); };
      badge.appendChild(btn);
    }

    el.appendChild(badge);
  });
}


function renderUpgradePanelContent(selectedCrew) {
    if (!selectedCrew) {
        upgradePanel.innerHTML = `<p class="small-muted">Select a crew to view/purchase upgrades.</p>`;
        return;
    }

    const c = selectedCrew;

    // Engineer-only UI block
    const engineerUpgradesHTML = c.role === 'Engineer' ? `
        <div class="upgrade">
            <div>
                <div style="font-weight:700">${UPGRADES.engineer.name} (Level ${c.upgrades.engineer})</div>
                <div class="small-muted">${UPGRADES.engineer.description}</div>
            </div>
            <div style="text-align:right">
                <div class="small-muted">Cost: <span class="stat">${calcUpgradeCost('engineer', c.upgrades.engineer)}</span></div>
                <div style="margin-top:8px">
                    <button data-action="buy" data-id="${c.id}" data-type="engineer">Buy</button>
                </div>
            </div>
        </div>
    ` : '';

    // Only show medic upgrades if the crew member is a Medic
    const medUpgradesHTML = c.role === 'Medic' ? `
        <div class="upgrade">
            <div>
                <div style="font-weight:700">${UPGRADES.med.name} (Level ${c.upgrades.med})</div>
                <div class="small-muted">${UPGRADES.med.description}</div>
            </div>
            <div style="text-align:right">
                <div class="small-muted">Cost: <span class="stat">${calcUpgradeCost('med', c.upgrades.med)}</span></div>
                <div style="margin-top:8px">
                    <button data-action="buy" data-id="${c.id}" data-type="med">Buy</button>
                </div>
            </div>
        </div>

        <div class="upgrade">
            <div>
                <div style="font-weight:700">${UPGRADES.autoHeal.name} (Level ${c.upgrades.autoHeal})</div>
                <div class="small-muted">${UPGRADES.autoHeal.description}</div>
            </div>
            <div style="text-align:right">
                <div class="small-muted">Cost: <span class="stat">${calcUpgradeCost('autoHeal', c.upgrades.autoHeal)}</span></div>
                <div style="margin-top:8px">
                    <button data-action="buy" data-id="${c.id}" data-type="autoHeal">Buy</button>
                </div>
            </div>
        </div>
    ` : '';

    upgradePanel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center">
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
            <div class="upgrade">
                <div>
                    <div style="font-weight:700">${UPGRADES.speed.name} (Level ${c.upgrades.speed})</div>
                    <div class="small-muted">${UPGRADES.speed.description}</div>
                </div>
                <div style="text-align:right">
                    <div class="small-muted">Cost: <span class="stat">${calcUpgradeCost('speed', c.upgrades.speed)}</span></div>
                    <div style="margin-top:8px">
                        <button data-action="buy" data-id="${c.id}" data-type="speed">Buy</button>
                    </div>
                </div>
            </div>

            <div class="upgrade">
                <div>
                    <div style="font-weight:700">${UPGRADES.armor.name} (Level ${c.upgrades.armor})</div>
                    <div class="small-muted">${UPGRADES.armor.description}</div>
                </div>
                <div style="text-align:right">
                    <div class="small-muted">Cost: <span class="stat">${calcUpgradeCost('armor', c.upgrades.armor)}</span></div>
                    <div style="margin-top:8px">
                        <button data-action="buy" data-id="${c.id}" data-type="armor">Buy</button>
                    </div>
                </div>
            </div>

            ${medUpgradesHTML}
            ${engineerUpgradesHTML}
        </div>

        <div style="margin-top:12px" class="small-muted">
            Current: Speed x${c.repairSpeedMult.toFixed(2)} • Damage reduction ${(c.damageReduction*100).toFixed(0)}%
            ${c.role === 'Medic' ? '• Heal rate: ' + (c.healRate || 0).toFixed(2) + ' HP/s' + (c.upgrades.autoHeal ? ' • Auto-Heal: ON' : '') : ''}
            ${c.role === 'Engineer' ? ' • Field Expertise lvl: ' + (c.upgrades.engineer || 0) : ''}
        </div>
    `;

    upgradePanel.querySelectorAll('[data-action="buy"]').forEach(btn => {
        btn.onclick = () => {
            const crewId = btn.dataset.id;
            const type = btn.dataset.type;
            purchaseUpgrade(crewId, type);
        };
    });
}


      function renderAll(){
        renderCrew();
        renderTasks();
        renderEventList();
        // keep upgrade panel in sync if a crew is open
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
        // unassign previous
        if (t.assigned && t.assigned !== crewId){
          const prev = crew.find(c=>c.id===t.assigned);
          if (prev) prev.repairing = null;
        }
        if (!crewId){
          t.assigned = null;
          save(); // persist unassignment
          renderAll();
          return;
        }
        const c = crew.find(x=>x.id===crewId);
        if (!c) return;
        if (c.health <= 0){
          alert(c.name + ' is dead and cannot be assigned.');
          return;
        }
        // if crew was doing something else, unassign old task
        if (c.repairing && c.repairing !== taskId){
          // if they were healing someone, clear heal target if medic
          if (c.role === 'Medic' && c.repairing && c.repairing.startsWith('healing:')) {
            c.healTarget = null;
          }
          const old = tasks.find(x=>x.id===c.repairing);
          if (old) old.assigned = null;
        }
        c.repairing = taskId;
        t.assigned = crewId;
        save(); // persist assignment change
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
        save(); // persist unassignment
        renderAll();
      }

      // Medic healing: request a Medic to heal a target
      function requestHeal(targetId){
        const medic = crew.find(x=>x.role==='Medic');
        if (!medic) { alert('No medic present.'); return; }
        if (medic.health <= 0){ alert('Medic is dead and cannot heal.'); return; }
        // Toggle heal: if medic already healing this target, stop
        if (medic.repairing && medic.repairing === ('healing:' + targetId)){
          medic.repairing = null;
          medic.healTarget = null;
          renderAll();
          return;
        }
        // if medic is busy repairing a system, unassign them from that and assign to healing
        if (medic.repairing && !medic.repairing.startsWith('healing:')){
          // find old task and clear it
          const oldTask = tasks.find(t => t.id === medic.repairing);
          if (oldTask) oldTask.assigned = null;
        }
        medic.repairing = 'healing:' + targetId;
        medic.healTarget = targetId;
        renderAll();
      }

      // Extinguish fire on a task by spending supplies
      function extinguishFireOnTask(taskId){
        const t = tasks.find(x=>x.id===taskId);
        if (!t) return;
        // find fire event(s)
        const fires = activeEvents.filter(e=> e.type === 'fire' && e.target === taskId);
        if (fires.length === 0) return;
        const cost = 10;
        if (supplies < cost){ alert('Not enough supplies to extinguish (need ' + cost + ')'); return; }
        if (!confirm('Spend ' + cost + ' supplies to extinguish the fire on ' + t.title + '?')) return;
        supplies -= cost;
        // remove all fire events on that task now
        fires.forEach(f => removeEventById(f.id, true));
        save();
        renderAll();
      }

      // Extinguish an event by id (used by event UI)
      function extinguishEvent(eventId){
        const ev = activeEvents.find(e => e.id === eventId);
        if (!ev) return;
        if (ev.type !== 'fire'){ alert('Only fires can be manually extinguished.'); return; }
        const cost = 10;
        if (supplies < cost){ alert('Not enough supplies to extinguish (need ' + cost + ')'); return; }
        if (!confirm('Spend ' + cost + ' supplies to extinguish the fire?')) return;
        supplies -= cost;
        removeEventById(eventId, true);
        save();
        renderAll();
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
          const c = crew.find(x=>x.id === t.assigned);
          if (!c || c.health <= 0){
            // unassign if assigned crew is dead or missing
            t.assigned = null;
            if (c) c.repairing = null;
            anyChange = true;
            return;
          }
          // advance progress: speed affected by crew multiplier and task event speed multiplier
          const speed = c.repairSpeedMult * (t.eventSpeedMult || 1);
          const progressBefore = t.progress;
          // progress is measured against baseTime * TASK_TIME_MULT
          t.progress += dt * speed;
          anyChange = anyChange || (Math.abs(t.progress - progressBefore) > 0.0001);

          // apply damage to crew (increased damage globally and task event multipliers)
          const rawDamage = t.baseDamagePerSec * (t.eventDamageMult || 1) * DAMAGE_MULTIPLIER * dt;
          // global event modifiers (e.g., hull breach or calm waters)
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
            // repair stops if crew dies
            t.assigned = null;
            c.repairing = null;
            anyChange = true;
          }

          // mark complete
          // compare progress against baseTime * TASK_TIME_MULT
          if (t.progress >= (t.baseTime * TASK_TIME_MULT)){
            t.complete = true;
            t.progress = t.baseTime * TASK_TIME_MULT;
            // reward supplies
            const reward = Math.max(12, Math.round((t.baseTime * TASK_TIME_MULT) * 6)); // scaled with longer times and difficulty
            supplies += reward;
            // unassign crew
            if (t.assigned){
              const cr = crew.find(x=>x.id===t.assigned);
              if (cr) cr.repairing = null;
              t.assigned = null;
            }
            broadcastEvent(`${t.title} repaired!`);

            // Task complete sound
            const evDetail = { id: t.id, title: t.title, reward: reward };
              // If the sound script is loaded, this will fire and the listener plays immediately.
              // If the sound script hasn't loaded yet, queue it so the sound script can pick it up on init.
              if (typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new CustomEvent('taskCompleted', { detail: evDetail }));
              } else {
                // extremely unlikely fallback: queue
                window._queuedTaskCompletedEvents = window._queuedTaskCompletedEvents || [];
                window._queuedTaskCompletedEvents.push(evDetail);
              }

            anyChange = true;
          }
        });

        // ---------- Medic auto-heal behavior (updated) ----------
        const medic = crew.find(x=>x.role==='Medic');

        // If Medic is idle and has AutoHeal upgrade, find an idle wounded crew and start healing them
        if (medic && (!medic.repairing) && (medic.upgrades && medic.upgrades.autoHeal > 0)){
          // allow medic to auto-heal themself if autoHeal level is 2 or more
          const allowSelfHeal = (medic.upgrades.autoHeal || 0) >= 2;

          // find idle wounded crew (include medic if allowSelfHeal)
          const candidates = crew.filter(c => {
            const wounded = c.health > 0 && c.health < c.maxHealth;
            const idle = !c.repairing;
            if (!wounded || !idle) return false;
            if (c.id === medic.id) return allowSelfHeal;
            return true;
          });

          if (candidates.length > 0){
            // pick the lowest-health idle crew (relative percent)
            candidates.sort((a,b)=> (a.health / a.maxHealth) - (b.health / b.maxHealth));
            const target = candidates[0];
            medic.repairing = 'healing:' + target.id;
            medic.healTarget = target.id;
            // message differs when medic heals themself
            if (target.id === medic.id) {
              broadcastEvent(`Medic auto-healing themself`);
            } else {
              broadcastEvent(`Medic auto-healing ${target.name}`);
            }
            anyChange = true;
          }
        }

        // Handle medic healing
        if (medic && medic.repairing && medic.repairing.startsWith('healing:') && medic.healTarget){
          const target = crew.find(x=>x.id === medic.healTarget);
          // medic healing does not take place inside dangerous area (medic can stay back)
          if (target && target.health > 0 && target.health < target.maxHealth){
            const healAmount = (medic.healRate || MEDIC_BASE_HEAL) * dt;
            const before = target.health;
            target.health = Math.min(target.maxHealth, target.health + healAmount);
            anyChange = anyChange || (Math.abs(target.health - before) > 0.0001);
            // Auto-stop healing when target reaches full health (new)
            if (target.health >= target.maxHealth - 0.0001){
              medic.repairing = null;
              medic.healTarget = null;
              broadcastEvent(`${target.name} healed to full.`);
              anyChange = true;
            }
          }
          // if target is dead, stop healing
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
            // expire
            removeEventById(ev.id, false);
            anyChange = true;
          }
        }

        // Check win
        if (tasks.every(t=>t.complete)){
          showVictory();
          stopLoop();
          anyChange = true;
        }

        if (anyChange) {
          // use scheduled render so we don't stomp user input if they're interacting
          scheduleRender();

          // Auto-save throttled to roughly every 2 seconds
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
        // choose candidate set using weighted pool
        const pool = getWeightedEventPool();
        const choice = pool[Math.floor(Math.random() * pool.length)];
        const evDef = EVENT_DEFS[choice];
        if (!evDef) return;

        const targetNeeded = (choice === 'fire' || choice === 'electrical');
        const possibleTargets = tasks.filter(t=>!t.complete);
        if (targetNeeded && possibleTargets.length === 0){
          // fallback to supply cache
          spawnEvent('supplyCache', null);
        } else {
          const target = targetNeeded ? possibleTargets[Math.floor(Math.random()*possibleTargets.length)].id : null;
          spawnEvent(choice, target);
        }

        // schedule next
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
        activeEvents.push(ev);
        // apply immediately
        def.apply(Object.assign(ev.meta, { target, globalDamageBoost: 0 }));
        // use scheduled render so we don't steal focus if player is interacting
        scheduleRender();
        // if event has 0 duration, remove immediately after apply (but keep notification)
        if (def.duration === 0){
          setTimeout(()=> {
            def.revert(ev.meta);
            // remove from active events
            const idx = activeEvents.findIndex(x => x.id === ev.id);
            if (idx >= 0) activeEvents.splice(idx,1);
            // use scheduled render
            scheduleRender();
          }, 500);
        }
      }

      function removeEventById(id, forced){
        const idx = activeEvents.findIndex(x => x.id === id);
        if (idx === -1) return;
        const ev = activeEvents[idx];
        const def = EVENT_DEFS[ev.type];
        if (def && def.revert){
          try { def.revert(ev.meta); } catch(e){ console.warn('Error reverting event', e); }
        }
        activeEvents.splice(idx,1);
        // save event removal (so any state changes that affect tasks get persisted)
        save();
        // use scheduled render to avoid stomping input
        scheduleRender();
      }

      function scheduleNextEvent(){
        stopNextEventTimer();
        // random between configured min/max
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

      function purchaseUpgrade(crewId, type){
        const c = crew.find(x=>x.id===crewId);
        if (!c) return;
        const cost = calcUpgradeCost(type, c.upgrades[type]);
        if (supplies < cost){
          alert('Not enough supplies. You need ' + cost + ' supplies.');
          return;
        }
        supplies -= cost;
        c.upgrades[type] = (c.upgrades[type] || 0) + 1;
        applyCrewUpgradeStats(c);
        save();
        renderAll();
        renderUpgradePanelContent(c);
      }

      function openUpgradeFor(crewId){
        const c = crew.find(x=>x.id===crewId);
        if (!c) return;
        upgradePanel.dataset.openCrew = c.id;
        renderUpgradePanelContent(c);
      }

      // ---------- UI events ----------
      document.getElementById('btn-start').addEventListener('click', ()=>{
        const overlay = document.getElementById('welcome-overlay');
        overlay.style.display = 'none';
        // ensure supplies default is set to START_SUPPLIES if not loaded from save
        if (typeof supplies !== 'number' || supplies === 0) supplies = START_SUPPLIES;
        startLoop();
        renderAll();
        save();
      });
      document.getElementById('btn-reset-upgrades').addEventListener('click', resetUpgrades);

      document.getElementById('difficultySelect').addEventListener('change', (e)=>{
        const newDiff = e.target.value;
        // if game already started, confirm change (applies immediately if confirmed)
        if (document.getElementById('welcome-overlay').style.display === 'none'){
          if (!confirm('Change difficulty to ' + newDiff + '? This will immediately alter event frequency and damage.')) {
            // revert select
            document.getElementById('difficultySelect').value = currentDifficultyName;
            return;
          }
        }
        applyDifficulty(newDiff);
        // update description box
        updateDifficultyDesc();
        // update supplies if welcome overlay present and no saved supplies
        if (document.getElementById('welcome-overlay').style.display !== 'none'){
          supplies = START_SUPPLIES;
        }
        save();
        renderAll();
      });

      function updateDifficultyDesc(){
        const sel = document.getElementById('difficultySelect');
        const desc = document.getElementById('difficultyDesc');
        const name = sel.value || 'Normal';
        const p = DIFFICULTY_PRESETS[name];
        desc.textContent = `Damage x${p.damageMultiplier}, Start supplies: ${p.startSupplies}, Event cadence: ${Math.round(p.eventDelayMinMs/1000)}–${Math.round(p.eventDelayMaxMs/1000)}s`;
      }

      // end overlay / victory
      function showVictory(){
          try { playWinSound(); } catch(e) { console.warn('Win sound failed', e); }
          document.getElementById('end-overlay').style.display = 'flex';
          document.getElementById('end-title').textContent = 'YOU SURFACED — VICTORY';
          document.getElementById('end-sub').textContent = 'All critical systems repaired. Supplies: ' + supplies + ' • Difficulty: ' + currentDifficultyName;
        }


      // quick utility: fast assign by id (used by "Quick" button)
      function findAvailableCrew(){
        return crew.filter(c=>c.health>0 && c.repairing==null);
      }

      // ---------- Init ----------
      function init(){
        // apply saved or default difficulty first
        applyDifficulty(currentDifficultyName);
        updateDifficultyDesc();

        // load saves (this may override supplies and difficulty)
        loadSave();

        // ensure crew stats reflect upgrades
        crew.forEach(c => applyCrewUpgradeStats(c));
        renderAll();

        // start the loop only when the user clicks Start (via welcome overlay)
        if (document.getElementById('welcome-overlay').style.display === 'none'){
          startLoop();
        }

        // keyboard: H to toggle welcome overlay for testing
        window.addEventListener('keydown', (e)=>{
          if (e.key.toLowerCase() === 'h'){
            const o = document.getElementById('welcome-overlay');
            o.style.display = (o.style.display === 'none' || !o.style.display) ? 'flex' : 'none';
          }
        });
      }

      // safety: make sure stats are applied
      crew.forEach(c => applyCrewUpgradeStats(c));

      // run init
      init();

      // Expose some functions for debugging in console
      window.__SUB_DEMO = { crew, tasks, save, resetUpgrades, assignCrewToTask, unassignTask, requestHeal, activeEvents, spawnRandomEvent, applyDifficulty, DIFFICULTY_PRESETS };

    })();