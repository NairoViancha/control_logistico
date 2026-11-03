/* ==========================================================================
   EYC Muebles · Control Logístico — app.js
   --------------------------------------------------------------------------
   Estructura de la lógica:
     1. Constantes, estado global y datos semilla
     2. Utilidades de fechas / urgencia / formato
     3. Persistencia en localStorage + indicador de sincronización
     4. Renderizado: Métricas, Tablero Kanban, Lista
     5. Modal: crear / editar pendientes
     6. Asistente IA / WhatsApp (widget flotante)
     7. Inicialización (DOMContentLoaded)
   ========================================================================== */

'use strict';

/* ==========================================================================
   1. CONSTANTES Y ESTADO GLOBAL
   ========================================================================== */

const ESTADOS = {
  PEDIDO: 'pedido',
  FABRICACION: 'fabricacion',
  LISTO: 'listo',
  ENTREGADO: 'entregado',
};

/* Texto legible por columna / badge */
const ESTADO_LABELS = {
  [ESTADOS.PEDIDO]: 'Por Iniciar / Pedido',
  [ESTADOS.FABRICACION]: 'En Fabricación',
  [ESTADOS.LISTO]: 'Listo para Despacho',
  [ESTADOS.ENTREGADO]: 'Entregado / Instalado',
};

/* Clases CSS por estado (borde del card y badge) */
const ESTADO_CARD_CLASS = {
  [ESTADOS.PEDIDO]: 'kanban-card--pedido',
  [ESTADOS.FABRICACION]: 'kanban-card--fabricacion',
  [ESTADOS.LISTO]: 'kanban-card--listo',
  [ESTADOS.ENTREGADO]: 'kanban-card--entregado',
};

const ESTADO_BADGE_CLASS = {
  [ESTADOS.PEDIDO]: 'badge--pedido',
  [ESTADOS.FABRICACION]: 'badge--fabricacion',
  [ESTADOS.LISTO]: 'badge--listo',
  [ESTADOS.ENTREGADO]: 'badge--entregado',
};

/* Orden de columnas del Kanban */
const ESTADO_ORDER = [
  ESTADOS.PEDIDO,
  ESTADOS.FABRICACION,
  ESTADOS.LISTO,
  ESTADOS.ENTREGADO,
];

const STORAGE_KEY = 'eyc_pendientes_v1';
const ROL_KEY = 'eyc_rol';

const state = {
  pendientes: [],          // Array de pedidos activos
  quickFilter: 'todos',    // 'todos' | 'vencidos' | 'hoy' | 'semana'
  search: '',               // Texto de búsqueda en vivo
  view: 'board',            // 'board' | 'list'
  sort: { campo: 'fecha', dir: 'asc' }, // Orden de la lista
  rol: 'operador',
};

/* ==========================================================================
   2. UTILIDADES DE FECHAS Y URGENCIA
   ========================================================================== */

/** Convierte un Date a formato local YYYY-MM-DD (para input[type=date]). */
function fechaLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Fecha de hoy en formato YYYY-MM-DD. */
function hoyStr() {
  return fechaLocal(new Date());
}

/** Suma (positivo o negativo) de días a la fecha de hoy. */
function sumarDias(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return fechaLocal(d);
}

/** Diferencia en días (positivo = futuro, negativo = pasado) respecto a hoy. */
function diasHasta(fechaStr) {
  const a = new Date(`${fechaStr}T00:00:00`);
  const b = new Date(`${hoyStr()}T00:00:00`);
  return Math.round((a - b) / 86400000);
}

/** ¿La fecha prometida ya pasó? (solo aplica a pendientes no entregados). */
function esVencido(p) {
  return p.estado !== ESTADOS.ENTREGADO && p.fecha < hoyStr();
}

/** ¿La fecha prometida está dentro de los próximos 48 horas? */
function esProximo(p) {
  const d = diasHasta(p.fecha);
  return p.estado !== ESTADOS.ENTREGADO && !esVencido(p) && d >= 0 && d <= 2;
}

/** Formato corto para mostrar la fecha: "5 nov". */
function formatearFecha(fechaStr) {
  if (!fechaStr) return '—';
  const d = new Date(`${fechaStr}T00:00:00`);
  if (isNaN(d.getTime())) return fechaStr;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

/** Escapa texto antes de insertarlo en HTML. */
function esc(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(str ?? '').replace(/[&<>"']/g, (c) => map[c]);
}

/* ==========================================================================
   3. DATOS SEMILLA (MOCK REALISTA DE CARPINTERÍA MODULAR)
   ========================================================================== */

function seed() {
  const hoy = hoyStr();
  return [
    {
      id: 'EYC-1042',
      cliente: 'María Pérez',
      mueble: 'Juego de Cocina Integral',
      fecha: sumarDias(3),
      estado: ESTADOS.FABRICACION,
      responsable: 'Operador',
      notas: 'Medidas especiales: separadores ajustables. Entregar en cocina.',
    },
    {
      id: 'EYC-1038',
      cliente: 'Res. Las Palmeras',
      mueble: 'Clóset Máster',
      fecha: sumarDias(5),
      estado: ESTADOS.PEDIDO,
      responsable: 'Operador',
      notas: 'Medidas estándar 2.40 m.',
    },
    {
      id: 'EYC-1044',
      cliente: 'Apto 502',
      mueble: 'Centro de Entretenimiento',
      fecha: hoy,
      estado: ESTADOS.LISTO,
      responsable: 'Taller',
      notas: 'Requiere verificación eléctrica antes del despacho.',
    },
    {
      id: 'EYC-1040',
      cliente: 'Jorge Ramírez',
      mueble: 'Mueble TV',
      fecha: hoy,
      estado: ESTADOS.ENTREGADO,
      responsable: 'Instalador',
      notas: 'Instalado y probado.',
    },
    {
      id: 'EYC-1046',
      cliente: 'Familia Gómez',
      mueble: 'Mesa de Centro',
      fecha: sumarDias(1),
      estado: ESTADOS.LISTO,
      responsable: 'Taller',
      notas: '',
    },
    {
      id: 'EYC-1035',
      cliente: 'Clínica Dental Norte',
      mueble: 'Cabina de Consulta',
      fecha: sumarDias(-4),
      estado: ESTADOS.FABRICACION,
      responsable: 'Operador',
      notas: 'Prioridad: obra en curso.',
    },
    {
      id: 'EYC-1048',
      cliente: 'Roberto Silva',
      mueble: 'Sofá Modular',
      fecha: sumarDias(7),
      estado: ESTADOS.PEDIDO,
      responsable: 'Operador',
      notas: '',
    },
    {
      id: 'EYC-1029',
      cliente: 'Vecina Ana',
      mueble: 'Ropero',
      fecha: sumarDias(-2),
      estado: ESTADOS.ENTREGADO,
      responsable: 'Instalador',
      notas: 'Colgado correctamente.',
    },
  ];
}

/* ==========================================================================
   4. PERSISTENCIA (LOCALSTORAGE) + INDICADOR DE SINCRONIZACIÓN
   ========================================================================== */

function cargarPendientes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (Array.isArray(data)) return data;
    }
  } catch (e) {
    console.warn('[EYC] No se pudo leer localStorage, se usan datos semilla.', e);
  }
  return seed();
}

function guardarPendientes() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.pendientes));
}

/** Ciclo de sincronización: "Sincronizando…" -> "Sincronizado en tiempo real". */
function sincronizarAhora() {
  const dot = document.getElementById('sync-dot');
  const status = document.getElementById('sync-status');
  const indicator = document.getElementById('sync-indicator');

  status.textContent = 'Sincronizando…';
  dot.classList.add('sync-dot--busy');
  indicator.classList.add('sync--busy');

  setTimeout(() => {
    status.textContent = 'Sincronizado en tiempo real';
    dot.classList.remove('sync-dot--busy');
    indicator.classList.remove('sync--busy');
  }, 900);
}

/* ==========================================================================
   5. RENDER · MÉTRICAS
   ========================================================================== */

function renderMetricas() {
  const hoy = hoyStr();

  // Entregas programadas para hoy (no entregadas aún)
  const entregasHoy = state.pendientes.filter(
    (p) => p.fecha === hoy && p.estado !== ESTADOS.ENTREGADO
  );

  // Pendientes vencidos (fecha pasada y aún no entregados)
  const vencidos = state.pendientes.filter(esVencido);

  // Total en producción (en taller)
  const enProducion = state.pendientes.filter((p) => p.estado === ESTADOS.FABRICACION);

  // ---- Tarjeta 1: Entregas para hoy (alerta visual al haber alguna) ----
  const valorHoy = document.getElementById('metric-hoy-value');
  const hintHoy = document.getElementById('metric-hoy-hint');
  valorHoy.textContent = String(entregasHoy.length);
  hintHoy.textContent = entregasHoy.length
    ? `${entregasHoy.length} entrega(s) programada(s) hoy`
    : 'Sin entregas programadas';
  document.getElementById('metric-hoy').classList.toggle('metric-card--accent', entregasHoy.length > 0);

  // ---- Tarjeta 2: Pendientes vencidos (alerta roja) ----
  const valorVencidos = document.getElementById('metric-vencidos-value');
  const hintVencidos = document.getElementById('metric-vencidos-hint');
  valorVencidos.textContent = String(vencidos.length);
  hintVencidos.textContent = vencidos.length
    ? `${vencidos.length} pedido(s) vencido(s) · acción requerida`
    : 'Sin pendientes vencidos';
  document.getElementById('metric-vencidos').classList.toggle('metric-card--alert', vencidos.length > 0);

  // ---- Tarjeta 3: Total en producción ----
  document.getElementById('metric-produccion-value').textContent = String(enProducion.length);
  document.getElementById('metric-produccion-hint').textContent = 'Obras en taller';
}

/* ==========================================================================
   6. RENDER · TABLERO KANBAN
   ========================================================================== */

/** Crea el elemento DOM de una tarjeta Kanban a partir de un pedido. */
function crearTarjeta(p) {
  const vencido = esVencido(p);
  const proximo = !vencido && esProximo(p);

  const card = document.createElement('article');
  card.className = `kanban-card ${ESTADO_CARD_CLASS[p.estado]}`;
  if (vencido) card.classList.add('kanban-card--vencido');
  else if (proximo) card.classList.add('kanban-card--proximo');
  card.setAttribute('draggable', 'true');
  card.dataset.id = p.id;

  card.innerHTML = `
    <div class="kanban-card__top">
      <p class="kanban-card__mueble">${esc(p.mueble)}</p>
      <span class="badge ${ESTADO_BADGE_CLASS[p.estado]}">${esc(ESTADO_LABELS[p.estado])}</span>
    </div>
    <p class="kanban-card__cliente"><i class="fas fa-user"></i>${esc(p.cliente)}</p>
    <div class="kanban-card__footer">
      <span class="kanban-card__fecha ${vencido ? 'kanban-card__fecha--vencida' : ''} ${proximo ? 'kanban-card__fecha--proxima' : ''}">
        <i class="far fa-calendar"></i>${esc(formatearFecha(p.fecha))}
      </span>
      <span class="kanban-card__id">${esc(p.id)}</span>
    </div>
  `;

  // Drag & Drop (de escritorio) + toque / click para editar (móvil)
  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/estado', p.estado);
    e.dataTransfer.setData('text/plain', p.id);
    e.dataTransfer.effectAllowed = 'move';
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));
  card.addEventListener('click', () => abrirModalPorId(p.id));

  return card;
}

/** Renderiza las 4 columnas del Kanban con sus tarjetas filtradas. */
function renderBoard() {
  const board = document.getElementById('board');
  board.innerHTML = '';

  ESTADO_ORDER.forEach((estado) => {
    const column = document.createElement('section');
    column.className = 'board-column';
    column.dataset.estado = estado;

    const count = state.pendientes.filter((p) => p.estado === estado).length;

    column.innerHTML = `
      <div class="board-column__header">
        <h3 class="board-column__title">${esc(ESTADO_LABELS[estado])}</h3>
        <span class="board-column__count">${count}</span>
      </div>
      <div class="board-cards" data-col-state="${estado}"></div>
    `;

    const cardsEl = column.querySelector('.board-cards');
    const visibles = state.pendientes
      .filter((p) => p.estado === estado)
      .filter((p) => cumpleFiltro(p))
      .filter((p) => cumpleBusqueda(p))
      .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));

    if (visibles.length === 0) {
      cardsEl.innerHTML = '<div class="board-empty">Sin pendientes</div>';
    } else {
      visibles.forEach((p) => cardsEl.appendChild(crearTarjeta(p)));
    }

    // Drag & Drop entre columnas
    column.addEventListener('dragover', (e) => {
      e.preventDefault();
      column.classList.add('drag-over');
    });
    column.addEventListener('dragleave', () => column.classList.remove('drag-over'));
    column.addEventListener('drop', (e) => {
      e.preventDefault();
      column.classList.remove('drag-over');
      const destino = column.dataset.estado;
      const origen = e.dataTransfer.getData('text/estado');
      const id = e.dataTransfer.getData('text/plain');
      if (!id || !origen || origen === destino) return;

      const p = state.pendientes.find((item) => item.id === id);
      if (p) {
        p.estado = destino;
        guardarPendientes();
        renderTodo();
        sincronizarAhora();
      }
    });

    board.appendChild(column);
  });
}

/* ==========================================================================
   7. RENDER · LISTA / TABLA EJECUTIVA
   ========================================================================== */

/** Crea una fila <tr> de la tabla ejecutiva. */
function crearFila(p) {
  const tr = document.createElement('tr');
  if (esVencido(p)) tr.classList.add('row-vencida');

  const tdId = document.createElement('td');
  tdId.className = 'td-id';
  tdId.textContent = p.id;

  const tdCliente = document.createElement('td');
  tdCliente.className = 'td-strong';
  tdCliente.textContent = p.cliente;

  const tdMueble = document.createElement('td');
  tdMueble.className = 'td-mueble';
  tdMueble.textContent = p.mueble;

  const tdFecha = document.createElement('td');
  tdFecha.className = `td-fecha ${esVencido(p) ? 'is-vencida' : ''} ${(!esVencido(p) && esProximo(p)) ? 'is-proxima' : ''}`;
  tdFecha.textContent = formatearFecha(p.fecha);

  const tdBadge = document.createElement('td');
  tdBadge.className = 'td-badge';
  const badge = document.createElement('span');
  badge.className = `badge ${ESTADO_BADGE_CLASS[p.estado]}`;
  badge.textContent = ESTADO_LABELS[p.estado];
  tdBadge.appendChild(badge);

  const tdResponsable = document.createElement('td');
  tdResponsable.className = 'td-responsable';
  tdResponsable.textContent = p.responsable || '—';

  tr.append(tdId, tdCliente, tdMueble, tdFecha, tdBadge, tdResponsable);
  return tr;
}

/** Renderiza las filas ordenadas por Fecha de Entrega. */
function renderLista() {
  const tbody = document.getElementById('list-body');
  tbody.innerHTML = '';

  // Sincroniza el icono de orden con el estado actual
  const sortIcon = document.getElementById('sort-icon');
  sortIcon.className = `fas ${state.sort.dir === 'asc' ? 'fa-sort-up' : 'fa-sort-down'}`;

  const visibles = obtenerPendientesFiltrados().sort((a, b) => {
    const cmp = String(a.fecha).localeCompare(String(b.fecha));
    return state.sort.dir === 'asc' ? cmp : cmp * -1;
  });

  visibles.forEach((p) => tbody.appendChild(crearFila(p)));
}

/* ==========================================================================
   8. FILTROS · BÚSQUEDA + RÁPIDOS + ORDENAMIENTO
   ========================================================================== */

/** Filtro rápido activo (Todos / Vencidos / Hoy / Semana). */
function cumpleFiltro(p) {
  switch (state.quickFilter) {
    case 'todos':
      return true;
    case 'vencidos':
      return esVencido(p);
    case 'hoy':
      // Entregas del día (programadas, aún no entregadas)
      return p.estado !== ESTADOS.ENTREGADO && p.fecha === hoyStr();
    case 'semana':
      // Próximos 7 días
      const dSemana = diasHasta(p.fecha);
      return p.estado !== ESTADOS.ENTREGADO && dSemana >= 0 && dSemana <= 6;
    default:
      return true;
  }
}

/** Búsqueda en vivo: Cliente, Proyecto/Mueble o ID de pedido. */
function cumpleBusqueda(p) {
  const q = state.search.trim().toLowerCase();
  if (!q) return true;
  const haystack = `${p.id} ${p.cliente} ${p.mueble} ${p.notas ?? ''}`.toLowerCase();
  return haystack.includes(q);
}

/** Lista final: aplica buscador + filtro rápido + orden. */
function obtenerPendientesFiltrados() {
  return state.pendientes.filter((p) => cumpleFiltro(p) && cumpleBusqueda(p));
}

/* ==========================================================================
   9. RENDER · GENERAL
   ========================================================================== */

function renderTodo() {
  renderMetricas();
  renderBoard();
  renderLista();
}

/* ==========================================================================
   10. MODAL · CREAR / EDITAR PENDIENTE
   ========================================================================== */

let modalEditId = null; // null = modo creación

function abrirModalPorId(id) {
  const p = state.pendientes.find((item) => item.id === id);
  abrirModal(p);
}

function abrirModal(p) {
  modalEditId = p ? p.id : null;

  document.getElementById('modal-title').textContent = p ? 'Editar Pendiente' : 'Nuevo Pendiente';
  document.getElementById('field-cliente').value = p ? p.cliente : '';
  document.getElementById('field-proyecto').value = p ? p.mueble : '';
  document.getElementById('field-fecha').value = p ? p.fecha : hoyStr();
  document.getElementById('field-estado').value = p ? p.estado : ESTADOS.PEDIDO;
  document.getElementById('field-responsable').value = p ? p.responsable : '';
  document.getElementById('field-notas').value = p ? (p.notas ?? '') : '';

  document.getElementById('modal-overlay').classList.remove('is-hidden');
}

function cerrarModal() {
  modalEditId = null;
  const form = document.getElementById('pending-form');
  form.reset();
  document.getElementById('field-fecha').value = hoyStr();
  document.getElementById('field-estado').value = ESTADOS.PEDIDO;
  document.getElementById('field-responsable').value = '';
  document.getElementById('modal-overlay').classList.add('is-hidden');
}

/** Valida y guarda (crea o actualiza) el pendiente desde el modal. */
function guardarDesdeModal(e) {
  e.preventDefault();

  const form = document.getElementById('pending-form');
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const cliente = document.getElementById('field-cliente').value.trim();
  const mueble = document.getElementById('field-proyecto').value.trim();
  const fecha = document.getElementById('field-fecha').value;
  const estado = document.getElementById('field-estado').value;
  const responsable = document.getElementById('field-responsable').value.trim() || 'Operador';
  const notas = document.getElementById('field-notas').value.trim();

  const datos = { cliente, mueble, fecha, estado, responsable, notas };

  if (modalEditId) {
    const idx = state.pendientes.findIndex((p) => p.id === modalEditId);
    if (idx >= 0) state.pendientes[idx] = { ...state.pendientes[idx], ...datos };
  } else {
    datos.id = generarId();
    state.pendientes.unshift(datos);
  }

  guardarPendientes();
  cerrarModal();
  renderTodo();
  sincronizarAhora();
}

/** Genera un nuevo ID de pedido correlativo (EYC-####). */
function generarId() {
  const nums = state.pendientes
    .map((p) => parseInt(String(p.id).replace(/\D/g, ''), 10))
    .filter((n) => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 1040;
  return `EYC-${max + 1}`;
}

/* ==========================================================================
   11. ASISTENTE IA / WHATSAPP · CHAT FLOTANTE
   ========================================================================== */

function abrirChat() {
  const panel = document.getElementById('chat-panel');
  panel.classList.add('chat-panel--open');
  if (!document.querySelector('.chat-msg--bot')) {
    pushMensaje('bot', '¡Hola! 👋 Soy el Asistente IA de EYC.\nPuedo consultar las entregas del día, buscar pedidos por cliente o revisar pendientes vencidos.\nEj: "¿Qué entregas hay para hoy?"');
  }
}

function cerrarChat() {
  document.getElementById('chat-panel').classList.remove('chat-panel--open');
}

function toggleChat() {
  const panel = document.getElementById('chat-panel');
  if (panel.classList.contains('chat-panel--open')) cerrarChat();
  else abrirChat();
}

function pushMensaje(autor, texto) {
  const container = document.getElementById('chat-messages');
  const msg = document.createElement('div');
  msg.className = `chat-msg chat-msg--${autor}`;
  msg.textContent = texto;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

/** Genera la respuesta automática del asistente según los datos actuales. */
function generarRespuestaBot(texto) {
  const q = texto.toLowerCase();

  // 1) Preguntas sobre entregas de hoy
  if (/hoy|entrega|entregar|despacho|despachar|programad/i.test(q)) {
    const hoy = hoyStr();
    const hoyList = state.pendientes.filter((p) => p.fecha === hoy && p.estado !== ESTADOS.ENTREGADO);

    if (hoyList.length === 0) {
      return '📭 No hay entregas programadas para hoy. ¡Buen ritmo! 🎉';
    }
    const lines = hoyList.map((p) => `• ${p.mueble} · ${p.cliente} · ${p.id} · ${ESTADO_LABELS[p.estado]}`);
    return `📦 Entregas programadas para hoy:\n${lines.join('\n')}\n\n¿Necesitas que despache alguno?`;
  }

  // 2) Preguntas sobre pendientes vencidos
  if (/venc|atras|retras/i.test(q)) {
    const vencidos = state.pendientes.filter(esVencido);
    if (vencidos.length === 0) {
      return '✅ ¡Sin pendientes vencidos! Todo al día con los plazos. 🎉';
    }
    const lines = vencidos.map((p) => `• ${p.mueble} · ${p.cliente} · ${p.id}`);
    return `⚠️ Tienes ${vencidos.length} pendiente(s) vencido(s):\n${lines.join('\n')}\nTe recomiendo priorizar el taller.`;
  }

  // 3) Búsqueda por cliente / proyecto
  const tokens = texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/i)
    .map((t) => t.trim())
    .filter(
      (t) =>
        t.length > 1 &&
        !['cliente', 'proyecto', 'pedidos', 'pendientes', 'que', 'hay', 'para', 'del', 'los', 'las', 'un', 'una', 'por', 'favor', 'dame', 'buscar', 'busca', 'ver', 'con', 'sin', 'tareas', 'entregas', 'entrega'].includes(t)
    );

  if (tokens.length > 0) {
    const term = tokens.join(' ').trim();
    const resultados = state.pendientes.filter((p) =>
      `${p.cliente} ${p.mueble} ${p.id}`.toLowerCase().includes(term.toLowerCase())
    );
    if (resultados.length > 0) {
      const lines = resultados.map((p) => `• ${p.mueble} · ${p.cliente} · ${p.id} · ${ESTADO_LABELS[p.estado]}`);
      return `🔎 Pedidos encontrados para "${term}":\n${lines.join('\n')}`;
    }
    return `🔍 No encontré pedidos para "${term}". Verifica el nombre del cliente.`;
  }

  // 4) Respuesta por defecto
  return '🤖 Puedo ayudarte a consultar entregas de hoy, buscar por cliente o revisar pendientes vencidos.\nPrueba con: "¿Qué entregas hay para hoy?" o "¿Pendientes del cliente Pérez?"';
}

/** Enviar mensaje del usuario y responder automáticamente del asistente. */
function enviarMensaje(texto) {
  const input = document.getElementById('chat-input');
  const msg = String(texto ?? input.value ?? '').trim();
  if (!msg) return;

  pushMensaje('user', msg);
  input.value = '';

  setTimeout(() => pushMensaje('bot', generarRespuestaBot(msg)), 450);
}

/* ==========================================================================
   12. EVENTOS · DOMContentLoaded
   ========================================================================== */

function init() {
  // Estado inicial
  state.pendientes = cargarPendientes();
  state.rol = localStorage.getItem(ROL_KEY) || 'operador';

  // Render inicial
  renderTodo();
  sincronizarAhora();

  // ---------- Selector de rol ----------
  const roleSelector = document.getElementById('role-selector');
  roleSelector.addEventListener('click', (e) => {
    const btn = e.target.closest('.role-btn');
    if (!btn) return;
    state.rol = btn.dataset.rol;
    localStorage.setItem(ROL_KEY, state.rol);
    document.querySelectorAll('#role-selector .role-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.rol === state.rol);
    });
  });

  // ---------- Búsqueda en vivo ----------
  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', (e) => {
    state.search = e.target.value;
    renderTodo();
  });

  // ---------- Filtros rápidos ----------
  const quickFilters = document.getElementById('quick-filters');
  quickFilters.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    state.quickFilter = chip.dataset.filter;
    document.querySelectorAll('#quick-filters .chip').forEach((c) => {
      c.classList.toggle('active', c.dataset.filter === state.quickFilter);
    });
    renderTodo();
  });

  // ---------- Vista conmutante (Tablero / Lista) ----------
  const viewToggle = document.getElementById('view-toggle');
  viewToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-view]');
    if (!btn) return;

    state.view = btn.dataset.view;
    document.querySelectorAll('#view-toggle [data-view]').forEach((b) => {
      b.classList.toggle('active', b.dataset.view === state.view);
    });
    document.getElementById('view-board').classList.toggle('is-hidden', state.view !== 'board');
    document.getElementById('view-list').classList.toggle('is-hidden', state.view !== 'list');
  });

  // ---------- Ordenamiento de la lista ----------
  document.getElementById('th-fecha').addEventListener('click', () => {
    if (state.sort.campo === 'fecha') {
      state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      state.sort.campo = 'fecha';
      state.sort.dir = 'asc';
    }
    renderLista();
  });

  // ---------- Modal · abrir / cerrar / guardar ----------
  document.getElementById('fab-nuevo').addEventListener('click', () => abrirModal(null));
  document.getElementById('modal-close').addEventListener('click', cerrarModal);
  document.getElementById('btn-cancelar').addEventListener('click', cerrarModal);
  document.getElementById('pending-form').addEventListener('submit', guardarDesdeModal);

  // ---------- Asistente IA · chat ----------
  document.getElementById('chat-fab').addEventListener('click', toggleChat);
  document.getElementById('chat-close').addEventListener('click', cerrarChat);
  document.getElementById('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    enviarMensaje(document.getElementById('chat-input').value);
  });
  document.getElementById('chat-quick').addEventListener('click', (e) => {
    const chip = e.target.closest('.chat-chip');
    if (chip) enviarMensaje(chip.dataset.q);
  });

  // ---------- Delegación: tarjetas Kanban (tap → editar) ----------
  document.getElementById('board').addEventListener('click', (e) => {
    const card = e.target.closest('.kanban-card');
    if (card) abrirModalPorId(card.dataset.id);
  });
}

document.addEventListener('DOMContentLoaded', init);
