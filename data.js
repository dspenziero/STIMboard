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
     sequenceGap        number  Pause between sequence clips, in milliseconds.
     sequenceFallbacks  array   Per-clip synth stand-ins: [{ id, ms }, ...] where
                                'id' is a synth.js case and 'ms' is its approximate
                                length so the next clip waits long enough.
     appendProcedural   bool    After 'audio' ENDS, chain the synth sound on the end.
     confetti           bool|number  true = 1 burst, a number = that many bursts.
     vibrate            array   Vibration pattern in ms (buzz, pause, buzz, ...).
     active             bool    REQUIRED. false hides the item completely.
   ========================================================================== */

// 1. Check if today is October 23rd
// A Date object holding the moment the page was loaded (local time).
// Note: 'today' is currently only used by the commented-out check below.
const today = new Date();

// Note: JavaScript months are 0-indexed, so 9 = October
// TESTING SWITCH: isBirthday is hardcoded to true so the birthday card always
// shows while developing. For the real gift, DELETE "true;" and the leading
// comment marker so the line becomes:
//   const isBirthday = (today.getMonth() === 9 && today.getDate() === 23);
// That expression is true only on the 23rd of October (any year), in the
// phone's local timezone. Remember to bump ?v= and CACHE_NAME afterwards.
const isBirthday = true; // Hardcoded to true for testing // (today.getMonth() === 9 && today.getDate() === 23);

// Exposed on 'window' so app.js (a separate script file) can read it.
window.SOUNDBOARD_DATA = [
  // ---- HERO CARD: the big red "CASE!" summon button at the very top ----
  // image:null -> app.js shows the emoji avatar. vibrate [220] = one 220ms buzz.
  { id: "case", type: "hero", title: "CASE!", subtitle: "High-priority summon", image: null, audio: "case.m4a", vibrate: [220], active: true },
  
  // ---- BIRTHDAY CARD: shimmering purple card, only visible when isBirthday is true ----
  // 'audio' is kept as the first clip for compatibility, but because
  // 'audioSequence' exists, app.js uses the sequence instead:
  //   bday1.m4a -> 500ms pause -> case.m4a -> 500ms pause -> bday2.m4a
  // sequenceFallbacks lines up BY POSITION with audioSequence:
  //   clip 0 (bday1.m4a) missing -> synth "birthday-part1", wait ~5.5s
  //   clip 1 (case.m4a)  missing -> synth "case",           wait ~1s
  //   clip 2 (bday2.m4a) missing -> synth "birthday-part2", wait ~5.5s
  // confetti: 4 -> four bursts, 300ms apart. The vibrate pattern is
  // buzz 200, rest 100, buzz 200, rest 100, long buzz 400.
  // 'active: isBirthday' is what hides/shows the whole card.
  { id: "birthday-surprise", type: "birthday", title: "HAPPY BIRTHDAY!", subtitle: "A special Oct 23rd surprise 🎈", icon: "🎂", audio: "bday1.m4a", audioSequence: ["bday1.m4a", "case.m4a", "bday2.m4a"], sequenceGap: 500, sequenceFallbacks: [{ id: "birthday-part1", ms: 5500 }, { id: "case", ms: 1000 }, { id: "birthday-part2", ms: 5500 }], confetti: 4, vibrate: [200, 100, 200, 100, 400], active: isBirthday },
  
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