/* ==========================================================================
   STIMboard Main Application Controller (app.js)
   --------------------------------------------------------------------------
   ROLE OF THIS FILE
   This is the "brain" of the page. It is loaded LAST (see index.html) so that
   everything it depends on already exists by the time it runs:
     - data.js   -> defines window.SOUNDBOARD_DATA (the list of buttons)
     - synth.js  -> defines window.playProceduralSound (the synth fallback)
   What lives in here, in file order:
     0. A "cache nuker" that deletes old Cache Storage entries on every load
     1. Service worker registration + the Android "Install App" button logic
     2. The confetti / emoji particle engine (drawn on a fullscreen <canvas>)
     3. The audio sequencer: playAudioSequence() and triggerStim()
     4. The DOM builder: renderSoundboard() turns SOUNDBOARD_DATA into buttons
   ========================================================================== */

/* --------------------------------------------------------------------------
   0. CACHE NUKER
   --------------------------------------------------------------------------
   Phones cache PWA files very aggressively. On every page load this block
   asks the browser for the NAMES of every cache in Cache Storage and deletes
   each one, so stale copies of the app can never survive.
   IMPORTANT SIDE EFFECT: because this runs on EVERY load, it also wipes the
   offline copies that sw.js saved on the previous visit. The service worker
   re-fills the cache as files are re-fetched, but there is a race: if the
   phone goes offline right after a nuke, there may be little left to serve.
   (Behaviour is intentionally unchanged here; this note is documentation.)
   -------------------------------------------------------------------------- */
// 'window.caches' only exists in secure contexts (https or localhost) and in
// browsers that support the Cache Storage API, so we feature-detect first.
if (window.caches) {
  // caches.keys() returns a Promise that resolves to an array of cache names
  // (for example ['stimboard-modular-v9']).
  caches.keys().then(keys => {
    // Loop over every cache name found...
    keys.forEach(key => {
      // ...and delete that cache. caches.delete() is async too, but we do not
      // need to wait for it, so the returned Promise is deliberately ignored.
      caches.delete(key);
    });
  });
}

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

// Plays item.audioSequence clip by clip. 'item' is one entry of SOUNDBOARD_DATA.
function playAudioSequence(item) {
  // Claim a new ticket. This instantly "cancels" any sequence already running,
  // because their saved tokens are now out of date.
  const token = ++sequenceToken;

  // Pause between clips in milliseconds. Use item.sequenceGap if it is a real
  // number (0 is allowed), otherwise default to half a second.
  const gapMs = typeof item.sequenceGap === 'number' ? item.sequenceGap : 500;

  // The ordered list of file names, e.g. ["bday1.m4a", "case.m4a", "bday2.m4a"].
  const clips = item.audioSequence;

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
    if (token !== sequenceToken || index >= clips.length) return;

    // 'advanced' makes sure we move to the next clip only ONCE per clip. A
    // failing file can fire BOTH the 'error' event and the play() rejection,
    // and without this guard we would skip ahead twice.
    let advanced = false;

    // Called when the clip finishes normally: wait 'gapMs', then play the next.
    const next = () => {
      if (advanced || token !== sequenceToken) return; // Already handled, or cancelled.
      advanced = true;
      sequenceTimer = setTimeout(() => playClip(index + 1), gapMs);
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
        // its estimated length (fb.ms, default 1000) PLUS the usual gap, then
        // continue with the next clip.
        window.playProceduralSound(fb.id, false);
        sequenceTimer = setTimeout(() => playClip(index + 1), (fb.ms || 1000) + gapMs);
      } else if (index === 0) {
        // No per-clip stand-in AND it was the first clip: play the whole-item synth sound.
        fallback();
      } else {
        // No stand-in for a later clip: skip it and move straight on.
        playClip(index + 1);
      }
    };

    // Create the audio element for this clip (the browser starts loading it).
    const audio = new Audio(clips[index]);
    currentAudio = audio;         // Remember it so the next tap can stop it.
    audio.onended = next;         // Finished normally -> schedule the next clip.
    audio.onerror = failed;       // Load/decode failure (e.g. 404) -> use the stand-in.

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

    // ONERROR (protected): the file failed to load -> play the full synth
    // version for this id, INCLUDING speech (second argument false = do not skip vocals).
    currentAudio.onerror = () => { if (window.playProceduralSound) window.playProceduralSound(item.id, false); };

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

  // Only items with active:true are shown. This is how the birthday card
  // appears/disappears (its 'active' is the isBirthday flag from data.js).
  const activeStims = data.filter(item => item.active);

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
      heroSlot.appendChild(heroBtn);
    } else if (item.type === 'featured' && featuredSlot) {
      // ---- FEATURED CARD (The Trumpet) ----
      const featBtn = document.createElement('button');
      featBtn.className = 'featured-card';
      featBtn.innerHTML = `<div class="featured-content"><span class="featured-title">${item.title}</span><span class="featured-sub">${item.subtitle}</span></div><span class="featured-icon">${item.icon || "🎺"}</span>`;
      featBtn.addEventListener('click', () => triggerStim(item, featBtn));
      featuredSlot.appendChild(featBtn);
    } else if (item.type === 'birthday' && featuredSlot) {
      // ---- BIRTHDAY CARD (only present when active/isBirthday is true) ----
      const bdayBtn = document.createElement('button');
      bdayBtn.className = 'birthday-card'; // Has the shimmering gradient animation.
      bdayBtn.innerHTML = `<div class="birthday-content"><span class="birthday-title">${item.title}</span><span class="birthday-sub">${item.subtitle}</span></div><span class="birthday-icon">${item.icon || "🎂"}</span>`;
      bdayBtn.addEventListener('click', () => triggerStim(item, bdayBtn));
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
      grid.appendChild(gridBtn);
    });

    if (groupData.collapsible) {
      // COLLAPSIBLE group: native <details>/<summary> accordion (no JS needed
      // to open/close it; the browser handles it and CSS styles the arrow).
      const details = document.createElement('details');
      details.className = 'collapsible-group';
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

// Run the builder as soon as the DOM is ready. Because app.js is loaded at the
// very end of <body>, the DOM is usually ALREADY parsed, so the second branch
// runs immediately; the first branch is a safety net if the script is moved.
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', renderSoundboard); } else { renderSoundboard(); }