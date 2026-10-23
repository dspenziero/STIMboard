/* ==========================================================================
   STIMboard Procedural Sound & Speech Engine (synth.js)
   --------------------------------------------------------------------------
   ROLE OF THIS FILE
   Generates sound from NOTHING but math, using the browser's Web Audio API
   plus the SpeechSynthesis (text-to-speech) API. No audio files are needed.
   It is the offline / missing-file safety net for app.js.

   PUBLIC SURFACE
   The only thing other files use is  window.playProceduralSound(id, skipVocals)
   defined at the bottom. Everything above it is a private building block:
     getAudioCtx()      - lazily creates the single shared AudioContext
     speakText()        - text-to-speech wrapper
     playBrassNote()    - one synthesized trumpet-ish note
     playClap()         - a burst of filtered noise (a handclap)
     playSubDrop()      - a falling sine wave (808-style sub-bass drop)
     playTimbalandRiff()- four quick falling triangle blips (beatbox riff)

   WEB AUDIO CRASH COURSE
   Sound is built as a GRAPH of nodes wired together:
     source (oscillator/noise) -> [filter] -> gain (volume) -> destination (speakers)
   Parameters (frequency, gain) can be SCHEDULED at exact future times on the
   audio clock (ctx.currentTime, in seconds). That is why every function below
   takes a 'startTime' instead of playing "now": the whole tune is scheduled
   in advance with sample-accurate timing.
   ========================================================================== */

// The one shared AudioContext (the "sound card" object). null until first use.
// Browsers limit how many contexts may exist, so we create exactly one.
let audioCtx = null;

// Returns the shared AudioContext, creating it on first call.
function getAudioCtx() {
  if (!audioCtx) {
    // Safari older than 14.1 only has the prefixed 'webkitAudioContext'.
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  // Browsers start contexts 'suspended' until a user gesture (a tap). Because
  // this is called from inside a tap handler chain, resume() is allowed to work.
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// Speaks 'text' aloud with the device's built-in voice.
//   rate   : speed. 1.0 normal, <1 slower, >1 faster.
//   pitch  : voice height. 1.0 normal, 0..2 allowed.
//   volume : 0..1.
function speakText(text, rate = 1.0, pitch = 1.0, volume = 1.0) {
  // Not every browser supports speech; do nothing silently if it is missing.
  if ('speechSynthesis' in window) {
    // Cut off anything still being spoken so phrases never queue up behind each other.
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text); // The thing to say.
    utterance.rate = rate; utterance.pitch = pitch; utterance.volume = volume;
    window.speechSynthesis.speak(utterance); // Queue it; speaks immediately since the queue was cleared.
  }
}

// Plays ONE brass-like note.
//   freq      : pitch in Hz (261.63 = middle C, 440 = concert A).
//   startTime : when to start, on the AudioContext clock (seconds).
//   duration  : how long the note lasts, in seconds.
// Recipe: a SAWTOOTH wave (buzzy, rich in harmonics, like brass) goes through
// a LOWPASS filter whose cutoff sweeps up then down (the "wah" of a trumpet
// attack), then through a gain envelope (quick swell, then decay).
function playBrassNote(freq, startTime, duration) {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();      // Tone generator.
  const filter = ctx.createBiquadFilter(); // Tone shaper.
  const gain = ctx.createGain();           // Volume control.

  // Sawtooth wave at the requested pitch from startTime.
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(freq, startTime);

  // FILTER ENVELOPE (the brassy "blat"):
  //  start dull at 800Hz -> open up to 3200Hz within 60ms -> settle to 1400Hz by note end.
  //  exponentialRamp is used because pitch/brightness is perceived logarithmically.
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(800, startTime);
  filter.frequency.exponentialRampToValueAtTime(3200, startTime + 0.06);
  filter.frequency.exponentialRampToValueAtTime(1400, startTime + duration);

  // AMPLITUDE ENVELOPE: start almost silent (0.001; exponential ramps cannot
  // start from exactly 0), swell to 0.2 over 40ms (the attack), then fade back
  // to near-silence by the end of the note (prevents a click when it stops).
  gain.gain.setValueAtTime(0.001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.2, startTime + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  // Wire the graph: oscillator -> filter -> gain -> speakers.
  osc.connect(filter); filter.connect(gain); gain.connect(ctx.destination);

  // Schedule start and stop. Stopping at the end lets the browser free the nodes.
  osc.start(startTime); osc.stop(startTime + duration);
}

// Plays a single synthetic HANDCLAP at 'startTime'.
// A clap is mostly short filtered white noise, so we fill a tiny audio buffer
// with random samples, band-pass it around 1.1kHz and fade it out in 80ms.
function playClap(startTime) {
  const ctx = getAudioCtx();
  // Buffer length in SAMPLES: sampleRate samples per second * 0.08 s = 80ms.
  const bufferSize = ctx.sampleRate * 0.08;
  // A mono (1 channel) empty buffer of that length.
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  // Get the raw sample array and fill it with random values from -1 to +1
  // (white noise). NOTE: this local 'data' is unrelated to SOUNDBOARD_DATA.
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  // A "source" node that plays the buffer once.
  const noise = ctx.createBufferSource(); noise.buffer = buffer;
  // Band-pass keeps only frequencies near 1100Hz -> the papery "clap" tone.
  const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 1100;
  // Volume: loud (0.7) instantly, then exponentially fade to silence over 80ms.
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.7, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.08);

  // noise -> filter -> gain -> speakers, then schedule it.
  noise.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
  noise.start(startTime); noise.stop(startTime + 0.08);
}

// Plays an 808-style SUB DROP: a pure sine wave whose pitch slides down fast.
//   startFreq/endFreq : pitch at start and end in Hz (defaults 160 -> 40).
//   dur               : length in seconds (default 0.4).
function playSubDrop(startTime, startFreq = 160, endFreq = 40, dur = 0.4) {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  // Sine = the purest, deepest tone (no harmonics), ideal for sub-bass.
  osc.type = 'sine';
  osc.frequency.setValueAtTime(startFreq, startTime);
  // Slide the pitch DOWN exponentially: this is the "boom" falling effect.
  osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + dur);

  // Start loud (0.6), fade to near silence by the end so it does not click.
  gain.gain.setValueAtTime(0.6, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);

  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(startTime); osc.stop(startTime + dur);
}

// Plays the "Dirty South" beatbox riff: FOUR short blips, 90ms apart, each
// starting lower than the last (220, 195, 170, 145 Hz) and each sliding down
// to 60Hz in 70ms. Triangle waves sound softer/rounder than sawtooth.
function playTimbalandRiff(startTime) {
  const ctx = getAudioCtx();
  for (let i = 0; i < 4; i++) {
    // Each blip begins 0.09s after the previous one.
    const t = startTime + (i * 0.09);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    // Start pitch drops by 25Hz per blip; each blip then falls to 60Hz.
    osc.frequency.setValueAtTime(220 - (i * 25), t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.07);
    // Punchy volume (0.5) fading out over 70ms.
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.07);
  }
}

/* --------------------------------------------------------------------------
   THE DISPATCHER: window.playProceduralSound(id, skipVocals)
   --------------------------------------------------------------------------
   Called by app.js. 'id' is the SOUNDBOARD_DATA item id (or a sequence
   stand-in id such as "birthday-part1"); the switch below picks the recipe.
     skipVocals = false : play everything, including spoken words.
     skipVocals = true  : instruments only. app.js uses this when a REAL
                          recording just finished and we are only chaining the
                          musical tail on (appendProcedural items), because
                          the recording already contained the spoken words.
   Unknown ids fall through the switch and make no sound.
   -------------------------------------------------------------------------- */
window.playProceduralSound = function(id, skipVocals = false) {
  const ctx = getAudioCtx();
  // 'now' = the current audio-clock time. Every note below is scheduled as
  // now + some offset in seconds, so the whole tune is queued in one go.
  const now = ctx.currentTime;

  switch (id) {
    // ---- FULL "HAPPY BIRTHDAY" (whole-item fallback for the birthday card) ----
    case "birthday-surprise": {
      // Speak the lyrics unless vocals are being skipped.
      if (!skipVocals) speakText("Happy birthday to you! Happy birthday to you! Happy birthday dear Case! Happy birthday to you!", 1.0, 1.2, 1.0);
      // Opening melody: f = frequency in Hz, d = duration in seconds.
      // 261.63 = C4, 293.66 = D4, 329.63 = E4, 349.23 = F4.
      const bdayNotes = [{ f: 261.63, d: 0.2 }, { f: 261.63, d: 0.1 }, { f: 293.66, d: 0.3 }, { f: 261.63, d: 0.3 }, { f: 349.23, d: 0.3 }, { f: 329.63, d: 0.6 }];
      // Running timeline position; starts 0.5s in so the speech can begin first.
      let bOffset = 0.5;
      bdayNotes.forEach(n => {
        // THREE notes at once = a chord. Multiplying a frequency by 1.25 gives
        // a major third above, and by 1.5 a perfect fifth above. Together with
        // the root they form a MAJOR chord (the bright, happy sound).
        playBrassNote(n.f, now + bOffset, n.d);
        playBrassNote(n.f * 1.25, now + bOffset, n.d);
        playBrassNote(n.f * 1.5, now + bOffset, n.d);
        // Advance the timeline by this note's length plus a 50ms breath.
        bOffset += n.d + 0.05;
      });
      break;
    }

    // ---- BIRTHDAY SEQUENCE STAND-INS (used when bday1/bday2 .m4a are missing) ----
    // Both ids share one block; 'id' tells us which half to play.
    case "birthday-part1":
    case "birthday-part2": {
      const isPart1 = id === "birthday-part1";
      // Speak this half's lyrics (skipped if vocals are suppressed).
      if (!skipVocals) speakText(isPart1 ? "Happy birthday to you! Happy birthday to you!" : "Happy birthday dear Case! Happy birthday to you!", 1.0, 1.2, 1.0);
      // Part 1 melody = lines 1 and 2 ("Happy birthday to you" x2).
      // 392.00 = G4. Note durations: short-short-long pattern per phrase.
      const part1 = [{ f: 261.63, d: 0.2 }, { f: 261.63, d: 0.1 }, { f: 293.66, d: 0.3 }, { f: 261.63, d: 0.3 }, { f: 349.23, d: 0.3 }, { f: 329.63, d: 0.6 },
                     { f: 261.63, d: 0.2 }, { f: 261.63, d: 0.1 }, { f: 293.66, d: 0.3 }, { f: 261.63, d: 0.3 }, { f: 392.00, d: 0.3 }, { f: 349.23, d: 0.6 }];
      // Part 2 melody = lines 3 and 4 ("...dear Case" / "...to you").
      // 523.25 = C5, 440.00 = A4, 466.16 = A#4/Bb4.
      const part2 = [{ f: 523.25, d: 0.2 }, { f: 523.25, d: 0.1 }, { f: 440.00, d: 0.3 }, { f: 349.23, d: 0.3 }, { f: 329.63, d: 0.3 }, { f: 293.66, d: 0.6 },
                     { f: 466.16, d: 0.2 }, { f: 466.16, d: 0.1 }, { f: 440.00, d: 0.3 }, { f: 349.23, d: 0.3 }, { f: 392.00, d: 0.3 }, { f: 349.23, d: 0.6 }];
      // Start 0.3s in (a short lead-in so speech and brass begin together).
      let pOffset = 0.3;
      // Pick the right half, then play each note as a 3-note major chord
      // (root, x1.25 major third, x1.5 perfect fifth), exactly like the full tune.
      (isPart1 ? part1 : part2).forEach(n => {
        playBrassNote(n.f, now + pOffset, n.d);
        playBrassNote(n.f * 1.25, now + pOffset, n.d);
        playBrassNote(n.f * 1.5, now + pOffset, n.d);
        pOffset += n.d + 0.05; // Note length + 50ms gap before the next note.
      });
      break;
    }

    // ---- "CASE!" : a sub-bass thump plus the spoken name ----
    case "case": {
      // Sine drop from 220Hz down to 45Hz over 0.4s = the "boom".
      playSubDrop(now, 220, 45, 0.4);
      // High-ish pitch (1.4) and brisk rate (1.15) make it sound like a shout.
      if (!skipVocals) speakText("CASE!", 1.15, 1.4, 1.0);
      break;
    }

    // ---- QUICK TRUMPET HIT: two notes, D5 then A5 ----
    case "trumpet-short": {
      playBrassNote(587.33, now, 0.12);            // D5, short.
      playBrassNote(880.00, now + 0.12, 0.35);     // A5, starts as the first ends, held longer.
      break;
    }

    // ---- THE TRUMPET: a 7-note Mambo No. 5 style fanfare ----
    case "the-trumpet": {
      if (!skipVocals) speakText("The Trumpet!", 1.3, 1.2, 1.0);
      // If speech is playing, wait 0.45s so the brass does not talk over it.
      // If vocals are skipped (the real recording just ended) start almost
      // immediately (0.05s) so the chain feels seamless.
      const t0 = now + (skipVocals ? 0.05 : 0.45);
      const notes = [{ f: 587.33, d: 0.12 }, { f: 659.25, d: 0.12 }, { f: 783.99, d: 0.15 }, { f: 880.00, d: 0.18 }, { f: 783.99, d: 0.12 }, { f: 880.00, d: 0.12 }, { f: 1046.5, d: 0.42 }];
      let offset = 0;
      notes.forEach(n => {
        playBrassNote(n.f, t0 + offset, n.d);
        // Advance by only 95% of the duration so notes slightly overlap,
        // which sounds smoother/more legato than strict end-to-start.
        offset += n.d * 0.95;
      });
      break;
    }

    // ---- THE CLASSICS ----
    // Each case below is a compact one-liner (code is unchanged; only comments added).
    // Syntax reminder: 'if (!skipVocals) speakText(...)' means "speak unless suppressed".
    // 'break;' at the end of a line stops the switch from falling into the next case.

    // "Million quid to get your Barney Gumbled!": speech + THREE quick sub drops
    // 0.18s apart (110Hz -> 45Hz, 0.16s each) acting like a stuttering bass hit.
    case "barney-gumbled": if (!skipVocals) speakText("Million quid to get your Barney Gumbled!", 1.1, 1.0); for (let i = 0; i < 3; i++) playSubDrop(now + (i * 0.18), 110, 45, 0.16); break;

    // Overheard fight line: one deep drop (260Hz -> 50Hz, 0.35s) immediately,
    // then the speech with a raised pitch (1.3) and fast rate (1.25) for aggression.
    case "fight-overheard": playSubDrop(now, 260, 50, 0.35); if (!skipVocals) speakText("Fuck with me, bitch!", 1.25, 1.3); break;

    // Big Sean cadence: speech plus FOUR sub drops at 0, 0.28, 0.58 and 0.95s,
    // timed to land roughly on the beats of "I don't. Fuck wit. CHU!".
    case "big-sean": if (!skipVocals) speakText("I don't. Fuck wit. CHU!", 1.0, 1.1); [0, 0.28, 0.58, 0.95].forEach(d => playSubDrop(now + d, 140, 40, 0.22)); break;

    // "Follow the rules": speech plus FIVE handclaps ~0.22s apart, one per
    // clapped word in the title (Follow 👏 The 👏 Rules 👏). First clap is at 0.2s.
    case "follow-the-rules": if (!skipVocals) speakText("You gotta follow the rules!", 1.0, 1.1); [0.2, 0.42, 0.64, 0.86, 1.08].forEach(t => playClap(now + t)); break;

    // Dirty South: speech, then the 4-blip Timbaland riff starting 0.3s in.
    case "dirty-south": if (!skipVocals) speakText("Dirty South! Di-di-dirty dirty.", 1.2, 0.95); playTimbalandRiff(now + 0.3); break;

    // ---- DEEP ROCK GALACTIC SALUTES ----
    // All of these are speech only: rate 1.1 (slightly quick) and pitch 0.7
    // (low, gruff, dwarf-like). The last argument 1.0 is full volume (the
    // default, written out explicitly). Real recordings replace these when present.
    case "drg-stone": if (!skipVocals) speakText("Rock and Stone!", 1.1, 0.7, 1.0); break;
    case "drg-on": if (!skipVocals) speakText("Rock on!", 1.1, 0.7, 1.0); break;
    case "drg-fight": if (!skipVocals) speakText("We fight for Rock and Stone!", 1.1, 0.7, 1.0); break;
    case "drg-bone": if (!skipVocals) speakText("Rock and Stone to the bone!", 1.1, 0.7, 1.0); break;
    case "drg-diff": if (!skipVocals) speakText("Eh, what's the difference between a rock and a stone?", 1.1, 0.7, 1.0); break;
    case "drg-never-alone": if (!skipVocals) speakText("If you rock and stone, you're never alone!", 1.1, 0.7, 1.0); break;
    case "drg-home": if (!skipVocals) speakText("If you don't rock and stone, you ain't coming home!", 1.1, 0.7, 1.0); break;
    case "drg-hear": if (!skipVocals) speakText("Did I hear a Rock and a Stone?", 1.1, 0.7, 1.0); break;
    // No 'default' branch on purpose: an unknown id simply produces no sound.
  }
};