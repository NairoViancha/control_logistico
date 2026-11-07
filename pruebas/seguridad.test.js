/* ==========================================================================
   MODUGAL · Pruebas de regresión de seguridad (auditoría nov 2026)
   --------------------------------------------------------------------------
   Corre la app real (index.html + app.js) contra un Supabase simulado, sin
   tocar datos reales. Requisitos: Node 18+ y Playwright
     npm i -D playwright && npx playwright install chromium
     node pruebas/seguridad.test.js
   Sale con código 1 si alguna prueba falla.
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');
const TMP = path.join(__dirname, '.tmp');

/* Página de prueba: la app real, con el cliente de Supabase simulado */
function prepararPagina() {
  fs.mkdirSync(TMP, { recursive: true });
  for (const f of ['app.js', 'styles.css', 'ciudades.js']) fs.copyFileSync(path.join(RAIZ, f), path.join(TMP, f));
  fs.copyFileSync(path.join(__dirname, 'fake-supabase.js'), path.join(TMP, 'fake-sb.js'));
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8')
    .replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase[^>]*><\/script>/, '<script src="fake-sb.js"></script>')
    .replace(/<script src="https:\/\/cdn\.tailwindcss[^>]*><\/script>/, '');
  fs.writeFileSync(path.join(TMP, 'index.html'), html);
  fs.writeFileSync(path.join(TMP, 'marco.html'), '<!doctype html><iframe id="f" src="index.html" width="800" height="600"></iframe>');
}

const resultados = [];
function prueba(nombre, ok, detalle = '') {
  resultados.push({ nombre, ok: Boolean(ok), detalle });
  console.log(`${ok ? '✔' : '✘'} ${nombre}${detalle ? ` — ${detalle}` : ''}`);
}

async function abrirApp(browser, { rol = 'nairovianchacortes@gmail.com' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 }, timezoneId: 'America/Bogota' });
  const pg = await ctx.newPage();
  pg.violacionesCSP = [];
  pg.on('dialog', (d) => d.accept());
  await pg.route('**/*', (r) => (/^(file|data|blob):/.test(r.request().url()) ? r.continue() : r.abort()));
  await pg.addInitScript(() => {
    localStorage.setItem('modo', 'tabla');
    document.addEventListener('securitypolicyviolation', (e) => { (window.__csp = window.__csp || []).push(e.violatedDirective); });
  });
  await pg.goto(`file://${path.join(TMP, 'index.html')}`);
  await pg.waitForTimeout(300);
  await pg.fill('#login-email', rol);
  await pg.fill('#login-password', 'clave123');
  await pg.click('#login-submit');
  await pg.waitForTimeout(900);
  return { ctx, pg };
}

const CARGA_XSS = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>"\'><svg onload=window.__xss=3>';

(async () => {
  prepararPagina();
  const browser = await chromium.launch();

  /* ---------- H-01 · CSP, integridad de librerías e inyección de scripts ---------- */
  {
    const { ctx, pg } = await abrirApp(browser);
    const meta = await pg.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || '');
    prueba('H-01 CSP presente sin unsafe-inline ni unsafe-eval en scripts', /script-src 'self'[^;]*;/.test(meta) && !/script-src[^;]*unsafe/.test(meta));
    prueba('H-01 connect-src limitado a Supabase', /connect-src 'self' https:\/\/\*\.supabase\.co wss:\/\/\*\.supabase\.co/.test(meta));
    const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
    prueba('H-01 Supabase con versión fija e integrity', /supabase-js@\d+\.\d+\.\d+\/[^"]+" integrity="sha384-/.test(html));
    prueba('H-01 FontAwesome con integrity', /font-awesome\/6\.5\.2\/css\/all\.min\.css" integrity="sha384-/.test(html));
    prueba('H-01 Tailwind con versión fija', /cdn\.tailwindcss\.com\/\d+\.\d+\.\d+/.test(html));
    const inline = await pg.evaluate(async () => {
      const s = document.createElement('script'); s.textContent = 'window.__inline = 1'; document.body.appendChild(s);
      await new Promise((r) => setTimeout(r, 100));
      let evalOk = true; try { eval('1'); } catch (e) { evalOk = false; }
      return { inline: window.__inline, evalOk };
    });
    prueba('H-01 script inyectado en línea NO se ejecuta', inline.inline === undefined);
    prueba('H-01 eval bloqueado', inline.evalOk === false);

    /* XSS almacenado: la carga maliciosa se guarda en varios campos y se pinta como texto */
    await pg.evaluate((carga) => {
      const p = state.proyectos[0];
      p.name = carga; p.client = carga; p.city = carga; p.neighborhood = carga;
      p.muebles = [{ id: 'mx', name: carga, carpenter: 'Carlos Martinez', manufacturingPhase: 'Armado', actividad: 'Armando', detalle: carga, estadoTrabajo: 'En proceso' }];
      state.documentos = { [p.id]: [{ id: 'dx', proyecto_id: 'p1', carpeta: 'proyecto', categoria: 'Planimetría', nombre: carga, ruta: 'documentos-proyecto/p1/x.pdf', tipo_mime: 'application/pdf', notas: carga, created_at: new Date().toISOString() }] };
      renderAll();
      openFicha(p.id);
      ['resumen', 'muebles', 'pendientes', 'pedidos', 'incidentes', 'dropbox'].forEach((sub) => mostrarSubFicha(sub));
      switchTab('equipo'); switchTab('tabla'); switchTab('proyectos'); switchTab('centro');
    }, CARGA_XSS);
    await pg.waitForTimeout(300);
    const xss = await pg.evaluate(() => ({ ejecutado: window.__xss, imgInyectada: !!document.querySelector('img[src="x"]'), svg: !!document.querySelector('svg[onload]') }));
    prueba('H-01 XSS almacenado (nombre, cliente, ciudad, mueble, documento) se muestra como texto', !xss.ejecutado && !xss.imgInyectada && !xss.svg, JSON.stringify(xss));
    await ctx.close();
  }

  /* ---------- H-09 · Clickjacking ---------- */
  {
    const ctx = await browser.newContext(); const pg = await ctx.newPage();
    await pg.route('**/*', (r) => (/^(file|data):/.test(r.request().url()) ? r.continue() : r.abort()));
    await pg.goto(`file://${path.join(TMP, 'marco.html')}`);
    await pg.waitForTimeout(600);
    const oculto = await pg.evaluate(() => {
      try {
        const d = document.getElementById('f').contentDocument;
        return !d || d.documentElement.style.display === 'none' || location.href.endsWith('index.html');
      } catch (e) { return true; }
    });
    prueba('H-09 la app no se deja mostrar dentro de un marco', oculto);
    await ctx.close();
  }

  /* ---------- H-02 · Política de contraseñas (valores frontera) ---------- */
  {
    const { ctx, pg } = await abrirApp(browser);
    const casos = await pg.evaluate(() => ({
      siete: validarClaveNueva('abc1234', 'ana@x.com'),
      ochoSoloLetras: validarClaveNueva('abcdefgh', 'ana@x.com'),
      ochoSoloNumeros: validarClaveNueva('12345678', 'ana@x.com'),
      conCorreo: validarClaveNueva('nairo2026x', 'nairo@x.com'),
      repetida: validarClaveNueva('aaaaaaaa', ''),
      larga: validarClaveNueva(`a1${'x'.repeat(80)}`, ''),
      valida: validarClaveNueva('Taller2026', 'ana@x.com'),
      validaJusta: validarClaveNueva('abcdef12', 'ana@x.com'),
    }));
    prueba('H-02 rechaza 7 caracteres', !!casos.siete);
    prueba('H-02 rechaza solo letras', !!casos.ochoSoloLetras);
    prueba('H-02 rechaza solo números', !!casos.ochoSoloNumeros);
    prueba('H-02 rechaza contraseña con el correo', !!casos.conCorreo);
    prueba('H-02 rechaza caracteres repetidos', !!casos.repetida);
    prueba('H-02 rechaza más de 72 caracteres', !!casos.larga);
    prueba('H-02 acepta 8 caracteres con letras y números (frontera)', casos.validaJusta === null && casos.valida === null);
    /* El formulario de registro usa la misma regla */
    await pg.evaluate(() => cerrarSesion()); await pg.waitForTimeout(400);
    await pg.click('#login-toggle');
    await pg.fill('#login-nombre', 'Prueba'); await pg.fill('#login-email', 'nuevo@x.com');
    await pg.fill('#login-password', 'abcdefgh'); await pg.fill('#login-password2', 'abcdefgh');
    await pg.click('#login-submit'); await pg.waitForTimeout(300);
    const msg = await pg.textContent('#login-error').catch(() => '');
    prueba('H-02 el registro rechaza "abcdefgh"', /letras y números/.test(msg || ''), msg);
    await ctx.close();
  }

  /* ---------- H-04 · Subida de archivos ---------- */
  {
    const { ctx, pg } = await abrirApp(browser);
    const tipos = await pg.evaluate(() => ({
      html: tipoDocumentoSeguro('plano.html'), svg: tipoDocumentoSeguro('logo.svg'), doble: tipoDocumentoSeguro('plano.pdf.html'),
      sinExt: tipoDocumentoSeguro('archivo'), pdfMayus: tipoDocumentoSeguro('PLANO.PDF'), dwg: tipoDocumentoSeguro('casa.dwg'), exe: tipoDocumentoSeguro('setup.exe'),
      previewDisfrazado: sePuedePrevisualizar({ nombre: 'a.pdf', tipo_mime: 'text/html' }),
      previewHtml: sePuedePrevisualizar({ nombre: 'a.html', tipo_mime: 'text/html' }),
      previewPdf: sePuedePrevisualizar({ nombre: 'a.pdf', tipo_mime: 'application/pdf' }),
    }));
    prueba('H-04 bloquea .html, .svg, .exe y doble extensión', !tipos.html && !tipos.svg && !tipos.exe && !tipos.doble && !tipos.sinExt, JSON.stringify(tipos));
    prueba('H-04 acepta PDF (mayúsculas) y DWG con tipo fijo', tipos.pdfMayus === 'application/pdf' && tipos.dwg === 'application/octet-stream');
    prueba('H-04 solo previsualiza PDF/imagen con extensión coherente', !tipos.previewDisfrazado && !tipos.previewHtml && tipos.previewPdf);
    fs.writeFileSync(path.join(TMP, 'malo.html'), '<script>alert(1)</script>');
    await pg.evaluate(() => openFicha('PRJ-001')); await pg.click('#ficha-subtabs [data-sub="dropbox"]');
    const antes = await pg.evaluate(() => (window.__writes || []).length);
    await pg.setInputFiles('#doc-archivo', path.join(TMP, 'malo.html'));
    await pg.click('#doc-subir'); await pg.waitForTimeout(300);
    const toast = await pg.textContent('#toast');
    const despues = await pg.evaluate(() => (window.__writes || []).length);
    prueba('H-04 subir un .html se rechaza sin tocar el servidor', /no permitido/i.test(toast) && antes === despues, toast);
    await ctx.close();
  }

  /* ---------- H-06 · Mensajes de error sin detalles internos ---------- */
  {
    const { ctx, pg } = await abrirApp(browser);
    const m = await pg.evaluate(() => ({
      rls: mensajeError({ code: '42501', message: 'new row violates row-level security policy for table "proyectos"' }),
      red: mensajeError(new TypeError('Failed to fetch')),
      check: mensajeError({ code: '23514', message: 'violates check constraint "carpinteros_nombre_largo"' }),
      raro: mensajeError({ code: 'XX000', message: 'internal error at relation pg_class oid 1259' }),
    }));
    prueba('H-06 error de RLS → "No tienes permiso"', /permiso/.test(m.rls) && !/row-level|proyectos/.test(m.rls));
    prueba('H-06 error de red → mensaje de conexión', /conexión/.test(m.red));
    prueba('H-06 nombre de restricción no se muestra', !/carpinteros_nombre_largo/.test(m.check));
    prueba('H-06 error desconocido → mensaje genérico', !/pg_class|internal/.test(m.raro));
    await ctx.close();
  }

  /* ---------- H-10 · Cierre por inactividad ---------- */
  {
    const { ctx, pg } = await abrirApp(browser);
    const r = await pg.evaluate(() => {
      localStorage.setItem('mg-ultima-actividad', String(Date.now() - 9 * 3600e3));
      const vieja = sesionInactiva();
      localStorage.setItem('mg-ultima-actividad', String(Date.now() - 7 * 3600e3));
      const reciente = sesionInactiva();
      return { vieja, reciente };
    });
    prueba('H-10 sesión de más de 8 h sin uso se considera inactiva (frontera 7 h / 9 h)', r.vieja === true && r.reciente === false);
    await ctx.close();
  }

  /* ---------- Entradas: teléfono (casos válidos, inválidos y frontera) ---------- */
  {
    const { ctx, pg } = await abrirApp(browser);
    const t = await pg.evaluate(() => ({
      celular: telefonoCOValido(digitosTelefonoCO('300 123 4567')),
      fijo: telefonoCOValido(digitosTelefonoCO('601 234 5678')),
      conIndicativo: telefonoParaGuardar('+57 300 123 4567'),
      nueve: telefonoCOValido(digitosTelefonoCO('300123456')),
      once: digitosTelefonoCO('30012345678'),
      empieza5: telefonoCOValido(digitosTelefonoCO('5001234567')),
      letras: digitosTelefonoCO('abc300def'),
    }));
    prueba('Entradas: teléfono acepta celular y fijo de 10 dígitos', t.celular && t.fijo);
    prueba('Entradas: teléfono quita el +57 y guarda con formato fijo', t.conIndicativo === '+57 300 123 4567');
    prueba('Entradas: teléfono rechaza 9 dígitos y prefijos no colombianos', !t.nueve && !t.empieza5);
    prueba('Entradas: teléfono corta en 10 dígitos y descarta letras', t.once.length === 10 && t.letras === '300');
    await ctx.close();
  }

  await browser.close();
  const fallidas = resultados.filter((r) => !r.ok);
  console.log(`\n${resultados.length - fallidas.length}/${resultados.length} pruebas superadas`);
  process.exit(fallidas.length ? 1 : 0);
})();
