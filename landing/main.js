(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* header: fondo al hacer scroll + menú móvil */
  const top = document.getElementById('top');
  const burger = top.querySelector('.burger');
  const onScroll = () => top.classList.toggle('solid', window.scrollY > 30);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
  burger.addEventListener('click', () => {
    const open = top.classList.toggle('open');
    burger.setAttribute('aria-expanded', open);
  });
  top.querySelectorAll('.menu a').forEach(a => a.addEventListener('click', () => {
    top.classList.remove('open');
    burger.setAttribute('aria-expanded', 'false');
  }));

  /* reveal on scroll */
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  /* manifiesto: palabras que se iluminan con el scroll */
  const mani = document.querySelector('[data-words]');
  if (mani) {
    const frag = document.createDocumentFragment();
    mani.childNodes.forEach(node => {
      const isEm = node.nodeName === 'EM';
      node.textContent.split(/(\s+)/).forEach(tok => {
        if (!tok) return;
        if (/^\s+$/.test(tok)) { frag.appendChild(document.createTextNode(tok)); return; }
        const s = document.createElement('span');
        s.className = 'w' + (isEm ? ' em' : '');
        s.textContent = tok;
        frag.appendChild(s);
      });
    });
    mani.textContent = '';
    mani.appendChild(frag);
    const words = [...mani.querySelectorAll('.w')];
    const paint = () => {
      const r = mani.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.35)));
      const n = Math.round(p * words.length);
      words.forEach((w, i) => w.classList.toggle('on', reduce || i < n));
    };
    paint();
    window.addEventListener('scroll', paint, { passive: true });
    window.addEventListener('resize', paint);
  }

  /* hero: recorrido por la cocina.
     Cada foto hace un acercamiento/paneo lento (Ken Burns) y se funde con la
     siguiente, para que se sienta como caminar por la cocina. */
  const tour = document.getElementById('tour');
  if (tour) {
    const slides = [...tour.querySelectorAll('.slide')];
    const label = document.getElementById('tourLabel');
    const barsBox = document.getElementById('tourBars');
    const pauseBtn = document.getElementById('tourPause');
    const DUR = reduce ? 7000 : 5600;   // tiempo en cada vista
    const FADE = 1600;                  // fundido (igual que el CSS)
    let cur = -1, timer = null, paused = false, startedAt = 0, remaining = DUR, anim = null, barAnim = null;

    const bars = slides.map((s, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', 'Ver: ' + s.dataset.label);
      b.innerHTML = '<span><i></i></span>';
      b.addEventListener('click', () => go(i));
      barsBox.appendChild(b);
      return b;
    });

    const kb = s => {
      let [s0, x0, y0, s1, x1, y1] = s.dataset.kb.split(' ').map(Number);
      // el paneo nunca puede pasar del zoom (si no, se ve el borde de la foto)
      const lim = sc => (sc - 1) / (2 * sc) * 100 * 0.9;
      const cl = (v, sc) => Math.max(-lim(sc), Math.min(lim(sc), v));
      x0 = cl(x0, s0); y0 = cl(y0, s0); x1 = cl(x1, s1); y1 = cl(y1, s1);
      return [
        { transform: `scale(${s0}) translate(${x0}%, ${y0}%)` },
        { transform: `scale(${s1}) translate(${x1}%, ${y1}%)` }
      ];
    };

    const schedule = ms => {
      clearTimeout(timer);
      startedAt = performance.now(); remaining = ms;
      timer = setTimeout(() => go(cur + 1), ms);
    };

    function go(i) {
      i = (i + slides.length) % slides.length;
      const prev = slides[cur];
      if (prev && prev !== slides[i]) {
        prev.classList.remove('on'); prev.classList.add('out');
        setTimeout(() => prev.classList.remove('out'), FADE);
      }
      cur = i;
      const s = slides[i];
      s.classList.remove('out'); s.classList.add('on');
      // precarga la siguiente
      const nx = slides[(i + 1) % slides.length].querySelector('img');
      if (nx.loading === 'lazy') nx.loading = 'eager';

      if (!reduce) {
        const img = s.querySelector('img');
        img.getAnimations().forEach(a => a.cancel());
        anim = img.animate(kb(s), { duration: DUR + FADE, easing: 'cubic-bezier(.3,.1,.4,1)', fill: 'forwards' });
      }
      label.style.opacity = 0;
      setTimeout(() => { label.textContent = s.dataset.label; label.style.opacity = 1; }, 250);

      bars.forEach((b, k) => {
        b.classList.toggle('done', k < i);
        b.setAttribute('aria-current', k === i ? 'true' : 'false');
        const fill = b.querySelector('i');
        fill.getAnimations().forEach(a => a.cancel());
        if (k !== i) fill.style.width = '';
      });
      const fill = bars[i].querySelector('i');
      barAnim = fill.animate([{ width: '0%' }, { width: '100%' }], { duration: DUR, easing: 'linear', fill: 'forwards' });

      if (paused) { anim && anim.pause(); barAnim.pause(); remaining = DUR; }
      else schedule(DUR);
    }

    // paused = estado real; userPaused = el usuario tocó pausa; hidden = no está en pantalla
    let userPaused = false, hidden = false;
    const sync = () => {
      pauseBtn.setAttribute('aria-pressed', userPaused);
      pauseBtn.setAttribute('aria-label', userPaused ? 'Reanudar recorrido' : 'Pausar recorrido');
      const p = userPaused || hidden;
      if (p === paused) return;
      paused = p;
      if (p) {
        clearTimeout(timer);
        remaining = Math.max(0, remaining - (performance.now() - startedAt));
        anim && anim.pause(); barAnim && barAnim.pause();
      } else {
        anim && anim.play(); barAnim && barAnim.play();
        schedule(remaining);
      }
    };
    pauseBtn.addEventListener('click', () => { userPaused = !userPaused; sync(); });

    // no gastar batería cuando el recorrido no se ve
    let offscreen = false;
    new IntersectionObserver(([e]) => { offscreen = !e.isIntersecting; hidden = offscreen || document.hidden; sync(); }, { threshold: 0.2 }).observe(tour);
    document.addEventListener('visibilitychange', () => { hidden = offscreen || document.hidden; sync(); });

    go(0);
  }

  /* carrusel de soluciones */
  const vp = document.getElementById('cardsVp');
  const cards = [...document.querySelectorAll('#cards .card')];
  const bar = document.getElementById('solBar');
  const prev = document.getElementById('prev');
  const next = document.getElementById('next');
  let active = 0;
  const setActive = (i, scroll = true) => {
    active = Math.max(0, Math.min(cards.length - 1, i));
    cards.forEach((c, k) => c.classList.toggle('on', k === active));
    bar.style.width = ((active + 1) / cards.length * 100) + '%';
    prev.disabled = active === 0;
    next.disabled = active === cards.length - 1;
    if (scroll) vp.scrollTo({ left: cards[active].offsetLeft - cards[0].offsetLeft, behavior: reduce ? 'auto' : 'smooth' });
  };
  cards.forEach((c, i) => c.addEventListener('click', () => setActive(i)));
  prev.addEventListener('click', () => setActive(active - 1));
  next.addEventListener('click', () => setActive(active + 1));
  vp.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { e.preventDefault(); setActive(active + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); setActive(active - 1); }
  });
  // arrastrar con el mouse
  let down = false, startX = 0, startL = 0, moved = false;
  vp.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse') return;
    down = true; moved = false; startX = e.clientX; startL = vp.scrollLeft;
  });
  window.addEventListener('pointermove', e => {
    if (!down) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 5) { moved = true; vp.classList.add('drag'); }
    vp.scrollLeft = startL - dx;
  });
  window.addEventListener('pointerup', () => {
    if (!down) return;
    down = false; vp.classList.remove('drag');
    if (moved) {
      const step = cards[1].offsetLeft - cards[0].offsetLeft;
      setActive(Math.round(vp.scrollLeft / step));
    }
  });
  // swipe táctil: sincroniza la tarjeta activa con el scroll
  let t;
  vp.addEventListener('scroll', () => {
    if (down) return;
    clearTimeout(t);
    t = setTimeout(() => {
      const step = cards[1].offsetLeft - cards[0].offsetLeft;
      const i = Math.round(vp.scrollLeft / step);
      if (i !== active) setActive(i, false);
    }, 120);
  }, { passive: true });
  setActive(0, false);

  /* contador */
  document.querySelectorAll('[data-count]').forEach(el => {
    const end = +el.dataset.count;
    const run = () => {
      if (reduce) { el.textContent = end; return; }
      const t0 = performance.now();
      const tick = now => {
        const p = Math.min(1, (now - t0) / 1400);
        el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    new IntersectionObserver((es, o) => { if (es[0].isIntersecting) { run(); o.disconnect(); } }, { threshold: 0.6 }).observe(el);
  });

  /* reloj (hora de Colombia) y año */
  const clock = document.getElementById('clock');
  const fmt = new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'America/Bogota' });
  const tickClock = () => { clock.textContent = fmt.format(new Date()); };
  tickClock(); setInterval(tickClock, 1000);
  document.getElementById('year').textContent = new Date().getFullYear();

  /* partículas cálidas (polvo de madera, muy sutil sobre fondo claro) */
  const cv = document.getElementById('particles');
  if (cv && !reduce) {
    const ctx = cv.getContext('2d');
    let W, H, dpr, pts = [];
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = cv.width = innerWidth * dpr; H = cv.height = innerHeight * dpr;
      const n = Math.round(Math.min(40, innerWidth / 30));
      pts = Array.from({ length: n }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        r: (Math.random() * 1.4 + .4) * dpr,
        vx: (Math.random() - .5) * .15 * dpr, vy: -(Math.random() * .25 + .05) * dpr,
        a: Math.random() * .25 + .1, red: Math.random() < .35
      }));
    };
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy;
        if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; }
        if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.red ? `rgba(180,96,42,${p.a})` : `rgba(205,178,137,${p.a + .15})`;
        ctx.fill();
      }
      requestAnimationFrame(draw);
    };
    resize(); draw();
    window.addEventListener('resize', resize);
  }
})();
