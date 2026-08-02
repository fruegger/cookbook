/* =========================================================
   Cookbook editor — form + live preview.

   State model:
     state.type    = 'recipe' | 'ingredient'
     state.id      = current id (e.g. 'recipe-001'), or null for new
     state.data    = the JSON object being edited
     state.lang    = active language for i18n input fields ('de'|'en'|'fr'|'it')

   Rendering:
     - renderForm()    rebuilds left-side form from state.data
     - renderPreview() invokes cookbook engine on state.data (no fetch)
     Both are called on any change, so the preview is always live.

   Persistence:
     - Save tries PUT /api/<type>s/<id>  → JSON body
     - On 404/network error, falls back to triggering a JSON file download
   ========================================================= */

const TYPES = ['recipe', 'ingredient', 'dedication', 'book'];
const CATEGORIES = ['entree', 'main', 'dessert', 'side', 'soup', 'breakfast'];

const state = {
  type: 'recipe',
  id: null,
  data: null,
  lang: localStorage.getItem('cookbook-lang') || 'de',
  dirty: false
};

// Cache of the recipe/dedication registries, needed synchronously while
// building the book form (picking a dedication, listing recipes to add).
// Populated by ensureBookRegistries() whenever entering 'book' mode.
let _recipesCache = null;
let _dedicationsCache = null;
async function ensureBookRegistries() {
  if (!_recipesCache) {
    _recipesCache = await fetch('data/recipes.json').then(r => r.json()).catch(() => ({ recipes: [] }));
  }
  if (!_dedicationsCache) {
    _dedicationsCache = await fetch('data/dedications.json').then(r => r.json()).catch(() => ({ dedications: [] }));
  }
}

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

/* ---------- Skeletons for new objects ---------- */

function emptyI18n() { return { de: '', en: '', fr: '', it: '' }; }
function emptyI18nList() { return { de: [], en: [], fr: [], it: [] }; }

function newRecipe() {
  return {
    id: '',
    category: 'main',
    servings: { de: 'für 2 Personen', en: 'serves 2', fr: 'pour 2 personnes', it: 'per 2 persone' },
    title: emptyI18n(),
    subtitle: emptyI18n(),
    mood: emptyI18nList(),
    basket: { image: '', alt: emptyI18n(), connectors: {} },
    ingredients: { groups: [{ name: emptyI18n(), items: [] }] },
    methods: [{ name: emptyI18n(), steps: [] }],
    finished: { image: '', alt: emptyI18n() },
    sources: [],
    notes: emptyI18nList()
  };
}

function newIngredient() {
  return {
    id: '',
    name: emptyI18n(),
    latin: '',
    image: '',
    image_alt: emptyI18n(),
    description: emptyI18n(),
    nutrition: { energy: '', carbs: '', fat: '', protein: '', _per: '100 g' },
    origin: emptyI18n(),
    seasonality: emptyI18n(),
    tips: emptyI18n(),
    usedIn: []
  };
}

function newDedication() {
  return {
    id: '',
    title: emptyI18n(),
    salutation: emptyI18n(),
    image: '',
    imageAlt: emptyI18n(),
    body: emptyI18nList(),
    signoff: emptyI18n()
  };
}

function newBook() {
  return {
    id: '',
    title: emptyI18n(),
    dedicationId: '',
    recipeIds: []
  };
}

function newForType(type) {
  if (type === 'recipe') return newRecipe();
  if (type === 'ingredient') return newIngredient();
  if (type === 'dedication') return newDedication();
  if (type === 'book') return newBook();
}

/* Tools can be a legacy plain array or a per-language object. For editing
   we want the *current* language's list only (no cross-language fallback),
   so typing in EN never shows/overwrites DE's tools. Legacy plain arrays
   are treated as German until the step is edited (see wireToolsInputs). */
/* Same idea as toolsRawFor, generalized: a field that may be a legacy
   plain string or a per-language object. Returns the current language's
   value with no cross-language fallback (for editing), treating a legacy
   plain string as German until the field is edited. */
function i18nRawFor(field, lang) {
  if (!field) return '';
  if (typeof field === 'string') return lang === 'de' ? field : '';
  return field[lang] || '';
}

function toolsRawFor(tools, lang) {
  if (!tools) return [];
  if (Array.isArray(tools)) return lang === 'de' ? tools : [];
  return tools[lang] || [];
}

/* ---------- Tiny helpers for nested form bindings ---------- */

function get(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function set(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* Wire all [data-path] inputs to state.data after rendering. */
function wireInputs() {
  $$('[data-path]').forEach(el => {
    const path = el.dataset.path;
    const current = get(state.data, path);
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.tagName === 'SELECT') {
      el.value = current ?? '';
      el.addEventListener('input', () => {
        set(state.data, path, el.value);
        markDirty();
        renderPreview();
      });
    }
  });
}

/* Wire array-list inputs (mood paragraphs, notes paragraphs). One textarea
   per paragraph, plus add/remove buttons. */
function paragraphList(label, basePath) {
  const arr = get(state.data, `${basePath}.${state.lang}`) || [];
  const rows = arr.map((p, i) => `
    <div class="repeating-row">
      <div class="row-head">
        <span>Absatz ${i + 1}</span>
        <button type="button" data-action="remove-paragraph" data-base="${basePath}" data-idx="${i}" title="Entfernen">✕</button>
      </div>
      <textarea data-paragraph="${basePath}" data-idx="${i}">${escapeHtml(p)}</textarea>
    </div>
  `).join('');
  return `
    <label>${escapeHtml(label)} (${state.lang.toUpperCase()})</label>
    ${rows}
    <div class="row-actions">
      <button type="button" data-action="add-paragraph" data-base="${basePath}">+ Absatz hinzufügen</button>
    </div>
  `;
}

/* ---------- Recipe form sections ---------- */

function recipeFormHtml() {
  const d = state.data;
  return `
    <fieldset>
      <legend>Identifikation</legend>
      <label>ID (z. B. recipe-004)</label>
      <input type="text" data-path="id" />
      <label>Kategorie</label>
      <select data-path="category">
        ${CATEGORIES.map(c => `<option value="${c}" ${c === d.category ? 'selected' : ''}>${c}</option>`).join('')}
      </select>
    </fieldset>

    <fieldset>
      <legend>Titel & Metadaten (${state.lang.toUpperCase()})</legend>
      <label>Titel</label>
      <input type="text" data-path="title.${state.lang}" />
      <label>Untertitel</label>
      <input type="text" data-path="subtitle.${state.lang}" />
      <label>Personenzahl / Portionen</label>
      <input type="text" data-path="servings.${state.lang}" />
    </fieldset>

    <fieldset>
      <legend>Stimmung</legend>
      ${paragraphList('Stimmungstext (Absätze)', 'mood')}
    </fieldset>

    <fieldset>
      <legend>Korbfoto</legend>
      <label>Bildpfad</label>
      <input type="text" data-path="basket.image" placeholder="assets/photos/recipe-004/basket.jpeg" />
      <label>Alt-Text (${state.lang.toUpperCase()})</label>
      <input type="text" data-path="basket.alt.${state.lang}" />
    </fieldset>

    ${ingredientGroupsHtml()}

    ${methodsHtml()}

    <fieldset>
      <legend>Hero-Foto (fertiges Gericht)</legend>
      <label>Bildpfad</label>
      <input type="text" data-path="finished.image" placeholder="assets/photos/recipe-004/finished.jpeg" />
      <label>Alt-Text (${state.lang.toUpperCase()})</label>
      <input type="text" data-path="finished.alt.${state.lang}" />
    </fieldset>

    ${sourcesHtml()}

    <fieldset>
      <legend>Notizen, Tricks, Trivia</legend>
      ${paragraphList('Notizen (eine pro Absatz)', 'notes')}
    </fieldset>
  `;
}

function ingredientGroupsHtml() {
  const groups = state.data.ingredients?.groups || [];
  return `
    <fieldset>
      <legend>Zutatengruppen</legend>
      ${groups.map((g, gi) => `
        <div class="repeating-row">
          <div class="row-head">
            <span>Gruppe ${gi + 1}</span>
            <button type="button" data-action="remove-group" data-idx="${gi}" title="Gruppe entfernen">✕</button>
          </div>
          <label>Gruppenname (${state.lang.toUpperCase()})</label>
          <input type="text" data-path="ingredients.groups.${gi}.name.${state.lang}" />
          ${(g.items || []).map((it, ii) => `
            <div class="repeating-row" style="margin-top:.5rem">
              <div class="row-head">
                <span>Zutat ${ii + 1}</span>
                <button type="button" data-action="remove-item" data-gi="${gi}" data-ii="${ii}">✕</button>
              </div>
              <div class="two-col">
                <div>
                  <label>Menge (${state.lang.toUpperCase()})</label>
                  <input type="text" data-qty="${gi}.${ii}" value="${escapeHtml(i18nRawFor(it.qty, state.lang))}" />
                </div>
                <div>
                  <label>ID (intern)</label>
                  <input type="text" data-path="ingredients.groups.${gi}.items.${ii}.id" />
                </div>
              </div>
              <label>Ref (Zutaten-Slug, z. B. „tonkabohne")</label>
              <input type="text" data-path="ingredients.groups.${gi}.items.${ii}.ref" />
              <label>Anzeige-Name (${state.lang.toUpperCase()}) — leer = aus Registry</label>
              <input type="text" data-path="ingredients.groups.${gi}.items.${ii}.name.${state.lang}" />
            </div>
          `).join('')}
          <div class="row-actions">
            <button type="button" data-action="add-item" data-gi="${gi}">+ Zutat</button>
          </div>
        </div>
      `).join('')}
      <div class="row-actions">
        <button type="button" data-action="add-group">+ Gruppe</button>
      </div>
    </fieldset>
  `;
}

function methodsHtml() {
  const methods = state.data.methods || [];
  return `
    <fieldset>
      <legend>Zubereitung — Methoden &amp; Schritte</legend>
      ${methods.map((m, mi) => `
        <div class="repeating-row">
          <div class="row-head">
            <span>Methode ${mi + 1}</span>
            <button type="button" data-action="remove-method" data-idx="${mi}">✕</button>
          </div>
          <label>Methodenname (${state.lang.toUpperCase()})</label>
          <input type="text" data-path="methods.${mi}.name.${state.lang}" />
          ${(m.steps || []).map((s, si) => `
            <div class="repeating-row" style="margin-top:.5rem">
              <div class="row-head">
                <span>Schritt ${si + 1}</span>
                <button type="button" data-action="remove-step" data-mi="${mi}" data-si="${si}">✕</button>
              </div>
              <div class="two-col">
                <div>
                  <label>ID</label>
                  <input type="text" data-path="methods.${mi}.steps.${si}.id" />
                </div>
                <div>
                  <label>Zeit</label>
                  <input type="text" data-path="methods.${mi}.steps.${si}.time" />
                </div>
              </div>
              <label>Anweisung (${state.lang.toUpperCase()})</label>
              <textarea data-path="methods.${mi}.steps.${si}.text.${state.lang}"></textarea>
              <label>Warnung / Achtung (${state.lang.toUpperCase()})</label>
              <input type="text" data-path="methods.${mi}.steps.${si}.warning.${state.lang}" />
              <label>Foto-Pfad</label>
              <input type="text" data-path="methods.${mi}.steps.${si}.photo" />
              <label>Werkzeuge (Komma-getrennt)</label>
              <input type="text" data-tools="${mi}.${si}" value="${escapeHtml(toolsRawFor(s.tools, state.lang).join(', '))}" />
            </div>
          `).join('')}
          <div class="row-actions">
            <button type="button" data-action="add-step" data-mi="${mi}">+ Schritt</button>
          </div>
        </div>
      `).join('')}
      <div class="row-actions">
        <button type="button" data-action="add-method">+ Methode</button>
      </div>
    </fieldset>
  `;
}

function sourcesHtml() {
  const sources = state.data.sources || [];
  return `
    <fieldset>
      <legend>Inspiration &amp; Quellen</legend>
      ${sources.map((s, i) => `
        <div class="repeating-row">
          <div class="row-head">
            <span>Quelle ${i + 1}</span>
            <button type="button" data-action="remove-source" data-idx="${i}">✕</button>
          </div>
          <div class="two-col">
            <div>
              <label>Typ</label>
              <select data-path="sources.${i}.type">
                <option value="url" ${s.type === 'url' ? 'selected' : ''}>URL</option>
                <option value="book" ${s.type === 'book' ? 'selected' : ''}>Buch</option>
                <option value="chef" ${s.type === 'chef' ? 'selected' : ''}>Koch/Köchin</option>
                <option value="tradition" ${s.type === 'tradition' ? 'selected' : ''}>Tradition</option>
              </select>
            </div>
            <div>
              <label>URL (falls Typ „URL")</label>
              <input type="text" data-path="sources.${i}.url" />
            </div>
          </div>
          <label>Beschriftung (${state.lang.toUpperCase()})</label>
          <input type="text" data-path="sources.${i}.label.${state.lang}" />
        </div>
      `).join('')}
      <div class="row-actions">
        <button type="button" data-action="add-source">+ Quelle</button>
      </div>
    </fieldset>
  `;
}

/* ---------- Ingredient form ---------- */

function ingredientFormHtml() {
  return `
    <fieldset>
      <legend>Identifikation</legend>
      <label>ID / Slug (z. B. „tonkabohne")</label>
      <input type="text" data-path="id" />
      <label>Latein. Name</label>
      <input type="text" data-path="latin" />
    </fieldset>

    <fieldset>
      <legend>Name (${state.lang.toUpperCase()})</legend>
      <input type="text" data-path="name.${state.lang}" />
    </fieldset>

    <fieldset>
      <legend>Foto</legend>
      <label>Bildpfad</label>
      <input type="text" data-path="image" placeholder="assets/photos/ingredients/tonkabohne.jpeg" />
      <label>Alt-Text (${state.lang.toUpperCase()})</label>
      <input type="text" data-path="image_alt.${state.lang}" />
    </fieldset>

    <fieldset>
      <legend>Beschreibung (${state.lang.toUpperCase()})</legend>
      <textarea data-path="description.${state.lang}"></textarea>
    </fieldset>

    <fieldset>
      <legend>Nährwerte (pro 100 g, kurze Strings)</legend>
      <div class="two-col">
        <div><label>Energie</label><input type="text" data-path="nutrition.energy" /></div>
        <div><label>Kohlenhydrate</label><input type="text" data-path="nutrition.carbs" /></div>
      </div>
      <div class="two-col">
        <div><label>Fett</label><input type="text" data-path="nutrition.fat" /></div>
        <div><label>Eiweiss</label><input type="text" data-path="nutrition.protein" /></div>
      </div>
      <label>Bezugsmenge</label>
      <input type="text" data-path="nutrition._per" />
    </fieldset>

    <fieldset>
      <legend>Herkunft &amp; Saison (${state.lang.toUpperCase()})</legend>
      <label>Herkunft</label>
      <input type="text" data-path="origin.${state.lang}" />
      <label>Saison / Verfügbarkeit</label>
      <input type="text" data-path="seasonality.${state.lang}" />
    </fieldset>

    <fieldset>
      <legend>Verwendung &amp; Tricks (${state.lang.toUpperCase()})</legend>
      <textarea data-path="tips.${state.lang}"></textarea>
    </fieldset>
  `;
}

/* ---------- Dedication form ---------- */

function dedicationFormHtml() {
  return `
    <fieldset>
      <legend>Identifikation</legend>
      <label>ID (z. B. dedication-002)</label>
      <input type="text" data-path="id" />
    </fieldset>

    <fieldset>
      <legend>Titel & Anrede (${state.lang.toUpperCase()})</legend>
      <label>Titel</label>
      <input type="text" data-path="title.${state.lang}" />
      <label>Anrede</label>
      <input type="text" data-path="salutation.${state.lang}" />
    </fieldset>

    <fieldset>
      <legend>Titelbild — eigene Seite vor dem Text</legend>
      <label>Bildpfad</label>
      <input type="text" data-path="image" placeholder="assets/photos/dedication-002/cover.jpeg" />
      <label>Alt-Text (${state.lang.toUpperCase()})</label>
      <input type="text" data-path="imageAlt.${state.lang}" />
    </fieldset>

    <fieldset>
      <legend>Widmungstext</legend>
      ${paragraphList('Absätze', 'body')}
    </fieldset>

    <fieldset>
      <legend>Unterschrift (${state.lang.toUpperCase()})</legend>
      <input type="text" data-path="signoff.${state.lang}" />
    </fieldset>
  `;
}

/* ---------- Book form ---------- */

function bookFormHtml() {
  const d = state.data;
  const dedications = _dedicationsCache?.dedications || [];
  const allRecipes = _recipesCache?.recipes || [];
  const recipeIds = d.recipeIds || [];
  const byId = Object.fromEntries(allRecipes.map(r => [r.id, r]));
  const availableRecipes = allRecipes.filter(r => !recipeIds.includes(r.id));

  return `
    <fieldset>
      <legend>Identifikation</legend>
      <label>ID (z. B. book-002)</label>
      <input type="text" data-path="id" />
      <label>Titel (${state.lang.toUpperCase()})</label>
      <input type="text" data-path="title.${state.lang}" />
    </fieldset>

    <fieldset>
      <legend>Zueignung</legend>
      <label>Welche Widmung gehört zu diesem Buch?</label>
      <select data-path="dedicationId">
        <option value="">— keine —</option>
        ${dedications.map(ded => {
          const label = ded.title?.de || ded.id;
          return `<option value="${ded.id}" ${ded.id === d.dedicationId ? 'selected' : ''}>${escapeHtml(label)}</option>`;
        }).join('')}
      </select>
    </fieldset>

    <fieldset>
      <legend>Rezepte im Buch — Reihenfolge per Drag &amp; Drop oder Pfeilen</legend>
      <div id="book-recipe-list">
        ${recipeIds.length ? recipeIds.map((rid, i) => {
          const r = byId[rid];
          const label = r ? (r.title?.de || rid) : `${rid} (nicht gefunden)`;
          return `
            <div class="repeating-row book-recipe-row" draggable="true" data-book-idx="${i}">
              <span class="drag-handle" title="Ziehen zum Umsortieren" aria-hidden="true">⠿</span>
              <span class="book-recipe-title">${i + 1}. ${escapeHtml(label)}</span>
              <button type="button" data-action="book-move-up" data-idx="${i}" title="Nach oben" ${i === 0 ? 'disabled' : ''}>↑</button>
              <button type="button" data-action="book-move-down" data-idx="${i}" title="Nach unten" ${i === recipeIds.length - 1 ? 'disabled' : ''}>↓</button>
              <button type="button" data-action="book-remove-recipe" data-idx="${i}" title="Entfernen">✕</button>
            </div>
          `;
        }).join('') : '<p style="color:var(--ink-faint,#978c80);font-size:.85rem">Noch keine Rezepte ausgewählt.</p>'}
      </div>
    </fieldset>

    <fieldset>
      <legend>Weitere Rezepte hinzufügen</legend>
      <div id="book-available-list">
        ${availableRecipes.length ? availableRecipes.map(r => `
          <div class="book-available-row" style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;padding:.3rem 0">
            <span>${escapeHtml(r.title?.de || r.id)}</span>
            <button type="button" data-action="book-add-recipe" data-rid="${r.id}" title="Zum Buch hinzufügen">+ Hinzufügen</button>
          </div>
        `).join('') : '<p style="color:var(--ink-faint,#978c80);font-size:.85rem">Alle Rezepte sind bereits im Buch.</p>'}
      </div>
    </fieldset>
  `;
}

/* ---------- Render: form, preview, lang tabs ---------- */

function renderLangTabs() {
  const el = $('#lang-tabs');
  el.innerHTML = ['de', 'en', 'fr', 'it'].map(l =>
    `<button class="${l === state.lang ? 'active' : ''}" data-lang="${l}">${l.toUpperCase()}</button>`
  ).join('');
  el.querySelectorAll('button').forEach(b => b.addEventListener('click', async () => {
    state.lang = b.dataset.lang;
    localStorage.setItem('cookbook-lang', state.lang);
    el.querySelectorAll('button').forEach(btn => btn.classList.toggle('active', btn.dataset.lang === state.lang));
    await renderForm();
    renderPreview();
    if (window.cookbook) window.cookbook.applyChrome(state.lang);
  }));
}

/* Per-type config: where to list existing items, where to fetch/save one,
   and how to build its form. Keeps the four editable types (recipe,
   ingredient, dedication, book) handled uniformly everywhere else. */
const TYPE_CONFIG = {
  recipe: {
    registryPath: 'data/recipes.json',
    registryKey: 'recipes',
    detailPath: id => `data/${id}.json`,
    apiPath: id => `/api/recipes/${encodeURIComponent(id)}`,
    labelFor: x => x.title?.de || x.id,
    formHtml: recipeFormHtml
  },
  ingredient: {
    registryPath: 'data/ingredients.json',
    registryKey: 'ingredients',
    detailPath: id => `data/ingredients/${id}.json`,
    apiPath: id => `/api/ingredients/${encodeURIComponent(id)}`,
    labelFor: x => x.name?.de || x.id,
    formHtml: ingredientFormHtml
  },
  dedication: {
    registryPath: 'data/dedications.json',
    registryKey: 'dedications',
    detailPath: id => `data/${id}.json`,
    apiPath: id => `/api/dedications/${encodeURIComponent(id)}`,
    labelFor: x => x.title?.de || x.id,
    formHtml: dedicationFormHtml
  },
  book: {
    registryPath: 'data/books.json',
    registryKey: 'books',
    detailPath: id => `data/${id}.json`,
    apiPath: id => `/api/books/${encodeURIComponent(id)}`,
    labelFor: x => x.title?.de || x.id,
    formHtml: bookFormHtml
  }
};

function renderModeTabs() {
  $$('.editor-mode-tabs button').forEach(b => {
    b.classList.toggle('active', b.dataset.type === state.type);
    b.onclick = async () => {
      if (state.type === b.dataset.type) return;
      if (state.dirty && !confirm('Ungesicherte Änderungen verwerfen?')) return;
      state.type = b.dataset.type;
      state.id = null;
      state.data = newForType(state.type);
      _bookPreviewIndex = 0;
      state.dirty = false;
      $$('.editor-mode-tabs button').forEach(btn => btn.classList.toggle('active', btn.dataset.type === state.type));
      await populatePicker();
      await renderForm();
      renderPreview();
    };
  });
}

async function populatePicker() {
  const sel = $('#picker');
  const cfg = TYPE_CONFIG[state.type];
  let opts = '<option value="">— neu —</option>';
  try {
    const r = await fetch(cfg.registryPath).then(r => r.json());
    const items = r[cfg.registryKey] || [];
    opts += items.map(x => `<option value="${x.id}">${escapeHtml(cfg.labelFor(x))}</option>`).join('');
  } catch {}
  sel.innerHTML = opts;
  sel.value = state.id || '';
  sel.onchange = async () => {
    const id = sel.value;
    if (state.dirty && !confirm('Ungesicherte Änderungen verwerfen?')) {
      sel.value = state.id || '';
      return;
    }
    if (!id) {
      state.id = null;
      state.data = newForType(state.type);
    } else {
      state.data = await fetch(cfg.detailPath(id)).then(r => r.json());
      state.id = id;
    }
    _bookPreviewIndex = 0;
    state.dirty = false;
    setStatus('');
    await renderForm();
    renderPreview();
  };
}

async function renderForm() {
  if (state.type === 'book') await ensureBookRegistries();
  const form = $('#form');
  form.innerHTML = TYPE_CONFIG[state.type].formHtml();
  wireInputs();
  wireRepeatingActions();
  wireToolsInputs();
  wireQtyInputs();
  wireParagraphInputs();
  if (state.type === 'book') wireBookRecipeList();
}

function wireQtyInputs() {
  // qty is stored per-language, like name/text/warning. Legacy plain-string
  // qty is migrated to the per-language shape (as German) the first time
  // it's edited.
  $$('[data-qty]').forEach(el => {
    el.addEventListener('input', () => {
      const [gi, ii] = el.dataset.qty.split('.').map(Number);
      const item = state.data.ingredients.groups[gi].items[ii];
      if (typeof item.qty === 'string') {
        const legacy = item.qty;
        item.qty = emptyI18n();
        item.qty.de = legacy;
      } else if (!item.qty) {
        item.qty = emptyI18n();
      }
      item.qty[state.lang] = el.value;
      markDirty();
      renderPreview();
    });
  });
}

function wireToolsInputs() {
  // tools is stored per-language, like text/warning; render as comma-separated
  // per active language, parse on input. Legacy plain-array tools are
  // migrated to the per-language shape (as German) the first time they're edited.
  $$('[data-tools]').forEach(el => {
    el.addEventListener('input', () => {
      const [mi, si] = el.dataset.tools.split('.').map(Number);
      const parsed = el.value.split(',').map(s => s.trim()).filter(Boolean);
      const step = state.data.methods[mi].steps[si];
      if (Array.isArray(step.tools)) {
        const legacy = step.tools;
        step.tools = emptyI18nList();
        step.tools.de = legacy;
      } else if (!step.tools) {
        step.tools = emptyI18nList();
      }
      step.tools[state.lang] = parsed;
      markDirty();
      renderPreview();
    });
  });
}

function wireParagraphInputs() {
  $$('[data-paragraph]').forEach(el => {
    el.addEventListener('input', () => {
      const base = el.dataset.paragraph;
      const idx = Number(el.dataset.idx);
      const arr = get(state.data, `${base}.${state.lang}`) || [];
      arr[idx] = el.value;
      set(state.data, `${base}.${state.lang}`, arr);
      markDirty();
      renderPreview();
    });
  });
}

/* Drag-and-drop reordering for the book's selected-recipes list. The
   ↑/↓ buttons (wired via wireRepeatingActions) do the same job and stay
   as a reliable fallback for touch devices / anyone who'd rather click. */
function wireBookRecipeList() {
  const list = $('#book-recipe-list');
  if (!list) return;
  let dragFrom = null;

  list.querySelectorAll('.book-recipe-row').forEach(row => {
    row.addEventListener('dragstart', () => {
      dragFrom = Number(row.dataset.bookIdx);
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => row.classList.remove('dragging'));
    row.addEventListener('dragover', e => {
      e.preventDefault();
      row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', async e => {
      e.preventDefault();
      row.classList.remove('drag-over');
      const dragTo = Number(row.dataset.bookIdx);
      if (dragFrom === null || dragFrom === dragTo) return;
      const arr = state.data.recipeIds;
      const [moved] = arr.splice(dragFrom, 1);
      arr.splice(dragTo, 0, moved);
      dragFrom = null;
      markDirty();
      await renderForm();
      renderPreview();
    });
  });
}

/* All add/remove buttons go through one delegated handler. Bound once —
   the <form> element persists across re-renders (only its innerHTML is
   replaced), so re-attaching here on every render would stack up
   duplicate listeners and fire actions multiple times. */
function wireRepeatingActions() {
  const form = $('#form');
  if (form.dataset.repeatingWired) return;
  form.dataset.repeatingWired = '1';
  form.addEventListener('click', async e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const a = btn.dataset.action;
    const d = state.data;
    switch (a) {
      case 'add-paragraph': {
        const base = btn.dataset.base;
        const arr = get(d, `${base}.${state.lang}`) || [];
        arr.push('');
        set(d, `${base}.${state.lang}`, arr);
        break;
      }
      case 'remove-paragraph': {
        const base = btn.dataset.base, idx = Number(btn.dataset.idx);
        const arr = get(d, `${base}.${state.lang}`) || [];
        arr.splice(idx, 1);
        set(d, `${base}.${state.lang}`, arr);
        break;
      }
      case 'add-group':
        d.ingredients.groups.push({ name: emptyI18n(), items: [] }); break;
      case 'remove-group':
        d.ingredients.groups.splice(Number(btn.dataset.idx), 1); break;
      case 'add-item': {
        const gi = Number(btn.dataset.gi);
        d.ingredients.groups[gi].items.push({ id: '', ref: '', qty: emptyI18n(), name: emptyI18n() });
        break;
      }
      case 'remove-item':
        d.ingredients.groups[Number(btn.dataset.gi)].items.splice(Number(btn.dataset.ii), 1);
        break;
      case 'add-method':
        d.methods.push({ name: emptyI18n(), steps: [] }); break;
      case 'remove-method':
        d.methods.splice(Number(btn.dataset.idx), 1); break;
      case 'add-step': {
        const mi = Number(btn.dataset.mi);
        d.methods[mi].steps.push({ id: '', time: null, tools: emptyI18nList(), text: emptyI18n(), photo: '', warning: emptyI18n() });
        break;
      }
      case 'remove-step':
        d.methods[Number(btn.dataset.mi)].steps.splice(Number(btn.dataset.si), 1);
        break;
      case 'add-source':
        (d.sources = d.sources || []).push({ type: 'url', url: '', label: emptyI18n() }); break;
      case 'remove-source':
        d.sources.splice(Number(btn.dataset.idx), 1); break;

      case 'book-move-up': {
        const i = Number(btn.dataset.idx);
        if (i > 0) {
          const arr = d.recipeIds;
          [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
        }
        break;
      }
      case 'book-move-down': {
        const i = Number(btn.dataset.idx);
        const arr = d.recipeIds;
        if (i < arr.length - 1) {
          [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
        }
        break;
      }
      case 'book-remove-recipe':
        d.recipeIds.splice(Number(btn.dataset.idx), 1); break;
      case 'book-add-recipe':
        (d.recipeIds = d.recipeIds || []).push(btn.dataset.rid); break;
    }
    markDirty();
    await renderForm();
    renderPreview();
  });
}

/* Preview just re-uses the cookbook engine on the in-memory object. */
let _bookPreviewIndex = 0;

async function renderPreview() {
  const type = state.type;
  $('#recipe-root').style.display = type === 'recipe' ? '' : 'none';
  $('#ingredient-root').style.display = type === 'ingredient' ? '' : 'none';
  $('#dedication-root').style.display = type === 'dedication' ? '' : 'none';
  $('#book-root').style.display = type === 'book' ? '' : 'none';
  const pager = $('#book-preview-pager');
  if (pager) pager.style.display = type === 'book' ? 'flex' : 'none';

  const registry = await window.cookbook.loadIngredientRegistry();

  if (type === 'recipe') {
    window.cookbook.renderRecipe(state.data, state.lang, registry);
  } else if (type === 'ingredient') {
    window.cookbook.renderIngredient(state.data, state.lang, registry);
  } else if (type === 'dedication') {
    window.cookbook.renderDedicationTextPage(state.data, state.lang, $('#dedication-root'));
  } else if (type === 'book') {
    await renderBookPreview(registry);
  }
}

/* Book preview: fetches the referenced dedication + recipes fresh each
   time (editor previews favor simplicity/correctness over caching) and
   shows one page at a time via the same engine book.html uses. */
async function renderBookPreview(registry) {
  const root = $('#book-root');
  const d = state.data;
  if (!d.recipeIds?.length && !d.dedicationId) {
    root.innerHTML = '<p style="padding:2rem;color:var(--ink-faint,#978c80)">Noch keine Zueignung oder Rezepte ausgewählt.</p>';
    return;
  }
  const dedication = d.dedicationId
    ? await fetch(`data/${d.dedicationId}.json`).then(r => r.ok ? r.json() : null).catch(() => null)
    : null;
  const recipeDetails = await Promise.all((d.recipeIds || []).map(rid =>
    fetch(`data/${rid}.json`).then(r => r.ok ? r.json() : null).catch(() => null)
  ));
  const recipesById = {};
  (d.recipeIds || []).forEach((rid, i) => { if (recipeDetails[i]) recipesById[rid] = recipeDetails[i]; });

  const pages = window.cookbook.buildBookPages(d, dedication, recipesById);
  if (!pages.length) {
    root.innerHTML = '<p style="padding:2rem;color:var(--ink-faint,#978c80)">Dieses Buch enthält noch keine Seiten.</p>';
    return;
  }
  if (_bookPreviewIndex >= pages.length) _bookPreviewIndex = pages.length - 1;
  if (_bookPreviewIndex < 0) _bookPreviewIndex = 0;

  window.cookbook.renderBookPage(pages[_bookPreviewIndex], state.lang, root, registry);

  const indicator = $('#book-preview-indicator');
  if (indicator) indicator.textContent = `${_bookPreviewIndex + 1} / ${pages.length}`;
  const prevBtn = $('#book-preview-prev');
  const nextBtn = $('#book-preview-next');
  if (prevBtn) prevBtn.disabled = _bookPreviewIndex === 0;
  if (nextBtn) nextBtn.disabled = _bookPreviewIndex === pages.length - 1;
}

/* ---------- Status / save ---------- */

function setStatus(msg, kind = '') {
  const el = $('#save-status');
  el.textContent = msg;
  el.className = 'save-status ' + kind;
}
function markDirty() {
  state.dirty = true;
  setStatus('● ungesichert', '');
}

async function save() {
  const id = state.data.id;
  if (!id) {
    alert('Bitte zuerst eine ID eintragen (z. B. recipe-004).');
    return;
  }
  const url = TYPE_CONFIG[state.type].apiPath(id);
  setStatus('Speichere …');
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.data, null, 2)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.id = id;
    state.dirty = false;
    setStatus('✓ gespeichert', 'ok');
    // A saved dedication/recipe can change what's pickable elsewhere
    // (a book's dedication dropdown, its available-recipes list) —
    // drop the cached registries so the next book edit sees it fresh.
    _recipesCache = null;
    _dedicationsCache = null;
    populatePicker();
  } catch (err) {
    setStatus('Backend offline — bitte JSON herunterladen', 'err');
    console.warn('Save via API failed:', err);
  }
}

function download() {
  const id = state.data.id || `${state.type}-NEW`;
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${id}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setStatus('✓ heruntergeladen', 'ok');
}

/* ---------- Boot ---------- */

async function boot() {
  // Read mode and id from URL: editor.html?type=recipe&id=recipe-001
  const params = new URLSearchParams(location.search);
  const t = params.get('type');
  if (TYPES.includes(t)) state.type = t;
  const initialId = params.get('id');

  state.data = newForType(state.type);

  renderModeTabs();
  renderLangTabs();
  if (window.cookbook) window.cookbook.applyChrome(state.lang);
  await populatePicker();

  if (initialId) {
    $('#picker').value = initialId;
    $('#picker').dispatchEvent(new Event('change'));
  } else {
    await renderForm();
    renderPreview();
  }

  $('#btn-save').addEventListener('click', save);
  $('#btn-download').addEventListener('click', download);

  $('#book-preview-prev')?.addEventListener('click', () => {
    _bookPreviewIndex--;
    renderPreview();
  });
  $('#book-preview-next')?.addEventListener('click', () => {
    _bookPreviewIndex++;
    renderPreview();
  });
}

boot();