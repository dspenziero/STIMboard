/* ==========================================================================
   STIMboard Debug Log (log.js)  -- loaded FIRST in index.html
   --------------------------------------------------------------------------
   ROLE OF THIS FILE
   A small persistent log so problems can be diagnosed on a phone, where there
   is no developer console. Other files call  stimLog(level, area, message, data)
   (or the shortcuts stimLog.info / .warn / .error).

   WHAT IT DOES
     - Keeps the last 300 entries in memory AND in localStorage, so the log
       survives reloads and app restarts.
     - Captures uncaught errors and unhandled promise rejections automatically.
     - Redacts anything that looks like a GitHub token before storing it, so
       copying the log never leaks the access token.
     - Mirrors every entry to the browser console (when one is available).
     - The log viewer screen (extras.js) reads it through stimLog.entries(),
       stimLog.text() and stimLog.clear().

   WHY IT LOADS FIRST
   So errors thrown while the other scripts load are still captured. It has no
   dependencies and every storage call is wrapped, so it can never break the app.
   ========================================================================== */

(function () {
  'use strict';

  const KEY = 'stimboard-log';   // localStorage key for the saved log.
  const MAX = 300;               // Keep only the newest 300 entries (bounds storage use).

  // Loads the saved log (an array of entries). Any problem -> start empty.
  function load() {
    try { const v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  let entries = load();

  // Removes anything token-shaped from text before it is stored or shown.
  //   github_pat_XXXX  = fine-grained tokens        ghp_/gho_/ghu_/ghs_/ghr_ = classic tokens
  //   "Bearer XXXX"    = an Authorization header copied into an error message
  function redact(s) {
    return String(s)
      .replace(/github_pat_[A-Za-z0-9_]+/g, 'github_pat_[REDACTED]')
      .replace(/gh[pousr]_[A-Za-z0-9]{20,}/g, 'gh_[REDACTED]')
      .replace(/(Bearer\s+)[A-Za-z0-9._\-]+/gi, '$1[REDACTED]');
  }

  // Turns optional extra data into a short safe string. Errors become their
  // message plus the first stack lines; objects become JSON; long text is cut.
  function fmt(data) {
    if (data === undefined || data === null) return '';
    try {
      if (data instanceof Error) return redact(data.name + ': ' + data.message + (data.stack ? '\n' + data.stack.split('\n').slice(0, 4).join('\n') : ''));
      if (typeof data === 'string') return redact(data).slice(0, 600);
      return redact(JSON.stringify(data)).slice(0, 600);
    } catch (e) { return '[unprintable]'; }
  }

  // Writes the log to storage. A full or blocked storage must not throw.
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(entries)); } catch (e) {} }

  // The main function. level: 'info' | 'warn' | 'error'. area: a short tag such
  // as 'github', 'audio' or 'form'. message: what happened. data: optional detail.
  function stimLog(level, area, message, data) {
    const entry = { t: new Date().toISOString(), l: level, a: area, m: redact(message), d: fmt(data) };
    entries.push(entry);
    if (entries.length > MAX) entries = entries.slice(entries.length - MAX);   // Drop the oldest.
    persist();
    // Mirror to the console. console.info/warn/error are the matching levels.
    try { (console[level] || console.log).call(console, '[STIMboard] ' + area + ': ' + entry.m, entry.d || ''); } catch (e) {}
  }

  // Shortcuts so callers can write stimLog.error('github', 'PUT failed', err).
  stimLog.info = (a, m, d) => stimLog('info', a, m, d);
  stimLog.warn = (a, m, d) => stimLog('warn', a, m, d);
  stimLog.error = (a, m, d) => stimLog('error', a, m, d);

  // A copy of the entries (newest last) for the viewer.
  stimLog.entries = () => entries.slice();

  // The whole log as plain text, ready to copy and paste into a message.
  // The header line records the context that usually matters when debugging.
  stimLog.text = () => {
    const head = ['STIMboard log', 'time: ' + new Date().toISOString(), 'url: ' + location.href,
      'agent: ' + navigator.userAgent, 'online: ' + navigator.onLine,
      'standalone: ' + (window.matchMedia && matchMedia('(display-mode: standalone)').matches), '---'];
    const lines = entries.map(e => e.t + ' ' + e.l.toUpperCase().padEnd(5) + ' [' + e.a + '] ' + e.m + (e.d ? '  | ' + e.d.replace(/\n/g, ' / ') : ''));
    return head.concat(lines).join('\n');
  };

  // Empties the log, in memory and in storage.
  stimLog.clear = () => { entries = []; persist(); };

  // Expose it on window so every other script (and the viewer) can use it.
  window.stimLog = stimLog;

  // ---- AUTOMATIC CAPTURE OF PROBLEMS NOBODY HANDLED ----
  // 'error' fires for uncaught exceptions (and for resources that fail to load,
  // but those do not bubble to window, so only real script errors arrive here).
  window.addEventListener('error', (ev) => {
    stimLog('error', 'window', (ev.message || 'Script error') + ' @ ' + (ev.filename || '').split('/').pop() + ':' + (ev.lineno || 0));
  });
  // 'unhandledrejection' fires when an async operation fails and nothing caught it.
  window.addEventListener('unhandledrejection', (ev) => {
    stimLog('error', 'promise', 'Unhandled rejection', ev.reason);
  });

  // One line per page load makes it easy to see where each session starts.
  stimLog('info', 'app', 'Page loaded', { online: navigator.onLine });
})();
