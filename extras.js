/* ==========================================================================
   STIMboard Extras (extras.js)
   --------------------------------------------------------------------------
   ROLE OF THIS FILE
   Everything that is "around" the soundboard rather than part of its core:
   developer mode, toast messages, favorites, recently played, search,
   filtering, progress bars, the birthday countdown, the birthday intro with
   fireworks, and audio preloading.

   LOAD ORDER (see index.html)
     data.js -> synth.js -> extras.js -> app.js
   extras.js needs synth.js (it reuses getAudioCtx, playBrassNote, playClap and
   playSubDrop, which are plain globals) and data.js (window.SOUNDBOARD_DATA and
   window.STIM_BIRTHDAY). It must load BEFORE app.js because app.js looks for
   window.isDevMode / window.isBirthdayNow the moment it first renders.

   HOW THE FILES TALK TO EACH OTHER
   There is no module system, so files cooperate through properties on 'window':
     extras.js PROVIDES: isDevMode, isBirthdayNow, showToast, recordPlay,
                         stimFilter, progressStart, progressStop, decorateCard,
                         renderCountdown, buildDevButtons, refreshExtras,
                         playBirthdayIntro
     app.js    PROVIDES: renderSoundboard, triggerStim, stopAllAudio
   Every call across files is guarded (e.g. "if (window.recordPlay)") so a
   missing file can never break the soundboard itself.

   PARTS, in file order
     1. Toast, dev mode, the 8-second logo hold, birthday helpers
     2. Favorites, recently played, search + filter, progress bar, toolbar
     3. Countdown card, birthday intro (fireworks + fanfare), dev buttons
     4. Audio preloading
   ========================================================================== */

/* --------------------------------------------------------------------------
   PART 1A. TOAST
   A toast is a small temporary message. One <div id="toast"> is created the
   first time it is needed and reused afterwards. Its look (position, fade and
   slide) lives in styles.css under "#toast".
   -------------------------------------------------------------------------- */

// Handle of the timer that hides the toast, so a new message can cancel the
// old timer (otherwise message 1's timer would hide message 2 too early).
let toastTimer = null;

// Shows 'message' for 'ms' milliseconds (default 2.6 seconds).
function showToast(message, ms = 2600) {
  // Look for an existing toast element from an earlier call.
  let el = document.getElementById('toast');
  if (!el) {                                   // First call ever: build it.
    el = document.createElement('div');
    el.id = 'toast';
    // role="status" + aria-live="polite" make screen readers read the message
    // aloud without interrupting whatever they are currently saying.
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  // textContent (not innerHTML) so the message is always treated as plain text.
  el.textContent = message;
  // Remove the 'show' class, read offsetWidth (this forces the browser to
  // recalculate layout right now), then add the class again. Without that
  // forced reflow the browser would merge the two changes and the CSS
  // transition would not restart when a second toast arrives quickly.
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  // Cancel any pending hide, then schedule a new one.
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}
// Expose it so other files (and the dev buttons below) can call it.
window.showToast = showToast;

/* --------------------------------------------------------------------------
   PART 1B. DEVELOPER MODE
   A hidden switch that reveals test tools and the unfinished features
   (search, favorites, recents) and lets the birthday card show on any day.
   The setting is saved in localStorage so it survives closing the app.
   -------------------------------------------------------------------------- */

// The localStorage key. localStorage only stores strings, so we save '1'/'0'.
const DEV_KEY = 'stimboard-dev-mode';

// localStorage can THROW (private browsing, blocked storage, full quota), so
// every access is wrapped in try/catch and failures just mean "dev mode off".
function isDevMode() { try { return localStorage.getItem(DEV_KEY) === '1'; } catch (e) { return false; } }

// Turns dev mode on or off and updates everything that depends on it.
function setDevMode(on) {
  // Save the choice (ignore storage errors; the toggle still works this session).
  try { localStorage.setItem(DEV_KEY, on ? '1' : '0'); } catch (e) {}
  // styles.css hides every '.dev-only' element unless <body> has 'dev-mode'.
  document.body.classList.toggle('dev-mode', on);
  // Rebuild the soundboard: the birthday card appears/disappears with dev mode.
  if (window.renderSoundboard) window.renderSoundboard();
  // Refresh the toolbar, quick lists, countdown card and dev buttons.
  if (window.refreshExtras) window.refreshExtras();
}
// app.js calls window.isDevMode() while building the card list.
window.isDevMode = isDevMode;

/* --------------------------------------------------------------------------
   PART 1C. BIRTHDAY HELPERS
   The actual date maths lives in data.js, which publishes the result as
   window.STIM_BIRTHDAY = { isBirthday, daysUntilBirthday, countdownDays }.
   -------------------------------------------------------------------------- */

// True only on the real birthday. '!!' converts the result to a strict boolean
// and the && chain makes it safe if data.js failed to load.
function isBirthdayNow() { return !!(window.STIM_BIRTHDAY && window.STIM_BIRTHDAY.isBirthday); }
window.isBirthdayNow = isBirthdayNow;

/* --------------------------------------------------------------------------
   PART 1D. THE 8-SECOND LOGO HOLD
   Holding a finger (or mouse button) on the logo for 8 seconds toggles dev
   mode. Pointer events cover touch, mouse and pen with one set of listeners.
   -------------------------------------------------------------------------- */

// How long the logo must be held, in milliseconds.
const HOLD_MS = 8000;

function wireLogoHold() {
  // '.brand' wraps the trumpet icon AND the "STIMboard" title in index.html.
  const logo = document.querySelector('.brand');
  if (!logo) return;                 // Nothing to wire if the markup changed.

  // Handle of the running hold timer, or null when no hold is in progress.
  let holdTimer = null;

  // Finger/mouse went DOWN on the logo: start the countdown.
  const start = (e) => {
    clearTimeout(holdTimer);         // Defensive: never run two timers at once.
    holdTimer = setTimeout(() => {
      // 8 seconds passed without being cancelled: toggle dev mode.
      holdTimer = null;
      const next = !isDevMode();     // Flip the current state.
      setDevMode(next);
      // The required toast telling the user which way it went.
      showToast(next ? '🛠️ Developer mode ENABLED' : '🔒 Developer mode DISABLED');
      // A short buzz confirms it without looking: two pulses = on, one = off.
      if (navigator.vibrate) navigator.vibrate(next ? [60, 40, 60] : [120]);
    }, HOLD_MS);
  };

  // Releasing early, sliding the finger off the logo, or the OS taking over
  // the touch (e.g. a system gesture) all abort the hold.
  const cancel = () => { clearTimeout(holdTimer); holdTimer = null; };

  logo.addEventListener('pointerdown', start);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => logo.addEventListener(t, cancel));

  // On Android a long press normally opens a context menu, which would steal
  // the touch and cancel the hold. Block that menu on the logo only.
  logo.addEventListener('contextmenu', (e) => e.preventDefault());
}

// Apply the saved dev-mode class immediately (before first paint matters), so
// dev-only elements never flash on or off after load. Then wire up the logo.
document.body.classList.toggle('dev-mode', isDevMode());
wireLogoHold();

/* ==========================================================================
   PART 2. FAVORITES, RECENTLY PLAYED, SEARCH + FILTER, PROGRESS BAR
   --------------------------------------------------------------------------
   The code for all of these is always present, but every piece of their UI
   carries the class 'dev-only'. styles.css hides '.dev-only' unless <body>
   also has the class 'dev-mode', so normal users never see them.
   ========================================================================== */

/* ---- Small safe wrappers around localStorage (it stores strings only) ---- */

// Reads and parses JSON saved under 'key'. Returns 'fallback' if nothing is
// saved, if the saved text is not valid JSON, or if storage is unavailable.
// (JSON.parse(null) gives null, which the == null check catches too.)
function loadJSON(key, fallback) { try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; } }

// Converts 'val' to JSON text and saves it. Storage errors are ignored: the
// feature just will not persist, but nothing crashes.
function saveJSON(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

/* ---- FAVORITES: an array of item ids, saved between launches ---- */
const FAV_KEY = 'stimboard-favs';
let favs = loadJSON(FAV_KEY, []);                      // e.g. ["case", "drg-stone"]

// True if this item id is currently a favorite.
function isFav(id) { return favs.indexOf(id) !== -1; }

// Adds the id if absent, removes it if present, saves, then redraws the UI.
function toggleFav(id) {
  // filter() builds a new array without the id; concat() builds one with it.
  favs = isFav(id) ? favs.filter(f => f !== id) : favs.concat(id);
  saveJSON(FAV_KEY, favs);
  refreshExtras();     // Updates the quick lists.
  // Update every matching star IN PLACE. A full re-render would collapse any
  // open accordion, which is annoying while starring several salutes.
  document.querySelectorAll('[data-id="' + id + '"] .fav-star').forEach(s => {
    s.classList.toggle('on', isFav(id));
    s.textContent = isFav(id) ? '★' : '☆';
  });
  // Only the favorites-only filter needs a real re-render (the card must vanish).
  if (filterState.favsOnly && window.renderSoundboard) window.renderSoundboard();
}

/* ---- RECENTLY PLAYED: newest first, at most 6, no duplicates ---- */
const RECENT_KEY = 'stimboard-recent';
const RECENT_MAX = 6;                                  // How many ids to remember.
let recents = loadJSON(RECENT_KEY, []);

// Called by app.js's triggerStim() on every tap (that is why it is on window).
window.recordPlay = function (item) {
  // Ignore bad input, and skip the birthday card (it is a one-off, not a "stim").
  if (!item || !item.id || item.type === 'birthday') return;
  // Put this id first, drop any older copy of it, keep only the newest 6.
  recents = [item.id].concat(recents.filter(r => r !== item.id)).slice(0, RECENT_MAX);
  saveJSON(RECENT_KEY, recents);
  renderQuickLists();  // Update the "Recently played" row straight away.
};

/* ---- SEARCH + FILTER ---- */

// The current filter settings, edited by the toolbar controls further down.
//   text     : what is typed in the search box
//   favsOnly : true when the "Favs" toggle is on
const filterState = { text: '', favsOnly: false };

// app.js calls this for every item while rendering; returning false hides it.
window.stimFilter = function (item) {
  // Normal users never get filtering, even if a stale search term exists.
  if (!isDevMode()) return true;
  // Favorites-only mode: hide everything that is not starred.
  if (filterState.favsOnly && !isFav(item.id)) return false;
  // Case-insensitive search text. An empty search matches everything.
  const q = filterState.text.trim().toLowerCase();
  if (!q) return true;
  // Search the title, subtitle and group name together as one string.
  return ((item.title || '') + ' ' + (item.subtitle || '') + ' ' + (item.group || '')).toLowerCase().indexOf(q) !== -1;
};

/* ---- PROGRESS BAR: a thin bar along the bottom edge of the playing card ---- */

// Starts (or restarts) the bar and animates it from 0% to 100% over 'ms'.
// app.js calls this when a sound starts and again when a real clip reports
// its true length.
window.progressStart = function (el, ms) {
  if (!el) return;
  // decorateCard() normally already added the bar; create one if it did not.
  let bar = el.querySelector('.progress-bar');
  if (!bar) { bar = document.createElement('div'); bar.className = 'progress-bar'; el.appendChild(bar); }
  // Jump back to 0% with no animation, force a reflow so the browser accepts
  // that as the new starting point, THEN turn the animation on and aim at 100%.
  bar.style.transition = 'none'; bar.style.width = '0%'; void bar.offsetWidth;
  bar.style.transition = 'width ' + (ms || 6000) + 'ms linear'; bar.style.width = '100%';
};

// Resets the bar instantly (used when a sound ends or is stopped).
window.progressStop = function (el) {
  if (!el) return;
  const bar = el.querySelector('.progress-bar');
  if (bar) { bar.style.transition = 'none'; bar.style.width = '0%'; }
};

/* ---- decorateCard: app.js calls this for every button it builds ---- */
// 'btn' is the new button element; 'item' is its SOUNDBOARD_DATA entry.
window.decorateCard = function (btn, item) {
  // The bar and star are positioned absolutely, so the card must be their
  // positioning anchor. Keep an existing value if one was already set.
  btn.style.position = btn.style.position || 'relative';
  // Every card gets a progress bar (width 0 until a sound plays).
  const bar = document.createElement('div'); bar.className = 'progress-bar'; btn.appendChild(bar);
  if (item.type === 'birthday') return;       // No favorite star on the birthday card.
  // The star is a <span>, NOT a <button>: buttons cannot be nested in buttons.
  const star = document.createElement('span');
  // 'dev-only' hides it for normal users; 'on' colours it gold when favorited.
  star.className = 'fav-star dev-only' + (isFav(item.id) ? ' on' : '');
  star.textContent = isFav(item.id) ? '★' : '☆';
  star.setAttribute('role', 'button'); star.setAttribute('aria-label', 'Toggle favorite');
  // stopPropagation() keeps the click from also reaching the card underneath,
  // so starring something does not play its sound.
  star.addEventListener('click', (e) => { e.stopPropagation(); toggleFav(item.id); });
  btn.appendChild(star);
  // Stims added through the form (marked userStim) also get a pencil that opens
  // the edit form. Built-in stims from data.js have none: they are edited in the code.
  if (item.userStim) {
    const pen = document.createElement('span');
    pen.className = 'edit-pen dev-only';
    pen.textContent = '✏️';
    pen.setAttribute('role', 'button'); pen.setAttribute('aria-label', 'Edit stim');
    pen.addEventListener('click', (e) => { e.stopPropagation(); window.openAddStim(item); }); // Do not play the sound.
    btn.appendChild(pen);
  }
};

/* ---- QUICK LISTS: "Favorites" and "Recently played" chip rows ---- */

// Finds an ACTIVE item by id (inactive/missing ones are silently dropped).
function findItem(id) { return (window.SOUNDBOARD_DATA || []).find(i => i.id === id && i.active); }

// Rebuilds both rows inside <div id="quickLists"> (created by buildToolbar).
function renderQuickLists() {
  const host = document.getElementById('quickLists');
  if (!host) return;                          // Toolbar not built yet.
  host.innerHTML = '';                        // Start from a clean slate.
  // Two rows: [heading, list of ids]. Destructured straight into the loop.
  [['⭐ Favorites', favs], ['🕘 Recently played', recents]].forEach(([label, ids]) => {
    // Turn ids into real items and drop any that no longer exist.
    const items = ids.map(findItem).filter(Boolean);
    if (!items.length) return;                // Empty row: show nothing at all.
    const row = document.createElement('div'); row.className = 'quick-row';
    const h = document.createElement('div'); h.className = 'quick-title'; h.textContent = label; row.appendChild(h);
    const chips = document.createElement('div'); chips.className = 'quick-chips';
    items.forEach(it => {
      const chip = document.createElement('button');
      chip.className = 'quick-chip'; chip.textContent = (it.icon || '🔊') + ' ' + it.title;
      // Tapping a chip plays the stim exactly like tapping its real button.
      chip.addEventListener('click', () => window.triggerStim(it, chip));
      chips.appendChild(chip);
    });
    row.appendChild(chips); host.appendChild(row);
  });
}

/* ---- DEV TOOLBAR: search box + favorites-only toggle + quick lists ---- */

// Builds the toolbar once and inserts it ABOVE the hero card.
function buildToolbar() {
  if (document.getElementById('devToolbar')) return;   // Already built: do nothing.
  const anchor = document.getElementById('heroSlot');
  if (!anchor) return;
  const wrap = document.createElement('div'); wrap.id = 'devToolbar'; wrap.className = 'dev-only';
  // The markup is a fixed string (no user data), so innerHTML is safe here.
  // #devButtons is filled by buildDevButtons(); #quickLists by renderQuickLists().
  wrap.innerHTML = '<div class="dev-badge">🛠️ DEV MODE</div>' +
    '<div class="search-row"><input id="searchBox" type="search" placeholder="Search stims…" autocomplete="off">' +
    '<button id="favFilterBtn" type="button">☆ Favs</button></div>' +
    '<div id="devButtons"></div><div id="quickLists"></div>';
  // Insert directly before #heroSlot, inside the same parent column.
  anchor.parentNode.insertBefore(wrap, anchor);

  // SEARCH: on every keystroke store the text and re-render the soundboard,
  // which re-runs window.stimFilter for every item.
  const box = wrap.querySelector('#searchBox');
  box.addEventListener('input', () => { filterState.text = box.value; window.renderSoundboard(); });

  // FAVORITES-ONLY toggle: flips the flag, updates the label/colour, re-renders.
  const favBtn = wrap.querySelector('#favFilterBtn');
  favBtn.addEventListener('click', () => {
    filterState.favsOnly = !filterState.favsOnly;
    favBtn.textContent = filterState.favsOnly ? '★ Favs' : '☆ Favs';
    favBtn.classList.toggle('on', filterState.favsOnly);
    window.renderSoundboard();
  });
}

// Redraws everything this file owns. Called at start-up and after any change
// to dev mode or favorites. Each optional piece is guarded because it is
// defined later in the file (Part 3) or may be absent.
function refreshExtras() {
  buildToolbar();
  renderQuickLists();
  if (window.renderCountdown) window.renderCountdown();
  if (window.buildDevButtons) window.buildDevButtons();
}
window.refreshExtras = refreshExtras;

/* ==========================================================================
   PART 3. COUNTDOWN CARD, BIRTHDAY INTRO, DEV TEST BUTTONS
   ========================================================================== */

/* ---- COUNTDOWN CARD ---- */
// Shown only in the 7 days before the birthday (COUNTDOWN_DAYS in data.js),
// or at any time before the date while in dev mode (so it can be previewed).
// Safe to call repeatedly: it removes its previous card first.
window.renderCountdown = function () {
  const old = document.getElementById('countdownCard');
  if (old) old.remove();                      // Remove the previous copy, if any.
  const b = window.STIM_BIRTHDAY; if (!b) return;
  const days = b.daysUntilBirthday;           // 0 on the day itself.
  // days > 0 excludes the birthday itself (the birthday card takes over then).
  const show = (days > 0 && days <= b.countdownDays) || (isDevMode() && days > 0);
  if (!show) return;
  const card = document.createElement('div');
  card.id = 'countdownCard';
  card.className = 'countdown-card';          // Styled in styles.css.
  // Singular wording for the last day, plural otherwise.
  card.textContent = days === 1 ? 'Tomorrow is the big day! 🎂' : days + ' days until your birthday! 🎈';
  // Place it directly above the hero (CASE!) card.
  const hero = document.getElementById('heroSlot');
  if (hero) hero.parentNode.insertBefore(card, hero);
};

/* ---- BIRTHDAY INTRO: shared state and helpers ---- */

// localStorage key remembering the LAST DAY the intro was shown ("2026-9-23").
const INTRO_KEY = 'stimboard-intro-day';

// Guard so the intro cannot be started twice at the same time.
let introRunning = false;

// Creates one firework: 70 sparks flying outward from (x, y) in a full circle.
//   sparks : the shared array the animation loop draws from.
function fwBurst(sparks, x, y) {
  // One random base colour per firework (hue 0-360 on the colour wheel).
  const hue = Math.random() * 360, n = 70;
  for (let i = 0; i < n; i++) {
    // Evenly spaced angles around the circle (2*PI radians / 70), and a random
    // speed of 2-7 pixels per frame so the ring has a soft, uneven edge.
    const a = (Math.PI * 2 * i) / n, s = 2 + Math.random() * 5;
    sparks.push({
      x, y,                                   // Start at the burst centre.
      vx: Math.cos(a) * s, vy: Math.sin(a) * s, // Velocity from angle + speed.
      life: 1,                                // 1 = bright; fades to 0.
      hue: hue + Math.random() * 40           // Slight colour variation per spark.
    });
  }
}

// Plays the intro's sound effects using synth.js building blocks. Those
// functions (getAudioCtx, playBrassNote, playSubDrop, playClap) are top-level
// declarations in synth.js, so they are shared globals here.
// Built in layers so it feels like a real party: fanfare, a "Happy Birthday"
// hook, firework whistle -> boom -> crackle for every burst, a cheer-like
// noise swell, and a closing flourish. All timings are seconds after 'now'.
function introSfx() {
  // If synth.js failed to load there is nothing to play.
  if (typeof getAudioCtx !== 'function') return;
  try {
    const ctx = getAudioCtx();
    // Every sound is scheduled relative to this moment on the audio clock.
    const t = ctx.currentTime;
    // Everything goes through the shared master gain, so tap-to-stop and the
    // volume control silence the intro too (getMaster is defined in synth.js).
    const out = (typeof getMaster === 'function') ? getMaster() : ctx.destination;

    // 1. FANFARE (0s): a bright C-E-G-C arpeggio, each note as a full major
    //    chord (root, x1.25 third, x1.5 fifth) and an octave-up doubling on the
    //    last note, ending on a long held chord.
    [[523.25, 0, 0.3], [659.25, 0.16, 0.3], [783.99, 0.32, 0.3], [1046.5, 0.48, 0.9]].forEach(([f, o, d]) => {
      playBrassNote(f, t + o, d); playBrassNote(f * 1.25, t + o, d); playBrassNote(f * 1.5, t + o, d);
    });
    playBrassNote(2093, t + 0.48, 0.9);            // Sparkling octave on top of the held note.

    // 2. HAPPY BIRTHDAY HOOK (1.5s): the first line, "Happy birthday to you",
    //    G G A G C B, played as bright major chords so it is instantly familiar.
    let h = 1.5;
    [[392.00, 0.18], [392.00, 0.12], [440.00, 0.3], [392.00, 0.3], [523.25, 0.3], [493.88, 0.6]].forEach(([f, d]) => {
      playBrassNote(f, t + h, d); playBrassNote(f * 1.25, t + h, d); playBrassNote(f * 1.5, t + h, d);
      h += d + 0.04;
    });

    // 3. FIREWORKS: for each of the 5 scheduled bursts (must match the burst
    //    times in playBirthdayIntro): a rising WHISTLE just before, a deep BOOM
    //    on the burst, then a rapid CRACKLE of claps as the sparks fall.
    [0.1, 0.9, 1.7, 2.5, 3.3].forEach((b, i) => {
      // Whistle: a quiet sine sweeping up from 500Hz to 2200Hz over 0.35s.
      const w = ctx.createOscillator(), wg = ctx.createGain();
      const ws = Math.max(b - 0.35, 0);
      w.type = 'sine';
      w.frequency.setValueAtTime(500 + i * 60, t + ws);
      w.frequency.exponentialRampToValueAtTime(2200, t + b);
      wg.gain.setValueAtTime(0.001, t + ws);
      wg.gain.exponentialRampToValueAtTime(0.08, t + b - 0.05);
      wg.gain.exponentialRampToValueAtTime(0.001, t + b + 0.02);
      w.connect(wg); wg.connect(out); w.start(t + ws); w.stop(t + b + 0.05);
      // Boom + a second, higher thump for body.
      playSubDrop(t + b, 160, 38, 0.45);
      playSubDrop(t + b, 320, 70, 0.2);
      // Crackle: 6 quick claps at slightly random gaps (sounds like sparks).
      for (let c = 0; c < 6; c++) playClap(t + b + 0.12 + c * 0.07 + Math.random() * 0.04);
    });

    // 4. CHEER SWELL (0.4s - 3.6s): a soft filtered-noise wash that rises and
    //    falls, like a crowd cheering. Noise buffer -> bandpass -> gain swell.
    const len = Math.floor(ctx.sampleRate * 3.4), buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;     // White noise.
    const n = ctx.createBufferSource(); n.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.6;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.001, t + 0.4);
    ng.gain.exponentialRampToValueAtTime(0.09, t + 1.6);            // Swell up...
    ng.gain.exponentialRampToValueAtTime(0.001, t + 3.7);           // ...and fade away.
    n.connect(bp); bp.connect(ng); ng.connect(out); n.start(t + 0.4); n.stop(t + 3.8);

    // 5. FINALE (3.7s): a big closing chord (C major, two octaves) with a final
    //    boom and a burst of claps, so it ends with a punch instead of fading.
    [523.25, 659.25, 783.99, 1046.5].forEach(f => playBrassNote(f, t + 3.7, 1.1));
    playSubDrop(t + 3.7, 200, 36, 0.7);
    for (let c = 0; c < 8; c++) playClap(t + 3.72 + c * 0.05);
  } catch (e) {}                                  // Audio problems must never break the visuals.
}

/* ---- THE BIRTHDAY INTRO ITSELF ---- */
// A full-screen overlay: fireworks on a canvas, big greeting text on top,
// synth sound effects, and a vibration pattern. Closes on tap or after 12s.
function playBirthdayIntro() {
  if (introRunning) return;                   // Ignore a second start while one is open.
  introRunning = true;

  // Build the overlay. The text block has pointer-events:none in CSS, so taps
  // always reach the overlay itself (which is what closes it).
  const ov = document.createElement('div'); ov.id = 'introOverlay';
  ov.innerHTML = '<canvas id="fwCanvas"></canvas><div class="intro-text"><div class="intro-small">🎉 It\'s your day! 🎉</div>' +
    '<div class="intro-big">HAPPY<br>BIRTHDAY<br>DANIELLE!</div><div class="intro-tap">Tap to continue</div></div>';
  document.body.appendChild(ov);

  // 2D drawing context; match the canvas bitmap to the screen size.
  const cv = ov.querySelector('#fwCanvas'), cx = cv.getContext('2d');
  cv.width = window.innerWidth; cv.height = window.innerHeight;

  // 'sparks' holds every live spark; 'alive' turns the animation loop off.
  const sparks = []; let alive = true;

  introSfx();                                 // Fanfare + thumps + crackles.
  // Buzz pattern: 150 on, 80 off, 150 on, 80 off, 400 on.
  if (navigator.vibrate) navigator.vibrate([150, 80, 150, 80, 400]);

  // SCHEDULED FIREWORKS: five moments (ms) that line up with the thumps in
  // introSfx(). Each moment launches TWO bursts at random positions in the
  // upper part of the screen (15-50% down, 20-80% across).
  [100, 900, 1700, 2500, 3300].forEach(ms => setTimeout(() => {
    if (!alive) return;                       // Overlay already closed: do nothing.
    fwBurst(sparks, cv.width * (0.2 + Math.random() * 0.6), cv.height * (0.15 + Math.random() * 0.35));
    fwBurst(sparks, cv.width * (0.2 + Math.random() * 0.6), cv.height * (0.15 + Math.random() * 0.35));
  }, ms));

  // RANDOM FIREWORKS: one extra silent burst every 0.7s for as long as the
  // overlay is open, so the sky never goes quiet after the scheduled ones.
  const rnd = setInterval(() => { if (alive) fwBurst(sparks, Math.random() * cv.width, Math.random() * cv.height * 0.5); }, 700);

  // FINALE VOLLEY (3.7s): matches the closing chord + boom in introSfx().
  // Five bursts across the whole width, 80ms apart, for a big "grand finale".
  setTimeout(() => {
    if (!alive) return;
    for (let k = 0; k < 5; k++) setTimeout(() => {
      if (alive) fwBurst(sparks, cv.width * (0.1 + k * 0.2), cv.height * (0.2 + Math.random() * 0.25));
    }, k * 80);
  }, 3700);

  // CONFETTI RAIN: coloured paper pieces and party emoji drifting down the
  // whole time the overlay is open (separate from the sparks so they fall
  // slowly and tumble instead of flying out in a ring).
  const rain = [];
  const rainColors = ['#f59e0b', '#fbbf24', '#f87171', '#38bdf8', '#34d399', '#c026d3', '#f472b6'];
  const rainEmoji = ['🎈', '🎉', '🎂', '✨', '🎁'];
  const rainTimer = setInterval(() => {
    if (!alive) return;
    for (let k = 0; k < 3; k++) {              // Three new pieces every 80ms.
      const em = Math.random() > 0.85;         // About 15% are emoji.
      rain.push({ x: Math.random() * cv.width, y: -20, vy: 1.5 + Math.random() * 2.5, vx: (Math.random() - 0.5) * 1.5,
                  size: em ? 18 + Math.random() * 12 : 5 + Math.random() * 6, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.2,
                  color: rainColors[Math.floor(Math.random() * rainColors.length)], text: em ? rainEmoji[Math.floor(Math.random() * rainEmoji.length)] : '' });
    }
  }, 80);

  // ANIMATION LOOP (runs once per screen refresh while 'alive').
  (function loop() {
    if (!alive) return;
    // Instead of clearing the canvas, paint a see-through dark rectangle over
    // it. Old sparks fade gradually, which draws glowing TRAILS.
    cx.globalCompositeOperation = 'source-over'; cx.fillStyle = 'rgba(8,6,20,0.22)'; cx.fillRect(0, 0, cv.width, cv.height);
    // 'lighter' ADDS colours together where sparks overlap, so crowded areas glow.
    cx.globalCompositeOperation = 'lighter';
    // Walk backwards so splice() does not skip elements.
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx; s.y += s.vy;               // Move.
      s.vy += 0.05;                           // Gentle gravity.
      s.vx *= 0.985;                          // Air drag slows the sideways motion.
      s.life -= 0.011;                        // Fade (gone in ~90 frames, 1.5s).
      // hsla = hue, saturation, lightness, alpha. Alpha follows 'life'.
      cx.fillStyle = 'hsla(' + s.hue + ',100%,60%,' + Math.max(s.life, 0) + ')';
      cx.beginPath(); cx.arc(s.x, s.y, 2.2, 0, Math.PI * 2); cx.fill();
      if (s.life <= 0) sparks.splice(i, 1);   // Remove dead sparks.
    }
    // Draw the confetti rain on top, with normal blending so colours stay true.
    cx.globalCompositeOperation = 'source-over';
    for (let i = rain.length - 1; i >= 0; i--) {
      const p = rain[i];
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;      // Drift down while tumbling.
      cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot);
      if (p.text) { cx.font = p.size + 'px Arial'; cx.fillText(p.text, -p.size / 2, p.size / 2); }
      else { cx.fillStyle = p.color; cx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); }
      cx.restore();
      if (p.y > cv.height + 30) rain.splice(i, 1);  // Off the bottom: remove.
    }
    requestAnimationFrame(loop);              // Schedule the next frame.
  })();

  // CLOSING: fade out, then remove the overlay. The 'alive' check makes it
  // safe to call twice (a tap AND the 12-second timer).
  const close = () => {
    if (!alive) return;
    alive = false; clearInterval(rnd); clearInterval(rainTimer); ov.classList.add('closing');
    setTimeout(() => { ov.remove(); introRunning = false; }, 600); // Wait for the CSS fade.
  };
  // Tapping only works after 1.2s, so an accidental tap cannot skip the show.
  setTimeout(() => ov.addEventListener('click', close), 1200);
  setTimeout(close, 12000);                   // Auto-close after 12 seconds.
}
window.playBirthdayIntro = playBirthdayIntro;

/* ---- AUTOMATIC INTRO ON THE REAL BIRTHDAY ---- */
// Shows a "tap to open" gate once per calendar day. Browsers refuse to play
// sound until the user touches the page, so this tap is what lets the intro's
// audio play at all.
function maybeAutoIntro() {
  if (!isBirthdayNow()) return;               // Only on the real birthday.
  // A key like "2026-9-23" (year-month-day) identifies today.
  const d = new Date(), key = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
  let seen = null; try { seen = localStorage.getItem(INTRO_KEY); } catch (e) {}
  if (seen === key) return;                   // Already shown today.
  const gate = document.createElement('div'); gate.id = 'introGate';
  gate.innerHTML = '<div class="gate-emoji">🎁</div><div class="gate-text">Tap to open your surprise</div>';
  gate.addEventListener('click', () => {
    gate.remove();
    // Record today BEFORE starting, so a reload mid-intro does not repeat it.
    try { localStorage.setItem(INTRO_KEY, key); } catch (e) {}
    playBirthdayIntro();
  });
  document.body.appendChild(gate);
}

/* ---- DEV-ONLY TEST BUTTONS (inside #devButtons in the dev toolbar) ---- */
window.buildDevButtons = function () {
  const host = document.getElementById('devButtons'); if (!host) return;
  host.innerHTML = '';                        // Rebuild from scratch each time.
  // Small helper: creates one button with a label and a click action.
  const mk = (label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'dev-btn'; b.textContent = label; b.addEventListener('click', fn); host.appendChild(b); };
  // 1. Replay the full birthday intro at any time.
  // Opens the quick "Add stim" form (Part 6): audio + title -> committed to GitHub.
  mk('➕ Add stim', () => window.openAddStim && window.openAddStim());
  mk('🎆 Test birthday intro', playBirthdayIntro);
  // 2. Forget that the intro was shown today, so the gate appears again on next launch.
  mk('🔁 Reset intro (show again)', () => { try { localStorage.removeItem(INTRO_KEY); } catch (e) {} showToast('Intro will show again on the next birthday launch'); });
  // 3. Emergency silence (same function tap-to-stop uses).
  mk('🛑 Stop all audio', () => window.stopAllAudio && window.stopAllAudio());
};

/* ---- START-UP ---- */
// Build the toolbar/countdown and (on the birthday) the gate. If the DOM is
// still parsing, wait for it; otherwise run right away.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { refreshExtras(); maybeAutoIntro(); });
} else { refreshExtras(); maybeAutoIntro(); }

/* ==========================================================================
   PART 4. AUDIO PRELOADING
   --------------------------------------------------------------------------
   After the first tap anywhere, quietly load every recording so the first
   press of each button has no lag (important for the tight 250 ms gap in the
   birthday sequence). The service worker already caches the files; this warms
   the browser's own media pipeline. The Audio objects are kept in an array so
   they are not garbage-collected mid-load. Failures are ignored: the synth
   fallback still exists for any file that is missing.
   ========================================================================== */
const preloaded = [];

function preloadAudio() {
  // Collect each distinct file name once (an object works as a set here).
  const names = {};
  (window.SOUNDBOARD_DATA || []).forEach(it => {
    if (!it.active) return;
    if (it.audio) names[it.audio] = 1;
    (it.audioSequence || []).forEach(n => { names[n] = 1; });
  });
  Object.keys(names).forEach(n => {
    // preload='auto' asks the browser to fetch the whole file now.
    try { const a = new Audio(); a.preload = 'auto'; a.src = n; a.onerror = () => {}; preloaded.push(a); } catch (e) {}
  });
}

// One-shot: runs on the first touch/click, then removes its own listener.
// (Waiting for a gesture also respects mobile data-saver and autoplay rules.)
function onFirstTap() {
  document.removeEventListener('pointerdown', onFirstTap);
  preloadAudio();
}
document.addEventListener('pointerdown', onFirstTap);

/* ==========================================================================
   PART 5. AUTOMATIC SILENT-TAIL MEASUREMENT
   --------------------------------------------------------------------------
   Recordings often end with a stretch of silence. The browser only reports a
   clip as finished AFTER that silence, which adds an unwanted extra pause
   before the next clip in a sequence (the birthday card). This measures how
   much trailing silence each sequence clip has and publishes it as
   window.clipTail[fileName] = milliseconds. app.js reads it and starts the
   next clip's gap as soon as the silence begins.
   Uses OfflineAudioContext, which needs no user tap and makes no sound.
   Works offline because the files are in the service worker cache.
   ========================================================================== */
window.clipTail = {};

const TAIL_THRESHOLD = 0.015;  // Samples quieter than this (0-1 scale) count as silence.
const TAIL_KEEP_MS = 40;       // Keep this much silence so the sound never feels clipped.

async function measureTail(name) {
  try {
    const res = await fetch(name);
    if (!res.ok) return;                               // Missing file: nothing to measure.
    const bytes = await res.arrayBuffer();
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const audio = await new OAC(1, 1, 44100).decodeAudioData(bytes);
    const data = audio.getChannelData(0);
    // Walk backwards from the end to the last sample that is clearly audible.
    let i = data.length - 1;
    while (i > 0 && Math.abs(data[i]) < TAIL_THRESHOLD) i--;
    const tailMs = ((data.length - 1 - i) / audio.sampleRate) * 1000 - TAIL_KEEP_MS;
    window.clipTail[name] = Math.max(0, Math.round(tailMs));
    if (isDevMode()) console.log('[STIMboard] silent tail of ' + name + ': ' + window.clipTail[name] + ' ms');
  } catch (e) {}                                       // Never let measuring break anything.
}

// Measure every file used in a sequence, shortly after load so it does not
// compete with the first paint.
setTimeout(() => {
  const names = {};
  (window.SOUNDBOARD_DATA || []).forEach(it => (it.audioSequence || []).forEach(n => { names[n] = 1; }));
  Object.keys(names).forEach(measureTail);
}, 1500);

/* ==========================================================================
   PART 6. USER STIMS: load stims.json + add / edit / delete form (dev mode)
   --------------------------------------------------------------------------
   WHAT THIS DOES
   Stims you create from your phone live in stims.json: a plain JSON list whose
   items have the same shape as data.js entries. On startup the app fetches that
   file and merges the items into window.SOUNDBOARD_DATA, so adding a stim needs
   NO code edits and NO ?v= / CACHE_NAME bumps (sw.js fetches stims.json
   network-first, so changes show up as soon as GitHub Pages republishes).

   THE FORM (dev mode only)
   Commits the audio file and the updated stims.json to your GitHub repo through
   GitHub's "contents" API. Stims added this way are marked userStim, which gives
   them a pencil button (dev mode only) that reopens the form to EDIT them or
   DELETE them. Built-in stims from data.js are not editable here: change them
   in the code.

   THE TOKEN
   The API needs a personal access token. It is stored ONLY in this phone's
   localStorage (never in the repo). The form has buttons to replace it (type a
   new one and save) and to clear it from this phone.

   PIECES, in file order
     loadUserStims / cacheUserAudio      fetch stims.json, merge, cache audio
     ghLoad/ghSave/ghClearToken/ghGuess  saved GitHub settings
     ghUrl/ghHeaders/ghGet/ghPut/ghDelete  thin wrappers over the GitHub API
     forgetCachedAudio                   drop a file from the offline caches
     fileToBase64/utf8ToB64/b64ToUtf8    base64 helpers (the API uses base64)
     openAddStim / saveStim / deleteStim the form and its two actions
   ========================================================================== */

/* ---- LOADING ---- */
// Fetches stims.json, adds any new items to the data, re-renders, and makes
// sure each item's audio is saved for offline use. Every failure is swallowed:
// if the network is down, the service worker already serves the cached
// stims.json, and a missing file simply means "no user stims yet".
async function loadUserStims() {
  try {
    // 'no-cache' = always revalidate with the server, so new stims show at once
    // instead of the browser reusing an old copy.
    const r = await fetch('stims.json', { cache: 'no-cache' });
    if (!r.ok) return;                                  // 404 etc.: nothing to add.
    const list = await r.json();
    if (!Array.isArray(list)) return;                   // Ignore a malformed file.
    const data = window.SOUNDBOARD_DATA || (window.SOUNDBOARD_DATA = []);
    // Build a set of ids already present, so a stim can never appear twice
    // (for example if this function runs again, or an id clashes with data.js).
    const have = {};
    data.forEach(i => { have[i.id] = 1; });
    let added = 0;
    list.forEach(it => {
      if (!it || !it.id || have[it.id]) return;         // Skip junk and duplicates.
      it.active = it.active !== false;                  // Default to visible unless explicitly false.
      it.userStim = true;                               // Marks it as editable/deletable (pencil button).
      data.push(it); have[it.id] = 1; added++;
      cacheUserAudio(it);                               // Save its audio for offline use.
    });
    // Only redraw when something changed, to avoid a pointless flicker.
    if (added && window.renderSoundboard) window.renderSoundboard();
  } catch (e) {}
}

// Saves a user stim's audio for offline use. <audio> playback usually asks the
// server for PARTIAL content (an HTTP Range request), and the service worker
// does not store partial responses. A plain fetch() gets the FULL file, which
// the service worker does store. So: if it is not cached yet, fetch it once.
function cacheUserAudio(it) {
  if (!it.audio || !window.caches) return;
  caches.match(it.audio).then(hit => { if (!hit) fetch(it.audio).catch(() => {}); }).catch(() => {});
}

/* ---- SAVED GITHUB SETTINGS ---- */
// One localStorage entry holds { owner, repo, branch, token }.
const GH_KEY = 'stimboard-gh';
function ghLoad() { return loadJSON(GH_KEY, {}); }
function ghSave(cfg) { saveJSON(GH_KEY, cfg); }

// Removes ONLY the token and keeps owner/repo/branch, so replacing a token
// later means pasting one new value instead of retyping everything.
function ghClearToken() {
  const cfg = ghLoad();
  delete cfg.token;
  ghSave(cfg);
}

// Best guess at owner/repo from the page address. A GitHub Pages project site
// lives at https://OWNER.github.io/REPO/ so both can be read from the URL. With
// a custom domain nothing can be guessed and the user fills the fields in.
function ghGuess() {
  const m = /^(.+)\.github\.io$/.exec(location.hostname);
  return { owner: m ? m[1] : '', repo: m ? (location.pathname.split('/').filter(Boolean)[0] || '') : '', branch: 'main' };
}

/* ---- GITHUB API WRAPPERS ---- */
// URL of a file in the repo through the contents API. Each path segment is
// encoded separately so a name with spaces or symbols stays valid but the "/"
// separators survive. 'withRef' adds ?ref=BRANCH, which GET requests need to
// read from a branch other than the default.
function ghUrl(cfg, path, withRef) {
  return 'https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' +
    path.split('/').map(encodeURIComponent).join('/') + (withRef ? '?ref=' + encodeURIComponent(cfg.branch) : '');
}

// Headers every API call needs: the token (Bearer = "act as this token's
// owner"), GitHub's JSON media type, and JSON for request bodies.
function ghHeaders(cfg) {
  return { 'Authorization': 'Bearer ' + cfg.token, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' };
}

// Reads a file's metadata: { sha, content (base64), ... }. Returns null when
// the file does not exist (HTTP 404). 'no-store' stops the browser reusing an
// old answer, which matters because the sha must be CURRENT for writes.
async function ghGet(cfg, path) {
  const r = await fetch(ghUrl(cfg, path, true), { headers: ghHeaders(cfg), cache: 'no-store' });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('GitHub ' + r.status + ': ' + (await r.text()).slice(0, 120));
  return r.json();
}

// Creates or updates a file with a commit. 'base64' is the new content. 'sha'
// is REQUIRED when the file already exists: it is the version being replaced,
// and GitHub answers 409 if that is no longer the latest, which prevents
// silently overwriting someone else's change.
async function ghPut(cfg, path, base64, message, sha) {
  const body = { message: message, content: base64, branch: cfg.branch };
  if (sha) body.sha = sha;
  const r = await fetch(ghUrl(cfg, path, false), { method: 'PUT', headers: ghHeaders(cfg), body: JSON.stringify(body) });
  if (!r.ok) throw new Error('GitHub ' + r.status + ': ' + (await r.text()).slice(0, 120));
  return r.json();
}

// Deletes a file with a commit. The CURRENT sha proves we are deleting the
// version we think we are.
async function ghDelete(cfg, path, sha, message) {
  const r = await fetch(ghUrl(cfg, path, false), {
    method: 'DELETE', headers: ghHeaders(cfg),
    body: JSON.stringify({ message: message, sha: sha, branch: cfg.branch })
  });
  if (!r.ok) throw new Error('GitHub ' + r.status + ': ' + (await r.text()).slice(0, 120));
}

// Drops a file from EVERY service-worker cache, so a deleted or replaced audio
// file can never be served from a stale offline copy. cache.delete() accepts a
// relative URL string and resolves it against the page address.
function forgetCachedAudio(name) {
  if (!name || !window.caches) return;
  caches.keys().then(keys => keys.forEach(k => caches.open(k).then(c => c.delete(name)))).catch(() => {});
}

/* ---- BASE64 HELPERS (the GitHub API sends and expects base64) ---- */
// A File/Blob -> base64 text. readAsDataURL yields "data:audio/x;base64,XXXX",
// so we keep only what follows the comma.
function fileToBase64(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(',')[1]);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(file);
  });
}
// Text <-> base64 that survives emoji and accents. Plain btoa()/atob() only
// handle Latin-1, so the text is first converted to UTF-8 bytes (and back).
function utf8ToB64(s) { return btoa(unescape(encodeURIComponent(s))); }
function b64ToUtf8(b) { return decodeURIComponent(escape(atob(b.replace(/\s/g, '')))); }

/* ---- THE ADD / EDIT FORM: small helpers ---- */
// Turns a title into a safe id/filename piece: "Rock On!" -> "rock-on".
// Lower-cases, collapses every run of other characters into one "-", trims
// stray dashes, caps the length at 40, and never returns an empty string.
function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'stim'; }

// Returns a function that shows a message in the form's status line.
// Pass a second argument of true to show it in red as an error.
function makeStatus(sheet) {
  return (msg, bad) => { const s = sheet.querySelector('#asStatus'); s.textContent = msg; s.className = bad ? 'bad' : ''; };
}

// Reads the GitHub settings from the open form, checks them and remembers them.
// Returns the settings object, or null after showing an error message.
function readCfg(sheet, status) {
  const q = (id) => sheet.querySelector(id);
  const cfg = { owner: q('#asOwner').value.trim(), repo: q('#asRepo').value.trim(), branch: q('#asBranch').value.trim() || 'main', token: q('#asToken').value.trim() };
  if (!cfg.owner || !cfg.repo || !cfg.token) {
    q('#asSettings').open = true;                         // Reveal the fields that need filling in.
    status('Fill in the GitHub owner, repo and token.', true);
    return null;
  }
  ghSave(cfg);                                            // Remember them for next time.
  return cfg;
}

// Text for the small line under the token field, so you can tell at a glance
// whether a token is stored on this phone. Never shows the token itself.
function tokenNote(hasToken) {
  return hasToken ? 'A token is saved on this phone. To replace it, type a new one and tap Save. To remove it, tap Clear saved token.'
                  : 'No token saved yet. Paste one here.';
}

/* ---- THE ADD / EDIT FORM ITSELF ---- */
// Opens the form as a full-screen sheet. With no argument it ADDS a stim; with
// an item (a user stim) it EDITS that stim and also offers Delete.
function openAddStim(editItem) {
  let sheet = document.getElementById('addStimSheet');
  if (sheet) { sheet.remove(); }                          // Rebuild fresh each time.
  const editing = !!editItem;
  const cfg = Object.assign(ghGuess(), ghLoad());         // Saved values win over guesses.
  sheet = document.createElement('div'); sheet.id = 'addStimSheet';
  // Fixed markup with no user data inside, so innerHTML is safe. Every value
  // (which could contain quotes) is assigned below through .value/.textContent.
  sheet.innerHTML =
    '<div class="as-card">' +
    '<h2 id="asHeading"></h2>' +
    '<label><span id="asFileLabel">Audio file</span><input id="asFile" type="file" accept="audio/*,.m4a,.mp3,.wav,.ogg"></label>' +
    '<label>Title<input id="asTitle" type="text" placeholder="e.g. Rock Solid"></label>' +
    '<label>Subtitle<input id="asSub" type="text" placeholder="e.g. Inside joke #12"></label>' +
    '<div class="as-row"><label>Emoji<input id="asIcon" type="text" value="🔊" maxlength="4"></label>' +
    '<label>Group<input id="asGroup" type="text" value="Misc Stims"></label></div>' +
    '<details id="asSettings"><summary>GitHub settings</summary>' +
    '<label>Owner<input id="asOwner" type="text" autocapitalize="none"></label>' +
    '<label>Repo<input id="asRepo" type="text" autocapitalize="none"></label>' +
    '<label>Branch<input id="asBranch" type="text" autocapitalize="none"></label>' +
    '<label>Access token<input id="asToken" type="password" autocomplete="off" placeholder="github_pat_..."></label>' +
    '<div class="as-row"><button type="button" id="asShowToken">👁 Show</button><button type="button" id="asClearToken">🗑️ Clear saved token</button></div>' +
    '<p class="as-hint" id="asTokenNote"></p>' +
    '<p class="as-hint">Saved only on this phone. Needs a fine-grained token with <b>Contents: Read and write</b> for this one repo.</p>' +
    '</details>' +
    '<div id="asStatus" role="status"></div>' +
    '<div class="as-row"><button type="button" id="asCancel">Cancel</button><button type="button" id="asSave"></button></div>' +
    '<div id="asDeleteRow"></div>' +
    '</div>';
  document.body.appendChild(sheet);
  const q = (id) => sheet.querySelector(id);

  // Fill the settings from saved/guessed values.
  q('#asOwner').value = cfg.owner || '';
  q('#asRepo').value = cfg.repo || '';
  q('#asBranch').value = cfg.branch || 'main';
  q('#asToken').value = cfg.token || '';
  q('#asTokenNote').textContent = tokenNote(!!cfg.token);
  if (!cfg.token) q('#asSettings').open = true;           // First time: show what is needed.

  // SHOW / HIDE: flips the field between dots and readable text so you can
  // check what you pasted. It starts hidden every time the form opens.
  q('#asShowToken').addEventListener('click', () => {
    const f = q('#asToken'), showing = f.type === 'text';
    f.type = showing ? 'password' : 'text';
    q('#asShowToken').textContent = showing ? '👁 Show' : '🙈 Hide';
  });

  // CLEAR SAVED TOKEN: confirms, removes ONLY the token from this phone's
  // storage (owner/repo/branch stay), and empties the field. It does not revoke
  // the token on GitHub: do that on GitHub's token page if it was exposed.
  q('#asClearToken').addEventListener('click', () => {
    if (!confirm('Remove the saved GitHub token from this phone? You will need to paste a token again before saving stims.')) return;
    ghClearToken();
    q('#asToken').value = '';
    q('#asTokenNote').textContent = tokenNote(false);
    makeStatus(sheet)('Token cleared from this phone. (It is still valid on GitHub until you revoke it there.)');
  });

  // Heading, button labels and fields differ between add and edit.
  q('#asHeading').textContent = editing ? '✏️ Edit stim' : '➕ Add a stim';
  q('#asSave').textContent = editing ? 'Save changes' : 'Save stim';
  if (editing) {
    q('#asFileLabel').textContent = 'Replace audio (optional): ' + editItem.audio;
    q('#asTitle').value = editItem.title || '';
    q('#asSub').value = editItem.subtitle || '';
    q('#asIcon').value = editItem.icon || '🔊';
    q('#asGroup').value = editItem.group || 'Misc Stims';
    // The Delete button exists only when editing.
    const del = document.createElement('button');
    del.type = 'button'; del.id = 'asDelete'; del.textContent = '🗑️ Delete this stim';
    del.addEventListener('click', () => deleteStim(sheet, editItem));
    q('#asDeleteRow').appendChild(del);
  }
  q('#asCancel').addEventListener('click', () => sheet.remove());
  q('#asSave').addEventListener('click', () => saveStim(sheet, editItem));
}

/* ---- SAVING (ADD or EDIT) ---- */
// Saves the form. With no editItem it creates a new stim; with one it updates it.
// ORDER MATTERS: audio is uploaded FIRST, then stims.json is updated. If the
// upload fails nothing references the file yet; if the stims.json write fails
// the only damage is an unused audio file. The reverse order could publish a
// button whose audio does not exist.
async function saveStim(sheet, editItem) {
  const q = (id) => sheet.querySelector(id);
  const status = makeStatus(sheet);
  const editing = !!editItem;
  const file = q('#asFile').files[0];                       // undefined when no file was chosen.
  const title = q('#asTitle').value.trim();

  // --- Validation: stop early, with a message, before touching GitHub. ---
  if (!editing && !file) return status('Choose an audio file first.', true);   // Audio is optional when editing.
  if (!title) return status('Enter a title.', true);
  if (file && file.size > 20 * 1024 * 1024) return status('That file is over 20 MB. Please use a shorter clip.', true);
  const cfg = readCfg(sheet, status);                       // Owner/repo/branch/token (null + message if incomplete).
  if (!cfg) return;

  // Disable Save so a double tap cannot start two uploads at once.
  const btn = q('#asSave'); btn.disabled = true;
  try {
    // The text fields shared by add and edit. Empty emoji/group get defaults.
    const fields = { title: title, subtitle: q('#asSub').value.trim(), icon: q('#asIcon').value.trim() || '🔊', group: q('#asGroup').value.trim() || 'Misc Stims' };
    // File extension from the original name (".m4a", ".mp3"...), default ".m4a".
    const ext = file ? (file.name.match(/\.[A-Za-z0-9]{2,4}$/) || ['.m4a'])[0].toLowerCase() : '';
    let id, audioName, oldAudio = null;                     // oldAudio = file to delete after a replacement.

    if (editing) {
      id = editItem.id; audioName = editItem.audio;         // Keep the same id and (unless replaced) the same file.
      if (file) {
        // A replacement ALWAYS gets a brand-new filename (id + timestamp), so
        // phones can never keep serving the old recording from their cache.
        audioName = id + '-' + Date.now().toString(36) + ext;
        status('Uploading new audio…');
        await ghPut(cfg, audioName, await fileToBase64(file), 'Replace audio for: ' + title);
        oldAudio = editItem.audio;                        // Removed after stims.json is saved.
      }
    } else {
      // Unique id and filename from the title ("rock-on", then "rock-on-2", ...).
      // The id is also the audio filename, so uniqueness protects both.
      const have = {}; (window.SOUNDBOARD_DATA || []).forEach(i => { have[i.id] = 1; });
      id = slugify(title); const base = id; let n = 2; while (have[id]) id = base + '-' + (n++);
      audioName = id + ext;
      status('Uploading audio…');
      // Never overwrite an existing file: ghGet returns null when it is absent.
      if (await ghGet(cfg, audioName)) throw new Error('A file named ' + audioName + ' already exists.');
      await ghPut(cfg, audioName, await fileToBase64(file), 'Add audio: ' + audioName);
    }

    // Read the CURRENT stims.json from GitHub (not the cached copy). The sha
    // makes GitHub reject the write if the file changed in between.
    status('Saving…');
    const cur = await ghGet(cfg, 'stims.json');             // null if the file does not exist yet.
    const list = cur ? JSON.parse(b64ToUtf8(cur.content)) : [];
    let item;
    if (editing) {
      // Find the entry by id and merge the new fields into it (other properties
      // such as vibrate stay as they were).
      const idx = list.findIndex(i => i.id === id);
      if (idx < 0) throw new Error('This stim is not in stims.json, so it cannot be edited here.');
      item = Object.assign(list[idx], fields, { audio: audioName });
    } else {
      // A new entry in the same shape as a data.js item. vibrate [80] = a short buzz.
      item = Object.assign({ id: id }, fields, { audio: audioName, vibrate: [80], active: true });
      list.push(item);
    }
    // Write the list back. 'cur && cur.sha' passes the sha only when the file existed.
    await ghPut(cfg, 'stims.json', utf8ToB64(JSON.stringify(list, null, 2) + '\n'), (editing ? 'Edit stim: ' : 'Add stim: ') + title, cur && cur.sha);

    // Tidy up the replaced recording (best effort: a leftover file is harmless,
    // so a failure here is ignored rather than reported as a save error).
    if (oldAudio) {
      try { const f = await ghGet(cfg, oldAudio); if (f) await ghDelete(cfg, oldAudio, f.sha, 'Remove old audio: ' + oldAudio); } catch (e) {}
      forgetCachedAudio(oldAudio);                          // And drop this phone's offline copy.
    }

    // Show it on this phone straight away (GitHub Pages needs a minute to publish).
    const data = window.SOUNDBOARD_DATA || (window.SOUNDBOARD_DATA = []);
    if (editing) { Object.assign(editItem, fields, { audio: audioName }); }   // Update the live object in place.
    else { item.userStim = true; data.push(item); }                           // New: mark it editable and add it.
    if (window.renderSoundboard) window.renderSoundboard();
    sheet.remove();
    showToast((editing ? '✅ Updated "' : '✅ Added "') + title + '". Live for everyone in ~1 minute.', 4500);
  } catch (e) {
    // Any failure above lands here: show it in red and let the user retry.
    status('Failed: ' + (e && e.message ? e.message : e), true);
    btn.disabled = false;
  }
}

/* ---- DELETING ---- */
// Deletes a user stim: removes it from stims.json FIRST (so the button vanishes
// for everyone), then deletes its audio file from the repo.
async function deleteStim(sheet, item) {
  const status = makeStatus(sheet);
  // confirm() is a native yes/no dialog; deleting is permanent for everyone.
  if (!confirm('Delete "' + item.title + '" for everyone? This cannot be undone.')) return;
  const cfg = readCfg(sheet, status);
  if (!cfg) return;
  const btn = sheet.querySelector('#asDelete'); btn.disabled = true;
  try {
    status('Deleting…');
    if (window.stopAllAudio) window.stopAllAudio();       // In case this stim is playing right now.
    const cur = await ghGet(cfg, 'stims.json');
    if (!cur) throw new Error('stims.json was not found on GitHub.');
    const list = JSON.parse(b64ToUtf8(cur.content));
    const next = list.filter(i => i.id !== item.id);       // Everything except this stim.
    if (next.length === list.length) throw new Error('This stim is not in stims.json, so it cannot be deleted here.');
    // The button disappears for everyone as soon as this write is published.
    await ghPut(cfg, 'stims.json', utf8ToB64(JSON.stringify(next, null, 2) + '\n'), 'Delete stim: ' + item.title, cur.sha);

    // Then delete the recording itself (best effort: an orphan file is harmless).
    let leftover = false;
    try { const f = await ghGet(cfg, item.audio); if (f) await ghDelete(cfg, item.audio, f.sha, 'Delete audio: ' + item.audio); }
    catch (e) { leftover = true; }
    forgetCachedAudio(item.audio);                         // Drop this phone's offline copy too.

    // Forget it on this phone: data, favorites, recently played, screen.
    const data = window.SOUNDBOARD_DATA || [];
    const at = data.indexOf(item); if (at >= 0) data.splice(at, 1);
    favs = favs.filter(f => f !== item.id); saveJSON(FAV_KEY, favs);
    recents = recents.filter(r => r !== item.id); saveJSON(RECENT_KEY, recents);
    if (window.renderSoundboard) window.renderSoundboard();
    refreshExtras();
    sheet.remove();
    showToast(leftover ? '🗑️ Deleted (the audio file could not be removed from the repo)' : '🗑️ Deleted "' + item.title + '"', 4500);
  } catch (e) {
    status('Failed: ' + (e && e.message ? e.message : e), true);
    btn.disabled = false;
  }
}
// Exposed so the pencil button (decorateCard) and the dev toolbar can open the form.
window.openAddStim = openAddStim;

// Start loading user stims once the page is ready (after app.js has defined
// renderSoundboard, so wait for the load event).
if (document.readyState === 'complete') loadUserStims();
else window.addEventListener('load', loadUserStims);
