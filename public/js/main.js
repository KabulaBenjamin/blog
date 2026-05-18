// ── Mobile nav toggle ─────────────────────────────────────────────────
const toggle = document.getElementById('navToggle');
const links  = document.getElementById('navLinks');
if (toggle && links) {
  toggle.addEventListener('click', () => {
    links.classList.toggle('nav--open');
  });
  // Close on link click
  links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => links.classList.remove('nav--open')));
}

// ── Sticky nav shadow ──────────────────────────────────────────────────
const nav = document.getElementById('nav');
if (nav) {
  window.addEventListener('scroll', () => {
    nav.style.boxShadow = window.scrollY > 10 ? '0 4px 20px rgba(26,26,46,0.12)' : 'none';
  }, { passive: true });
}

// ── Reading progress bar ───────────────────────────────────────────────
if (document.querySelector('.article-body')) {
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;top:0;left:0;height:3px;background:linear-gradient(90deg,#0d9488,#b45309);z-index:9999;transition:width 0.1s;width:0';
  document.body.appendChild(bar);
  window.addEventListener('scroll', () => {
    const d = document.documentElement;
    const p = (d.scrollTop) / (d.scrollHeight - d.clientHeight) * 100;
    bar.style.width = Math.min(p, 100) + '%';
  }, { passive: true });
}

// ── Lazy image fade-in ─────────────────────────────────────────────────
document.querySelectorAll('img[loading="lazy"]').forEach(img => {
  img.style.opacity = '0';
  img.style.transition = 'opacity 0.4s';
  if (img.complete) {
    img.style.opacity = '1';
  } else {
    img.addEventListener('load', () => { img.style.opacity = '1'; });
  }
});

// ── External links open in new tab ────────────────────────────────────
document.querySelectorAll('.prose a').forEach(a => {
  if (a.hostname !== location.hostname) {
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  }
});

// ── Code block copy buttons ───────────────────────────────────────────
document.querySelectorAll('.prose pre').forEach(pre => {
  const btn = document.createElement('button');
  btn.textContent = 'Copy';
  btn.style.cssText = 'position:absolute;top:10px;right:10px;padding:4px 10px;background:rgba(255,255,255,0.1);color:#e2e8f0;border:1px solid rgba(255,255,255,0.2);border-radius:4px;cursor:pointer;font-size:0.72rem;font-family:monospace';
  pre.style.position = 'relative';
  pre.appendChild(btn);
  btn.addEventListener('click', () => {
    navigator.clipboard.writeText(pre.textContent.replace('Copy','').trim());
    btn.textContent = '✓ Copied';
    setTimeout(() => btn.textContent = 'Copy', 1800);
  });
});
