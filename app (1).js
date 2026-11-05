/* =====================================================
   CONFIGURACIÓN — cambia solo estas líneas
   ===================================================== */
const SUPABASE_URL = "https://eigjqfcskkpooswrmuqz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_xL-WRiWj8xllbS-qzjJgZg_Cv_5OVPG";
const ADMIN_EMAIL = "kestebanrquevedo@gmail.com";

// Textos fijos de la plantilla de cartas
const TITULO = "Zoe F.";
const FIRMA = "Watari R. ";

// Diseño de las cartas en modo "solo texto" (el mismo CSS de tus cartas)
const CSS_CARTA = `
h1 {
  font-family: cursive;
  text-align: center;
  color: #FFD700;
}
.Text {
  text-align: center;
  font-family: cursive;
}
.watari {
  text-align: right;
  font-family: cursive;
  color: black;
}
h6 {
  font-family: Courier New;
}
img {
  max-width: 100%;
  display: block;
  margin: 12px auto;
}
`;

// Diseño del portafolio de Spotify (el mismo CSS de tu página original)
const CSS_PORTAFOLIO = `
.contenedor {
  display: flex;
  justify-content: center;
  align-items: center;
}
.svg-button img {
  width: 75px;
  height: auto;
  border: 2px solid #1DB954;
  border-radius: 30px;
  cursor: pointer;
  transition: transform 0.2s ease;
}
.svg-button img:hover {
  transform: scale(1.05);
}
p {
  text-align: center;
  font-family: 'Courier New', Courier, monospace;
}
.encabezado {
  padding: 35px 0;
  text-align: center;
}
.banner-spotify {
  width: 200px;
  max-width: 80%;
  height: auto;
  display: block;
  margin: 0 auto;
}
`;
const LOGO_SPOTIFY =
  "https://upload.wikimedia.org/wikipedia/commons/9/99/Black_Spotify_logo_with_text.svg";
const BOTON_SPOTIFY =
  "https://developer-assets.spotifycdn.com/images/guidelines/design/logo.svg";

// Permisos con los que se muestran las páginas dentro del visor.
const LETTER_SANDBOX =
  "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals allow-presentation";
const LETTER_ALLOW = "autoplay; encrypted-media; fullscreen; clipboard-write";

/* ===================================================== */

const $ = (id) => document.getElementById(id);
const iframe = $("viewer");
const sidebar = $("sidebar");

let sb = null;
let cartas = []; // [{id, fecha, etiqueta}] ordenadas por fecha
let canciones = []; // [{id, orden, titulo}] (solo para el panel)
let isAdmin = false;
let editId = null;
let editCancionId = null;
let peticion = 0; // evita que una página lenta pise a otra
const cache = new Map(); // id -> datos de la carta
let portafolioHtml = null; // portafolio ya armado

/* ---------- utilidades ---------- */

function claveActual() {
  return location.hash.slice(1) || "portafolio";
}

function etiquetaDe(c) {
  if (c.etiqueta) return c.etiqueta;
  const [y, m, d] = c.fecha.split("-");
  return `${d}‑${m}‑${y}`;
}

function formatoFecha(f) {
  const [y, m, d] = f.split("-");
  return `${d}-${m}-${y}`;
}

const LEIDAS_KEY = "cartas_leidas";
function leidas() {
  try {
    return new Set(JSON.parse(localStorage.getItem(LEIDAS_KEY) || "[]"));
  } catch {
    return new Set();
  }
}
function marcarLeida(id) {
  const s = leidas();
  s.add(id);
  try {
    localStorage.setItem(LEIDAS_KEY, JSON.stringify([...s]));
  } catch {}
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mostrarEnVisor(html) {
  iframe.setAttribute("sandbox", LETTER_SANDBOX);
  iframe.setAttribute("allow", LETTER_ALLOW);
  iframe.srcdoc = html;
}

function mensajeEnVisor(texto) {
  iframe.setAttribute("sandbox", "");
  iframe.srcdoc = `<body style="font-family:'Courier New',monospace;color:#555;padding:24px">${texto}</body>`;
}

/* ---------- plantilla de carta (modo "solo texto") ---------- */

// Escapa el texto y convierte: ![desc](url) → imagen, [texto](url) → link, Enter → <br>
function formatear(t) {
  return esc(t || "")
    .replace(
      /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g,
      '<img src="$2" alt="$1">',
    )
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>',
    )
    .replace(/\r?\n/g, "<br>");
}

function plantillaCarta(c) {
  const fecha = c.fecha_mostrar || formatoFecha(c.fecha);
  const despedida = c.despedida ? "<br>" + formatear(c.despedida) : "";
  return (
    `<!doctype html><html lang="es"><head><meta charset="UTF-8">` +
    `<title>${esc(TITULO)}</title><style>${CSS_CARTA}</style></head><body>` +
    `<h1>${esc(TITULO)}</h1>` +
    `<h6>${esc(fecha)}</h6>` +
    `<p class="Text">${formatear(c.texto)}${despedida}</p>` +
    `<p class="watari">${esc(FIRMA)}</p>` +
    `<br><br><br><br><br><br></body></html>`
  );
}

/* ---------- carta en modo "HTML completo" ---------- */

function prepararHtml({ html, base_url }) {
  html = html || "";
  if (!base_url) return html;
  const base = `<base href="${base_url.replace(/"/g, "&quot;")}">`;
  return /<head[^>]*>/i.test(html)
    ? html.replace(/<head[^>]*>/i, (m) => m + base)
    : base + html;
}

function htmlDeCarta(c) {
  return c.modo === "texto" ? plantillaCarta(c) : prepararHtml(c);
}

/* ---------- portafolio de Spotify ---------- */

function formatoTitulo(t) {
  return esc(t || "").replace(/\r?\n/g, "<br>");
}

// **negrilla**, __subrayado__, Enter → salto de línea
function formatoDescripcion(t) {
  return esc(t || "")
    .replace(/\*\*([\s\S]+?)\*\*/g, "<b>$1</b>")
    .replace(/__([\s\S]+?)__/g, "<u>$1</u>")
    .replace(/\r?\n/g, "<br>");
}

function urlSegura(u) {
  return /^https?:\/\//i.test((u || "").trim()) ? esc(u.trim()) : "#";
}

function htmlPortafolio(lista) {
  const separador = "<br><br><br><br>";
  const items = lista
    .map(
      (c) =>
        `<p>${formatoTitulo(c.titulo)}</p>` +
        `<div class="contenedor"><a href="${urlSegura(c.url)}" class="svg-button" target="_blank" rel="noopener">` +
        `<img src="${BOTON_SPOTIFY}" alt="Botón SVG" /></a></div>` +
        `<p>${formatoDescripcion(c.descripcion)}</p>`,
    )
    .join(separador);
  return (
    `<!doctype html><html lang="es"><head><meta charset="UTF-8"><title>Spotify</title>` +
    `<style>${CSS_PORTAFOLIO}</style></head><body>` +
    `<header class="encabezado"><img src="${LOGO_SPOTIFY}" alt="Logo de Spotify" class="banner-spotify"></header>` +
    `<br><br><br>${items}${"<br>".repeat(10)}</body></html>`
  );
}

/* ---------- menú ---------- */

function renderMenu() {
  const cont = $("lista-cartas");
  cont.innerHTML = "";
  const vistas = leidas();
  const ultima = cartas[cartas.length - 1];

  cartas.forEach((c) => {
    const a = document.createElement("a");
    a.className = "menu-item";
    a.href = `#carta-${c.id}`;
    a.dataset.key = `carta-${c.id}`;
    // el ícono de "sin leer" lo lleva la última carta hasta que se abre
    const icono =
      c === ultima && !vistas.has(c.id) ? "mark_email_unread" : "mail";
    a.innerHTML = `<span class="material-icons">${icono}</span><span class="label"></span>`;
    a.querySelector(".label").textContent = etiquetaDe(c);
    cont.appendChild(a);
  });
  marcarActivo();
}

function marcarActivo() {
  const key = claveActual();
  document.querySelectorAll(".menu-item[data-key]").forEach((el) => {
    el.classList.toggle("active", el.dataset.key === key);
  });
}

/* ---------- visor ---------- */

async function abrirPortafolio() {
  const token = ++peticion;

  if (!portafolioHtml) {
    const { data, error } = await sb
      .from("canciones")
      .select("titulo, url, descripcion")
      .order("orden", { ascending: true })
      .order("id", { ascending: true });
    if (token !== peticion) return;
    if (error) {
      console.error(error);
      mensajeEnVisor("No se pudo cargar el portafolio.");
      return;
    }
    portafolioHtml = htmlPortafolio(data);
  }
  if (token !== peticion) return;
  mostrarEnVisor(portafolioHtml);
}

async function abrirCarta(id) {
  const token = ++peticion;
  let carta = cache.get(id);

  if (!carta) {
    const { data, error } = await sb
      .from("cartas")
      .select("modo, fecha, html, base_url, texto, despedida, fecha_mostrar")
      .eq("id", id)
      .single();
    if (token !== peticion) return;
    if (error) {
      console.error(error);
      mensajeEnVisor("No se pudo cargar la carta.");
      return;
    }
    carta = data;
    cache.set(id, carta);
  }
  if (token !== peticion) return;

  mostrarEnVisor(htmlDeCarta(carta));
  marcarLeida(id);
  renderMenu();
}

async function route() {
  if (document.body.classList.contains("bloqueado")) return;
  const key = claveActual();
  marcarActivo();

  if (key.startsWith("carta-")) {
    const id = Number(key.slice(6));
    if (cartas.some((c) => c.id === id)) return abrirCarta(id);
  }
  abrirPortafolio();
}

/* ---------- sesión ---------- */

function mostrarLogin(mensaje = "") {
  peticion++;
  cartas = [];
  canciones = [];
  cache.clear();
  portafolioHtml = null;
  iframe.removeAttribute("srcdoc");
  iframe.src = "about:blank";
  sidebar.classList.remove("open");
  $("admin").classList.add("hidden");
  document.body.classList.add("bloqueado");
  $("login").classList.remove("hidden");
  $("login-error").textContent = mensaje;
}

async function entrar(session) {
  isAdmin =
    (session.user.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase();
  document
    .querySelectorAll(".solo-admin")
    .forEach((el) => el.classList.toggle("hidden", !isAdmin));

  $("login").classList.add("hidden");
  document.body.classList.remove("bloqueado");

  await cargarCartas();
  route();
}

async function cerrarSesion() {
  await sb.auth.signOut();
  mostrarLogin();
}

async function cargarCartas() {
  const { data, error } = await sb
    .from("cartas")
    .select("id, fecha, etiqueta")
    .order("fecha", { ascending: true })
    .order("id", { ascending: true });
  if (error) console.error(error);
  cartas = error ? [] : data;
  renderMenu();
  if (isAdmin) renderListaAdmin();
}

/* ---------- panel de administración: general ---------- */

function mostrarTab(nombre) {
  const cartasTab = nombre === "cartas";
  $("sec-cartas").classList.toggle("hidden", !cartasTab);
  $("sec-canciones").classList.toggle("hidden", cartasTab);
  $("tab-cartas").classList.toggle("secundario", !cartasTab);
  $("tab-canciones").classList.toggle("secundario", cartasTab);
  if (!cartasTab) cargarCancionesAdmin();
}

function abrirAdmin() {
  limpiarFormulario();
  limpiarCancion();
  msgAdmin("");
  msgCancion("");
  renderListaAdmin();
  mostrarTab("cartas");
  $("admin").classList.remove("hidden");
}

/* ---------- panel: cartas ---------- */

function msgAdmin(texto, esError = false) {
  const p = $("admin-msg");
  p.className = esError ? "error" : "ok";
  p.textContent = texto;
}

function aplicarModo() {
  const modo = $("a-modo").value;
  document.querySelectorAll("#admin-form [data-modo]").forEach((el) => {
    el.classList.toggle("hidden", el.dataset.modo !== modo);
  });
}

function limpiarFormulario() {
  editId = null;
  $("admin-form").reset();
  $("a-guardar").textContent = "Guardar carta";
  aplicarModo();
}

function renderListaAdmin() {
  const ul = $("admin-lista");
  ul.innerHTML = "";
  [...cartas].reverse().forEach((c) => {
    const li = document.createElement("li");
    const txt = document.createElement("span");
    txt.textContent = etiquetaDe(c);
    const acciones = document.createElement("span");
    acciones.innerHTML =
      `<button type="button" class="btn mini secundario" data-accion="editar" data-id="${c.id}">Editar</button> ` +
      `<button type="button" class="btn mini secundario" data-accion="borrar" data-id="${c.id}">Borrar</button>`;
    li.append(txt, acciones);
    ul.appendChild(li);
  });
}

async function editar(id) {
  msgAdmin("Cargando…");
  const { data, error } = await sb
    .from("cartas")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return msgAdmin("No se pudo cargar la carta.", true);

  editId = id;
  $("a-modo").value = data.modo === "texto" ? "texto" : "html";
  aplicarModo();
  $("a-fecha").value = data.fecha;
  $("a-etiqueta").value = data.etiqueta || "";
  $("a-fecha-mostrar").value = data.fecha_mostrar || "";
  $("a-texto").value = data.texto || "";
  $("a-despedida").value = data.despedida || "";
  $("a-base").value = data.base_url || "";
  $("a-html").value = data.html || "";
  $("a-guardar").textContent = "Guardar cambios";
  msgAdmin("Editando carta. Cambia lo que necesites y guarda.");
  $("admin").scrollTo({ top: 0, behavior: "smooth" });
}

async function borrar(id) {
  const c = cartas.find((x) => x.id === id);
  if (!confirm(`¿Borrar la carta ${c ? etiquetaDe(c) : ""}? No se puede deshacer.`))
    return;
  const { data, error } = await sb
    .from("cartas")
    .delete()
    .eq("id", id)
    .select("id");
  if (error || !data || !data.length)
    return msgAdmin("No se pudo borrar (¿tienes permisos de admin?).", true);
  cache.delete(id);
  if (editId === id) limpiarFormulario();
  await cargarCartas();
  msgAdmin("Carta borrada.");
  route();
}

async function guardar(e) {
  e.preventDefault();
  const modo = $("a-modo").value;
  const esTexto = modo === "texto";

  const fila = {
    modo,
    fecha: $("a-fecha").value,
    etiqueta: $("a-etiqueta").value.trim() || null,
    fecha_mostrar: esTexto ? $("a-fecha-mostrar").value.trim() || null : null,
    texto: esTexto ? $("a-texto").value.trim() : null,
    despedida: esTexto ? $("a-despedida").value.trim() || null : null,
    base_url: esTexto ? null : $("a-base").value.trim() || null,
    html: esTexto ? null : $("a-html").value,
  };

  if (!fila.fecha) return msgAdmin("Falta la fecha.", true);
  if (esTexto && !fila.texto) return msgAdmin("Falta el texto de la carta.", true);
  if (!esTexto && !(fila.html || "").trim())
    return msgAdmin("Falta el código de la carta.", true);

  $("a-guardar").disabled = true;
  let fallo = false;

  if (editId) {
    const { data, error } = await sb
      .from("cartas")
      .update(fila)
      .eq("id", editId)
      .select("id");
    fallo = !!error || !data || !data.length;
    cache.delete(editId);
  } else {
    const { error } = await sb.from("cartas").insert(fila);
    fallo = !!error;
  }
  $("a-guardar").disabled = false;

  if (fallo)
    return msgAdmin("No se pudo guardar (¿tienes permisos de admin?).", true);

  limpiarFormulario();
  await cargarCartas();
  msgAdmin("Carta guardada ✓");
  route();
}

/* ---------- panel: canciones ---------- */

function msgCancion(texto, esError = false) {
  const p = $("cancion-msg");
  p.className = esError ? "error" : "ok";
  p.textContent = texto;
}

function limpiarCancion() {
  editCancionId = null;
  $("cancion-form").reset();
  $("c-guardar").textContent = "Guardar canción";
}

function refrescarPortafolio() {
  portafolioHtml = null;
  if (claveActual() === "portafolio") route();
}

async function cargarCancionesAdmin() {
  const { data, error } = await sb
    .from("canciones")
    .select("id, orden, titulo")
    .order("orden", { ascending: true })
    .order("id", { ascending: true });
  if (error) {
    console.error(error);
    msgCancion("No se pudieron cargar las canciones.", true);
  }
  canciones = error ? [] : data;
  renderListaCanciones();
}

function renderListaCanciones() {
  const ul = $("canciones-lista");
  ul.innerHTML = "";
  canciones.forEach((c, i) => {
    const li = document.createElement("li");
    const txt = document.createElement("span");
    txt.textContent = `${i + 1}. ${(c.titulo || "").replace(/\s*\n\s*/g, " ")}`;
    const acciones = document.createElement("span");
    acciones.innerHTML =
      `<button type="button" class="btn mini secundario" data-accion="subir" data-id="${c.id}">↑</button> ` +
      `<button type="button" class="btn mini secundario" data-accion="bajar" data-id="${c.id}">↓</button> ` +
      `<button type="button" class="btn mini secundario" data-accion="editar" data-id="${c.id}">Editar</button> ` +
      `<button type="button" class="btn mini secundario" data-accion="borrar" data-id="${c.id}">Borrar</button>`;
    li.append(txt, acciones);
    ul.appendChild(li);
  });
}

async function editarCancion(id) {
  msgCancion("Cargando…");
  const { data, error } = await sb
    .from("canciones")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return msgCancion("No se pudo cargar la canción.", true);

  editCancionId = id;
  $("c-titulo").value = data.titulo || "";
  $("c-url").value = data.url || "";
  $("c-desc").value = data.descripcion || "";
  $("c-guardar").textContent = "Guardar cambios";
  msgCancion("Editando canción. Cambia lo que necesites y guarda.");
  $("admin").scrollTo({ top: 0, behavior: "smooth" });
}

async function borrarCancion(id) {
  const c = canciones.find((x) => x.id === id);
  const nombre = c ? (c.titulo || "").replace(/\s*\n\s*/g, " ") : "";
  if (!confirm(`¿Borrar la canción "${nombre}"? No se puede deshacer.`)) return;
  const { data, error } = await sb
    .from("canciones")
    .delete()
    .eq("id", id)
    .select("id");
  if (error || !data || !data.length)
    return msgCancion("No se pudo borrar (¿tienes permisos de admin?).", true);
  if (editCancionId === id) limpiarCancion();
  await cargarCancionesAdmin();
  msgCancion("Canción borrada.");
  refrescarPortafolio();
}

async function moverCancion(id, direccion) {
  const i = canciones.findIndex((c) => c.id === id);
  const j = i + direccion;
  if (i < 0 || j < 0 || j >= canciones.length) return;
  const a = canciones[i];
  const b = canciones[j];

  // si por algún motivo tienen el mismo orden, se renumera toda la lista
  if (a.orden === b.orden) {
    const nuevo = canciones.map((c, k) => ({ id: c.id, orden: k + 1 }));
    [nuevo[i].orden, nuevo[j].orden] = [nuevo[j].orden, nuevo[i].orden];
    for (const n of nuevo) {
      await sb.from("canciones").update({ orden: n.orden }).eq("id", n.id);
    }
  } else {
    const r1 = await sb
      .from("canciones")
      .update({ orden: b.orden })
      .eq("id", a.id)
      .select("id");
    const r2 = await sb
      .from("canciones")
      .update({ orden: a.orden })
      .eq("id", b.id)
      .select("id");
    if (r1.error || r2.error || !r1.data?.length || !r2.data?.length)
      return msgCancion("No se pudo cambiar el orden.", true);
  }
  await cargarCancionesAdmin();
  refrescarPortafolio();
}

async function guardarCancion(e) {
  e.preventDefault();
  const fila = {
    titulo: $("c-titulo").value.trim(),
    url: $("c-url").value.trim(),
    descripcion: $("c-desc").value.trim() || null,
  };
  if (!fila.titulo) return msgCancion("Falta el título.", true);
  if (!/^https?:\/\//i.test(fila.url))
    return msgCancion("El link debe empezar por https://", true);

  $("c-guardar").disabled = true;
  let fallo = false;

  if (editCancionId) {
    const { data, error } = await sb
      .from("canciones")
      .update(fila)
      .eq("id", editCancionId)
      .select("id");
    fallo = !!error || !data || !data.length;
  } else {
    fila.orden = canciones.reduce((m, c) => Math.max(m, c.orden || 0), 0) + 1;
    const { error } = await sb.from("canciones").insert(fila);
    fallo = !!error;
  }
  $("c-guardar").disabled = false;

  if (fallo)
    return msgCancion("No se pudo guardar (¿tienes permisos de admin?).", true);

  limpiarCancion();
  await cargarCancionesAdmin();
  msgCancion("Canción guardada ✓");
  refrescarPortafolio();
}

// Envuelve el texto seleccionado con una marca (** o __)
function envolverSeleccion(marca) {
  const t = $("c-desc");
  const { selectionStart: s, selectionEnd: e, value: v } = t;
  if (s === e) {
    msgCancion("Selecciona primero la frase que quieres resaltar.", true);
    return;
  }
  t.value = v.slice(0, s) + marca + v.slice(s, e) + marca + v.slice(e);
  t.focus();
  t.setSelectionRange(s + marca.length, e + marca.length);
  msgCancion("");
}

/* ---------- eventos ---------- */

function conectarEventos() {
  $("menu-toggle").addEventListener("click", () =>
    sidebar.classList.toggle("open"),
  );

  sidebar.addEventListener("click", (e) => {
    const item = e.target.closest(".menu-item");
    if (!item) return;
    sidebar.classList.remove("open");
    if (item.dataset.accion === "admin") abrirAdmin();
    if (item.dataset.accion === "salir") cerrarSesion();
  });

  window.addEventListener("hashchange", route);

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    sidebar.classList.remove("open");
    $("admin").classList.add("hidden");
  });

  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("login-error").textContent = "";
    const { data, error } = await sb.auth.signInWithPassword({
      email: $("email").value.trim(),
      password: $("password").value,
    });
    if (error) {
      $("login-error").textContent = "Correo o contraseña incorrectos.";
      return;
    }
    $("password").value = "";
    await entrar(data.session);
  });

  // pestañas y cierre del panel
  $("tab-cartas").addEventListener("click", () => mostrarTab("cartas"));
  $("tab-canciones").addEventListener("click", () => mostrarTab("canciones"));
  $("a-cerrar").addEventListener("click", () =>
    $("admin").classList.add("hidden"),
  );

  // cartas
  $("a-modo").addEventListener("change", aplicarModo);
  $("admin-form").addEventListener("submit", guardar);
  $("a-limpiar").addEventListener("click", () => {
    limpiarFormulario();
    msgAdmin("");
  });
  $("a-archivo").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (f) $("a-html").value = await f.text();
  });
  $("admin-lista").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-accion]");
    if (!btn) return;
    const id = Number(btn.dataset.id);
    if (btn.dataset.accion === "editar") editar(id);
    if (btn.dataset.accion === "borrar") borrar(id);
  });

  // canciones
  $("cancion-form").addEventListener("submit", guardarCancion);
  $("c-limpiar").addEventListener("click", () => {
    limpiarCancion();
    msgCancion("");
  });
  $("c-negrilla").addEventListener("click", () => envolverSeleccion("**"));
  $("c-subrayado").addEventListener("click", () => envolverSeleccion("__"));
  $("canciones-lista").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-accion]");
    if (!btn) return;
    const id = Number(btn.dataset.id);
    if (btn.dataset.accion === "editar") editarCancion(id);
    if (btn.dataset.accion === "borrar") borrarCancion(id);
    if (btn.dataset.accion === "subir") moverCancion(id, -1);
    if (btn.dataset.accion === "bajar") moverCancion(id, 1);
  });
}

/* ---------- arranque ---------- */

async function iniciar() {
  conectarEventos();

  if (!window.supabase) {
    mostrarLogin("No se pudo cargar el sistema de sesión. Recarga la página.");
    return;
  }
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const {
    data: { session },
  } = await sb.auth.getSession();
  if (session) await entrar(session);
  else mostrarLogin();

  sb.auth.onAuthStateChange((evento) => {
    if (evento === "SIGNED_OUT") mostrarLogin();
  });
}

iniciar();
