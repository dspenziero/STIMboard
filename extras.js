/* ==========================================================================
   STIMboard Extras (extras.js)
   --------------------------------------------------------------------------
   ROLE OF THIS FILE
   Everything that is "around" the soundboard rather than part of its core:
   developer mode, toast messages, favourites, recently played, search,
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
     2. Favourites, recently played, search + filter, progress bar, toolbar
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
   (search, favourites, recents) and lets the birthday card show on any day.
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
   PART 2. FAVOURITES, RECENTLY PLAYED, SEARCH + FILTER, PROGRESS BAR
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

/* ---- FAVOURITES: an array of item ids, saved between launches ---- */
const FAV_KEY = 'stimboard-favs';
let favs = loadJSON(FAV_KEY, []);                      // e.g. ["case", "drg-stone"]

// True if this item id is currently a favourite.
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
  // Only the favourites-only filter needs a real re-render (the card must vanish).
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
  // Favourites-only mode: hide everything that is not starred.
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
  if (item.type === 'birthday') return;       // No favourite star on the birthday card.
  // The star is a <span>, NOT a <button>: buttons cannot be nested in buttons.
  const star = document.createElement('span');
  // 'dev-only' hides it for normal users; 'on' colours it gold when favourited.
  star.className = 'fav-star dev-only' + (isFav(item.id) ? ' on' : '');
  star.textContent = isFav(item.id) ? '★' : '☆';
  star.setAttribute('role', 'button'); star.setAttribute('aria-label', 'Toggle favourite');
  // stopPropagation() keeps the click from also reaching the card underneath,
  // so starring something does not play its sound.
  star.addEventListener('click', (e) => { e.stopPropagation(); toggleFav(item.id); });
  btn.appendChild(star);
};

/* ---- QUICK LISTS: "Favourites" and "Recently played" chip rows ---- */

// Finds an ACTIVE item by id (inactive/missing ones are silently dropped).
function findItem(id) { return (window.SOUNDBOARD_DATA || []).find(i => i.id === id && i.active); }

// Rebuilds both rows inside <div id="quickLists"> (created by buildToolbar).
function renderQuickLists() {
  const host = document.getElementById('quickLists');
  if (!host) return;                          // Toolbar not built yet.
  host.innerHTML = '';                        // Start from a clean slate.
  // Two rows: [heading, list of ids]. Destructured straight into the loop.
  [['⭐ Favourites', favs], ['🕘 Recently played', recents]].forEach(([label, ids]) => {
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

/* ---- DEV TOOLBAR: search box + favourites-only toggle + quick lists ---- */

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

  // FAVOURITES-ONLY toggle: flips the flag, updates the label/colour, re-renders.
  const favBtn = wrap.querySelector('#favFilterBtn');
  favBtn.addEventListener('click', () => {
    filterState.favsOnly = !filterState.favsOnly;
    favBtn.textContent = filterState.favsOnly ? '★ Favs' : '☆ Favs';
    favBtn.classList.toggle('on', filterState.favsOnly);
    window.renderSoundboard();
  });
}

// Redraws everything this file owns. Called at start-up and after any change
// to dev mode or favourites. Each optional piece is guarded because it is
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
function introSfx() {
  // If synth.js failed to load there is nothing to play.
  if (typeof getAudioCtx !== 'function') return;
  try {
    // Every sound is scheduled relative to this moment on the audio clock.
    const t = getAudioCtx().currentTime;
    // FANFARE: a C-E-G-C major arpeggio (523, 659, 784, 1047 Hz). Each note is
    // played together with its major third (x1.25) for a fuller sound.
    [[523.25, 0], [659.25, 0.18], [783.99, 0.36], [1046.5, 0.54]].forEach(([f, o]) => {
      playBrassNote(f, t + o, 0.5); playBrassNote(f * 1.25, t + o, 0.5);
    });
    // FIREWORK THUMPS: one low sub-drop per visual burst, 0.8s apart. These
    // times must stay in step with the burst schedule in playBirthdayIntro().
    [0.1, 0.9, 1.7, 2.5, 3.3].forEach(o => playSubDrop(t + o, 150, 40, 0.3));
    // CRACKLE: pairs of handclaps just after each thump, like sparks popping.
    [0.25, 0.4, 1.05, 1.2, 1.85, 2.0, 2.65, 2.8, 3.45].forEach(o => playClap(t + o));
  } catch (e) {}                              // Audio problems must never break the visuals.
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
    '<div class="intro-big">HAPPY<br>BIRTHDAY<br>CASE!</div><div class="intro-tap">Tap to continue</div></div>';
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
    requestAnimationFrame(loop);              // Schedule the next frame.
  })();

  // CLOSING: fade out, then remove the overlay. The 'alive' check makes it
  // safe to call twice (a tap AND the 12-second timer).
  const close = () => {
    if (!alive) return;
    alive = false; clearInterval(rnd); ov.classList.add('closing');
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
