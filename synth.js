/* ==========================================================================
   STIMboard Procedural Sound & Speech Engine (synth.js)
   ========================================================================== */

let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function speakText(text, rate = 1.0, pitch = 1.0, volume = 1.0) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate; utterance.pitch = pitch; utterance.volume = volume;
    window.speechSynthesis.speak(utterance);
  }
}

function playBrassNote(freq, startTime, duration) {
  const ctx = getAudioCtx(); const osc = ctx.createOscillator(); const filter = ctx.createBiquadFilter(); const gain = ctx.createGain();
  osc.type = 'sawtooth'; osc.frequency.setValueAtTime(freq, startTime);
  filter.type = 'lowpass'; filter.frequency.setValueAtTime(800, startTime); filter.frequency.exponentialRampToValueAtTime(3200, startTime + 0.06); filter.frequency.exponentialRampToValueAtTime(1400, startTime + duration);
  gain.gain.setValueAtTime(0.001, startTime); gain.gain.exponentialRampToValueAtTime(0.2, startTime + 0.04); gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
  osc.start(startTime); osc.stop(startTime + duration);
}

function playClap(startTime) {
  const ctx = getAudioCtx(); const bufferSize = ctx.sampleRate * 0.08; const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0); for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource(); noise.buffer = buffer;
  const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 1100;
  const gain = ctx.createGain(); gain.gain.setValueAtTime(0.7, startTime); gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.08);
  noise.connect(filter); filter.connect(gain); gain.connect(ctx.destination); noise.start(startTime); noise.stop(startTime + 0.08);
}

function playSubDrop(startTime, startFreq = 160, endFreq = 40, dur = 0.4) {
  const ctx = getAudioCtx(); const osc = ctx.createOscillator(); const gain = ctx.createGain();
  osc.type = 'sine'; osc.frequency.setValueAtTime(startFreq, startTime); osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + dur);
  gain.gain.setValueAtTime(0.6, startTime); gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);
  osc.connect(gain); gain.connect(ctx.destination); osc.start(startTime); osc.stop(startTime + dur);
}

function playTimbalandRiff(startTime) {
  const ctx = getAudioCtx();
  for (let i = 0; i < 4; i++) {
    const t = startTime + (i * 0.09); const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.type = 'triangle'; osc.frequency.setValueAtTime(220 - (i * 25), t); osc.frequency.exponentialRampToValueAtTime(60, t + 0.07);
    gain.gain.setValueAtTime(0.5, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + 0.07);
  }
}

window.playProceduralSound = function(id, skipVocals = false) {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;

  switch (id) {
    case "birthday-surprise": {
      if (!skipVocals) speakText("Happy birthday to you! Happy birthday to you! Happy birthday dear Case! Happy birthday to you!", 1.0, 1.2, 1.0);
      const bdayNotes = [{ f: 261.63, d: 0.2 }, { f: 261.63, d: 0.1 }, { f: 293.66, d: 0.3 }, { f: 261.63, d: 0.3 }, { f: 349.23, d: 0.3 }, { f: 329.63, d: 0.6 }];
      let bOffset = 0.5;
      bdayNotes.forEach(n => { 
        playBrassNote(n.f, now + bOffset, n.d); 
        playBrassNote(n.f * 1.25, now + bOffset, n.d); 
        playBrassNote(n.f * 1.5, now + bOffset, n.d); 
        bOffset += n.d + 0.05; 
      });
      break;
    }
    case "case": {
      playSubDrop(now, 220, 45, 0.4);
      if (!skipVocals) speakText("CASE!", 1.15, 1.4, 1.0);
      break;
    }
    case "trumpet-short": {
      playBrassNote(587.33, now, 0.12); playBrassNote(880.00, now + 0.12, 0.35);
      break;
    }
    case "the-trumpet": {
      if (!skipVocals) speakText("The Trumpet!", 1.3, 1.2, 1.0);
      const t0 = now + (skipVocals ? 0.05 : 0.45);
      const notes = [{ f: 587.33, d: 0.12 }, { f: 659.25, d: 0.12 }, { f: 783.99, d: 0.15 }, { f: 880.00, d: 0.18 }, { f: 783.99, d: 0.12 }, { f: 880.00, d: 0.12 }, { f: 1046.5, d: 0.42 }];
      let offset = 0; notes.forEach(n => { playBrassNote(n.f, t0 + offset, n.d); offset += n.d * 0.95; });
      break;
    }
    case "barney-gumbled": if (!skipVocals) speakText("Million quid to get your Barney Gumbled!", 1.1, 1.0); for (let i = 0; i < 3; i++) playSubDrop(now + (i * 0.18), 110, 45, 0.16); break;
    case "fight-overheard": playSubDrop(now, 260, 50, 0.35); if (!skipVocals) speakText("Fuck with me, bitch!", 1.25, 1.3); break;
    case "big-sean": if (!skipVocals) speakText("I don't. Fuck wit. CHU!", 1.0, 1.1); [0, 0.28, 0.58, 0.95].forEach(d => playSubDrop(now + d, 140, 40, 0.22)); break;
    case "follow-the-rules": if (!skipVocals) speakText("You gotta follow the rules!", 1.0, 1.1); [0.2, 0.42, 0.64, 0.86, 1.08].forEach(t => playClap(now + t)); break;
    case "dirty-south": if (!skipVocals) speakText("Dirty South! Di-di-dirty dirty.", 1.2, 0.95); playTimbalandRiff(now + 0.3); break;
    case "drg-stone": if (!skipVocals) speakText("Rock and Stone!", 1.1, 0.7, 1.0); break;
    case "drg-on": if (!skipVocals) speakText("Rock on!", 1.1, 0.7, 1.0); break;
    case "drg-fight": if (!skipVocals) speakText("We fight for Rock and Stone!", 1.1, 0.7, 1.0); break;
    case "drg-bone": if (!skipVocals) speakText("Rock and Stone to the bone!", 1.1, 0.7, 1.0); break;
    case "drg-diff": if (!skipVocals) speakText("Eh, what's the difference between a rock and a stone?", 1.1, 0.7, 1.0); break;
    case "drg-never-alone": if (!skipVocals) speakText("If you rock and stone, you're never alone!", 1.1, 0.7, 1.0); break;
    case "drg-home": if (!skipVocals) speakText("If you don't rock and stone, you ain't coming home!", 1.1, 0.7, 1.0); break;
    case "drg-hear": if (!skipVocals) speakText("Did I hear a Rock and a Stone?", 1.1, 0.7, 1.0); break;
  }
};