/* ==========================================================================
   STIMboard Main Application Controller (app.js)
   ========================================================================== */

// --- 1. SERVICE WORKER & ANDROID INSTALL PROMPT ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => reg.update())
      .catch((err) => console.warn('SW skipped:', err));
  });

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}

let deferredPrompt;
const installBtn = document.getElementById('installBtn');
const appFooter = document.getElementById('appFooter');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (installBtn) installBtn.style.display = 'block';
  if (appFooter) appFooter.style.display = 'none';
});

if (installBtn) {
  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') installBtn.style.display = 'none';
    deferredPrompt = null;
  });
}

// --- 2. CONFETTI PARTICLE ENGINE ---
const canvas = document.getElementById('confettiCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;
let particles = [];

function resizeCanvas() {
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function burstConfetti() {
  if (!canvas) return;
  const colors = ['#f59e0b', '#fbbf24', '#f87171', '#38bdf8', '#34d399'];
  for (let i = 0; i < 75; i++) {
    particles.push({
      x: canvas.width / 2,
      y: canvas.height / 3,
      vx: (Math.random() - 0.5) * 14,
      vy: (Math.random() - 0.7) * 16,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 10,
      opacity: 1
    });
  }
}

function renderConfetti() {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.45;
    p.rotation += p.rotSpeed;
    p.opacity -= 0.012;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate((p.rotation * Math.PI) / 180);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.max(p.opacity, 0);
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
    ctx.restore();

    if (p.opacity <= 0 || p.y > canvas.height) particles.splice(i, 1);
  }
  requestAnimationFrame(renderConfetti);
}
renderConfetti();

// --- 3. AUDIO SEQUENCER & HAPTICS (Updated with Strict 404 Catch) ---
let currentAudio = null;

function triggerStim(item, el) {
  // 1. Fire Visuals & Haptics immediately
  if (item.vibrate && 'vibrate' in navigator) navigator.vibrate(item.vibrate);
  if (item.confetti) burstConfetti();
  if (el) {
    el.classList.add('playing');
    setTimeout(() => el.classList.remove('playing'), 800);
  }

  // 2. Play Audio
  if (item.audio) {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.onended = null;
      currentAudio.onerror = null;
    }
    
    currentAudio = new Audio(item.audio);

    // If the MP3 file is missing/404s, fire the procedural sound instantly
    currentAudio.onerror = () => {
      if (window.playProceduralSound) window.playProceduralSound(item.id, false);
    };

    if (item.appendProcedural) {
      currentAudio.onended = () => {
        if (window.playProceduralSound) window.playProceduralSound(item.id, true);
      };
    }

    const playPromise = currentAudio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // If the browser blocks playback, fall back to procedural
        if (window.playProceduralSound) window.playProceduralSound(item.id, false);
      });
    }
  } else {
    // If audio is explicitly set to null, play procedural instantly
    if (window.playProceduralSound) window.playProceduralSound(item.id, false);
  }
}

// --- 4. DOM BUILDER (Mounts Hero, Featured, Grids & Collapsible Cards) ---
function renderSoundboard() {
  const heroSlot = document.getElementById('heroSlot');
  const featuredSlot = document.getElementById('featuredSlot');
  const gridContainer = document.getElementById('gridContainer');
  const slotCounter = document.getElementById('slotCounter');

  const data = window.SOUNDBOARD_DATA || [];
  const activeStims = data.filter(item => item.active);
  if (slotCounter) slotCounter.textContent = `${activeStims.length} Stims`;

  const groupedItems = {};

  activeStims.forEach(item => {
    if (item.type === 'hero' && heroSlot) {
      const heroBtn = document.createElement('button');
      heroBtn.className = 'hero-card';
      const imgMarkup = item.image
        ? `<img src="${item.image}" alt="${item.title}" class="hero-avatar">`
        : `<div class="hero-avatar">👩🏻</div>`;

      heroBtn.innerHTML = `
        <div class="hero-avatar-wrapper">
          ${imgMarkup}
          <div class="hero-pulse-ring"></div>
        </div>
        <div class="hero-info">
          <span class="hero-title">${item.title}</span>
          <span class="hero-sub">${item.subtitle}</span>
        </div>
      `;
      heroBtn.addEventListener('click', () => triggerStim(item, heroBtn));
      heroSlot.appendChild(heroBtn);

    } else if (item.type === 'featured' && featuredSlot) {
      const featBtn = document.createElement('button');
      featBtn.className = 'featured-card';
      featBtn.innerHTML = `
        <div class="featured-content">
          <span class="featured-title">${item.title}</span>
          <span class="featured-sub">${item.subtitle}</span>
        </div>
        <span class="featured-icon">${item.icon || "🎺"}</span>
      `;
      featBtn.addEventListener('click', () => triggerStim(item, featBtn));
      featuredSlot.appendChild(featBtn);

    } else {
      const groupName = item.group || "Misc Stims";
      if (!groupedItems[groupName]) {
        groupedItems[groupName] = {
          collapsible: Boolean(item.collapsible),
          items: []
        };
      }
      if (item.collapsible) groupedItems[groupName].collapsible = true;
      groupedItems[groupName].items.push(item);
    }
  });

  if (!gridContainer) return;

  Object.keys(groupedItems).forEach(groupName => {
    const groupData = groupedItems[groupName];
    const grid = document.createElement('div');
    grid.className = 'sound-grid';

    groupData.items.forEach(item => {
      const gridBtn = document.createElement('button');
      gridBtn.className = 'stim-card';
      gridBtn.innerHTML = `
        <span class="stim-icon">${item.icon || "🔊"}</span>
        <div class="stim-text">
          <span class="stim-title">${item.title}</span>
          <span class="stim-sub">${item.subtitle}</span>
        </div>
      `;
      gridBtn.addEventListener('click', () => triggerStim(item, gridBtn));
      grid.appendChild(gridBtn);
    });

    if (groupData.collapsible) {
      const details = document.createElement('details');
      details.className = 'collapsible-group';

      const summary = document.createElement('summary');
      summary.innerHTML = `
        <span>${groupName} (${groupData.items.length})</span>
        <span class="collapse-arrow">▼</span>
      `;

      details.appendChild(summary);
      details.appendChild(grid);
      gridContainer.appendChild(details);
    } else {
      const section = document.createElement('div');
      section.className = 'group-section';

      const title = document.createElement('h2');
      title.className = 'group-title';
      title.textContent = groupName;

      section.appendChild(title);
      section.appendChild(grid);
      gridContainer.appendChild(section);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderSoundboard);
} else {
  renderSoundboard();
}