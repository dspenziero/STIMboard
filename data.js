/* ==========================================================================
   STIMboard Data Configuration (data.js)
   ========================================================================== */

// 1. Check if today is October 23rd
const today = new Date();
// Note: JavaScript months are 0-indexed, so 9 = October
const isBirthday = true // (today.getMonth() === 9 && today.getDate() === 23);

window.SOUNDBOARD_DATA = [
  // --- 1. HERO CARD ---
  {
    id: "case",
    type: "hero",
    title: "CASE!",
    subtitle: "High-priority summon",
    image: null, 
    audio: null,
    vibrate: [220],
    active: true
  },

  // --- 2. BIRTHDAY EXCLUSIVE (Only appears on Oct 23) ---
  {
    id: "birthday-surprise",
    type: "featured",
    title: "HAPPY BIRTHDAY!",
    subtitle: "A special Oct 23rd surprise 🎈",
    icon: "🎂",
    audio: null, 
    confetti: true,
    vibrate: [200, 100, 200, 100, 400], // celebratory vibration
    active: isBirthday 
  },

  // --- 3. THE TRUMPET ---
  {
    id: "the-trumpet",
    type: "featured",
    title: "THE TRUMPET! 🎺🎺",
    subtitle: "Mambo No. 5 (Full Solo Burst)",
    icon: "🎺",
    audio: null, 
    appendProcedural: true, 
    confetti: true,
    vibrate: [100, 50, 100, 50, 300],
    active: true
  },

  // --- 4. THE CLASSICS ---
  { id: "trumpet-short", group: "The Classics", title: "TRUMPET 🎺", subtitle: "Mambo No. 5 (Quick hit)", icon: "🎺", audio: null, appendProcedural: true, vibrate: [80], active: true },
  { id: "barney-gumbled", group: "The Classics", title: "Barney Gumbled", subtitle: "Million quid / Selekta", icon: "🇬🇧", audio: null, vibrate: [60, 40, 60], active: true },
  { id: "fight-overheard", group: "The Classics", title: "FUCK WITH ME BITCH", subtitle: "Overheard balcony classic", icon: "🥊", audio: null, vibrate: [150, 50, 150], active: true },
  { id: "big-sean", group: "The Classics", title: "I don't. Fuck wit. CHU!", subtitle: "Big Sean cadence", icon: "😤", audio: null, vibrate: [100, 80, 100, 80, 250], active: true },
  { id: "follow-the-rules", group: "The Classics", title: "Follow 👏 The 👏 Rules 👏", subtitle: "Sister enforcement mode", icon: "👏", audio: null, vibrate: [50, 50, 50, 50, 50, 50, 50, 50, 50], active: true },
  { id: "dirty-south", group: "The Classics", title: "Dirty South di-di-dirty", subtitle: "Timbaland beatbox riff", icon: "🎧", audio: null, vibrate: [70, 30, 70, 30, 120], active: true },

  // --- 5. DEEP ROCK GALACTIC ---
  { id: "drg-stone", group: "⛏️ Deep Rock Galactic Salutes", collapsible: true, title: "ROCK AND STONE!", subtitle: "The classic salute", icon: "⛏️", audio: null, vibrate: [150, 50, 200], active: true },
  { id: "drg-on", group: "⛏️ Deep Rock Galactic Salutes", collapsible: true, title: "ROCK ON!", subtitle: "Short & sweet", icon: "🤘", audio: null, vibrate: [150], active: true },
  { id: "drg-fight", group: "⛏️ Deep Rock Galactic Salutes", collapsible: true, title: "We Fight!", subtitle: "For Rock and Stone", icon: "⚔️", audio: null, vibrate: [100, 50, 100, 50, 250], active: true },
  { id: "drg-bone", group: "⛏️ Deep Rock Galactic Salutes", collapsible: true, title: "To the Bone!", subtitle: "Rock and Stone", icon: "🦴", audio: null, vibrate: [80, 80, 80, 200], active: true },
  { id: "drg-diff", group: "⛏️ Deep Rock Galactic Salutes", collapsible: true, title: "The Difference?", subtitle: "Between a Rock and a Stone", icon: "🪨", audio: null, vibrate: [50, 50, 50, 150], active: true },
  { id: "drg-never-alone", group: "⛏️ Deep Rock Galactic Salutes", collapsible: true, title: "Never Alone", subtitle: "If you Rock and Stone", icon: "🍻", audio: null, vibrate: [100, 50, 200], active: true },
  { id: "drg-home", group: "⛏️ Deep Rock Galactic Salutes", collapsible: true, title: "Ain't Coming Home", subtitle: "If you don't Rock and Stone", icon: "🚀", audio: null, vibrate: [60, 60, 60, 60, 200], active: true },
  { id: "drg-hear", group: "⛏️ Deep Rock Galactic Salutes", collapsible: true, title: "Did I Hear...?", subtitle: "A Rock and a Stone?", icon: "👂", audio: null, vibrate: [100, 50, 100, 50, 150], active: true }
];