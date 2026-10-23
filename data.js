/* ==========================================================================
   STIMboard Data Configuration (data.js)
   --------------------------------------------------------------------------
   ROLE OF THIS FILE
   The single source of truth for every button in the app. app.js reads
   window.SOUNDBOARD_DATA and builds the UI from it, so adding a button means
   adding ONE object to the array below; no HTML or other JS needs to change
   (except synth.js, if you also want a procedural fallback for it).
   Loaded FIRST in index.html, before synth.js and app.js.

   FIELD REFERENCE (every property an item may have)
     id                 string  REQUIRED. Unique name. Also the key synth.js uses
                                to find the procedural fallback for this item.
     type               string  'hero' | 'featured' | 'birthday' place the item in
                                a special card slot. Omit it for a normal grid button.
     group              string  Grid items only. Heading text of the section the
                                button appears in. Missing -> "Misc Stims".
     collapsible        bool    Grid items only. true -> the whole group renders
                                inside a tap-to-expand <details> accordion.
     title / subtitle   string  The two lines of text on the button.
     icon               string  Emoji shown on the button (a default exists per card type).
     image              string  'hero' only. Photo URL for the avatar (null = emoji).
     audio              string  File to play first (relative to the site root).
     audioSequence      array   Several files played one after another (see birthday).
     sequenceGap        number|array  Pause between sequence clips, in milliseconds.
                                A number applies to every gap; an array gives one
                                gap per transition, e.g. [250, 500].
     sequenceFallbacks  array   Per-clip synth stand-ins: [{ id, ms }, ...] where
                                'id' is a synth.js case and 'ms' is its approximate
                                length so the next clip waits long enough.
     appendProcedural   bool    After 'audio' ENDS, chain the synth sound on the end.
     confetti           bool|number  true = 1 burst, a number = that many bursts.
     vibrate            array   Vibration pattern in ms (buzz, pause, buzz, ...).
     active             bool    REQUIRED. false hides the item completely.
     birthdayOnly       bool    true -> app.js shows the item ONLY on the real
                                 birthday (isBirthday below) or while developer
                                 mode is on (8-second hold on the logo). The
                                 birthday card uses this instead of tying
                                 'active' to the date, so dev mode can reveal it.
     durationMs         number  OPTIONAL. Estimated length in ms, used only for
                                 the progress bar and the "still playing" timer
                                 of synth-only sounds. Real recordings report
                                 their own length, so this is rarely needed.

   WHO READS WHAT (so you know where to look when something misbehaves)
     data.js   -> publishes window.SOUNDBOARD_DATA and window.STIM_BIRTHDAY
     app.js    -> reads SOUNDBOARD_DATA to build buttons and play sounds
     extras.js -> reads STIM_BIRTHDAY (countdown, intro) and SOUNDBOARD_DATA
                  (favorites, recents, search, audio preloading)
     sw.js     -> has its OWN PRECACHE list of files: when you add a new audio
                  file here, ALSO add it to PRECACHE in sw.js so it works
                  offline from the very first visit.
   ========================================================================== */

// 1. BIRTHDAY DATE LOGIC
// A Date object holding the moment the page was loaded (local time on the
// phone). Everything below is computed ONCE per page load.
const today = new Date();

// Note: JavaScript months are 0-indexed, so 9 = October. To change the date,
// edit BIRTHDAY_MONTH / BIRTHDAY_DAY below; nothing else needs to change.
// (The old hardcoded "isBirthday = true" testing switch is gone: use developer
// mode instead, which does not require editing code or bumping versions.)
const BIRTHDAY_MONTH = 9;   // 0-indexed: 9 = October.
const BIRTHDAY_DAY = 23;    // Day of the month.
const COUNTDOWN_DAYS = 7;   // The countdown card appears only this many days before.

// REAL CHECK: true only on Oct 23 (any year) in the phone's local timezone.
// Used for the birthday intro, and (via app.js) the birthday card. Developer
// mode can force those features on at any other time.
const isBirthday = (today.getMonth() === BIRTHDAY_MONTH && today.getDate() === BIRTHDAY_DAY);

// Whole days from today until the NEXT birthday (0 = today). Uses local
// midnights so time-of-day never skews the count.
const daysUntilBirthday = (() => {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let target = new Date(today.getFullYear(), BIRTHDAY_MONTH, BIRTHDAY_DAY);
  if (target < start) target = new Date(today.getFullYear() + 1, BIRTHDAY_MONTH, BIRTHDAY_DAY);
  return Math.round((target - start) / 86400000);
})();
// Published on 'window' for extras.js (a separate file). It reads:
//   isBirthday         -> show the "tap to open" gate and intro automatically
//   daysUntilBirthday  -> the countdown card text (0 on the day itself)
//   countdownDays      -> how close the date must be before the card appears
window.STIM_BIRTHDAY = { isBirthday, daysUntilBirthday, countdownDays: COUNTDOWN_DAYS };

// Exposed on 'window' so app.js (a separate script file) can read it.
window.SOUNDBOARD_DATA = [
  // ---- HERO CARD: the big red "CASE!" summon button at the very top ----
  // image:null -> app.js shows the emoji avatar. vibrate [220] = one 220ms buzz.
  { id: "case", type: "hero", title: "CASE!", subtitle: "High-priority summon", image: null, audio: "case.m4a", vibrate: [220], active: true },
  
  // ---- BIRTHDAY CARD: shimmering purple card, only visible when isBirthday is true ----
  // 'audio' is kept as the first clip for compatibility, but because
  // 'audioSequence' exists, app.js uses the sequence instead:
  //   bday1.m4a -> 250ms pause -> case.m4a -> 500ms pause -> bday2.m4a
  // sequenceGap: [250, 500] is one gap PER transition (gap[0] follows clip 0,
  // gap[1] follows clip 1). A single number (e.g. 500) applies to all of them.
  // sequenceFallbacks lines up BY POSITION with audioSequence:
  //   clip 0 (bday1.m4a) missing -> synth "birthday-part1", wait ~5.5s
  //   clip 1 (case.m4a)  missing -> synth "case",           wait ~1s
  //   clip 2 (bday2.m4a) missing -> synth "birthday-part2", wait ~5.5s
  // confetti: 4 -> four bursts, 300ms apart. The vibrate pattern is
  // buzz 200, rest 100, buzz 200, rest 100, long buzz 400.
  // 'birthdayOnly: true' is what hides the card except on the real birthday
  // or in developer mode (app.js checks it). 'active' stays true so that dev
  // mode can reveal the card without editing this file.
  { id: "birthday-surprise", type: "birthday", title: "HAPPY BIRTHDAY!", subtitle: "A special Oct 23rd surprise 🎈", icon: "🎂", audio: "bday1.m4a", audioSequence: ["bday1.m4a", "case.m4a", "bday2.m4a"], sequenceGap: [250, 500], sequenceFallbacks: [{ id: "birthday-part1", ms: 5500 }, { id: "case", ms: 1000 }, { id: "birthday-part2", ms: 5500 }], confetti: 4, vibrate: [200, 100, 200, 100, 400], birthdayOnly: true, active: true },
  
  // ---- FEATURED CARD: the gold "THE TRUMPET!" button ----
  // appendProcedural:true -> play the-trumpet.m4a, then when it ENDS, chain
  // the synthesized brass fanfare right after it (vocals skipped, since the
  // recording already says the words). One confetti burst on tap.
  { id: "the-trumpet", type: "featured", title: "THE TRUMPET! 🎺🎺", subtitle: "Mambo No. 5 (Full Solo Burst)", icon: "🎺", audio: "the-trumpet.m4a", appendProcedural: true, confetti: true, vibrate: [100, 50, 100, 50, 300], active: true },
  
  // ---- GROUP: "The Classics" (normal, always-visible 2-column grid) ----
  // No 'type' -> these are ordinary grid buttons. They all share group
  // "The Classics", so app.js puts them in ONE section under that heading.
  // Quick trumpet hit; like the big one it chains the synth notes after the recording.
  { id: "trumpet-short", group: "The Classics", title: "TRUMPET 🎺", subtitle: "Mambo No. 5 (Quick hit)", icon: "🎺", audio: "trumpet.m4a", appendProcedural: true, vibrate: [80], active: true },
  { id: "barney-gumbled", group: "The Classics", title: "Barney Gumbled", subtitle: "Million quid / Selekta", icon: "🇬🇧", audio: "barney-gumbled.m4a", vibrate: [60, 40, 60], active: true },
  { id: "fight-overheard", group: "The Classics", title: "FUCK WITH ME BITCH", subtitle: "Overheard trashy bitch classic", icon: "🥊", audio: "fuckwitme-bich.m4a", vibrate: [150, 50, 150], active: true },
  { id: "big-sean", group: "The Classics", title: "I don't. Fuck wit. CHU!", subtitle: "Big Sean cadence", icon: "😤", audio: "fuckwit-chu.m4a", vibrate: [100, 80, 100, 80, 250], active: true },
  // Nine 50ms buzzes with 50ms rests = a rapid "clapping" haptic.
  { id: "follow-the-rules", group: "The Classics", title: "Follow 👏 The 👏 Rules 👏", subtitle: "Sister enforcement mode", icon: "👏", audio: "follow-rules.m4a", vibrate: [50, 50, 50, 50, 50, 50, 50, 50, 50], active: true },
  { id: "dirty-south", group: "The Classics", title: "Dirty South di-di-dirty", subtitle: "Timbaland beatbox riff", icon: "🎧", audio: "dirty-south.m4a", vibrate: [70, 30, 70, 30, 120], active: true },

  // ---- GROUP: Deep Rock Galactic salutes (COLLAPSIBLE accordion) ----
  // 'collapsible: true' on these items makes app.js wrap the whole group in a
  // native <details> element: collapsed by default, tap the header to expand.
  // The group name below is repeated on every item, and MUST match exactly
  // (including the emoji and spacing) or they would split into separate groups.
  { id: "drg-stone", group: "⛏️ Deep Rock Galactic Salutes", collapsible: true, title: "ROCK AND STONE!", subtitle: "The classic salute", icon: "⛏️", audio: "rocknstone.m4a", vibrate: [150, 50, 200], active: true },
  { id: "drg-on", group: "⛏️ Deep Rock Galactic Salutes", collapsible: true, title: "ROCK ON!", subtitle: "Short & sweet", icon: "🤘", audio: "rock-on.m4a", vibrate: [150], active: true },
  { id: "drg-fight", group: "⛏️ Deep Rock Galactic Salutes", collapsible: true, title: "We Fight!", subtitle: "For Rock and Stone", icon: "⚔️", audio: "we-fight-rocknstone.m4a", vibrate: [100, 50, 100, 50, 250], active: true },
  { id: "drg-bone", group: "⛏️ Deep Rock Galactic Salutes", collapsible: true, title: "To the Bone!", subtitle: "Rock and Stone", icon: "🦴", audio: "2the-bone.m4a", vibrate: [80, 80, 80, 200], active: true },
  { id: "drg-diff", group: "⛏️ Deep Rock Galactic Salutes", collapsible: true, title: "The Difference?", subtitle: "Between a Rock and a Stone", icon: "🪨", audio: "rocknstone-diff.m4a", vibrate: [50, 50, 50, 150], active: true },
  { id: "drg-never-alone", group: "⛏️ Deep Rock Galactic Salutes", collapsible: true, title: "Never Alone", subtitle: "If you Rock and Stone", icon: "🍻", audio: "never-alone.m4a", vibrate: [100, 50, 200], active: true },
  { id: "drg-home", group: "⛏️ Deep Rock Galactic Salutes", collapsible: true, title: "Ain't Coming Home", subtitle: "If you don't Rock and Stone", icon: "🚀", audio: "rocknstone-home.m4a", vibrate: [60, 60, 60, 60, 200], active: true },
  // Last item: NO trailing comma after the closing brace (the array ends right after).
  { id: "drg-hear", group: "⛏️ Deep Rock Galactic Salutes", collapsible: true, title: "Did I Hear...?", subtitle: "A Rock and a Stone?", icon: "👂", audio: "hear-rocknstone.m4a", vibrate: [100, 50, 100, 50, 150], active: true }
];