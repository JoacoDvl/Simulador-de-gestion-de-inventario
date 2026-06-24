/**
 * ================================================================
 * StockMgr — app.js
 * Sistema de Gestión de Inventario
 *
 * Librerías externas utilizadas:
 *   - Toastify
 *   - SweetAlert2 
 *
 * Técnicas aplicadas:
 *   - fetch + async/await + try/catch para cargar productos.json
 *   - Manipulación del DOM sin frameworks
 *   - Arrays: filter, map, reduce, sort, find, slice
 *   - Modales propios en HTML/CSS (sin prompt/confirm/alert nativos)
 *   - Historial de acciones con registro de hora
 * ================================================================
 */

// ── Estado global de la aplicación ───────────────────────────────────────────
const estado = {
  productos:       [],    // Array principal, cargado desde productos.json
  historial:       [],    // Registro de operaciones realizadas
  filtros: {
    busqueda:  '',        // Texto del buscador
    categoria: '',        // Filtro por categoría
    stock:     '',        // Filtro por estado de stock
    col:       'id',      // Columna de ordenamiento activa
    asc:       true       // Dirección del ordenamiento
  },
  nextId:          13,    // Autoincremento para nuevos productos
  pendienteElimId: null   // ID del producto esperando confirmación de baja
};

// Umbral para considerar un stock como "bajo"
const STOCK_BAJO = 5;

// Colores para las barras del dashboard
const COLORES_BARRAS = ['#3b82f6', '#22d3a5', '#fbbf24', '#f43f5e', '#a78bfa', '#fb923c'];

// ── Inicialización ────────────────────────────────────────────────────────────

/**
 * Punto de entrada: se ejecuta cuando el DOM está completamente cargado.
 * Carga los datos desde el JSON y configura los eventos globales.
 */
document.addEventListener('DOMContentLoaded', () => {
  cargarProductos();
  configurarNavegacion();
  configurarFiltros();
  configurarModales();
  configurarOrdenamiento();
  configurarBotonesPrincipales();
  mostrarFechaHeader();
});

/**
 * Carga los productos desde el archivo JSON externo usando fetch.
 * El uso de async/await con try/catch maneja correctamente los errores de red.
 * IMPORTANTE: requiere un servidor HTTP local (no funciona con file://)
 */
async function cargarProductos() {
  try {
    const respuesta = await fetch('./productos.json');

    if (!respuesta.ok) {
      throw new Error(`Error HTTP: ${respuesta.status}`);
    }

    const datos = await respuesta.json();
    estado.productos = datos;
    estado.nextId = Math.max(...datos.map(producto => producto.id)) + 1;

    renderizarTodo();
    toast('Inventario cargado correctamente');

  } catch (error) {
    toast('Error al cargar el inventario. Verificá que el servidor esté activo.', 'err');
  }
}

// ── Navegación entre vistas ───────────────────────────────────────────────────

function configurarNavegacion() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => navegarA(item.dataset.view));
  });
}

/**
 * Activa la vista solicitada y su ítem del sidebar.
 * Renderiza el contenido específico de cada sección.
 */
function navegarA(vista) {
  document.querySelectorAll('.nav-item').forEach(itemNav => itemNav.classList.remove('on'));
  document.querySelectorAll('.view').forEach(vistaSeccion => vistaSeccion.classList.remove('on'));

  document.querySelector(`[data-view="${vista}"]`).classList.add('on');
  document.getElementById(`view-${vista}`).classList.add('on');

  if (vista === 'dashboard') renderizarDashboard();
  if (vista === 'alertas')   renderizarAlertas();
  if (vista === 'historial') renderizarHistorial();
}

// ── Render principal ──────────────────────────────────────────────────────────

/** Actualiza stats, tabla y badge de alertas */
function renderizarTodo() {
  renderizarStats();
  renderizarTabla();
  actualizarBadgeAlertas();
}

/** Calcula y muestra las 4 tarjetas de resumen */
function renderizarStats() {
  const productos      = estado.productos;
  const cantidadSinStock = productos.filter(producto => producto.stock === 0).length;
  const cantidadStockBajo = productos.filter(producto => producto.stock > 0 && producto.stock <= STOCK_BAJO).length;
  const valorTotal     = productos.reduce((acumulado, producto) => acumulado + producto.precio * producto.stock, 0);

  document.getElementById('stTotal').textContent = productos.length;
  document.getElementById('stSin').textContent   = cantidadSinStock;
  document.getElementById('stBajo').textContent  = cantidadStockBajo;
  document.getElementById('stValor').textContent = formatARS(valorTotal);
}

/**
 * Aplica todos los filtros activos, ordena el resultado
 * y genera las filas de la tabla.
 *
 * Métodos de array utilizados:
 *   - filter → aplica los 3 filtros (búsqueda, categoría, stock)
 *   - sort   → ordena por la columna seleccionada
 *   - map    → genera el HTML de cada fila
 */
function renderizarTabla() {
  const { busqueda, categoria, stock: filtroStock, col: columnaOrden, asc: ordenAscendente } = estado.filtros;

  const lista = estado.productos
    .filter(producto => {
      const coincideBusqueda  = producto.nombre.toLowerCase().includes(busqueda) ||
                                producto.proveedor.toLowerCase().includes(busqueda);
      const coincideCategoria = !categoria || producto.categoria === categoria;
      const coincideStock     = filtroStock === ''    ? true
                              : filtroStock === 'ok'  ? producto.stock > STOCK_BAJO
                              : filtroStock === 'low' ? producto.stock > 0 && producto.stock <= STOCK_BAJO
                              : producto.stock === 0;

      return coincideBusqueda && coincideCategoria && coincideStock;
    })
    .sort((primero, segundo) => {
      let valorPrimero = primero[columnaOrden];
      let valorSegundo = segundo[columnaOrden];
      if (typeof valorPrimero === 'string') {
        valorPrimero = valorPrimero.toLowerCase();
        valorSegundo = valorSegundo.toLowerCase();
      }
      if (valorPrimero < valorSegundo) return ordenAscendente ? -1 : 1;
      if (valorPrimero > valorSegundo) return ordenAscendente ? 1 : -1;
      return 0;
    });

  const tbody = document.getElementById('tblBody');

  if (lista.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="7">
        <div class="empty">
          <i class="fas fa-search"></i>
          <p>No hay productos con esos filtros.</p>
        </div>
      </td></tr>`;
    document.getElementById('tblCounter').textContent = '0 resultados';
    return;
  }

  tbody.innerHTML = lista.map(producto => generarFilaProducto(producto)).join('');

  // Contador de registros visibles
  const hayFiltro = busqueda || categoria || filtroStock;
  document.getElementById('tblCounter').textContent = hayFiltro
    ? `${lista.length} de ${estado.productos.length} productos`
    : `${lista.length} productos`;
}

/**
 * Genera el HTML de una fila de la tabla para un producto.
 * Incluye el badge de stock y los botones de acción con onclick inline.
 */
function generarFilaProducto(producto) {
  const badgeStock = producto.stock === 0
    ? `<span class="badge b-out">Sin stock</span>`
    : producto.stock <= STOCK_BAJO
      ? `<span class="badge b-low">${producto.stock} uds.</span>`
      : `<span class="badge b-ok">${producto.stock} uds.</span>`;

  return `
    <tr>
      <td class="td-id">#${String(producto.id).padStart(3, '0')}</td>
      <td class="td-name">${esc(producto.nombre)}</td>
      <td><span class="badge b-cat">${producto.categoria}</span></td>
      <td class="td-prov">${esc(producto.proveedor)}</td>
      <td class="td-price">${formatARS(producto.precio)}</td>
      <td>${badgeStock}</td>
      <td class="td-acts">
        <button class="btn btn-ghost btn-sm btn-ico" title="Ajustar stock"
          onclick="abrirModalStock(${producto.id})">
          <i class="fas fa-boxes-stacked"></i>
        </button>
        <button class="btn btn-ghost btn-sm btn-ico" title="Editar"
          onclick="abrirModalEditar(${producto.id})">
          <i class="fas fa-pen"></i>
        </button>
        <button class="btn btn-danger btn-sm btn-ico" title="Eliminar"
          onclick="abrirModalEliminar(${producto.id})">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    </tr>`;
}

// ── Ordenamiento por columna ──────────────────────────────────────────────────

function configurarOrdenamiento() {
  document.querySelectorAll('thead th[data-col]').forEach(encabezado => {
    encabezado.addEventListener('click', () => {
      const columna = encabezado.dataset.col;
      if (estado.filtros.col === columna) {
        estado.filtros.asc = !estado.filtros.asc;
      } else {
        estado.filtros.col = columna;
        estado.filtros.asc = true;
      }
      actualizarEncabezados();
      renderizarTabla();
    });
  });
}

/** Resalta visualmente la columna de ordenamiento activa */
function actualizarEncabezados() {
  document.querySelectorAll('thead th[data-col]').forEach(encabezado => {
    encabezado.classList.toggle('sorted', encabezado.dataset.col === estado.filtros.col);
  });
}

// ── Filtros ───────────────────────────────────────────────────────────────────

function configurarFiltros() {
  document.getElementById('buscador').addEventListener('input', evento => {
    estado.filtros.busqueda = evento.target.value.toLowerCase().trim();
    renderizarTabla();
  });

  document.getElementById('filCat').addEventListener('change', evento => {
    estado.filtros.categoria = evento.target.value;
    renderizarTabla();
  });

  document.getElementById('filStock').addEventListener('change', evento => {
    estado.filtros.stock = evento.target.value;
    renderizarTabla();
  });
}

// ── Modal: Nuevo / Editar producto ────────────────────────────────────────────

function configurarModales() {
  // Modal producto
  document.getElementById('modalGuardar').addEventListener('click', guardarProducto);
  document.getElementById('modalCancelar').addEventListener('click', cerrarModalProducto);
  document.getElementById('modalClose').addEventListener('click', cerrarModalProducto);
  document.getElementById('modalProducto').addEventListener('click', evento => {
    if (evento.target === document.getElementById('modalProducto')) cerrarModalProducto();
  });

  // Modal eliminar
  document.getElementById('elimConfirmar').addEventListener('click', confirmarEliminar);
  document.getElementById('elimCancelar').addEventListener('click', cerrarModalEliminar);
  document.getElementById('modalEliminar').addEventListener('click', evento => {
    if (evento.target === document.getElementById('modalEliminar')) cerrarModalEliminar();
  });

  // Modal stock
  document.getElementById('stockAplicar').addEventListener('click', aplicarStock);
  document.getElementById('stockCancelar').addEventListener('click', cerrarModalStock);
  document.getElementById('stockClose').addEventListener('click', cerrarModalStock);
  document.getElementById('modalStock').addEventListener('click', evento => {
    if (evento.target === document.getElementById('modalStock')) cerrarModalStock();
  });
}

/** Limpia el formulario y abre el modal en modo "Nuevo" */
function abrirModalNuevo() {
  document.getElementById('modalTitulo').textContent = 'Nuevo producto';
  document.getElementById('fId').value      = '';
  document.getElementById('fNombre').value  = '';
  document.getElementById('fCat').value     = '';
  document.getElementById('fProv').value    = '';
  document.getElementById('fPrecio').value  = '';
  document.getElementById('fStock').value   = '';
  limpiarErrores();
  document.getElementById('modalProducto').classList.add('on');
}

/** Pre-carga los datos del producto y abre el modal en modo "Editar" */
function abrirModalEditar(id) {
  const producto = estado.productos.find(item => item.id === id);
  if (!producto) return;

  document.getElementById('modalTitulo').textContent = 'Editar producto';
  document.getElementById('fId').value      = producto.id;
  document.getElementById('fNombre').value  = producto.nombre;
  document.getElementById('fCat').value     = producto.categoria;
  document.getElementById('fProv').value    = producto.proveedor;
  document.getElementById('fPrecio').value  = producto.precio;
  document.getElementById('fStock').value   = producto.stock;
  limpiarErrores();
  document.getElementById('modalProducto').classList.add('on');
}

function cerrarModalProducto() {
  document.getElementById('modalProducto').classList.remove('on');
}

function limpiarErrores() {
  document.querySelectorAll('.field-err').forEach(elemento => elemento.classList.remove('on'));
}

/**
 * Valida el formulario y ejecuta el alta o la modificación.
 *
 * Alta:      push al array de productos
 * Edición:   map → reemplaza el objeto con id coincidente (sin mutar directamente)
 */
function guardarProducto() {
  limpiarErrores();
  let valido = true;

  const nombre     = document.getElementById('fNombre').value.trim();
  const categoria  = document.getElementById('fCat').value;
  const proveedor  = document.getElementById('fProv').value.trim();
  const precio     = parseFloat(document.getElementById('fPrecio').value);
  const stock      = parseInt(document.getElementById('fStock').value);
  const idExistente = document.getElementById('fId').value;

  if (!nombre)                      { document.getElementById('errNombre').classList.add('on'); valido = false; }
  if (!categoria)                   { document.getElementById('errCat').classList.add('on');    valido = false; }
  if (!proveedor)                   { document.getElementById('errProv').classList.add('on');   valido = false; }
  if (isNaN(precio) || precio < 0)  { document.getElementById('errPrecio').classList.add('on'); valido = false; }
  if (isNaN(stock)  || stock  < 0)  { document.getElementById('errStock').classList.add('on');  valido = false; }

  if (!valido) return;

  if (idExistente) {
    // Edición: reemplazar con map para mantener la inmutabilidad del array
    estado.productos = estado.productos.map(producto =>
      producto.id === parseInt(idExistente)
        ? { ...producto, nombre, categoria, proveedor, precio, stock }
        : producto
    );
    registrarAccion('edit', `Editado <strong>${nombre}</strong>`);
    toast(`"${nombre}" actualizado`);
  } else {
    // Alta: agregar el nuevo objeto al array
    const nuevoProducto = { id: estado.nextId++, nombre, categoria, proveedor, precio, stock };
    estado.productos.push(nuevoProducto);
    registrarAccion('add', `Agregado <strong>${nombre}</strong>`);
    toast(`"${nombre}" agregado al inventario`);
  }

  cerrarModalProducto();
  renderizarTodo();
}

// ── Modal: Eliminar ───────────────────────────────────────────────────────────

function abrirModalEliminar(id) {
  const producto = estado.productos.find(item => item.id === id);
  if (!producto) return;

  estado.pendienteElimId = id;
  document.getElementById('elimMsg').innerHTML =
    `¿Confirmás eliminar <strong>${esc(producto.nombre)}</strong>? Esta acción no se puede deshacer.`;
  document.getElementById('modalEliminar').classList.add('on');
}

function cerrarModalEliminar() {
  document.getElementById('modalEliminar').classList.remove('on');
  estado.pendienteElimId = null;
}

/**
 * Ejecuta la baja del producto usando filter
 * (devuelve un nuevo array sin el elemento eliminado)
 */
function confirmarEliminar() {
  const id = estado.pendienteElimId;
  const producto = estado.productos.find(item => item.id === id);
  if (!producto) return;

  estado.productos = estado.productos.filter(item => item.id !== id);
  registrarAccion('del', `Eliminado <strong>${producto.nombre}</strong>`);
  toast(`"${producto.nombre}" eliminado`, 'err');

  cerrarModalEliminar();
  renderizarTodo();
}

// ── Modal: Ajustar stock ──────────────────────────────────────────────────────

let stockIdActivo = null;

function abrirModalStock(id) {
  const producto = estado.productos.find(item => item.id === id);
  if (!producto) return;

  stockIdActivo = id;
  document.getElementById('stockInfo').textContent =
    `${producto.nombre} — stock actual: ${producto.stock} unidades`;
  document.getElementById('stockOp').value   = 'sumar';
  document.getElementById('stockCant').value = '0';
  document.getElementById('errStockCant').classList.remove('on');
  document.getElementById('modalStock').classList.add('on');
}

function cerrarModalStock() {
  document.getElementById('modalStock').classList.remove('on');
  stockIdActivo = null;
}

/**
 * Aplica la operación de stock seleccionada (sumar / restar / fijar).
 * Usa map para actualizar el array sin mutarlo directamente.
 */
function aplicarStock() {
  const cantidad  = parseInt(document.getElementById('stockCant').value);
  const operacion = document.getElementById('stockOp').value;

  if (isNaN(cantidad) || cantidad < 0) {
    document.getElementById('errStockCant').classList.add('on');
    return;
  }

  const producto = estado.productos.find(item => item.id === stockIdActivo);
  if (!producto) return;

  const stockAnterior = producto.stock;
  const stockNuevo    = operacion === 'sumar'  ? stockAnterior + cantidad
                      : operacion === 'restar' ? Math.max(0, stockAnterior - cantidad)
                      : cantidad;

  estado.productos = estado.productos.map(item =>
    item.id === stockIdActivo ? { ...item, stock: stockNuevo } : item
  );

  registrarAccion('stock', `Stock de <strong>${producto.nombre}</strong>: ${stockAnterior} → ${stockNuevo} uds.`);
  toast(`Stock actualizado: ${stockAnterior} → ${stockNuevo}`);

  cerrarModalStock();
  renderizarTodo();
}

// ── Botones principales ───────────────────────────────────────────────────────

function configurarBotonesPrincipales() {
  document.getElementById('btnNuevo').addEventListener('click', abrirModalNuevo);
  document.getElementById('btnExportar').addEventListener('click', exportarCSV);
  document.getElementById('btnLimpiarHist').addEventListener('click', limpiarHistorial);
}

// ── Exportar CSV ──────────────────────────────────────────────────────────────

/**
 * Genera un archivo CSV con todos los productos y lo descarga.
 * Usa map para convertir cada objeto en una línea de texto.
 */
function exportarCSV() {
  const encabezado = ['ID', 'Nombre', 'Categoría', 'Proveedor', 'Precio', 'Stock'];
  const filas = estado.productos.map(producto =>
    [producto.id, producto.nombre, producto.categoria, producto.proveedor, producto.precio, producto.stock]
      .map(valor => `"${valor}"`).join(',')
  );

  const contenidoCSV = [encabezado.join(','), ...filas].join('\n');
  const blob         = new Blob([contenidoCSV], { type: 'text/csv;charset=utf-8;' });
  const url          = URL.createObjectURL(blob);
  const enlace       = document.createElement('a');
  enlace.href     = url;
  enlace.download = `inventario_${new Date().toISOString().slice(0, 10)}.csv`;
  enlace.click();
  URL.revokeObjectURL(url);

  toast('Inventario exportado como CSV', 'info');
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

/**
 * Renderiza los dos gráficos de barras del dashboard.
 *
 * Gráfico 1: reduce para agrupar stock por categoría
 * Gráfico 2: map → sort → slice para obtener el top 5 por valor
 */
function renderizarDashboard() {
  // Stock total por categoría
  const stockPorCategoria = estado.productos.reduce((acumulado, producto) => {
    acumulado[producto.categoria] = (acumulado[producto.categoria] || 0) + producto.stock;
    return acumulado;
  }, {});

  const maxStockCategoria = Math.max(...Object.values(stockPorCategoria), 1);

  document.getElementById('chartCat').innerHTML = Object.entries(stockPorCategoria)
    .sort((primero, segundo) => segundo[1] - primero[1])
    .map(([categoria, stockTotal], indice) => `
      <div class="bar-row">
        <div class="bar-lbl">${categoria}</div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${(stockTotal / maxStockCategoria * 100).toFixed(1)}%;background:${COLORES_BARRAS[indice % COLORES_BARRAS.length]}"></div>
        </div>
        <div class="bar-num">${stockTotal} uds.</div>
      </div>`).join('');

  // Top 5 productos por valor en inventario
  const topProductos = estado.productos
    .map(producto => ({ nombre: producto.nombre, valor: producto.precio * producto.stock }))
    .sort((primero, segundo) => segundo.valor - primero.valor)
    .slice(0, 5);

  const maxValorTop = Math.max(...topProductos.map(producto => producto.valor), 1);

  document.getElementById('chartTop').innerHTML = topProductos.map(producto => `
    <div class="bar-row">
      <div class="bar-lbl" style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(producto.nombre)}</div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${(producto.valor / maxValorTop * 100).toFixed(1)}%;background:#22d3a5"></div>
      </div>
      <div class="bar-num">${formatCorto(producto.valor)}</div>
    </div>`).join('');
}

// ── Alertas ───────────────────────────────────────────────────────────────────

/** Actualiza el badge numérico del sidebar con la cantidad de alertas activas */
function actualizarBadgeAlertas() {
  const cantidad = estado.productos.filter(producto => producto.stock <= STOCK_BAJO).length;
  const badge    = document.getElementById('badgeAlertas');
  badge.textContent    = cantidad > 0 ? cantidad : '';
  badge.style.display  = cantidad > 0 ? '' : 'none';
}

/**
 * Renderiza la lista de alertas separadas por prioridad:
 *   - Rojo:    sin stock (stock === 0)
 *   - Amarillo: stock bajo (1 a STOCK_BAJO)
 *
 * Usa filter para obtener cada subconjunto.
 */
function renderizarAlertas() {
  const productosSinStock = estado.productos.filter(producto => producto.stock === 0);
  const productosStockBajo = estado.productos.filter(producto => producto.stock > 0 && producto.stock <= STOCK_BAJO);
  const container = document.getElementById('alertList');

  if (productosSinStock.length === 0 && productosStockBajo.length === 0) {
    container.innerHTML = `<div class="empty">
      <i class="fas fa-check-circle" style="color:var(--green);opacity:1"></i>
      <p>Todo el inventario está en buen estado.</p>
    </div>`;
    return;
  }

  const generarAlerta = (producto, tipo) => `
    <div class="alert-item ${tipo === 'red' ? 'a-red' : 'a-yellow'}">
      <i class="fas ${tipo === 'red' ? 'fa-circle-xmark' : 'fa-triangle-exclamation'} alert-ico"></i>
      <div class="alert-body">
        <div class="alert-name">${esc(producto.nombre)}</div>
        <div class="alert-desc">
          ${tipo === 'red' ? 'Sin stock' : `Stock bajo: ${producto.stock} unidades`}
          — ${esc(producto.proveedor)}
        </div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="abrirModalStock(${producto.id})">
        <i class="fas fa-plus"></i> Reponer
      </button>
    </div>`;

  container.innerHTML =
    productosSinStock.map(producto => generarAlerta(producto, 'red')).join('') +
    productosStockBajo.map(producto => generarAlerta(producto, 'yellow')).join('');
}

// ── Historial ─────────────────────────────────────────────────────────────────

/** Agrega una entrada al historial con la hora actual */
function registrarAccion(tipo, descripcion) {
  const hora = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  estado.historial.unshift({ tipo, descripcion, hora });
}

/**
 * Renderiza el listado de acciones registradas.
 * Usa map para generar cada ítem de historial.
 */
function renderizarHistorial() {
  const container = document.getElementById('histList');

  if (estado.historial.length === 0) {
    container.innerHTML = `<div class="empty">
      <i class="fas fa-clock-rotate-left"></i>
      <p>No hay acciones registradas todavía.</p>
    </div>`;
    return;
  }

  const iconos = {
    add:   { clase: 'h-add',   icono: 'fa-plus-circle'   },
    edit:  { clase: 'h-edit',  icono: 'fa-pen-circle'    },
    del:   { clase: 'h-del',   icono: 'fa-circle-minus'  },
    stock: { clase: 'h-stock', icono: 'fa-boxes-stacked' }
  };

  container.innerHTML = estado.historial.map(accion => {
    const datosIcono = iconos[accion.tipo] || iconos.add;
    return `<div class="hist-item">
      <span class="hist-time">${accion.hora}</span>
      <i class="fas ${datosIcono.icono} hist-ico ${datosIcono.clase}"></i>
      <span class="hist-txt">${accion.descripcion}</span>
    </div>`;
  }).join('');
}

function limpiarHistorial() {
  estado.historial = [];
  renderizarHistorial();
  toast('Historial limpiado', 'info');
}

// ── Utilidades ────────────────────────────────────────────────────────────────

/** Formatea un número como precio en pesos argentinos */
const formatARS = valor =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0
  }).format(valor);

/** Formato compacto para valores grandes (dashboard) */
const formatCorto = valor =>
  valor >= 1_000_000 ? `$${(valor / 1_000_000).toFixed(1)}M`
  : valor >= 1_000   ? `$${(valor / 1_000).toFixed(0)}K`
  : `$${valor}`;

/** Escapa caracteres HTML para prevenir XSS al insertar texto en el DOM */
const esc = texto =>
  String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Muestra una notificación no bloqueante usando Toastify.
 * Reemplaza completamente el uso de alert() nativo.
 */
function toast(mensaje, tipo = 'ok') {
  const fondos = {
    ok:   'linear-gradient(135deg, #22d3a5, #0d9488)',
    err:  'linear-gradient(135deg, #f43f5e, #be123c)',
    info: 'linear-gradient(135deg, #3b82f6, #1d4ed8)'
  };

  Toastify({
    text: mensaje,
    duration: 3000,
    gravity: 'bottom',
    position: 'right',
    stopOnFocus: true,
    style: {
      background:  fondos[tipo] || fondos.ok,
      borderRadius: '7px',
      fontFamily:  "'Outfit', sans-serif",
      fontSize:    '13px',
      fontWeight:  '500',
      boxShadow:   '0 4px 20px rgba(0,0,0,.45)',
      padding:     '10px 16px'
    }
  }).showToast();
}

/** Muestra la fecha actual en el header */
function mostrarFechaHeader() {
  document.getElementById('hdrFecha').textContent =
    new Date().toLocaleDateString('es-AR', {
      weekday: 'short', day: 'numeric', month: 'short'
    });
}
