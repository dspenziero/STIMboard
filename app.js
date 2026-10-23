/* ==========================================================================
   STIMboard Main Application Controller (app.js)
   --------------------------------------------------------------------------
   ROLE OF THIS FILE
   This is the "brain" of the page. It is loaded LAST (see index.html) so that
   everything it depends on already exists by the time it runs:
     - data.js   -> defines window.SOUNDBOARD_DATA (the list of buttons)
     - synth.js  -> defines window.playProceduralSound (the synth fallback)
     - extras.js -> defines dev mode, favorites, progress bars, the intro...
   Load order in index.html: data.js, synth.js, extras.js, app.js.
   What lives in here, in file order:
     0. (Removed) the old cache nuker; sw.js now owns freshness and offline
     1. Service worker registration + the Android "Install App" button logic
     2. The confetti / emoji particle engine (drawn on a fullscreen <canvas>)
     3. The audio sequencer: now-playing tracking, stopAllAudio() (tap-to-stop),
        playAudioSequence() and triggerStim()
     4. The DOM builder: renderSoundboard() turns SOUNDBOARD_DATA into buttons
        (re-runnable: dev mode, search and the favorites filter call it again)

   HOOKS INTO extras.js (all optional; each call is guarded with "if (window.x)"
   so the soundboard still works if extras.js is missing)
     isDevMode / isBirthdayNow  decide which items are visible
     stimFilter(item)           search + favorites-only filtering
     recordPlay(item)           feeds the "recently played" list
     decorateCard(btn, item)    adds the progress bar and favorite star
     progressStart / Stop       draw the progress bar on the playing card
   HOOKS OUT (this file exposes on window for extras.js)
     renderSoundboard, triggerStim, stopAllAudio
   ========================================================================== */

/* --------------------------------------------------------------------------
   0. (REMOVED) CACHE NUKER
   The old code deleted every Cache Storage entry on each load, which broke
   offline mode. sw.js now handles freshness (network-first, no-cache fetches,
   old caches deleted on activate), so nothing is needed here.
   -------------------------------------------------------------------------- */

/* --------------------------------------------------------------------------
   1. SERVICE WORKER & ANDROID INSTALL PROMPT
   -------------------------------------------------------------------------- */
// Only try to register a service worker if this browser supports them.
if ('serviceWorker' in navigator) {
  // Wait for the whole page (images, scripts, etc.) to finish loading before
  // registering, so registration never competes with first paint for bandwidth.
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')          // Register the worker file next to index.html.
      .then((reg) => reg.update())  // Ask the browser to re-check sw.js for changes right now,
                                    // instead of waiting for its own ~24h schedule.
      .catch(() => {});             // If registration fails (e.g. offline first visit) stay silent.
  });

  // 'refreshing' is a one-shot guard. Without it, a controller change could
  // trigger more than one reload and cause a reload loop.
  let refreshing = false;

  // 'controllerchange' fires when a NEW service worker takes control of the
  // page (sw.js calls skipWaiting() + clients.claim() so this happens fast).
  // We reload once so the page is guaranteed to be running the newest files.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}

// Holds the browser's deferred 'beforeinstallprompt' event until the user
// taps our own Install button. 'let' without a value means it starts undefined.
let deferredPrompt;
// Grab the Install button (hidden by CSS by default: .install-btn { display:none })
// and the footer hint ("Tap 3 dots -> Add to Home screen") from index.html.
const installBtn = document.getElementById('installBtn');
const appFooter = document.getElementById('appFooter'); // Currently unused here; CSS hides it in standalone mode.

// Chrome/Android fires 'beforeinstallprompt' when the app meets the PWA
// install criteria (manifest + service worker + https).
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();   // Stop Chrome's default mini-infobar; we want to control WHEN the prompt shows.
  deferredPrompt = e;   // Save the event so we can call .prompt() on it later.
  if (installBtn) installBtn.style.display = 'block'; // Reveal our own Install button.
});

// Wire up the Install button, but only if it exists in the HTML.
if (installBtn) {
  // 'async' lets us 'await' the user's choice below.
  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;           // Nothing saved -> nothing to show.
    deferredPrompt.prompt();               // Show the native "Install app?" dialog.
    const { outcome } = await deferredPrompt.userChoice; // Wait until the user taps Install/Cancel. outcome = 'accepted' | 'dismissed'.
    if (outcome === 'accepted') installBtn.style.display = 'none'; // Installed -> hide the button.
    deferredPrompt = null;                 // A prompt event can only be used once, so discard it.
  });
}

// 'appinstalled' fires after a successful install (even if installed through
// the browser menu instead of our button), so hide the button in that case too.
window.addEventListener('appinstalled', () => {
  if (installBtn) installBtn.style.display = 'none';
});

/* --------------------------------------------------------------------------
   2. MULTI-BURST & EMOJI CONFETTI ENGINE
   --------------------------------------------------------------------------
   A tiny particle system. burstConfetti() ADDS particles to the 'particles'
   array; renderConfetti() runs forever (once per screen refresh) moving and
   drawing them, and removes each one when it fades out or falls off-screen.
   -------------------------------------------------------------------------- */
// The fullscreen <canvas id="confettiCanvas"> from index.html (fixed, on top
// of everything, with pointer-events:none so taps pass through to buttons).
const canvas = document.getElementById('confettiCanvas');
// The 2D drawing context used for all drawing. Guarded in case canvas is missing.
const ctx = canvas ? canvas.getContext('2d') : null;
// Every live particle. Each entry is a plain object (see burstConfetti).
let particles = [];

// Make the canvas's internal pixel size match the window so drawings are not
// stretched or blurry. (CSS size alone would only scale the bitmap.)
function resizeCanvas() {
  if (canvas) {
    canvas.width = window.innerWidth;    // Internal bitmap width in pixels.
    canvas.height = window.innerHeight;  // Internal bitmap height in pixels.
  }
}
// Re-fit whenever the window changes size or the phone rotates, and fit once now.
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Spawns ONE burst of 75 particles from near the top-middle of the screen.
// triggerStim() calls this several times, 300ms apart, for multi-burst effects.
function burstConfetti() {
  if (!canvas) return; // No canvas on the page -> nothing to draw on.

  // Palette for plain colored squares: amber, yellow, red, sky blue, green, magenta.
  const colors = ['#f59e0b', '#fbbf24', '#f87171', '#38bdf8', '#34d399', '#c026d3'];
  // Emoji that can appear instead of squares: balloon, sparkles, cake, party popper.
  const emojis = ['🎈', '✨', '🎂', '🎉'];

  for (let i = 0; i < 75; i++) {
    // About 20% of particles (random value above 0.8) become emoji.
    const isEmoji = Math.random() > 0.8;
    particles.push({
      // Start point: horizontal center, one third of the way down the screen.
      x: canvas.width / 2, y: canvas.height / 3,
      // Initial velocity in pixels per frame.
      // vx: random between -7 and +7 (spreads left and right evenly).
      // vy: random between -11.2 and +4.8 (mostly negative = launches UPWARD;
      //     the -0.7 offset biases particles upward rather than downward).
      vx: (Math.random() - 0.5) * 14, vy: (Math.random() - 0.7) * 16,
      // Size in pixels: emoji are bigger (16-32px) than squares (4-12px).
      size: isEmoji ? Math.random() * 16 + 16 : Math.random() * 8 + 4,
      // Pick a random color from the palette (used only by square particles).
      color: colors[Math.floor(Math.random() * colors.length)],
      // 'emoji' or 'color' decides how renderConfetti() draws this particle.
      type: isEmoji ? 'emoji' : 'color',
      // Which emoji to draw (empty string for squares).
      text: isEmoji ? emojis[Math.floor(Math.random() * emojis.length)] : '',
      // Starting angle in degrees (0-360), and spin per frame (-5 to +5 degrees).
      rotation: Math.random() * 360, rotSpeed: (Math.random() - 0.5) * 10,
      // 1 = fully visible. Fades toward 0 each frame, then the particle is removed.
      opacity: 1
    });
  }
}

// The animation loop. Runs once per display refresh (~60 times a second) for
// the entire life of the page, drawing every particle in its new position.
function renderConfetti() {
  if (!ctx || !canvas) return; // Without a canvas there is nothing to animate (and the loop ends).
  // Wipe the previous frame completely.
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Iterate BACKWARDS so that removing an element with splice() does not
  // shift the indices of particles we have not visited yet.
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;            // Move horizontally by current velocity.
    p.y += p.vy;            // Move vertically by current velocity.
    p.vy += 0.45;           // Gravity: each frame, pull downward a little harder.
    p.rotation += p.rotSpeed; // Keep spinning.
    p.opacity -= 0.012;     // Fade out slowly (fully gone after ~83 frames, about 1.4s).

    ctx.save();                                    // Remember the untransformed canvas state.
    ctx.translate(p.x, p.y);                       // Move the origin to the particle so it rotates about its center.
    ctx.rotate((p.rotation * Math.PI) / 180);      // Rotate (canvas wants radians, so convert from degrees).
    ctx.globalAlpha = Math.max(p.opacity, 0);      // Apply transparency; clamp so it never goes negative.

    if (p.type === 'emoji') {
      ctx.font = `${p.size}px Arial`;              // Emoji are drawn as text, so set a font size.
      ctx.fillText(p.text, -p.size / 2, p.size / 2); // Offset so the glyph is centered on the particle.
    } else {
      ctx.fillStyle = p.color;                     // Square particles use their palette color...
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); // ...drawn centered on the origin.
    }
    ctx.restore(); // Undo translate/rotate/alpha so the next particle starts clean.

    // Remove the particle once it is invisible OR has fallen below the screen.
    if (p.opacity <= 0 || p.y > canvas.height) particles.splice(i, 1);
  }
  // Schedule the next frame. The browser pauses this when the tab is hidden.
  requestAnimationFrame(renderConfetti);
}
// Kick off the loop once at startup. After this it keeps re-scheduling itself.
renderConfetti();

/* --------------------------------------------------------------------------
   3. AUDIO SEQUENCER & HAPTICS
   --------------------------------------------------------------------------
   HYBRID AUDIO MODEL (read this first)
   Every button tries to play a real recording (.m4a/.mp3) first. If that file
   is missing (404), cannot decode, is blocked, or the phone is offline and it
   was never cached, we FALL BACK to the procedural synthesizer in synth.js.
   Three different data-driven behaviours exist:
     (a) Plain item          { audio: "x.m4a" }
         -> play x.m4a; on failure play the synth sound for item.id.
     (b) Appended item       { audio: "x.m4a", appendProcedural: true }
         -> play x.m4a; when it ENDS, chain the synth sound (vocals skipped).
     (c) Sequence item       { audioSequence: [...], sequenceGap, sequenceFallbacks }
         -> play several clips in order with a pause between them; each clip
            has its own optional synth stand-in. Used by the birthday card.
   !! PROTECTED LOGIC: the onerror / onended / play().catch handlers below are
   !! the offline safety net. Do not remove or reorder them.
   -------------------------------------------------------------------------- */

// The one <audio> element currently playing (or null). We keep a reference so
// the NEXT tap can stop it first, which prevents overlapping/double playback.
let currentAudio = null;

// A counter used as a "cancellation ticket" for sequences. Every time a new
// sequence starts it increments this number and remembers its own copy
// (its 'token'). Any older sequence notices its token no longer matches the
// global value and quietly stops itself.
let sequenceToken = 0;

// Handle of the pending setTimeout() between sequence clips, so a new tap can
// cancel a gap that is still counting down.
let sequenceTimer = null;

// ---- NOW-PLAYING TRACKING (powers tap-to-stop and the progress bar) ----
// Only ONE thing plays at a time, so a single variable is enough.
// { item, el } for the button that is currently sounding, or null when silent.
//   item : the SOUNDBOARD_DATA entry (tap-to-stop compares against it)
//   el   : the button element (gets the gold .is-playing look + progress bar)
let nowPlaying = null;
// Safety timer: synth sounds give no 'ended' event, so we clear the state
// after an estimated time. Audio files clear it on their real 'ended' event.
let playingWatchdog = null;

// Mark a button as playing. 'estimateMs' is a guess at how long the sound
// lasts; it drives the progress bar until a real length is known.
function setNowPlaying(item, el, estimateMs) {
  clearNowPlaying();                       // Reset any previous button first.
  nowPlaying = { item, el };
  if (el) el.classList.add('is-playing');  // Gold border + glow (styles.css).
  if (window.progressStart) window.progressStart(el, estimateMs); // extras.js draws the bar.
  // Watchdog at 2.5x the estimate: generous on purpose, because an over-long
  // estimate only delays the "stop" look, while a too-short one would make a
  // still-playing sound look finished and break tap-to-stop. Real recordings
  // clear the state themselves on 'ended', so this mainly serves synth sounds.
  playingWatchdog = setTimeout(clearNowPlaying, (estimateMs || 8000) * 2.5);
}

// Called once a real recording reports its true length (loadedmetadata).
// Restarts the progress bar with the exact duration and tightens the watchdog.
function updatePlayingDuration(ms) {
  if (!nowPlaying) return;                 // Sound was already stopped: ignore.
  if (window.progressStart) window.progressStart(nowPlaying.el, ms);
  // +3000ms of slack so the watchdog never fires before the real 'ended'.
  clearTimeout(playingWatchdog); playingWatchdog = setTimeout(clearNowPlaying, ms + 3000);
}

// Returns to the silent state: removes the gold look, resets the bar, forgets
// the button. Safe to call when nothing is playing.
function clearNowPlaying() {
  clearTimeout(playingWatchdog); playingWatchdog = null;
  if (nowPlaying && nowPlaying.el) nowPlaying.el.classList.remove('is-playing');
  if (window.progressStop) window.progressStop(nowPlaying && nowPlaying.el);
  nowPlaying = null;
}

// Silences EVERYTHING: the current <audio>, a running sequence (and its gap
// timer), browser speech, and the synthesizer. Safe to call at any time.
// Used by tap-to-stop, by tapping a different button, and the dev Stop button.
//
// PROTECTED-LOGIC NOTE: this deliberately sets onended/onerror to null BEFORE
// pause(). Otherwise pausing could trigger the offline fallback (which would
// start a synth sound right after we asked for silence). The normal
// onerror/onended handlers in triggerStim() and playAudioSequence() are
// unchanged and still run whenever a sound is NOT being stopped by the user.
function stopAllAudio() {
  // Bumping the ticket makes every running sequence see a stale token and quit.
  sequenceToken++;
  if (sequenceTimer) { clearTimeout(sequenceTimer); sequenceTimer = null; } // Cancel a pending gap between clips.
  if (currentAudio) {                                // Detach handlers FIRST so a paused clip cannot fire a late fallback.
    currentAudio.onended = null; currentAudio.onerror = null;
    try { currentAudio.pause(); } catch (e) {}
    currentAudio = null;
  }
  // Cut off any spoken words from the SpeechSynthesis API.
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  // synth.js disconnects its master output, silencing every scheduled note.
  if (window.stopProceduralSound) window.stopProceduralSound();
  clearNowPlaying();                                 // Reset the button look + progress bar.
}

// Plays item.audioSequence clip by clip. 'item' is one entry of SOUNDBOARD_DATA.
function playAudioSequence(item) {
  // Claim a new ticket. This instantly "cancels" any sequence already running,
  // because their saved tokens are now out of date.
  const token = ++sequenceToken;

  // Pause between clips in milliseconds. item.sequenceGap can be either:
  //   - a single number (e.g. 500): the same pause after every clip, or
  //   - an array (e.g. [250, 500]): gaps[i] is the pause AFTER clip i, before
  //     clip i+1. So [250, 500] = 250ms after clip 0, 500ms after clip 1.
  // Any missing/invalid entry defaults to half a second (0 is allowed).
  const gapAfter = (index) => {
    const g = Array.isArray(item.sequenceGap) ? item.sequenceGap[index] : item.sequenceGap;
    return typeof g === 'number' ? g : 500;
  };

  // The ordered list of file names, e.g. ["bday1.m4a", "case.m4a", "bday2.m4a"].
  const clips = item.audioSequence;

  // The next clip, loaded in advance: { index, el } or null.
  let preloaded = null;

  // Milliseconds of trailing silence to skip for the clip at 'index'.
  // An explicit item.sequenceTrim[index] wins; otherwise use the automatic
  // measurement from extras.js (window.clipTail, keyed by file name); else 0.
  const trimAfter = (index) => {
    const manual = Array.isArray(item.sequenceTrim) ? item.sequenceTrim[index] : undefined;
    if (typeof manual === 'number') return manual;
    return (window.clipTail && window.clipTail[clips[index]]) || 0;
  };

  // If a previous gap timer is still pending, cancel it so it cannot start a
  // clip from the old sequence.
  if (sequenceTimer) { clearTimeout(sequenceTimer); sequenceTimer = null; }

  // Stop whatever audio is already playing. We also clear its handlers so a
  // paused clip can never fire a late 'ended' or 'error' event.
  if (currentAudio) { currentAudio.pause(); currentAudio.onended = null; currentAudio.onerror = null; }

  // Whole-item fallback: play the synth sound registered under item.id
  // (for the birthday card that is "birthday-surprise", the full tune).
  // The 'window.playProceduralSound' check makes it safe if synth.js failed to load.
  const fallback = () => { if (window.playProceduralSound) window.playProceduralSound(item.id, false); };

  // Plays the clip at position 'index'. Calls itself for the next position.
  const playClip = (index) => {
    // Stop if this sequence was cancelled (stale token) or we ran past the end.
    if (token !== sequenceToken) return;
    // Ran past the last clip: the whole sequence is finished, so reset the
    // button look and progress bar.
    if (index >= clips.length) { clearNowPlaying(); return; }

    // 'advanced' makes sure we move to the next clip only ONCE per clip. A
    // failing file can fire BOTH the 'error' event and the play() rejection,
    // and without this guard we would skip ahead twice.
    let advanced = false;

    // Called when the clip finishes normally: wait this clip's gap (gapAfter), then play the next.
    const next = () => {
      if (advanced || token !== sequenceToken) return; // Already handled, or cancelled.
      advanced = true;
      sequenceTimer = setTimeout(() => playClip(index + 1), gapAfter(index));
    };

    // Called when the clip cannot be played (missing file, decode error, autoplay block).
    const failed = () => {
      if (advanced || token !== sequenceToken) return; // Already handled, or cancelled.
      advanced = true;

      // Look up this clip's personal synth stand-in, if the data defines one.
      // Example entry: { id: "birthday-part1", ms: 5500 }.
      const fb = item.sequenceFallbacks && item.sequenceFallbacks[index];

      if (fb && window.playProceduralSound) {
        // Play the stand-in. Synth sounds give no 'ended' event, so we wait for
        // its estimated length (fb.ms, default 1000) PLUS this clip's gap, then
        // continue with the next clip.
        window.playProceduralSound(fb.id, false);
        sequenceTimer = setTimeout(() => playClip(index + 1), (fb.ms || 1000) + gapAfter(index));
      } else if (index === 0) {
        // No per-clip stand-in AND it was the first clip: play the whole-item synth sound.
        fallback();
      } else {
        // No stand-in for a later clip: skip it and move straight on.
        playClip(index + 1);
      }
    };

    // Use the copy we PRELOADED while the previous clip was playing, if there
    // is one for this position; otherwise create it now (first clip, or the
    // preload was discarded). Preloading removes the load delay between clips.
    const audio = (preloaded && preloaded.index === index) ? preloaded.el : new Audio(clips[index]);
    preloaded = null;
    currentAudio = audio;         // Remember it so the next tap can stop it.
    audio.onended = next;         // Finished normally -> schedule the next clip.
    audio.onerror = () => { if (window.stimLog) stimLog.warn("audio", "sequence clip failed", { file: clips[index] }); failed(); };       // Load/decode failure (e.g. 404) -> use the stand-in.

    // Start fetching the NEXT clip right now, in the background.
    if (index + 1 < clips.length) {
      const pre = new Audio(); pre.preload = 'auto'; pre.src = clips[index + 1];
      pre.onerror = () => {};     // Ignore: if it fails, playClip falls back normally.
      preloaded = { index: index + 1, el: pre };
    }

    // TAIL TRIM: many recordings end with silence baked into the file, and
    // 'ended' only fires after that silence. If we know how long the silent
    // tail is (item.sequenceTrim[index], or measured automatically by
    // extras.js into window.clipTail), move on as soon as the tail begins.
    // 'next' is guarded by 'advanced', so this can never double-advance, and
    // the normal onended above stays in place as the safety net.
    audio.addEventListener('playing', () => {
      const t = trimAfter(index);
      if (!(t > 0) || !isFinite(audio.duration)) return;
      const wait = Math.max(0, audio.duration * 1000 - t - audio.currentTime * 1000);
      setTimeout(() => {
        if (advanced || token !== sequenceToken) return; // Already moved on, or cancelled.
        audio.onended = null; audio.pause();             // Silence only: nothing audible is cut.
        next();
      }, wait);
    }, { once: true });

    // play() returns a Promise in modern browsers. It REJECTS when playback is
    // refused (autoplay policy, unsupported source), so route that to 'failed'.
    const p = audio.play();
    if (p !== undefined) p.catch(failed);
  };

  // Start the sequence at the first clip.
  playClip(0);
}

// The click handler shared by EVERY button. 'item' is its SOUNDBOARD_DATA
// entry; 'el' is the button element (used for the 'playing' glow animation).
function triggerStim(item, el) {
  // TAP-TO-STOP: tapping the button that is already playing stops it, and we
  // return immediately so the tap does NOT also start the sound again.
  if (nowPlaying && nowPlaying.item === item) { stopAllAudio(); return; }
  // Tapping a DIFFERENT button stops whatever was playing first, so two
  // sounds can never overlap. (Harmless when nothing is playing.)
  stopAllAudio();
  // Remember it for the "recently played" list (extras.js; no-op if absent).
  if (window.recordPlay) window.recordPlay(item);
  // Estimated length for the progress bar / watchdog. data.js 'durationMs'
  // wins; otherwise guess 14s for the birthday sequence and 6s for the rest.
  // Real recordings replace the guess with their true length once loaded.
  setNowPlaying(item, el, item.durationMs || (item.audioSequence ? 14000 : 6000));
  // HAPTICS: vibrate the phone with the item's pattern (array of milliseconds,
  // alternating vibrate/pause, e.g. [200,100,200] = buzz, rest, buzz).
  // 'vibrate' in navigator is false on desktop and iOS, so we guard it.
  if (item.vibrate && 'vibrate' in navigator) navigator.vibrate(item.vibrate);

  // CONFETTI: 'confetti: true' means 1 burst, 'confetti: 4' means 4 bursts.
  if (item.confetti) {
    const burstCount = typeof item.confetti === 'number' ? item.confetti : 1;
    // Stagger the bursts 300ms apart (0ms, 300ms, 600ms, ...) for a fireworks feel.
    for (let i = 0; i < burstCount; i++) { setTimeout(burstConfetti, i * 300); }
  }

  // VISUAL FEEDBACK: add the 'playing' class (CSS gives it a glow/pulse) and
  // remove it again after 800ms. 'el' can be undefined, so check first.
  if (el) { el.classList.add('playing'); setTimeout(() => el.classList.remove('playing'), 800); }

  // BEHAVIOUR (c): multi-clip sequence. Hand off completely and stop here.
  // Array.isArray + length guards against a missing or empty list.
  if (Array.isArray(item.audioSequence) && item.audioSequence.length) {
    playAudioSequence(item);
    return;
  }

  if (item.audio) {
    // BEHAVIOURS (a) and (b): a single recording.
    // First stop any audio still playing and clear its handlers (see above).
    if (currentAudio) { currentAudio.pause(); currentAudio.onended = null; currentAudio.onerror = null; }

    // Create the audio element for the recording and make it the current one.
    currentAudio = new Audio(item.audio);
    // Once the browser knows the file's real length, use it for the progress
    // bar. appendProcedural items add 2.5s of room for the chained synth notes.
    // isFinite() guards against 'Infinity'/NaN, which some streams report.
    // (An EXTRA listener: it does not touch the protected onerror/onended below.)
    const extraMs = item.appendProcedural ? 2500 : 0;
    currentAudio.addEventListener('loadedmetadata', () => { if (isFinite(currentAudio.duration)) updatePlayingDuration(currentAudio.duration * 1000 + extraMs); });

    // ONERROR (protected): the file failed to load -> play the full synth
    // version for this id, INCLUDING speech (second argument false = do not skip vocals).
    currentAudio.onerror = () => { if (window.stimLog) stimLog.warn("audio", "file failed, using synth", { id: item.id, file: item.audio }); if (window.playProceduralSound) window.playProceduralSound(item.id, false); };
    // Real recording finished and nothing is chained after it -> clear the
    // playing state. (appendProcedural overrides onended just below; the
    // watchdog timer clears the state for those.)
    currentAudio.onended = () => { clearNowPlaying(); };

    // ONENDED (protected): only for 'appendProcedural' items. After the real
    // recording finishes, chain the synth sound onto the end. 'true' = skip the
    // spoken words (the recording already said them); only instruments play.
    if (item.appendProcedural) { currentAudio.onended = () => { if (window.playProceduralSound) window.playProceduralSound(item.id, true); }; }

    // Start playback. play() returns a Promise that rejects if the browser
    // blocks or cannot start playback; treat that exactly like a load error.
    const playPromise = currentAudio.play();
    if (playPromise !== undefined) { playPromise.catch(() => { if (window.playProceduralSound) window.playProceduralSound(item.id, false); }); }
  } else {
    // No recording configured at all: go straight to the synth sound.
    if (window.playProceduralSound) window.playProceduralSound(item.id, false);
  }
}

/* --------------------------------------------------------------------------
   4. DOM BUILDER (Mounts Hero, Featured, Birthday, Grids)
   --------------------------------------------------------------------------
   Reads window.SOUNDBOARD_DATA and creates the buttons. Each item's 'type'
   decides WHERE it goes:
     'hero'     -> #heroSlot      (the big red CASE! card)
     'featured' -> #featuredSlot  (the gold trumpet card)
     'birthday' -> #featuredSlot  (the shimmering purple card)
     anything else -> grouped by item.group into grids inside #gridContainer
   -------------------------------------------------------------------------- */
function renderSoundboard() {
  // The mount points that exist in index.html.
  const heroSlot = document.getElementById('heroSlot');
  const featuredSlot = document.getElementById('featuredSlot');
  const gridContainer = document.getElementById('gridContainer');
  const slotCounter = document.getElementById('slotCounter'); // The "N Stims" pill in the header.

  // Fall back to an empty list if data.js failed to define the data.
  const data = window.SOUNDBOARD_DATA || [];

  // VISIBILITY RULES. An item is shown only if ALL of these are true:
  //   1. item.active is true (the master on/off switch in data.js), AND
  //   2. it is not birthdayOnly, OR it is the real birthday, OR dev mode is on
  //      (this is how the birthday card appears/disappears), AND
  //   3. it passes the search / favorites-only filter (window.stimFilter, which
  //      always lets the big top cards through and filters the grid buttons).
  // isDevMode()/isBirthdayNow() come from extras.js (loaded before this file);
  // the "? ... : false" fallbacks keep the app working if it is missing.
  const dev = window.isDevMode ? window.isDevMode() : false;
  const bday = window.isBirthdayNow ? window.isBirthdayNow() : false;
  const activeStims = data.filter(item => item.active && (!item.birthdayOnly || bday || dev) && (!window.stimFilter || window.stimFilter(item)));

  // Re-runnable: wipe whatever a previous render put in the mount points.
  [heroSlot, featuredSlot, gridContainer].forEach(m => { if (m) m.innerHTML = ''; });

  // Update the header pill, e.g. "21 Stims".
  if (slotCounter) slotCounter.textContent = `${activeStims.length} Stims`;

  // Collects the ordinary grid items by group name while we loop, shaped like:
  //   { "The Classics": { collapsible: false, items: [...] }, ... }
  const groupedItems = {};

  activeStims.forEach(item => {
    if (item.type === 'hero' && heroSlot) {
      // ---- HERO CARD ----
      const heroBtn = document.createElement('button');
      heroBtn.className = 'hero-card'; // Styled by .hero-card in styles.css.
      // Use a real photo if item.image is set, otherwise show an emoji avatar.
      const imgMarkup = item.image ? `<img src="${item.image}" alt="${item.title}" class="hero-avatar">` : `<div class="hero-avatar">👩🏻</div>`;
      // Build the inner layout: avatar (with pulse ring) on the left, text on the right.
      heroBtn.innerHTML = `<div class="hero-avatar-wrapper">${imgMarkup}<div class="hero-pulse-ring"></div></div><div class="hero-info"><span class="hero-title">${item.title}</span><span class="hero-sub">${item.subtitle}</span></div>`;
      // On tap, run the shared handler. The arrow function captures THIS item and button.
      heroBtn.addEventListener('click', () => triggerStim(item, heroBtn));
      // data-id lets extras.js find this card later (e.g. to update its star).
      heroBtn.dataset.id = item.id;
      // extras.js hook: adds the progress bar to this card.
      if (window.decorateCard) window.decorateCard(heroBtn, item);
      heroSlot.appendChild(heroBtn);
    } else if (item.type === 'featured' && featuredSlot) {
      // ---- FEATURED CARD (The Trumpet) ----
      const featBtn = document.createElement('button');
      featBtn.className = 'featured-card';
      featBtn.innerHTML = `<div class="featured-content"><span class="featured-title">${item.title}</span><span class="featured-sub">${item.subtitle}</span></div><span class="featured-icon">${item.icon || "🎺"}</span>`;
      featBtn.addEventListener('click', () => triggerStim(item, featBtn));
      // data-id lets extras.js find this card later (e.g. to update its star).
      featBtn.dataset.id = item.id;
      // extras.js hook: adds the progress bar to this card.
      if (window.decorateCard) window.decorateCard(featBtn, item);
      featuredSlot.appendChild(featBtn);
    } else if (item.type === 'birthday' && featuredSlot) {
      // ---- BIRTHDAY CARD (only present on the birthday or in dev mode) ----
      const bdayBtn = document.createElement('button');
      bdayBtn.className = 'birthday-card'; // Has the shimmering gradient animation.
      bdayBtn.innerHTML = `<div class="birthday-content"><span class="birthday-title">${item.title}</span><span class="birthday-sub">${item.subtitle}</span></div><span class="birthday-icon">${item.icon || "🎂"}</span>`;
      bdayBtn.addEventListener('click', () => triggerStim(item, bdayBtn));
      // data-id lets extras.js find this card later (e.g. to update its star).
      bdayBtn.dataset.id = item.id;
      // extras.js hook: adds the progress bar to this card.
      if (window.decorateCard) window.decorateCard(bdayBtn, item);
      featuredSlot.appendChild(bdayBtn);
    } else {
      // ---- ORDINARY ITEM: just file it under its group for now ----
      // Items without a 'group' land in "Misc Stims".
      const groupName = item.group || "Misc Stims";
      // Create the group bucket the first time we see this group name.
      if (!groupedItems[groupName]) { groupedItems[groupName] = { collapsible: Boolean(item.collapsible), items: [] }; }
      // If ANY item in the group asks for collapsible, the whole group becomes collapsible.
      if (item.collapsible) groupedItems[groupName].collapsible = true;
      groupedItems[groupName].items.push(item);
    }
  });

  // Without a grid mount point there is nowhere to put the grouped items.
  if (!gridContainer) return;

  // True while a search term or favorites-only filter is narrowing the list.
  const filtering = window.stimFilterActive ? window.stimFilterActive() : false;

  // Nothing matched: say so, instead of leaving an empty page under the search box.
  if (filtering && Object.keys(groupedItems).length === 0) {
    const none = document.createElement('p');
    none.className = 'no-results';
    none.textContent = 'No stims match. Try a different search, or turn off Favs.';
    gridContainer.appendChild(none);
    return;
  }

  // Build one section per group, in the order the groups first appeared.
  Object.keys(groupedItems).forEach(groupName => {
    const groupData = groupedItems[groupName];

    // The 2-column grid that will hold this group's buttons.
    const grid = document.createElement('div');
    grid.className = 'sound-grid';

    groupData.items.forEach(item => {
      const gridBtn = document.createElement('button');
      gridBtn.className = 'stim-card';
      // Icon on top, title + subtitle underneath. Default icon is a speaker.
      gridBtn.innerHTML = `<span class="stim-icon">${item.icon || "🔊"}</span><div class="stim-text"><span class="stim-title">${item.title}</span><span class="stim-sub">${item.subtitle}</span></div>`;
      gridBtn.addEventListener('click', () => triggerStim(item, gridBtn));
      gridBtn.dataset.id = item.id;
      // extras.js hook: adds the favorite star, the progress bar and (for stims
      // added through the form, in dev mode) the edit pencil. Safe no-op if
      // extras.js is missing.
      if (window.decorateCard) window.decorateCard(gridBtn, item);
      grid.appendChild(gridBtn);
    });

    if (groupData.collapsible) {
      // COLLAPSIBLE group: native <details>/<summary> accordion (no JS needed
      // to open/close it; the browser handles it and CSS styles the arrow).
      const details = document.createElement('details');
      details.className = 'collapsible-group';
      // While filtering, open the group so its matches are visible. Without
      // this, a match inside a closed accordion would look like "no results".
      if (filtering) details.open = true;
      const summary = document.createElement('summary');
      // Shows "Group Name (count)" plus the rotating arrow.
      summary.innerHTML = `<span>${groupName} (${groupData.items.length})</span><span class="collapse-arrow">▼</span>`;
      details.appendChild(summary);
      details.appendChild(grid);
      gridContainer.appendChild(details);
    } else {
      // NORMAL group: a heading followed by the grid, always visible.
      const section = document.createElement('div');
      section.className = 'group-section';
      const title = document.createElement('h2');
      title.className = 'group-title';
      title.textContent = groupName; // textContent (not innerHTML) so the name is treated as plain text.
      section.appendChild(title);
      section.appendChild(grid);
      gridContainer.appendChild(section);
    }
  });
}

// Expose the builder so extras.js can re-render (dev mode, search, favorites filter).
window.renderSoundboard = renderSoundboard;
window.triggerStim = triggerStim;
window.stopAllAudio = stopAllAudio;

// Run the builder as soon as the DOM is ready. Because app.js is loaded at the
// very end of <body>, the DOM is usually ALREADY parsed, so the second branch
// runs immediately; the first branch is a safety net if the script is moved.
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', renderSoundboard); } else { renderSoundboard(); }
