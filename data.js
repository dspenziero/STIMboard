/* ==========================================================================
   STIMboard Data Configuration (data.js)
   ========================================================================== */
// 1. Check if today is October 23rd
const today = new Date();
// Note: JavaScript months are 0-indexed, so 9 = October
const isBirthday = true; // Hardcoded to true for testing // (today.getMonth() === 9 && today.getDate() === 23);

window.SOUNDBOARD_DATA = [
  { id: "case", type: "hero", title: "CASE!", subtitle: "High-priority summon", image: null, audio: "case.m4a", vibrate: [220], active: true },
  
  { id: "birthday-surprise", type: "birthday", title: "HAPPY BIRTHDAY!", subtitle: "A special Oct 23rd surprise 🎈", icon: "🎂", audio: "bday1.m4a", confetti: 4, vibrate: [200, 100, 200, 100, 400], active: isBirthday },
  
  { id: "the-trumpet", type: "featured", title: "THE TRUMPET! 🎺🎺", subtitle: "Mambo No. 5 (Full Solo Burst)", icon: "🎺", audio: "the-trumpet.m4a", appendProcedural: true, confetti: true, vibrate: [100, 50, 100, 50, 300], active: true },
  
  { id: "trumpet-short", group: "The Classics", title: "TRUMPET 🎺", subtitle: "Mambo No. 5 (Quick hit)", icon: "🎺", audio: "trumpet.m4a", appendProcedural: true, vibrate: [80], active: true },
  { id: "barney-gumbled", group: "The Classics", title: "Barney Gumbled", subtitle: "Million quid / Selekta", icon: "🇬🇧", audio: "barney-gumbled.m4a", vibrate: [60, 40, 60], active: true },
  { id: "fight-overheard", group: "The Classics", title: "FUCK WITH ME BITCH", subtitle: "Overheard trashy bitch classic", icon: "🥊", audio: "fuckwitme-bich.m4a", vibrate: [150, 50, 150], active: true },
  { id: "big-sean", group: "The Classics", title: "I don't. Fuck wit. CHU!", subtitle: "Big Sean cadence", icon: "😤", audio: "fuckwit-chu.m4a", vibrate: [100, 80, 100, 80, 250], active: true },
  { id: "follow-the-rules", group: "The Classics", title: "Follow 👏 The 👏 Rules 👏", subtitle: "Sister enforcement mode", icon: "👏", audio: "follow-rules.m4a", vibrate: [50, 50, 50, 50, 50, 50, 50, 50, 50], active: true },
  { id: "dirty-south", group: "The Classics", title: "Dirty South di-di-dirty", subtitle: "Timbaland beatbox riff", icon: "🎧", audio: "dirty-south.m4a", vibrate: [70, 30, 70, 30, 120], active: true },

  { id: "drg-stone", group: "⛏️ Deep Rock Galactic Salutes", collapsible: true, title: "ROCK AND STONE!", subtitle: "The classic salute", icon: "⛏️", audio: "rocknstone.m4a", vibrate: [150, 50, 200], active: true },
  { id: "drg-on", group: "⛏️ Deep Rock Galactic Salutes", collapsible: true, title: "ROCK ON!", subtitle: "Short & sweet", icon: "🤘", audio: "rock-on.m4a", vibrate: [150], active: true },
  { id: "drg-fight", group: "⛏️ Deep Rock Galactic Salutes", collapsible: true, title: "We Fight!", subtitle: "For Rock and Stone", icon: "⚔️", audio: "we-fight-rocknstone.m4a", vibrate: [100, 50, 100, 50, 250], active: true },
  { id: "drg-bone", group: "⛏️ Deep Rock Galactic Salutes", collapsible: true, title: "To the Bone!", subtitle: "Rock and Stone", icon: "🦴", audio: "2the-bone.m4a", vibrate: [80, 80, 80, 200], active: true },
  { id: "drg-diff", group: "⛏️ Deep Rock Galactic Salutes", collapsible: true, title: "The Difference?", subtitle: "Between a Rock and a Stone", icon: "🪨", audio: "rocknstone-diff.m4a", vibrate: [50, 50, 50, 150], active: true },
  { id: "drg-never-alone", group: "⛏️ Deep Rock Galactic Salutes", collapsible: true, title: "Never Alone", subtitle: "If you Rock and Stone", icon: "🍻", audio: "never-alone.m4a", vibrate: [100, 50, 200], active: true },
  { id: "drg-home", group: "⛏️ Deep Rock Galactic Salutes", collapsible: true, title: "Ain't Coming Home", subtitle: "If you don't Rock and Stone", icon: "🚀", audio: "rocknstone-home.m4a", vibrate: [60, 60, 60, 60, 200], active: true },
  { id: "drg-hear", group: "⛏️ Deep Rock Galactic Salutes", collapsible: true, title: "Did I Hear...?", subtitle: "A Rock and a Stone?", icon: "👂", audio: "hear-rocknstone.m4a", vibrate: [100, 50, 100, 50, 150], active: true }
];