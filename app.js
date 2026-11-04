/* ==========================================================================
   MODUGAL - espacios renovados · app.js
   --------------------------------------------------------------------------
   Plataforma SaaS B2B de fabricación de cocinas integrales y mobiliario
   de alta gama.

   Módulos:
     1. Estado global + datos mock + persistencia (localStorage)
     2. Stepper de 6 fases (PRODUCTION_PHASES)
     3. Tablero de Producción (KPIs + tarjetas + filtros)
     4. Equipo & Asignaciones
     5. Seguimiento Comercial (Kanban + trimestre)
     6. Estadísticas & Rendimiento
     7. Registro de Pedidos / Compras
     8. Modal Ficha de Proyecto (5 subpestañas)
     9. Asistente IA / Bot de WhatsApp
    10. Inicialización
   ========================================================================== */

'use strict';

/* ==========================================================================
   1. CONSTANTES DE NEGOCIO
   ========================================================================== */

const PRODUCTION_PHASES = ['Recepción', 'Asignación', 'Armado', 'Presentación', 'Embalaje', 'Despacho'];

const EST_PRODUCCION = { EN_PROCESO: 'en_proceso', DETENIDO: 'detenido', COMPLETADO: 'completado' };

const ETAPAS_COMERCIAL = ['Prospectos', 'Cotizaciones', 'Aprobados', 'En Fabricación', 'Instalaciones', 'Garantías'];

const STAGES_STATS = [
  { etapa: 'Diseño', avg: 3.2, badge: 'ÓPTIMO' },
  { etapa: 'Corte', avg: 2.5, badge: 'ÓPTIMO' },
  { etapa: 'Fabricación & Armado', avg: 8.4, badge: 'CUELLO DE BOTELLA' },
  { etapa: 'Instalación', avg: 4.1, badge: 'NORMAL' },
];

const ROLES = ['gerencia', 'arquitecto', 'carpintero'];
const STORAGE_KEY = 'modugal_estado_v1';
const ROL_KEY = 'modugal_rol';

/* ==========================================================================
   2. ESTADO GLOBAL
   ========================================================================== */

const state = {
  proyectos: [],
  comercial: [],
  rol: 'gerencia',
  tab: 'produccion',
  fProduccion: 'todos',
  search: '',
  quarter: 'Q4-2026',
  fichaId: null,
  fichaSub: 'resumen',
};

/* ==========================================================================
   3. DATOS MOCK (4 PROYECTOS + 2 PROSPECTOS COMERCIALES)
   ========================================================================== */

function seed() {
  return {
    proyectos: [
      {
        id: 'PRJ-001', nombre: 'Cocina Integral - Res. Las Palmeras', cliente: 'Res. Las Palmeras',
        direccion: 'Av. Industrial 450, Col. San Rafael', gps: '-34.5500, -58.4400', tipo: 'Cocina Integral',
        presupuesto: 1850000, fechaPrometida: '2026-12-18', estado: 'completado', operario: 'Edwin San Gil',
        fasesCompletadas: 6,
        muebles: [
          { id: 'M-1001-1', nombre: 'Gabinete Base Modular', fase: 6, instalado: true, operario: 'Edwin San Gil' },
          { id: 'M-1001-2', nombre: 'Isla Central', fase: 6, instalado: true, operario: 'Edwin San Gil' },
        ],
        pedidos: [
          { id: 'P-1001-1', categoria: 'Herrajes', producto: 'Cierre Lento', proveedor: 'Herrajes SRL', guia: 'PUR-1101', estado: 'recibido' },
          { id: 'P-1001-2', categoria: 'Vidrios', producto: 'Vidrio 12mm', proveedor: 'Vidrios del Plata', guia: 'PUR-1102', estado: 'recibido' },
        ],
        alertas: [], bloqueos: [],
      },
      {
        id: 'PRJ-002', nombre: 'Cocina Integral - Apto 502 Torre Verde', cliente: 'Apto 502 Torre Verde',
        direccion: 'Av. Energía 1200, Piso 52', gps: '-34.5400, -58.4300', tipo: 'Cocina Integral',
        presupuesto: 1240000, fechaPrometida: '2026-11-28', estado: 'en_proceso', operario: 'María Fernanda López',
        fasesCompletadas: 2,
        muebles: [
          { id: 'M-1002-1', nombre: 'Módulo Isla', fase: 2, instalado: false, operario: 'María Fernanda López' },
          { id: 'M-1002-2', nombre: 'Cajones Modulares', fase: 2, instalado: false, operario: 'María Fernanda López' },
        ],
        pedidos: [
          { id: 'P-1002-1', categoria: 'Madecor', producto: 'Estantería Modular', proveedor: 'Proveedores del Madero', guia: 'PUR-2201', estado: 'recibido' },
        ],
        alertas: [ { id: 'A-1002-1', tipo: 'material', texto: 'Falta herrajes Cierre Lento para módulo Isla' } ],
        bloqueos: [],
      },
      {
        id: 'PRJ-003', nombre: 'Cocina Integral - Clínica Dental Norte', cliente: 'Clínica Dental Norte',
        direccion: 'Calle Quirúrgica 890', gps: '-34.5600, -58.4500', tipo: 'Cocina Integral',
        presupuesto: 2100000, fechaPrometida: '2026-10-30', estado: 'detenido', operario: 'Faber Contreras',
        fasesCompletadas: 3,
        muebles: [
          { id: 'M-1003-1', nombre: 'Cabina Clínica', fase: 3, instalado: false, operario: 'Faber Contreras' },
        ],
        pedidos: [
          { id: 'P-1003-1', categoria: 'Herrajes', producto: 'Bisagras Cierre Lento', proveedor: 'Herrajes SRL', guia: 'PUR-3301', estado: 'pendiente' },
        ],
        alertas: [],
        bloqueos: [ { id: 'B-1003-1', texto: 'Faltan bisagras Cierre Lento', resuelto: false } ],
      },
      {
        id: 'PRJ-004', nombre: 'Cocina Integral - Res. Gómez', cliente: 'Res. Gómez',
        direccion: 'Av. Los Pinos 2100', gps: '-34.5700, -58.4600', tipo: 'Cocina Integral',
        presupuesto: 980000, fechaPrometida: '2026-09-15', estado: 'completado', operario: 'Juan Pablo Ríos',
        fasesCompletadas: 6,
        muebles: [
          { id: 'M-1004-1', nombre: 'Sofá Modular', fase: 6, instalado: true, operario: 'Juan Pablo Ríos' },
        ],
        pedidos: [], alertas: [], bloqueos: [],
      },
    ],
    comercial: [
      { id: 'MG-2001', cliente: 'Ing. Fernández', tipo: 'Prospectos', presupuesto: 2400000, fechaPrometida: '2026-12-20', proyectoId: null },
      { id: 'MG-2002', cliente: 'Familia Muñoz', tipo: 'Cotizaciones', presupuesto: 1750000, fechaPrometida: '2026-11-25', proyectoId: null },
      { id: 'MG-2003', cliente: 'Dra. Suárez', tipo: 'Aprobados', presupuesto: 1500000, fechaPrometida: '2026-11-15', proyectoId: null },
      { id: 'MG-2004', cliente: 'Vecinos del Lago', tipo: 'En Fabricación', presupuesto: 2100000, fechaPrometida: '2027-02-10', proyectoId: 'PRJ-002' },
      { id: 'MG-2005', cliente: 'Comunidad Marina', tipo: 'Instalaciones', presupuesto: 1900000, fechaPrometida: '2026-10-28', proyectoId: null },
      { id: 'MG-2006', cliente: 'Taller de Arte Norte', tipo: 'Garantías', presupuesto: 850000, fechaPrometida: '2026-08-12', proyectoId: null },
    ],
  };
}

function cargarEstado() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.proyectos) && Array.isArray(data.comercial)) {
        return { proyectos: data.proyectos, comercial: data.comercial };
      }
    }
  } catch (e) {
    console.warn('[MODUGAL] Error leyendo localStorage, se usa datos semilla.', e);
  }
  const s = seed();
  return { proyectos: s.proyectos, comercial: s.comercial };
}

function guardarEstado() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ proyectos: state.proyectos, comercial: state.comercial }));
}

function generarId(prefix) {
  const nums = state.proyectos.map((p) => parseInt(String(p.id).replace(/\D/g, ''), 10)).filter((n) => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 1000;
  return `${prefix}-${max + 1}`;
}

/* ==========================================================================
   4. UTILIDADES
   ========================================================================== */

function hoyStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function formatearFecha(fechaStr) {
  if (!fechaStr) return '—';
  const d = new Date(`${fechaStr}T00:00:00`);
  if (isNaN(d.getTime())) return fechaStr;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

function formatearMoneda(monto) {
  return monto.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
}

function esc(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(str ?? '').replace(/[&<>"']/g, (c) => map[c]);
}

function enCuarto(fechaStr, quarter) {
  const m = String(quarter || '').match(/^Q([1-4])-(\d{4})$/i);
  if (!m) return true;
  const yq = parseInt(m[2], 10);
  const q = parseInt(m[1], 10);
  const [y, mesRaw] = String(fechaStr || '').split('-').map(Number);
  const mes = mesRaw ? mesRaw - 1 : 0;
  const inicio = Math.floor((q - 1) * 3);
  const fin = inicio + 2;
  return y === yq && mes >= inicio && mes <= fin;
}

function mismoEtapa(a, b) {
  const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/s$/, '');
  return norm(a) === norm(b);
}

/* ==========================================================================
   5. ASISTENTE IA / BOT DE WHATSAPP
   ========================================================================== */

function pushMensaje(autor, texto) {
  const container = document.getElementById('chat-messages');
  const msg = document.createElement('div');
  msg.className = `chat-msg ${autor === 'user' ? 'chat-msg--user' : 'chat-msg--bot'}`;
  msg.textContent = texto;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function generarRespuestaBot(texto) {
  const q = texto.toLowerCase();

  if (/hoy|entrega|entregar|despacho|despachar|entregas/i.test(q)) {
    const hoy = hoyStr();
    const entregasHoy = state.proyectos.filter((p) => p.fechaPrometida === hoy && p.estado !== EST_PRODUCCION.COMPLETADO);
    if (entregasHoy.length === 0) return '📭 No hay entregas programadas para hoy. ¡Buen ritmo! 🎉';
    const lines = entregasHoy.map((p) => `• ${p.nombre} · ${p.cliente} · ${p.id}`);
    return `📦 Proyectos con entregas programadas para hoy:\n${lines.join('\n')}\n\n¿Necesitas despacho o instalación?`;
  }

  if (/material|falta|faltan|herraje|madecor|vidrio|insumo/i.test(q)) {
    const conMateriales = state.proyectos.filter((p) => (p.alertas || []).some((a) => a.tipo === 'material' && !a.resuelto));
    if (conMateriales.length === 0) return '✅ ¡Sin faltantes de materiales! Todo en orden. 🎉';
    const lines = conMateriales.map((p) => `• ${p.nombre} · Falta: ${p.alertas.filter((a) => a.tipo === 'material' && !a.resuelto).map((a) => a.texto).join(', ')}`);
    return `⚠️ Proyectos con materiales faltantes:\n${lines.join('\n')}`;
  }

  if (/detenido|detenidos|paralizo|paralizada/i.test(q)) {
    const detenidos = state.proyectos.filter((p) => p.estado === EST_PRODUCCION.DETENIDO);
    if (detenidos.length === 0) return '✅ Sin proyectos detenidos actualmente.';
    const lines = detenidos.map((p) => `• ${p.nombre} · ${p.bloqueos.filter((b) => !b.resuelto).map((b) => b.texto).join(', ') || 'Bloqueo activo'}`);
    return `⚠️ Proyectos detenidos:\n${lines.join('\n')}`;
  }

  const tokens = texto.toLowerCase().split(/[^a-z0-9]+/).map((t) => t.trim()).filter((t) => t.length > 1);
  const term = tokens.join(' ').trim();
  if (term) {
    const resultados = state.proyectos.filter((p) => `${p.id} ${p.cliente} ${p.nombre}`.toLowerCase().includes(term.toLowerCase()));
    if (resultados.length > 0) {
      const lines = resultados.map((p) => `• ${p.nombre} · ${p.cliente} · Estado: ${p.estado}`);
      return `🔎 Proyectos encontrados para "${term}":\n${lines.join('\n')}`;
    }
    return `🔍 No encontré proyectos para "${term}".`;
  }

  return '🤖 Soy el Asistente IA de MODUGAL. Puedo consultar entregas de hoy, proyectos con materiales faltantes o clientes. Prueba: "¿Qué entregas hay para hoy?"';
}

function enviarMensaje(texto) {
  const input = document.getElementById('chat-input');
  const msg = String(texto ?? input.value ?? '').trim();
  if (!msg) return;
  pushMensaje('user', msg);
  input.value = '';
  setTimeout(() => pushMensaje('bot', generarRespuestaBot(msg)), 450);
}

function abrirChat() {
  const panel = document.getElementById('chat-panel');
  panel.classList.add('open');
  if (document.querySelectorAll('#chat-messages .chat-msg').length === 0) {
    pushMensaje('bot', '¡Hola! 👋 Soy el Asistente IA de MODUGAL.\nPuedo consultar entregas de hoy, proyectos con materiales faltantes o clientes. Prueba: "¿Qué entregas hay para hoy?"');
  }
}

function cerrarChat() {
  document.getElementById('chat-panel').classList.remove('open');
}

/* ==========================================================================
   6. RENDER · TABLERO DE PRODUCCIÓN
   ========================================================================== */

function stepperHTML(completadas, estado) {
  let html = '<div class="stepper">';
  PRODUCTION_PHASES.forEach((f, i) => {
    let cls = 'todo';
    if (i < completadas) cls = 'done';
    else if (i === completadas) cls = estado === 'detenido' ? 'blocked current' : 'current';
    const icon = i < completadas ? '<i class="fas fa-check" aria-hidden="true"></i>' : i + 1;
    html += `<div class="step ${cls}"><div class="dot">${icon}</div><p class="label">${f}</p></div>`;
  });
  return html + '</div>';
}

function crearTarjetaProduccion(p) {
  const alertas = (p.alertas || []).filter((a) => !a.resuelto);
  const esDetenido = p.estado === EST_PRODUCCION.DETENIDO;

  const statusLabel = p.estado === 'en_proceso' ? 'EN PROCESO' : p.estado === 'detenido' ? 'DETENIDO' : 'ENTREGADO';
  const badgeCls = p.estado === 'en_proceso' ? 'badge-en_proceso' : p.estado === 'detenido' ? 'badge-detencion' : 'badge-completado';

  const alertasHTML = esDetenido
    ? `<div class="alerta alerta-bloqueo"><i class="fas fa-triangle-exclamation mr-1" aria-hidden="true"></i>Faltan materiales · Proyecto detenido - requiere revisión</div>`
    : (alertas.length
        ? alertas.map((a) => `<div class="alerta ${a.tipo === 'material' ? 'alerta-material' : 'alerta-bloqueo'}"><i class="fas fa-triangle-exclamation mr-1" aria-hidden="true"></i>${a.texto}</div>`).join('')
        : `<div class="alerta" style="background:#f8fafc;border:1px solid #e2e8f0;color:#64748b"><i class="fas fa-circle-check mr-1" aria-hidden="true" style="color:var(--success)"></i>Sin alertas activas</div>`);

  const card = document.createElement('div');
  card.className = 'proyecto-card bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden';
  card.innerHTML = `
    <div class="render-hd">
      <div class="flex items-center justify-between">
        <span class="badge ${badgeCls}">${statusLabel}</span>
        <span class="badge bg-white text-slate-900">${p.id}</span>
      </div>
    </div>
    <div class="p-3">
      <p class="font-extrabold text-slate-900 text-sm">${p.id} · ${p.nombre}</p>
      <p class="text-xs text-slate-500 mt-0.5">Cliente: ${p.cliente}</p>
      <p class="text-xs text-slate-500 mt-0.5">Ubicación: ${p.direccion}</p>
      <p class="text-xs text-slate-500 mt-0.5">Trazador Responsable: ${p.operario}</p>
      <p class="text-xs text-slate-500 mt-0.5">Entrega Estimada: ${formatearFecha(p.fechaPrometida)}</p>
      <div class="mt-3">${stepperHTML(p.fasesCompletadas, p.estado)}</div>
      <div class="mt-2 space-y-2">${alertasHTML}</div>
      <button type="button" class="btn btn-dark w-full mt-3 py-2 text-sm" data-f-id="${p.id}">
        <i class="fas fa-folder-open mr-1" aria-hidden="true"></i>Ficha del Proyecto >
      </button>
    </div>
  `;
  return card;
}

function filtrarProyectos() {
  let lista = state.proyectos;
  if (state.fProduccion !== 'todos') lista = lista.filter((p) => p.estado === state.fProduccion);
  if (state.search) {
    const q = state.search.toLowerCase();
    lista = lista.filter((p) => `${p.id} ${p.cliente} ${p.nombre} ${p.tipo}`.toLowerCase().includes(q));
  }
  return lista;
}

function renderProduccion() {
  const grid = document.getElementById('proyectos-grid');
  const lista = filtrarProyectos();
  grid.innerHTML = '';

  if (lista.length === 0) {
    grid.innerHTML = '<div class="bg-white border border-slate-200 rounded-xl shadow-sm p-6 text-center text-slate-500 text-sm">No hay proyectos para el filtro seleccionado.</div>';
    return;
  }

  lista.forEach((p) => grid.appendChild(crearTarjetaProduccion(p)));
}

function renderKpis() {
  // Valores del panel de KPIs (escenario de fábrica)
  const kpiActivos = document.getElementById('kpi-activos');
  const kpiDetenidos = document.getElementById('kpi-detenidos');
  const kpiBodega = document.getElementById('kpi-bodega');
  const kpiOperarios = document.getElementById('kpi-operarios');

  kpiActivos.textContent = '6';
  kpiDetenidos.textContent = '1';
  kpiBodega.textContent = '2';
  kpiOperarios.textContent = '10';

  // Tarjeta Detenidos: borde/texto rojo con icono de alerta
  const cardDetenidos = kpiDetenidos.closest('.kpi-card');
  cardDetenidos.classList.toggle('kpi-alert', true);

  // Tarjeta Operarios: en verde
  const cardOperarios = kpiOperarios.closest('.kpi-card');
  cardOperarios.classList.toggle('kpi-success', true);
}

/* ==========================================================================
   7. RENDER · EQUIPO & ASIGNACIONES
   ========================================================================== */

function renderEquipo() {
  const contenedor = document.getElementById('equipo-grid');
  contenedor.innerHTML = '';

  const porOperario = new Map();
  state.proyectos.forEach((p) => {
    (p.muebles || []).forEach((m) => {
      if (!m.operario) return;
      if (!porOperario.has(m.operario)) porOperario.set(m.operario, []);
      porOperario.get(m.operario).push({ ...m, proyectoNombre: p.nombre });
    });
  });

  if (porOperario.size === 0) {
    contenedor.innerHTML = '<div class="bg-white border border-slate-200 rounded-xl shadow-sm p-6 text-center text-slate-500 text-sm">Sin asignaciones de operarios.</div>';
  }

  porOperario.forEach((muebles, operario) => {
    const card = document.createElement('div');
    card.className = 'bg-white border border-slate-200 rounded-xl shadow-sm p-4';
    let itemsHTML = '';
    muebles.forEach((m) => {
      const stepsHTML = PRODUCTION_PHASES.map((f, i) => {
        const cls = i < m.fase ? 'done' : i === m.fase ? 'current' : 'todo';
        const icon = i < m.fase ? '<i class="fas fa-check" aria-hidden="true"></i>' : i + 1;
        return `<div class="step ${cls}"><div class="dot">${icon}</div><p class="label">${f}</p></div>`;
      }).join('');
      itemsHTML += `
        <div class="border border-slate-200 rounded-lg p-3 mb-2 last:mb-0">
          <p class="text-sm font-bold text-slate-900">${m.nombre} <span class="text-xs text-slate-500">· ${m.proyectoNombre}</span></p>
          <div class="stepper mt-2" style="transform: scale(0.85); transform-origin: left top;">${stepsHTML}</div>
        </div>`;
    });
    card.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <p class="font-extrabold text-slate-900">${operario}</p>
        <span class="badge badge-en_proceso">OPERARIO DE PLANTA · ${muebles.length} ${muebles.length === 1 ? 'tarea' : 'tareas'}</span>
      </div>
      ${itemsHTML}
    `;
    contenedor.appendChild(card);
  });
}

/* ==========================================================================
   8. RENDER · SEGUIMIENTO COMERCIAL (KANBAN)
   ========================================================================== */

function renderComercial() {
  const board = document.getElementById('comercial-board');
  board.innerHTML = '';
  const items = state.comercial.filter((i) => enCuarto(i.fechaPrometida, state.quarter));

  ETAPAS_COMERCIAL.forEach((etapa) => {
    const col = document.createElement('div');
    col.className = 'kanban-col bg-white border border-slate-200 rounded-xl shadow-sm';
    const colItems = items.filter((i) => i.tipo === etapa);
    col.innerHTML = `<div class="kanban-col-titulo"><span>${etapa}</span><span>${colItems.length}</span></div>`;
    colItems.forEach((i) => {
      const card = document.createElement('div');
      card.className = 'kanban-card-comercial';
      card.innerHTML = `
        <p class="font-extrabold text-slate-900 text-sm">${i.id} · ${i.cliente}</p>
        <p class="text-xs text-slate-500 mt-1">Etapa: ${i.tipo}</p>
        <p class="text-sm font-bold text-emerald-600 mt-1">$${i.presupuesto.toLocaleString('en-US')}</p>
        <p class="text-xs text-slate-500 mt-1">Fecha prometida: ${formatearFecha(i.fechaPrometida)}</p>
        <span class="badge ${etapa === 'Garantías' ? 'badge-completado' : etapa === 'En Fabricación' ? 'badge-en_proceso' : 'badge-normal'} mt-2 inline-flex">${etapa}</span>
      `;
      col.appendChild(card);
    });
    board.appendChild(col);
  });
}

/* ==========================================================================
   9. RENDER · ESTADÍSTICAS & RENDIMIENTO
   ========================================================================== */

function renderStats() {
  const contenedor = document.getElementById('stats-view');
  const bottleneck = STAGES_STATS.reduce((a, b) => (b.avg > a.avg ? b : a), STAGES_STATS[0]);
  let html = '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">';
  STAGES_STATS.forEach((s) => {
    const isBottleneck = s.etapa === bottleneck.etapa;
    html += `
      <div class="bg-white border border-slate-200 rounded-xl shadow-sm p-4 ${isBottleneck ? 'border-red-300 bg-red-50' : ''}">
        <p class="kpi-label">${s.etapa}</p>
        <p class="kpi-value">${s.avg} días</p>
        <p class="text-xs text-slate-500 mt-1">Promedio de producción</p>
        <span class="badge mt-2 ${s.badge === 'CUELLO DE BOTELLA' ? 'badge-cuello' : s.badge === 'ÓPTIMO' ? 'badge-completado' : 'badge-normal'} inline-flex">${s.badge}</span>
      </div>`;
  });
  html += '</div>';
  html += `<p class="mt-3 text-sm text-slate-500">Cuello de botella detectado: <span class="font-extrabold" style="color:var(--brand)">${bottleneck.etapa}</span> con promedio de ${bottleneck.avg} días.</p>`;
  contenedor.innerHTML = html;
}

/* ==========================================================================
   10. RENDER · REGISTRO DE PEDIDOS / COMPRAS
   ========================================================================== */

function renderPedidos() {
  const select = document.getElementById('pedido-proyecto');
  select.innerHTML = '<option value="">Seleccionar proyecto...</option>';
  state.proyectos.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.id} · ${p.nombre}`;
    select.appendChild(opt);
  });
}

function onPedidoGuardar(e) {
  e.preventDefault();
  const proyectoId = document.getElementById('pedido-proyecto').value;
  const categoria = document.getElementById('pedido-categoria').value;
  const producto = document.getElementById('pedido-producto').value.trim();
  const proveedor = document.getElementById('pedido-proveedor').value.trim();
  const guia = document.getElementById('pedido-guia').value.trim();
  const estado = document.getElementById('pedido-estado').value;

  if (!proyectoId || !producto) return;

  const p = state.proyectos.find((x) => x.id === proyectoId);
  p.pedidos.push({ id: generarId('P'), categoria, producto, proveedor, guia, estado });
  guardarEstado();
  document.getElementById('pedido-form').reset();
  renderPedidos();
}

/* ==========================================================================
   11. MODAL · FICHA DE PROYECTO (5 SUBPESTAÑAS)
   ========================================================================== */

function openFicha(id) {
  state.fichaId = id;
  const p = state.proyectos.find((x) => x.id === id);
  if (!p) return;

  document.getElementById('ficha-titulo').textContent = `Ficha · ${p.id}`;
  document.getElementById('ficha-cliente').textContent = p.cliente;
  document.getElementById('ficha-direccion').textContent = p.direccion;
  document.getElementById('ficha-gps').textContent = p.gps;
  document.getElementById('ficha-fecha-prom').textContent = formatearFecha(p.fechaPrometida);
  document.getElementById('ficha-presupuesto').textContent = p.presupuesto.toLocaleString('en-US');

  const mueblesDiv = document.getElementById('ficha-muebles-list');
  mueblesDiv.innerHTML = (p.muebles || []).map((m) => {
    const stepsHTML = PRODUCTION_PHASES.map((f, i) => {
      const cls = i < m.fase ? 'done' : i === m.fase ? 'current' : 'todo';
      const icon = i < m.fase ? '<i class="fas fa-check" aria-hidden="true"></i>' : i + 1;
      return `<div class="step ${cls}"><div class="dot">${icon}</div><p class="label">${f}</p></div>`;
    }).join('');
    return `
      <div class="border border-slate-200 rounded-lg p-3">
        <p class="text-sm font-bold text-slate-900">${m.nombre} <span class="text-xs text-slate-500">· ${m.id}</span></p>
        <div class="stepper mt-2" style="transform: scale(0.85); transform-origin: left top;">${stepsHTML}</div>
      </div>`;
  }).join('');

  const tbody = document.getElementById('ficha-pedidos-tbody');
  tbody.innerHTML = (p.pedidos || []).map((od) => `
    <tr>
      <td class="p-2 border-b border-slate-200">${od.categoria}</td>
      <td class="p-2 border-b border-slate-200">${od.producto}</td>
      <td class="p-2 border-b border-slate-200">${od.proveedor}</td>
      <td class="p-2 border-b border-slate-200">${od.guia}</td>
      <td class="p-2 border-b border-slate-200"><span class="badge badge-en_proceso">${od.estado}</span></td>
    </tr>
  `).join('');

  const bloqueosDiv = document.getElementById('ficha-bloqueos-list');
  bloqueosDiv.innerHTML = (p.bloqueos || []).length === 0
    ? '<p class="text-sm text-slate-500">Sin bloqueos reportados.</p>'
    : (p.bloqueos || []).map((b) => `
      <div class="flex items-center justify-between gap-2 border border-slate-200 rounded-lg p-3 mb-2">
        <p class="text-sm font-semibold text-slate-900">${b.texto}</p>
        ${b.resuelto
          ? '<span class="badge badge-completado">Resuelto</span>'
          : `<button type="button" class="btn btn-ghost py-1.5 text-xs" data-resolver="${b.id}">Marcar Resuelto</button>`}
      </div>`).join('');

  const esGerencia = state.rol === 'gerencia';
  const privado = document.getElementById('dropbox-privado');
  document.getElementById('dropbox-privado-lock').innerHTML = esGerencia
    ? '<button type="button" class="mt-2 w-full py-2 rounded-lg bg-red-600 text-white text-sm font-bold"><i class="fas fa-lock-open mr-2" aria-hidden="true"></i> Acceder a Carpeta Privada</button>'
    : '<button type="button" class="mt-2 w-full py-2 rounded-lg bg-slate-100 text-slate-400 text-sm font-bold cursor-not-allowed"><i class="fas fa-lock mr-2" aria-hidden="true"></i> BLOQUEADA · Requiere rol Gerencia</button>';
  privado.classList.toggle('opacity-60', !esGerencia);

  document.getElementById('modal-ficha').classList.remove('is-hidden');
  document.getElementById('ficha-subtabs').querySelectorAll('[data-sub]').forEach((b) => {
    b.classList.toggle('active', b.dataset.sub === state.fichaSub);
  });
  document.querySelectorAll('#ficha-resumen, #ficha-muebles, #ficha-pedidos, #ficha-bloqueos, #ficha-archivos').forEach((el) => {
    el.classList.toggle('is-hidden', el.id !== `ficha-${state.fichaSub}`);
  });
}

function closeFicha() {
  document.getElementById('modal-ficha').classList.add('is-hidden');
  state.fichaId = null;
}

function bindFichaEvents() {
  document.getElementById('ficha-close').addEventListener('click', closeFicha);
  document.getElementById('ficha-subtabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sub]');
    if (!btn) return;
    state.fichaSub = btn.dataset.sub;
    document.getElementById('ficha-subtabs').querySelectorAll('[data-sub]').forEach((b) => b.classList.toggle('active', b.dataset.sub === state.fichaSub));
    document.querySelectorAll('#ficha-resumen, #ficha-muebles, #ficha-pedidos, #ficha-bloqueos, #ficha-archivos').forEach((el) => {
      el.classList.toggle('is-hidden', el.id !== `ficha-${state.fichaSub}`);
    });
  });
  document.addEventListener('click', (e) => {
    const resolver = e.target.closest('[data-resolver]');
    if (resolver) {
      const id = resolver.dataset.resolver;
      const p = state.proyectos.find((x) => x.id === state.fichaId);
      const b = p?.bloqueos?.find((x) => x.id === id);
      if (b) b.resuelto = true;
      guardarEstado();
      if (state.fichaId) openFicha(state.fichaId);
      return;
    }
    const fId = e.target.closest('[data-f-id]');
    if (fId) openFicha(fId.dataset.fId);
  });
}

/* ==========================================================================
   12. NAVEGACIÓN ENTRE MÓDULOS
   ========================================================================== */

function switchTab(tab) {
  state.tab = tab;
  document.querySelectorAll('#mg-tabs [data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach((el) => {
    el.classList.toggle('is-hidden', el.id !== `tab-${tab}`);
  });

  if (tab === 'produccion') { renderKpis(); renderProduccion(); }
  if (tab === 'equipo') renderEquipo();
  if (tab === 'comercial') renderComercial();
  if (tab === 'stats') renderStats();
  if (tab === 'pedidos') renderPedidos();
}

/* ==========================================================================
   13. EVENTOS · INICIALIZACIÓN
   ========================================================================== */

function init() {
  const cargado = cargarEstado();
  state.proyectos = cargado.proyectos;
  state.comercial = cargado.comercial;
  state.rol = localStorage.getItem(ROL_KEY) || 'gerencia';

  renderKpis();
  renderProduccion();
  switchTab('produccion');

  // Buscador global (módulo Producción)
  document.getElementById('mg-search-input').addEventListener('input', (e) => {
    state.search = e.target.value.trim().toLowerCase();
    renderProduccion();
  });

  // Selector de rol
  document.getElementById('mg-role-selector').addEventListener('click', (e) => {
    const btn = e.target.closest('.mg-role-btn');
    if (!btn) return;
    state.rol = btn.dataset.rol;
    localStorage.setItem(ROL_KEY, state.rol);
    document.querySelectorAll('#mg-role-selector .mg-role-btn').forEach((b) => b.classList.toggle('active', b.dataset.rol === state.rol));
  });

  // Botón Nuevo Pedido
  document.getElementById('btn-nuevo-pedido').addEventListener('click', () => switchTab('pedidos'));

  // Tabs
  document.getElementById('mg-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    switchTab(btn.dataset.tab);
  });

  // Filtros producción
  document.getElementById('filtros-produccion').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filtro]');
    if (!btn) return;
    state.fProduccion = btn.dataset.filtro;
    document.querySelectorAll('#filtros-produccion [data-filtro]').forEach((b) => b.classList.toggle('active', b.dataset.filtro === state.fProduccion));
    renderProduccion();
  });

  // Tablero comercial
  document.getElementById('comercial-quarter').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-quarter]');
    if (!btn) return;
    state.quarter = btn.dataset.quarter;
    document.querySelectorAll('#comercial-quarter [data-quarter]').forEach((b) => b.classList.toggle('active', b.dataset.quarter === state.quarter));
    renderComercial();
  });

  // Formulario pedidos
  document.getElementById('pedido-form').addEventListener('submit', onPedidoGuardar);

  // Asistente IA
  document.getElementById('chat-fab').addEventListener('click', abrirChat);
  document.getElementById('chat-close').addEventListener('click', cerrarChat);
  document.getElementById('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    enviarMensaje(document.getElementById('chat-input').value);
  });
  document.getElementById('chat-quick').addEventListener('click', (e) => {
    const chip = e.target.closest('.chat-chip');
    if (chip) enviarMensaje(chip.dataset.q);
  });

  bindFichaEvents();
}

document.addEventListener('DOMContentLoaded', init);
