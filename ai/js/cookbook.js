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
  de: { entree: 'Vorspeise', main: 'Hauptgericht', dessert: 'Dessert', side: 'Beilage', soup: 'Suppe', breakfast: 'Frühstück', bread: 'Brot', sauce: 'Sosse' },
  en: { entree: 'Starter', main: 'Main', dessert: 'Dessert', side: 'Side', soup: 'Soup', breakfast: 'Breakfast', bread: 'Bread', sauce: 'Sauce' },
  fr: { entree: 'Entrée', main: 'Plat', dessert: 'Dessert', side: 'Accompagnement', soup: 'Soupe', breakfast: 'Petit-déjeuner', bread: 'Pain', sauce: 'Sauce' },
  it: { entree: 'Antipasto', main: 'Piatto principale', dessert: 'Dolce', side: 'Contorno', soup: 'Zuppa', breakfast: 'Colazione', bread: 'Pane', sauce: 'Salsa' }
};

/* Interface chrome — section headings, labels, placeholders, status
   messages. Not recipe/ingredient content (that's all authored per-recipe
   in the JSON), just the fixed text the app itself prints around it. */
const UI_LABELS = {
  brandName:           { de: 'Dinner für zwei', en: 'Dinner for Two', fr: 'Dîner pour deux', it: 'Cena per due' },
  basketSection:      { de: 'Der Korb & die Zutaten', en: 'The Basket & Ingredients', fr: 'Le Panier & les Ingrédients', it: 'Il Cestino & gli Ingredienti' },
  prepSection:         { de: 'Zubereitung', en: 'Preparation', fr: 'Préparation', it: 'Preparazione' },
  sourcesTitle:        { de: 'Inspiration & Quellen', en: 'Inspiration & Sources', fr: 'Inspiration & Sources', it: 'Ispirazione & Fonti' },
  notesTitle:          { de: 'Notizen, Tricks, Trivia', en: 'Notes, Tricks & Trivia', fr: 'Notes, Astuces & Anecdotes', it: 'Note, Trucchi e Curiosità' },
  photoSoon:           { de: 'Foto folgt', en: 'Photo coming soon', fr: 'Photo à venir', it: 'Foto in arrivo' },
  ingredientTag:       { de: 'Zutat', en: 'Ingredient', fr: 'Ingrédient', it: 'Ingrediente' },
  ingredientProfile:   { de: 'Steckbrief', en: 'Profile', fr: 'Fiche', it: 'Scheda' },
  descriptionTitle:    { de: 'Beschreibung', en: 'Description', fr: 'Description', it: 'Descrizione' },
  nutritionTitle:      { de: 'Nährwerte (pro {per})', en: 'Nutrition (per {per})', fr: 'Valeurs nutritionnelles (pour {per})', it: 'Valori nutrizionali (per {per})' },
  originSeasonTitle:   { de: 'Herkunft & Saison', en: 'Origin & Season', fr: 'Origine & Saison', it: 'Origine & Stagionalità' },
  usageTricksTitle:    { de: 'Verwendung & Tricks', en: 'Uses & Tricks', fr: 'Utilisation & Astuces', it: 'Utilizzo & Trucchi' },
  usedInTitle:         { de: 'Verwendet in', en: 'Used in', fr: 'Utilisé dans', it: 'Utilizzato in' },
  backToRecipes:       { de: '← Zu allen Rezepten', en: '← Back to all recipes', fr: '← Retour à toutes les recettes', it: '← Torna a tutte le ricette' },
  nrgLabel:            { de: 'Energie', en: 'Energy', fr: 'Énergie', it: 'Energia' },
  carbsLabel:          { de: 'Kohlenhydrate', en: 'Carbohydrates', fr: 'Glucides', it: 'Carboidrati' },
  fatLabel:            { de: 'Fett', en: 'Fat', fr: 'Lipides', it: 'Grassi' },
  proteinLabel:        { de: 'Eiweiss', en: 'Protein', fr: 'Protéines', it: 'Proteine' },
  noRecipeGiven:       { de: 'Kein Rezept angegeben.', en: 'No recipe specified.', fr: 'Aucune recette spécifiée.', it: 'Nessuna ricetta specificata.' },
  backToOverview:      { de: 'Zur Übersicht', en: 'Back to overview', fr: "Retour à l'aperçu", it: 'Torna alla panoramica' },
  recipeNotFound:      { de: 'Rezept {id} nicht gefunden.', en: 'Recipe {id} not found.', fr: 'Recette {id} introuvable.', it: 'Ricetta {id} non trovata.' },
  noIngredientGiven:   { de: 'Keine Zutat angegeben.', en: 'No ingredient specified.', fr: 'Aucun ingrédient spécifié.', it: 'Nessun ingrediente specificato.' },
  ingredientNotFound:  { de: 'Zutat {id} nicht gefunden.', en: 'Ingredient {id} not found.', fr: 'Ingrédient {id} introuvable.', it: 'Ingrediente {id} non trovato.' },
  navRecipes:          { de: 'Rezepte', en: 'Recipes', fr: 'Recettes', it: 'Ricette' },
  navIngredients:      { de: 'Zutaten', en: 'Ingredients', fr: 'Ingrédients', it: 'Ingredienti' },
  navEditor:           { de: 'Editor', en: 'Editor', fr: 'Éditeur', it: 'Editor' },
  navPrint:            { de: 'Drucken', en: 'Print', fr: 'Imprimer', it: 'Stampa' },
  ctaToRecipes:        { de: 'Zu den Rezepten →', en: 'To the recipes →', fr: 'Aux recettes →', it: 'Alle ricette →' },
  tagRecipes:          { de: 'Rezepte, gesammelt und mit Liebe weitergegeben.', en: 'Recipes, collected and passed on with love.', fr: 'Recettes, rassemblées et transmises avec amour.', it: 'Ricette, raccolte e tramandate con amore.' },
  tagIngredients:      { de: 'Steckbriefe der Zutaten — Herkunft, Saison, Tricks.', en: 'Ingredient profiles — origin, season, tricks.', fr: 'Fiches des ingrédients — origine, saison, astuces.', it: 'Schede degli ingredienti — origine, stagionalità, trucchi.' },
  noRecipesInCategory: { de: 'Keine Rezepte in dieser Kategorie.', en: 'No recipes in this category.', fr: 'Aucune recette dans cette catégorie.', it: 'Nessuna ricetta in questa categoria.' },
  noIngredientsYet:    { de: 'Noch keine Zutaten erfasst.', en: 'No ingredients recorded yet.', fr: "Aucun ingrédient enregistré pour l'instant.", it: 'Nessun ingrediente ancora registrato.' },
  allCategoriesLabel:  { de: 'Alle', en: 'All', fr: 'Tous', it: 'Tutti' },
  recipeCountOne:      { de: '{n} Rezept', en: '{n} recipe', fr: '{n} recette', it: '{n} ricetta' },
  recipeCountMany:     { de: '{n} Rezepte', en: '{n} recipes', fr: '{n} recettes', it: '{n} ricette' }
};

/* Looks up a UI_LABELS entry for lang (falling back through LANGS like
   pickLang), then substitutes any {placeholder} tokens from vars. */
function t(key, lang, vars) {
  const entry = UI_LABELS[key];
  if (!entry) return key;
  let str = entry[lang] || entry.de || '';
  if (vars) {
    for (const k in vars) str = str.replace(`{${k}}`, vars[k]);
  }
  return str;
}

function recipeCountLabel(n, lang) {
  return t(n === 1 ? 'recipeCountOne' : 'recipeCountMany', lang, { n });
}

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

/* Tools can be stored either as a plain array (legacy, still used by
   recipe-002/003) or as a per-language object like other i18n fields
   (e.g. { de: [...], en: [...] }). This resolves either shape for display,
   falling back across languages the same way pickLang does. */
function pickTools(tools, lang) {
  if (!tools) return [];
  if (Array.isArray(tools)) return tools;
  if (tools[lang] && tools[lang].length) return tools[lang];
  for (const l of LANGS) {
    if (tools[l] && tools[l].length) return tools[l];
  }
  return [];
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
            <span class="qty">${escapeHtml(pickLang(item.qty, lang))}</span>
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
            ? `<img src="${escapeHtml(b.image)}" alt="${escapeHtml(bAlt)}" onload="window.cookbook && window.cookbook.layoutBasketConnectors(this.closest('.basket-pair'))">`
            : `<div class="basket-placeholder">${escapeHtml(t('photoSoon', lang))}</div>`}
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
          pickTools(s.tools, lang).forEach(t => meta.push(`<span class="tool">${escapeHtml(t)}</span>`));
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
                  : `<span>${escapeHtml(t('photoSoon', lang))}</span>`
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

      <div class="section-eyebrow">${escapeHtml(t('basketSection', lang))}</div>
      ${basketPairsHtml}

      <div class="section-eyebrow">${escapeHtml(t('prepSection', lang))}</div>
      <div class="methods">${methodsHtml}</div>

      <div class="colophon">
        <div>
          <h2>${escapeHtml(t('sourcesTitle', lang))}</h2>
          <ul>${sourcesHtml}</ul>
        </div>
        <div>
          <h2>${escapeHtml(t('notesTitle', lang))}</h2>
          <ul>${notesHtml}</ul>
        </div>
      </div>
    </article>
  `;

  document.title = title + ' — ' + t('brandName', lang);

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => layoutBasketConnectors(root));
  } else {
    layoutBasketConnectors(root);
  }
}

/* ---------- SVG connectors between list items and basket photo ----------
   The dots are authored as percentages across the *photo* (x/y: 0-100).
   The actual pixel position of each dot, and the line reaching to its
   matching ingredient row, can only be known after layout (row heights
   depend on translated text length), so the raw data is stashed on the
   <svg> itself and layoutBasketConnectors() rebuilds circles+lines from
   it on demand. This also means a not-yet-laid-out container (zero-size
   measurement) never permanently loses the connector data — it's always
   available to redraw once real layout is possible. */
function renderConnectors(map) {
  if (!map || !Object.keys(map).length) return '';
  return `<svg class="connectors" preserveAspectRatio="none" data-connectors='${escapeHtml(JSON.stringify(map))}'></svg>`;
}

/* Measures the rendered DOM and (re)draws each dot over the photo, plus a
   line reaching to the matching ingredient row in the list. Safe to call
   repeatedly (e.g. after language switches, resize, or print) since it
   always rebuilds from the connector data stored on the svg, never from
   whatever happens to be in the DOM already. If the container isn't
   measurable yet (zero size — e.g. a hidden tab, or a not-yet-painted
   first frame) it retries once on the next frame instead of giving up. */
function layoutBasketConnectors(scope, _isRetry) {
  const root = scope || document;
  const pairs = root.matches && root.matches('.basket-pair')
    ? [root]
    : root.querySelectorAll('.basket-pair');
  pairs.forEach(pair => {
    const svg = pair.querySelector(':scope > svg.connectors');
    if (!svg) return;
    let map;
    try { map = JSON.parse(svg.dataset.connectors || '{}'); } catch { map = {}; }
    if (!Object.keys(map).length) return;

    const img = pair.querySelector('.basket-figure img');
    const pairRect = pair.getBoundingClientRect();
    if (!img || !pairRect.width || !pairRect.height) {
      // Not laid out yet — leave existing content untouched and retry
      // once on the next frame rather than destructively clearing.
      if (!_isRetry && typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => layoutBasketConnectors(pair, true));
      }
      return;
    }
    const imgRect = img.getBoundingClientRect();

    svg.setAttribute('viewBox', `0 0 ${pairRect.width} ${pairRect.height}`);

    const listItems = pair.querySelectorAll('.ingredient-list li[data-ing-id]');
    const parts = [];
    Object.entries(map).forEach(([targetId, p]) => {
      const cx = (imgRect.left - pairRect.left) + (p.x / 100) * imgRect.width;
      const cy = (imgRect.top - pairRect.top) + (p.y / 100) * imgRect.height;

      const li = Array.from(listItems).find(el => el.dataset.ingId === targetId);
      if (li) {
        const liRect = li.getBoundingClientRect();
        const x2 = liRect.left - pairRect.left;
        const y2 = liRect.top - pairRect.top + liRect.height / 2;
        parts.push(`<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}"/>`);
      }
      parts.push(`<circle class="connector-dot" data-target="${escapeHtml(targetId)}" cx="${cx}" cy="${cy}" r="3.5"/>`);
    });
    svg.innerHTML = parts.join('');
  });
}

// Recompute on resize (row heights and photo box both change), debounced.
let _connectorResizeTimer = null;
if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    clearTimeout(_connectorResizeTimer);
    _connectorResizeTimer = setTimeout(() => layoutBasketConnectors(document), 100);
  });
  // Print uses a different (mm-based) box for the photo (see cookbook.css),
  // so coordinates computed for screen layout don't carry over — recompute
  // right before printing, and again after in case the user cancels.
  window.addEventListener('beforeprint', () => layoutBasketConnectors(document));
  window.addEventListener('afterprint', () => layoutBasketConnectors(document));
}

/* ---------- Site chrome (brand + nav) ----------
   The header — brand name, nav links, print link — is static HTML
   repeated in every page (not generated by this file), so it doesn't
   update automatically on language switch. Call this whenever the
   language changes to keep it in sync. */
function applyChrome(lang) {
  const brandLink = document.querySelector('.brand a');
  if (brandLink) brandLink.textContent = t('brandName', lang);

  const navKeyByHref = {
    'recipes.html': 'navRecipes',
    'ingredients.html': 'navIngredients',
    'editor.html': 'navEditor'
  };
  document.querySelectorAll('.topnav nav a[href]').forEach(a => {
    const key = navKeyByHref[a.getAttribute('href')];
    if (key) a.textContent = t(key, lang);
  });
  const printLink = document.querySelector('.topnav nav a[onclick*="print"]');
  if (printLink) printLink.textContent = t('navPrint', lang);
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
    const bootLang = localStorage.getItem('cookbook-lang') || 'de';
    if (!id) {
      document.getElementById('recipe-root').innerHTML =
        `<p style="padding:2rem">${escapeHtml(t('noRecipeGiven', bootLang))} <a href="recipes.html">${escapeHtml(t('backToOverview', bootLang))}</a></p>`;
      return;
    }
    const res = await fetch(`data/${id}.json`);
    if (!res.ok) {
      document.getElementById('recipe-root').innerHTML =
        `<p style="padding:2rem">${escapeHtml(t('recipeNotFound', bootLang, { id }))}</p>`;
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
    applyChrome(l);
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
    [t('nrgLabel', lang), ing.nutrition?.energy],
    [t('carbsLabel', lang), ing.nutrition?.carbs],
    [t('fatLabel', lang), ing.nutrition?.fat],
    [t('proteinLabel', lang), ing.nutrition?.protein]
  ].filter(([, v]) => v).map(([k, v]) =>
    `<li><span class="qty">${escapeHtml(k)}</span><span class="name">${escapeHtml(v)}</span></li>`
  ).join('') || '<li style="color:var(--ink-faint)">—</li>';

  root.innerHTML = `
    <article class="recipe-page">
      <div class="recipe-meta">
        <span class="category">${escapeHtml(t('ingredientTag', lang))}</span>
        <span class="servings">${escapeHtml(t('ingredientProfile', lang))}</span>
      </div>
      <h1 class="recipe-title">${escapeHtml(name)}</h1>
      ${ing.latin ? `<p class="recipe-subtitle"><em>${escapeHtml(ing.latin)}</em></p>` : ''}

      <div class="basket-pair" style="margin-top:2rem">
        <figure class="basket-figure">
          ${ing.image
            ? `<img src="${escapeHtml(ing.image)}" alt="${escapeHtml(imgAlt)}">`
            : `<div class="basket-placeholder">${escapeHtml(t('photoSoon', lang))}</div>`}
        </figure>
        <div class="ingredient-list">
          <h3>${escapeHtml(t('descriptionTitle', lang))}</h3>
          <p style="font-family:var(--serif);font-size:1.05rem;line-height:1.5">${escapeHtml(desc) || '<span style="color:var(--ink-faint)">—</span>'}</p>

          <h3>${escapeHtml(t('nutritionTitle', lang, { per: ing.nutrition?._per || '100 g' }))}</h3>
          <ul>${nutritionRows}</ul>

          <h3>${escapeHtml(t('originSeasonTitle', lang))}</h3>
          <p style="font-family:var(--serif);font-size:1.05rem">${escapeHtml(origin) || '<span style="color:var(--ink-faint)">—</span>'}<br>${escapeHtml(seasonality)}</p>

          <h3>${escapeHtml(t('usageTricksTitle', lang))}</h3>
          <p style="font-family:var(--serif);font-size:1.05rem">${escapeHtml(tips) || '<span style="color:var(--ink-faint)">—</span>'}</p>

          <h3>${escapeHtml(t('usedInTitle', lang))}</h3>
          ${usedHtml}
        </div>
      </div>

      <p style="margin-top:3rem"><a href="recipes.html">${escapeHtml(t('backToRecipes', lang))}</a></p>
    </article>
  `;

  document.title = name + ' — ' + t('brandName', lang);
}

async function bootIngredient(arg) {
  let ing;
  if (arg && typeof arg === 'object' && arg.data) {
    ing = arg.data;
  } else {
    const id = getQueryId();
    const bootLang = localStorage.getItem('cookbook-lang') || 'de';
    if (!id) {
      document.getElementById('ingredient-root').innerHTML =
        `<p style="padding:2rem">${escapeHtml(t('noIngredientGiven', bootLang))}</p>`;
      return;
    }
    const res = await fetch(`data/ingredients/${id}.json`);
    if (!res.ok) {
      document.getElementById('ingredient-root').innerHTML =
        `<p style="padding:2rem">${escapeHtml(t('ingredientNotFound', bootLang, { id }))}</p>`;
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
    applyChrome(l);
  };
  draw(lang);
}

/* ---------- Public API ---------- */
window.bootRecipe = bootRecipe;
window.bootIngredient = bootIngredient;
window.cookbook = {
  pickLang, pickTools, escapeHtml, LANGS, LANG_LABELS, CAT_LABELS, UI_LABELS, t, applyChrome, recipeCountLabel,
  renderRecipe, renderIngredient, loadIngredientRegistry, layoutBasketConnectors
};