/* =========================================================
   Cookbook engine — render recipes from JSON data
   ========================================================= */

const LANGS = ['de', 'en', 'fr', 'it'];
const LANG_LABELS = { de: 'DE', en: 'EN', fr: 'FR', it: 'IT' };
const CAT_LABELS = {
  de: { entree: 'Vorspeise', main: 'Hauptgericht', dessert: 'Dessert', side: 'Beilage', soup: 'Suppe', breakfast: 'Frühstück' },
  en: { entree: 'Starter', main: 'Main', dessert: 'Dessert', side: 'Side', soup: 'Soup', breakfast: 'Breakfast' },
  fr: { entree: 'Entrée', main: 'Plat', dessert: 'Dessert', side: 'Accompagnement', soup: 'Soupe', breakfast: 'Petit-déjeuner' },
  it: { entree: 'Antipasto', main: 'Piatto principale', dessert: 'Dolce', side: 'Contorno', soup: 'Zuppa', breakfast: 'Colazione' }
};

function pickLang(field, lang) {
  if (!field) return '';
  if (typeof field === 'string') return field;
  if (Array.isArray(field)) return field.join(' ');
  if (field[lang] && (Array.isArray(field[lang]) ? field[lang].length : field[lang])) return field[lang];
  // fallback: first language with content
  for (const l of LANGS) {
    if (field[l] && (Array.isArray(field[l]) ? field[l].length : field[l])) return field[l];
  }
  return '';
}

function availableLangs(recipe) {
  return LANGS.filter(l => {
    const t = recipe.title?.[l];
    return t && t.length > 0;
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ---------- Render a single recipe page ---------- */
function renderRecipe(recipe, lang) {
  const root = document.getElementById('recipe-root');
  if (!root) return;

  const cat = CAT_LABELS[lang]?.[recipe.category] || recipe.category;
  const servings = pickLang(recipe.servings, lang);
  const title = pickLang(recipe.title, lang);
  const subtitle = pickLang(recipe.subtitle, lang);
  const moodArr = recipe.mood?.[lang]?.length ? recipe.mood[lang] : (recipe.mood?.de || []);
  const finishedAlt = pickLang(recipe.finished?.alt, lang);

  // Render an ingredient group as HTML
  const renderGroup = (g) => `
    <h3>${escapeHtml(pickLang(g.name, lang))}</h3>
    <ul>
      ${g.items.map(item => `
        <li data-ing-id="${escapeHtml(item.id)}">
          <span class="qty">${escapeHtml(item.qty)}</span>
          <span class="name">${
            item.ref
              ? `<a href="../ingredients/${escapeHtml(item.ref)}.html">${escapeHtml(pickLang(item.name, lang))}</a>`
              : escapeHtml(pickLang(item.name, lang))
          }</span>
        </li>
      `).join('')}
    </ul>
  `;

  // Determine basket layout: support either `recipe.basket` (single, legacy)
  // or `recipe.baskets` (array, new). Each group may carry a `basket` field
  // referencing a basket id; groups with no basket id attach to the first basket
  // (or to the single basket if `recipe.basket` is used).
  const allGroups = recipe.ingredients?.groups || [];
  let baskets = [];
  if (Array.isArray(recipe.baskets) && recipe.baskets.length) {
    baskets = recipe.baskets;
  } else if (recipe.basket) {
    baskets = [Object.assign({ id: 'main' }, recipe.basket)];
  }

  const basketPairsHtml = baskets.map((b, i) => {
    const groupsForBasket = allGroups.filter(g =>
      g.basket ? g.basket === b.id : i === 0  // unassigned groups go to first basket
    );
    const bAlt = pickLang(b.alt, lang);
    const bTitle = pickLang(b.title, lang);
    return `
      <div class="basket-pair">
        <figure class="basket-figure">
          <img src="${escapeHtml(b.image || '')}" alt="${escapeHtml(bAlt)}">
          ${renderConnectors(b.connectors || {})}
        </figure>
        <div class="ingredient-list">
          ${bTitle ? `<div class="basket-label">${escapeHtml(bTitle)}</div>` : ''}
          ${groupsForBasket.map(renderGroup).join('')}
        </div>
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

  // Sources
  const sourcesHtml = (recipe.sources || []).map(src => {
    const lbl = pickLang(src.label, lang);
    if (src.type === 'url' && src.url) {
      return `<li><a href="${escapeHtml(src.url)}" target="_blank" rel="noopener">${escapeHtml(lbl)}</a></li>`;
    }
    return `<li>${escapeHtml(lbl)}</li>`;
  }).join('');

  // Notes
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
        <img src="${escapeHtml(recipe.finished?.image || '')}"
             alt="${escapeHtml(finishedAlt)}"
             style="object-position: ${escapeHtml(recipe.finished?.focal || 'center center')}">
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
}

/* ---------- SVG connectors between list items and basket photo ----------
   recipe.basket.connectors is a map of ingredient-id -> {x, y}
   x and y are percentages of the basket image (0–100)
   The SVG uses viewBox 0 0 100 100 and preserveAspectRatio="none"
   so coordinates are essentially in image-percentage space.
   List-item endpoints are computed in JS after layout.
*/
function renderConnectors(map) {
  const points = Object.entries(map).map(([id, p]) => `
    <circle cx="${p.x}" cy="${p.y}" r="0.8" data-target="${id}"/>
  `).join('');
  return `
    <svg class="connectors" viewBox="0 0 100 100" preserveAspectRatio="none">
      ${points}
    </svg>
  `;
}

/* ---------- Language switcher ---------- */
function mountLangSwitch(recipe, currentLang, onChange) {
  const el = document.getElementById('lang-switch');
  if (!el) return;
  const avail = availableLangs(recipe);
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

/* ---------- Boot a recipe page ---------- */
async function bootRecipe(dataPath) {
  const res = await fetch(dataPath);
  const recipe = await res.json();
  let lang = localStorage.getItem('cookbook-lang') || 'de';
  const avail = availableLangs(recipe);
  if (!avail.includes(lang)) lang = avail[0] || 'de';

  const draw = (l) => {
    lang = l;
    localStorage.setItem('cookbook-lang', l);
    renderRecipe(recipe, l);
    mountLangSwitch(recipe, l, draw);
  };
  draw(lang);
}

window.bootRecipe = bootRecipe;