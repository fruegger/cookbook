/* =========================================================
   Cookbook engine — render recipes & ingredients from JSON.

   Single render engine, used by:
     - recipe.html?id=recipe-001        (renderRecipe)
     - ingredient.html?id=tonkabohne    (renderIngredient)
     - recipes.html                     (recipe index — uses listing helpers)
     - ingredients.html                 (ingredient index)

   The engine never assumes file naming beyond what's in the registries
   (data/recipes.json, data/ingredients.json) — adding a recipe is a
   matter of dropping a JSON in data/ and registering it.
   ========================================================= */

const LANGS = ['de', 'en', 'fr', 'it'];
const LANG_LABELS = { de: 'DE', en: 'EN', fr: 'FR', it: 'IT' };
const CAT_LABELS = {
  de: { entree: 'Vorspeise', main: 'Hauptgericht', dessert: 'Dessert', side: 'Beilage', soup: 'Suppe', breakfast: 'Frühstück' },
  en: { entree: 'Starter', main: 'Main', dessert: 'Dessert', side: 'Side', soup: 'Soup', breakfast: 'Breakfast' },
  fr: { entree: 'Entrée', main: 'Plat', dessert: 'Dessert', side: 'Accompagnement', soup: 'Soupe', breakfast: 'Petit-déjeuner' },
  it: { entree: 'Antipasto', main: 'Piatto principale', dessert: 'Dolce', side: 'Contorno', soup: 'Zuppa', breakfast: 'Colazione' }
};

/* ---------- Generic helpers ---------- */

function pickLang(field, lang) {
  if (!field) return '';
  if (typeof field === 'string') return field;
  if (Array.isArray(field)) return field.join(' ');
  if (field[lang] && (Array.isArray(field[lang]) ? field[lang].length : field[lang])) return field[lang];
  for (const l of LANGS) {
    if (field[l] && (Array.isArray(field[l]) ? field[l].length : field[l])) return field[l];
  }
  return '';
}

function availableLangs(obj, key = 'title') {
  return LANGS.filter(l => {
    const t = obj?.[key]?.[l];
    return t && t.length > 0;
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function getQueryId() {
  return new URLSearchParams(location.search).get('id');
}

/* ---------- Ingredient registry (cached fetch) ----------
   Used by the recipe renderer so that an ingredient's "ref" can be
   resolved to a canonical name when the recipe doesn't override it,
   and to validate links to ingredient detail pages. */

let _ingredientRegistryPromise = null;
function loadIngredientRegistry() {
  if (!_ingredientRegistryPromise) {
    _ingredientRegistryPromise = fetch('data/ingredients.json')
      .then(r => r.ok ? r.json() : { ingredients: [] })
      .catch(() => ({ ingredients: [] }));
  }
  return _ingredientRegistryPromise;
}

function ingredientNameFromRegistry(registry, ref, lang) {
  const entry = registry?.ingredients?.find(i => i.id === ref);
  return entry ? pickLang(entry.name, lang) : '';
}

/* ============================================================
   RECIPE PAGE RENDERER
   ============================================================ */

function renderRecipe(recipe, lang, registry) {
  const root = document.getElementById('recipe-root');
  if (!root) return;

  const cat = CAT_LABELS[lang]?.[recipe.category] || recipe.category;
  const servings = pickLang(recipe.servings, lang);
  const title = pickLang(recipe.title, lang);
  const subtitle = pickLang(recipe.subtitle, lang);
  const moodArr = recipe.mood?.[lang]?.length ? recipe.mood[lang] : (recipe.mood?.de || []);
  const finishedAlt = pickLang(recipe.finished?.alt, lang);

  const renderGroup = (g) => `
    <h3>${escapeHtml(pickLang(g.name, lang))}</h3>
    <ul>
      ${g.items.map(item => {
        // Prefer the name on the item itself; fall back to the ingredient
        // registry, so unfilled translations still show something usable.
        const itemName =
          pickLang(item.name, lang) ||
          ingredientNameFromRegistry(registry, item.ref, lang) ||
          item.ref || '';
        return `
          <li data-ing-id="${escapeHtml(item.id)}">
            <span class="qty">${escapeHtml(item.qty || '')}</span>
            <span class="name">${
              item.ref
                ? `<a href="ingredient.html?id=${encodeURIComponent(item.ref)}">${escapeHtml(itemName)}</a>`
                : escapeHtml(itemName)
            }</span>
          </li>
        `;
      }).join('')}
    </ul>
  `;

  // Basket layout: support `recipe.basket` (single, legacy) or `recipe.baskets` (array).
  const allGroups = recipe.ingredients?.groups || [];
  let baskets = [];
  if (Array.isArray(recipe.baskets) && recipe.baskets.length) {
    baskets = recipe.baskets;
  } else if (recipe.basket) {
    baskets = [Object.assign({ id: 'main' }, recipe.basket)];
  }

  const basketPairsHtml = baskets.map((b, i) => {
    const groupsForBasket = allGroups.filter(g =>
      g.basket ? g.basket === b.id : i === 0
    );
    const bAlt = pickLang(b.alt, lang);
    const bTitle = pickLang(b.title, lang);
    return `
      <div class="basket-pair">
        <figure class="basket-figure">
          ${b.image
            ? `<img src="${escapeHtml(b.image)}" alt="${escapeHtml(bAlt)}">`
            : '<div class="basket-placeholder">Foto folgt</div>'}
        </figure>
        <div class="ingredient-list">
          ${bTitle ? `<div class="basket-label">${escapeHtml(bTitle)}</div>` : ''}
          ${groupsForBasket.map(renderGroup).join('')}
        </div>
        ${renderConnectors(b.connectors || {})}
      </div>
    `;
  }).join('');

  // Methods + steps
  const methodsHtml = (recipe.methods || []).map(m => `
    <section class="method">
      <h3 class="method-title">${escapeHtml(pickLang(m.name, lang))}</h3>
      <ol class="steps">
        ${m.steps.map(s => {
          const text = pickLang(s.text, lang);
          const warn = pickLang(s.warning, lang);
          const meta = [];
          if (s.time) meta.push(`<span class="time">${escapeHtml(s.time)}</span>`);
          (s.tools || []).forEach(t => meta.push(`<span class="tool">${escapeHtml(t)}</span>`));
          return `
            <li class="step" id="step-${escapeHtml(s.id)}">
              <div class="num"></div>
              <div class="body">
                <p>${escapeHtml(text)}</p>
                ${meta.length ? `<div class="meta">${meta.join('')}</div>` : ''}
                ${warn ? `<div class="warning">${escapeHtml(warn)}</div>` : ''}
              </div>
              <div class="photo">${
                s.photo
                  ? `<img src="${escapeHtml(s.photo)}" alt="">`
                  : '<span>Foto folgt</span>'
              }</div>
            </li>
          `;
        }).join('')}
      </ol>
    </section>
  `).join('');

  const sourcesHtml = (recipe.sources || []).map(src => {
    const lbl = pickLang(src.label, lang);
    if (src.type === 'url' && src.url) {
      return `<li><a href="${escapeHtml(src.url)}" target="_blank" rel="noopener">${escapeHtml(lbl)}</a></li>`;
    }
    return `<li>${escapeHtml(lbl)}</li>`;
  }).join('');

  const notesArr = recipe.notes?.[lang]?.length ? recipe.notes[lang] : (recipe.notes?.de || []);
  const notesHtml = notesArr.map(n => `<li>${escapeHtml(n)}</li>`).join('');

  root.innerHTML = `
    <article class="recipe-page">
      <header>
        <div class="recipe-meta">
          <span class="category">${escapeHtml(cat)}</span>
          <span class="servings">${escapeHtml(servings)}</span>
        </div>
        <h1 class="recipe-title">${escapeHtml(title)}</h1>
        ${subtitle ? `<p class="recipe-subtitle">${escapeHtml(subtitle)}</p>` : ''}
      </header>
      <figure class="hero">
        ${recipe.finished?.image
          ? `<img src="${escapeHtml(recipe.finished.image)}"
                  alt="${escapeHtml(finishedAlt)}"
                  style="object-position: ${escapeHtml(recipe.finished?.focal || 'center center')}">`
          : '<div class="basket-placeholder">Foto folgt</div>'}
      </figure>

      <div class="mood">
        ${moodArr.map(p => `<p>${escapeHtml(p)}</p>`).join('')}
      </div>

      <div class="section-eyebrow">Der Korb &amp; die Zutaten</div>
      ${basketPairsHtml}

      <div class="section-eyebrow">Zubereitung</div>
      <div class="methods">${methodsHtml}</div>

      <div class="colophon">
        <div>
          <h2>Inspiration &amp; Quellen</h2>
          <ul>${sourcesHtml}</ul>
        </div>
        <div>
          <h2>Notizen, Tricks, Trivia</h2>
          <ul>${notesHtml}</ul>
        </div>
      </div>
    </article>
  `;

  document.title = title + ' — Dinner für zwei';

  // Draw connector lines once the new DOM is in place. A second pass runs
  // when images load (handled inside wireConnectors). Also start observing
  // size changes so the lines stay in sync with the print transition.
  requestAnimationFrame(() => {
    wireConnectors(root);
    observeBasketPairs();
  });
}

/* ---------- SVG connectors between list items and basket photo ----------
   Two-stage rendering:
     1. renderConnectors(map) emits an empty <svg class="connectors"> sibling
        to the figure (inside .basket-pair) carrying the connector data as a
        JSON attribute. No geometry is computed at HTML-render time because
        we don't yet know where the <li> elements will land.
     2. wireConnectors() runs after the recipe is in the DOM, measures each
        <li data-ing-id="…"> and the basket figure, and writes <circle>+<line>
        elements into the SVG using pixel coordinates relative to .basket-pair.
   The pass is re-run on resize, on basket-image load, and on language switch.
*/
function renderConnectors(map) {
  const data = encodeURIComponent(JSON.stringify(map || {}));
  return `<svg class="connectors" data-connectors="${data}" aria-hidden="true"></svg>`;
}

function wireConnectors(root) {
  const scope = root || document;
  const svgNS = 'http://www.w3.org/2000/svg';

  scope.querySelectorAll('.basket-pair').forEach(pair => {
    const svg = pair.querySelector('svg.connectors');
    const figure = pair.querySelector('.basket-figure');
    const img = figure && figure.querySelector('img');
    const list = pair.querySelector('.ingredient-list');
    if (!svg || !figure || !list) return;

    let map = {};
    try {
      map = JSON.parse(decodeURIComponent(svg.dataset.connectors || '%7B%7D'));
    } catch { map = {}; }

    // Defer until the image has dimensions; otherwise the figure rect can be 0.
    if (img && !img.complete) {
      img.addEventListener('load', () => wireConnectors(scope), { once: true });
      img.addEventListener('error', () => wireConnectors(scope), { once: true });
    }

    const pairRect = pair.getBoundingClientRect();
    const figRect = figure.getBoundingClientRect();
    if (pairRect.width === 0 || figRect.width === 0) return;

    // Use a normalized 0-100 viewBox with preserveAspectRatio="none" so the
    // SVG stretches to whatever size the basket-pair takes — including the
    // very different print layout. This avoids needing to recompute pixel
    // coordinates for print (where getBoundingClientRect can't see the
    // print-specific layout).
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.position = 'absolute';
    svg.style.inset = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.pointerEvents = 'none';
    pair.style.position = pair.style.position || 'relative';
    svg.innerHTML = '';

    // Figure offset/size as percentages of the pair.
    const figXpct = ((figRect.left - pairRect.left) / pairRect.width) * 100;
    const figYpct = ((figRect.top - pairRect.top) / pairRect.height) * 100;
    const figWpct = (figRect.width / pairRect.width) * 100;
    const figHpct = (figRect.height / pairRect.height) * 100;

    Object.entries(map).forEach(([id, p]) => {
      const li = list.querySelector(`li[data-ing-id="${CSS.escape(id)}"]`);
      if (!li) return;
      const liRect = li.getBoundingClientRect();

      // Image-side endpoint, in percentages of the pair.
      const x1 = figXpct + (p.x / 100) * figWpct;
      const y1 = figYpct + (p.y / 100) * figHpct;

      // List-side endpoint: middle-left of the <li>, in percentages of the pair.
      const x2 = ((liRect.left - pairRect.left) / pairRect.width) * 100;
      const y2 = (((liRect.top - pairRect.top) + liRect.height / 2) / pairRect.height) * 100;

      // Line first (so circles sit on top). Stroke is set as attributes so
      // the line renders even if CSS doesn't apply (default <line> stroke
      // is 'none' — invisible). non-scaling-stroke keeps the line visually
      // ~1.25px regardless of the SVG's stretched aspect ratio.
      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', x1);
      line.setAttribute('y1', y1);
      line.setAttribute('x2', x2);
      line.setAttribute('y2', y2);
      line.setAttribute('stroke', '#2a2520');
      line.setAttribute('stroke-width', '1.25');
      line.setAttribute('stroke-opacity', '0.7');
      line.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.appendChild(line);

      const dot = document.createElementNS(svgNS, 'circle');
      // Circle in a stretched viewBox would become an ellipse, so place it
      // and size it in viewBox units — small enough that the distortion
      // is invisible.
      dot.setAttribute('cx', x1);
      dot.setAttribute('cy', y1);
      dot.setAttribute('r', 0.6);
      dot.setAttribute('fill', '#8b1e3f');
      dot.setAttribute('fill-opacity', '0.9');
      dot.setAttribute('data-target', id);
      svg.appendChild(dot);
    });
  });
}

// Re-wire on resize (debounced) and after fonts settle.
let _connectorRaf = null;
function scheduleConnectorRewire() {
  if (_connectorRaf) cancelAnimationFrame(_connectorRaf);
  _connectorRaf = requestAnimationFrame(() => {
    _connectorRaf = null;
    wireConnectors();
  });
}
window.addEventListener('resize', scheduleConnectorRewire);

// ResizeObserver catches every layout change to a basket-pair — including
// when the print stylesheet kicks in and resizes the columns. This is the
// most reliable trigger across browsers because it doesn't depend on the
// browser firing beforeprint or matchMedia('print') reliably.
let _resizeObserver = null;
function observeBasketPairs() {
  if (typeof ResizeObserver === 'undefined') return;
  if (_resizeObserver) _resizeObserver.disconnect();
  _resizeObserver = new ResizeObserver(scheduleConnectorRewire);
  document.querySelectorAll('.basket-pair').forEach(p => _resizeObserver.observe(p));
}

// Print handling: the screen and print layouts have different column ratios
// (1.1fr 1fr vs 0.85fr 1fr) and different image dimensions, so the lines must
// be recomputed when entering print and restored when leaving.
//
// `matchMedia('print').onchange` fires reliably with the print layout already
// applied, which beforeprint does not. We use both for browser coverage.
function rewireForPrint() {
  // Two passes: one immediate, one after a frame, because some browsers
  // apply print CSS in stages.
  wireConnectors();
  requestAnimationFrame(() => wireConnectors());
}
window.addEventListener('beforeprint', rewireForPrint);
window.addEventListener('afterprint', scheduleConnectorRewire);
if (window.matchMedia) {
  const mql = window.matchMedia('print');
  const onChange = () => {
    if (mql.matches) rewireForPrint();
    else scheduleConnectorRewire();
  };
  if (mql.addEventListener) mql.addEventListener('change', onChange);
  else if (mql.addListener) mql.addListener(onChange); // older Safari
}
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => wireConnectors());
}

/* ---------- Language switcher ---------- */
function mountLangSwitch(obj, currentLang, onChange, key = 'title') {
  const el = document.getElementById('lang-switch');
  if (!el) return;
  const avail = availableLangs(obj, key);
  el.innerHTML = LANGS.map(l => {
    const active = l === currentLang ? 'active' : '';
    const disabled = avail.includes(l) ? '' : 'disabled';
    return `<button class="${active}" ${disabled} data-lang="${l}">${LANG_LABELS[l]}</button>`;
  }).join('');
  el.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      if (b.disabled) return;
      onChange(b.dataset.lang);
    });
  });
}

/* ---------- Boot a recipe page ----------
   Modes:
     bootRecipe()                — read id from URL, fetch data/recipe-<id>.json
     bootRecipe('path/to.json')  — explicit path (legacy/back-compat)
     bootRecipe({ data: obj })   — render an in-memory object (used by editor preview)
*/
async function bootRecipe(arg) {
  let recipe;
  if (arg && typeof arg === 'object' && arg.data) {
    recipe = arg.data;
  } else if (typeof arg === 'string') {
    const res = await fetch(arg);
    recipe = await res.json();
  } else {
    const id = getQueryId();
    if (!id) {
      document.getElementById('recipe-root').innerHTML =
        '<p style="padding:2rem">Kein Rezept angegeben. <a href="recipes.html">Zur Übersicht</a></p>';
      return;
    }
    const res = await fetch(`data/${id}.json`);
    if (!res.ok) {
      document.getElementById('recipe-root').innerHTML =
        `<p style="padding:2rem">Rezept <code>${escapeHtml(id)}</code> nicht gefunden.</p>`;
      return;
    }
    recipe = await res.json();
  }

  const registry = await loadIngredientRegistry();

  let lang = localStorage.getItem('cookbook-lang') || 'de';
  const avail = availableLangs(recipe);
  if (!avail.includes(lang)) lang = avail[0] || 'de';

  const draw = (l) => {
    lang = l;
    localStorage.setItem('cookbook-lang', l);
    renderRecipe(recipe, l, registry);
    mountLangSwitch(recipe, l, draw);
  };
  draw(lang);
}

/* ============================================================
   INGREDIENT PAGE RENDERER
   ============================================================ */

async function renderIngredient(ing, lang, registry) {
  const root = document.getElementById('ingredient-root');
  if (!root) return;

  const name = pickLang(ing.name, lang);
  const desc = pickLang(ing.description, lang);
  const origin = pickLang(ing.origin, lang);
  const seasonality = pickLang(ing.seasonality, lang);
  const tips = pickLang(ing.tips, lang);
  const imgAlt = pickLang(ing.image_alt, lang);

  // Backlinks: which recipes use this ingredient?
  const recipesRes = await fetch('data/recipes.json').then(r => r.json()).catch(() => ({ recipes: [] }));
  const usedIn = (ing.usedIn || [])
    .map(id => recipesRes.recipes.find(r => r.id === id))
    .filter(Boolean);

  const usedHtml = usedIn.length
    ? `<ul>${usedIn.map(r => `<li><a href="${escapeHtml(r.href)}">${escapeHtml(pickLang(r.title, lang))}</a></li>`).join('')}</ul>`
    : '<p style="color:var(--ink-faint)">—</p>';

  const nutritionRows = [
    ['Energie', ing.nutrition?.energy],
    ['Kohlenhydrate', ing.nutrition?.carbs],
    ['Fett', ing.nutrition?.fat],
    ['Eiweiss', ing.nutrition?.protein]
  ].filter(([, v]) => v).map(([k, v]) =>
    `<li><span class="qty">${escapeHtml(k)}</span><span class="name">${escapeHtml(v)}</span></li>`
  ).join('') || '<li style="color:var(--ink-faint)">—</li>';

  root.innerHTML = `
    <article class="recipe-page">
      <div class="recipe-meta">
        <span class="category">Zutat</span>
        <span class="servings">Steckbrief</span>
      </div>
      <h1 class="recipe-title">${escapeHtml(name)}</h1>
      ${ing.latin ? `<p class="recipe-subtitle"><em>${escapeHtml(ing.latin)}</em></p>` : ''}

      <div class="basket-pair" style="margin-top:2rem">
        <figure class="basket-figure">
          ${ing.image
            ? `<img src="${escapeHtml(ing.image)}" alt="${escapeHtml(imgAlt)}">`
            : '<div class="basket-placeholder">Foto folgt</div>'}
        </figure>
        <div class="ingredient-list">
          <h3>Beschreibung</h3>
          <p style="font-family:var(--serif);font-size:1.05rem;line-height:1.5">${escapeHtml(desc) || '<span style="color:var(--ink-faint)">—</span>'}</p>

          <h3>Nährwerte (pro ${escapeHtml(ing.nutrition?._per || '100 g')})</h3>
          <ul>${nutritionRows}</ul>

          <h3>Herkunft &amp; Saison</h3>
          <p style="font-family:var(--serif);font-size:1.05rem">${escapeHtml(origin) || '<span style="color:var(--ink-faint)">—</span>'}<br>${escapeHtml(seasonality)}</p>

          <h3>Verwendung &amp; Tricks</h3>
          <p style="font-family:var(--serif);font-size:1.05rem">${escapeHtml(tips) || '<span style="color:var(--ink-faint)">—</span>'}</p>

          <h3>Verwendet in</h3>
          ${usedHtml}
        </div>
      </div>

      <p style="margin-top:3rem"><a href="recipes.html">← Zu allen Rezepten</a></p>
    </article>
  `;

  document.title = name + ' — Dinner für zwei';
}

async function bootIngredient(arg) {
  let ing;
  if (arg && typeof arg === 'object' && arg.data) {
    ing = arg.data;
  } else {
    const id = getQueryId();
    if (!id) {
      document.getElementById('ingredient-root').innerHTML =
        '<p style="padding:2rem">Keine Zutat angegeben.</p>';
      return;
    }
    const res = await fetch(`data/ingredients/${id}.json`);
    if (!res.ok) {
      document.getElementById('ingredient-root').innerHTML =
        `<p style="padding:2rem">Zutat <code>${escapeHtml(id)}</code> nicht gefunden.</p>`;
      return;
    }
    ing = await res.json();
  }

  const registry = await loadIngredientRegistry();

  let lang = localStorage.getItem('cookbook-lang') || 'de';
  const avail = availableLangs(ing, 'name');
  if (!avail.includes(lang)) lang = avail[0] || 'de';

  const draw = (l) => {
    lang = l;
    localStorage.setItem('cookbook-lang', l);
    renderIngredient(ing, l, registry);
    mountLangSwitch(ing, l, draw, 'name');
  };
  draw(lang);
}

/* ---------- Public API ---------- */
window.bootRecipe = bootRecipe;
window.bootIngredient = bootIngredient;
window.cookbook = {
  pickLang, escapeHtml, LANGS, LANG_LABELS, CAT_LABELS,
  renderRecipe, renderIngredient, loadIngredientRegistry
};