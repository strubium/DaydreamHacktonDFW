const audioContext = new (window.AudioContext || window.webkitAudioContext)();

let waterBuffer, musicBuffer;

let clickBuffer = null;

function createClickBuffer() {
  const sr = audioContext.sampleRate;
  const dur = 0.035; // 35ms click
  const len = Math.floor(sr * dur);
  const buf = audioContext.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  // white-noise burst with quick decay
  for (let i = 0; i < len; i++) {
    const env = 1 - (i / len); // linear decay
    data[i] = (Math.random() * 2 - 1) * env * 0.6; // scale down amplitude
  }
  return buf;
}

function playClick() {
  // ensure AudioContext is running (some browsers require user gesture)
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(()=>{ /* ignore */ });
  }

  if (!clickBuffer) clickBuffer = createClickBuffer();

  const src = audioContext.createBufferSource();
  src.buffer = clickBuffer;

  const gain = audioContext.createGain();
  const t = audioContext.currentTime;

  // quick envelope for a tight click
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(0.6, t + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);

  src.connect(gain).connect(audioContext.destination);
  src.start(t);
  // stop after buffer length + small margin
  src.stop(t + 0.06);
}

function playWinSound() {
  // ensure context running
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(()=>{});
  }

  const now = audioContext.currentTime;
  // master gain for overall shaping (short swell + decay)
  const master = audioContext.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.linearRampToValueAtTime(0.9, now + 0.04);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
  master.connect(audioContext.destination);

  // bright arpeggio notes (C5, E5, G5)
  const freqs = [523.25, 659.25, 783.99];
  freqs.forEach((freq, i) => {
    const start = now + i * 0.12; // stagger notes slightly
    const osc = audioContext.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);

    // small note gain with per-note envelope
    const g = audioContext.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(0.6, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 1.6);

    // gentle detuned saw layer for warmth (optional)
    const osc2 = audioContext.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(freq * 0.9995, start); // tiny detune
    const g2 = audioContext.createGain();
    g2.gain.setValueAtTime(0.0001, start);
    g2.gain.linearRampToValueAtTime(0.14, start + 0.02);
    g2.gain.exponentialRampToValueAtTime(0.0001, start + 1.6);

    // connect and play
    osc.connect(g).connect(master);
    osc2.connect(g2).connect(master);
    osc.start(start);
    osc.stop(start + 1.7);
    osc2.start(start);
    osc2.stop(start + 1.7);
  });
}

// play on any button click (delegated)
document.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.disabled) return;
  // suppress clicks on elements with data-no-click attribute
  if (btn.closest('[data-no-click]')) return;
  playClick();
});

    // Load audio file
    async function loadAudio(url) {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        return await audioContext.decodeAudioData(arrayBuffer);
    }

    // Fade helper
    function fadeGain(gainNode, from, to, duration) {
        gainNode.gain.setValueAtTime(from, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(to, audioContext.currentTime + duration);
    }

    async function startAudio() {
    // Disable button
    document.getElementById('btn-start').disabled = true;

    // files expected in same folder
    try {
      waterBuffer = await loadAudio('sounds/thirdparty/loudwaterrushing.mp3');  // ambient
      musicBuffer = await loadAudio('sounds/28006303.mp3');  // music
    } catch(e){
      // audio optional — continue silently if missing
      console.warn('Audio load failed', e);
    }

    // Water (loop forever, steady volume)
    if (waterBuffer){
      const waterSource = audioContext.createBufferSource();
      const waterGain = audioContext.createGain();
      waterGain.gain.value = 0.2; // 50% volume
      waterSource.buffer = waterBuffer;
      waterSource.loop = true;
      waterSource.connect(waterGain).connect(audioContext.destination);
      waterSource.start();
    }

    // Music (fade in/out cycle)
    if (musicBuffer){
      const musicSource = audioContext.createBufferSource();
      const musicGain = audioContext.createGain();
      musicGain.gain.value = 0;  // start muted

      musicSource.buffer = musicBuffer;
      musicSource.loop = true;
      musicSource.connect(musicGain).connect(audioContext.destination);
      musicSource.start();

      // Fade loop
      function scheduleFades() {
        // fade in
        fadeGain(musicGain, 0, 0.3, 5);
        // fade out after 15s
        setTimeout(() => fadeGain(musicGain, 0.3, 0, 5), 15000);
      }

      // Run the loop every 30s (5s fade in + 10s hold + 5s fade out + 10s silence)
      scheduleFades();
      setInterval(scheduleFades, 30000);
    }
}


(function(){
  function playTaskCompleteSound(detail){
    try {
      if (audioContext.state === 'suspended') audioContext.resume().catch(()=>{});
      const now = audioContext.currentTime;

      // master envelope
      const master = audioContext.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.linearRampToValueAtTime(0.85, now + 0.02);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
      master.connect(audioContext.destination);

      // two tonal partials
      const partials = [
        { freq: 880, type: 'sine', offset: 0 },
        { freq: 1320, type: 'triangle', offset: 0.02 }
      ];

      partials.forEach((p, i) => {
        const osc = audioContext.createOscillator();
        osc.type = p.type;
        osc.frequency.setValueAtTime(p.freq * (1 + (i === 0 ? -0.002 : 0.003)), now + p.offset);

        const g = audioContext.createGain();
        g.gain.setValueAtTime(0.0001, now + p.offset);
        g.gain.linearRampToValueAtTime(0.6 - i*0.15, now + p.offset + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, now + p.offset + 0.85 + i*0.12);

        osc.connect(g).connect(master);
        osc.start(now + p.offset);
        osc.stop(now + p.offset + 0.85 + i*0.12);
      });

      // short noise attack for click
      const noiseDur = 0.04;
      const buf = audioContext.createBuffer(1, Math.floor(audioContext.sampleRate * noiseDur), audioContext.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const env = 1 - (i / data.length);
        data[i] = (Math.random() * 2 - 1) * env * 0.25;
      }
      const src = audioContext.createBufferSource();
      src.buffer = buf;
      const ng = audioContext.createGain();
      ng.gain.setValueAtTime(0.0001, now);
      ng.gain.linearRampToValueAtTime(0.45, now + 0.004);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      src.connect(ng).connect(master);
      src.start(now);
      src.stop(now + 0.12);
    } catch (err) {
      console.warn('playTaskCompleteSound failed', err);
    }
  }

  function playCrewDeathSound(detail){
    try {
      if (audioContext.state === 'suspended') audioContext.resume().catch(()=>{});
      const now = audioContext.currentTime;

      // master envelope
      const master = audioContext.createGain();
      master.gain.setValueAtTime(0.001, now);
      master.gain.linearRampToValueAtTime(0.7, now + 0.02);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
      master.connect(audioContext.destination);

      // low "falling" tone
      const osc = audioContext.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 1.2);

      const g = audioContext.createGain();
      g.gain.setValueAtTime(0.8, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

      osc.connect(g).connect(master);
      osc.start(now);
      osc.stop(now + 1.3);

      // short burst of noise for impact
      const dur = 0.15;
      const buf = audioContext.createBuffer(1, Math.floor(audioContext.sampleRate * dur), audioContext.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const env = 1 - (i / data.length);
        data[i] = (Math.random() * 2 - 1) * env * 0.6;
      }
      const src = audioContext.createBufferSource();
      src.buffer = buf;
      const ng = audioContext.createGain();
      ng.gain.setValueAtTime(0.7, now);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      src.connect(ng).connect(master);
      src.start(now);
      src.stop(now + dur);

    } catch (err) {
      console.warn('playCrewDeathSound failed', err);
    }
  }

  function playPopupSound() {
    try {
      if (audioContext.state === 'suspended') audioContext.resume().catch(()=>{});
      const now = audioContext.currentTime;

      // master gain envelope
      const master = audioContext.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.linearRampToValueAtTime(0.7, now + 0.01);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      master.connect(audioContext.destination);

      // oscillator for pluck (short, bright blip)
      const osc = audioContext.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, now);  // start mid-high
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.2); // upward pitch sweep

      // envelope per note
      const g = audioContext.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.5, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);

      osc.connect(g).connect(master);
      osc.start(now);
      osc.stop(now + 0.35);

      // optional tiny noise "pop" layer
      const dur = 0.05;
      const buf = audioContext.createBuffer(1, Math.floor(audioContext.sampleRate * dur), audioContext.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const env = 1 - (i / data.length);
        data[i] = (Math.random() * 2 - 1) * env * 0.2;
      }
      const src = audioContext.createBufferSource();
      src.buffer = buf;
      const ng = audioContext.createGain();
      ng.gain.setValueAtTime(0.4, now);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      src.connect(ng).connect(master);
      src.start(now);
      src.stop(now + dur);
    } catch (err) {
      console.warn('playPopupSound failed', err);
    }
  }

  window.addEventListener('popUp', (e) => {
        try {
          playPopupSound();
        } catch (err) {
          console.warn('popUp handler failed', err);
        }
      });

    window.addEventListener('crewDied', (e) => {
      try {
        playCrewDeathSound(e && e.detail);
      } catch (err) {
        console.warn('crewDied handler failed', err);
      }
    });

  // Listen for a CustomEvent('taskCompleted') — detail can include { id, title, reward }
  window.addEventListener('taskCompleted', (e) => {
    try {
      // Optionally use e.detail for variations (currently ignored)
      playTaskCompleteSound(e && e.detail);
    } catch (err) {
      console.warn('taskCompleted handler failed', err);
    }
  });

  // If some code dispatched events before this script loaded, process a queue if present:
  if (Array.isArray(window._queuedTaskCompletedEvents) && window._queuedTaskCompletedEvents.length){
    window._queuedTaskCompletedEvents.forEach(d => {
      try { playTaskCompleteSound(d); } catch(e){ console.warn(e); }
    });
    window._queuedTaskCompletedEvents.length = 0;
  }

  // Expose for debugging / manual trigger
  window.playTaskCompleteSound = playTaskCompleteSound;
  window.triggerTaskCompleteSoundEvent = function(detail){
    return window.dispatchEvent(new CustomEvent('taskCompleted', { detail }));
  };
})();


// Button triggers audio context resume + playback
document.getElementById('btn-start').addEventListener('click', () => {
    audioContext.resume().then(startAudio);
});