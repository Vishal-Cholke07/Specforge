/**
 * SpecForge — Device Comparison App
 * Fully interactive, no frameworks, pure JS
 */

/* ═══════════════════════════════════════
   STATE
═══════════════════════════════════════ */
let allDevices = [];
let filteredDevices = [];
let selectedIds = [];
let favorites = JSON.parse(localStorage.getItem('sf_favorites') || '[]');
let savedComparisons = JSON.parse(localStorage.getItem('sf_saved') || '[]');
let currentCategory = 'all';
let currentBrand = 'all';
let currentSort = 'default';
let priceMin = 0, priceMax = 9999;
let isListView = false;
let chartInstance = null;
const USD_TO_INR_RATE = 93.04; // Mid-April 2026 web reference rate.
const PRICE_RANGE_STEP = 5000;
const RADAR_METRICS = [
  { key: 'RAM', label: 'RAM', type: 'spec', higherBetter: true },
  { key: 'Storage', label: 'Storage', type: 'spec', higherBetter: true },
  { key: 'Battery', label: 'Battery', type: 'spec', higherBetter: true },
  { key: 'Refresh Rate', label: 'Refresh', type: 'spec', higherBetter: true },
  { key: 'rating', label: 'Rating', type: 'device', higherBetter: true },
  { key: 'price', label: 'Value', type: 'device', higherBetter: false }
];

/* Spec sections for table grouping */
const SPEC_SECTIONS = {
  'Core Specs': ['Processor', 'RAM', 'Storage'],
  'Display':    ['Display', 'Refresh Rate'],
  'Battery':    ['Battery'],
  'Camera':     ['Camera'],
  'Connectivity': ['5G', 'OS'],
  'Physical':   ['Weight']
};

/* Numeric specs for highlight comparison */
const NUMERIC_HIGHER_BETTER = new Set(['RAM', 'Storage', 'Battery', 'Refresh Rate', 'Camera']);
const NUMERIC_LOWER_BETTER  = new Set(['Weight', 'Price']);

/* ═══════════════════════════════════════
   INIT
═══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', init);

async function init() {
  showSpinner(true);
  try {
    const res = await fetch('devices.json');
    allDevices = (await res.json()).map(device => ({
      ...device,
      usdPrice: device.price,
      price: convertUsdToInr(device.price)
    }));
  } catch (e) {
    console.error('Failed to load devices.json', e);
    allDevices = [];
  }
  showSpinner(false);

  syncPriceControls();

  populateBrandFilter();
  applyFilters();
  updateSavedBadge();

  /* Event listeners */
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  document.getElementById('searchInput').addEventListener('input', handleSearch);
  document.getElementById('voiceBtn').addEventListener('click', voiceSearch);
  document.getElementById('categoryFilter').addEventListener('click', handleCategoryClick);
  document.getElementById('brandFilter').addEventListener('change', e => { currentBrand = e.target.value; applyFilters(); });
  document.getElementById('sortSelect').addEventListener('change', e => { currentSort = e.target.value; applyFilters(); });
  document.getElementById('priceRangeMin').addEventListener('input', handlePriceRange);
  document.getElementById('priceRangeMax').addEventListener('input', handlePriceRange);
  document.getElementById('resetFiltersBtn').addEventListener('click', resetFilters);
  document.getElementById('clearFiltersBtn').addEventListener('click', resetFilters);
  document.getElementById('compareBtn').addEventListener('click', openComparison);
  document.getElementById('closeCompareBtn').addEventListener('click', closeComparison);
  document.getElementById('resetCompareBtn').addEventListener('click', clearSelected);
  document.getElementById('saveComparisonBtn').addEventListener('click', saveComparison);
  document.getElementById('savedBtn').addEventListener('click', openSavedModal);
  document.getElementById('closeModalBtn').addEventListener('click', closeSavedModal);
  document.getElementById('exportBtn').addEventListener('click', exportComparison);
  document.getElementById('gridViewBtn').addEventListener('click', () => setView(false));
  document.getElementById('listViewBtn').addEventListener('click', () => setView(true));

  // Close autocomplete on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-wrapper')) hideAutocomplete();
  });
}

/* ═══════════════════════════════════════
   THEME
═══════════════════════════════════════ */
function toggleTheme() {
  const html = document.documentElement;
  html.setAttribute('data-theme', html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
}

/* ═══════════════════════════════════════
   FILTERS & SEARCH
═══════════════════════════════════════ */
function populateBrandFilter() {
  const brands = [...new Set(allDevices.map(d => d.brand))].sort();
  const sel = document.getElementById('brandFilter');
  brands.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b; opt.textContent = b;
    sel.appendChild(opt);
  });
}

function applyFilters() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();

  filteredDevices = allDevices.filter(d => {
    if (currentCategory !== 'all' && d.category !== currentCategory) return false;
    if (currentBrand !== 'all' && d.brand !== currentBrand) return false;
    if (d.price < priceMin || d.price > priceMax) return false;
    if (q && !d.name.toLowerCase().includes(q) && !d.brand.toLowerCase().includes(q)) return false;
    return true;
  });

  // Sort
  if (currentSort === 'price_asc')    filteredDevices.sort((a,b) => a.price - b.price);
  else if (currentSort === 'price_desc')   filteredDevices.sort((a,b) => b.price - a.price);
  else if (currentSort === 'rating_desc')  filteredDevices.sort((a,b) => b.rating - a.rating);
  else if (currentSort === 'ram_desc')     filteredDevices.sort((a,b) => b.specs.RAM - a.specs.RAM);
  else if (currentSort === 'battery_desc') filteredDevices.sort((a,b) => b.specs.Battery - a.specs.Battery);

  renderDeviceGrid();
}

function handleSearch() {
  applyFilters();
  showAutocomplete();
}

function handleCategoryClick(e) {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  document.querySelectorAll('#categoryFilter .chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  currentCategory = chip.dataset.value;
  applyFilters();
}

function handlePriceRange() {
  const minEl = document.getElementById('priceRangeMin');
  const maxEl = document.getElementById('priceRangeMax');
  priceMin = parseInt(minEl.value);
  priceMax = parseInt(maxEl.value);
  if (priceMin > priceMax) { priceMin = priceMax; minEl.value = priceMax; }
  updatePriceRangeLabels();
  applyFilters();
}

function resetFilters() {
  document.getElementById('searchInput').value = '';
  currentCategory = 'all';
  currentBrand = 'all';
  currentSort = 'default';
  const sliderMax = getPriceSliderMax();
  priceMin = 0;
  priceMax = sliderMax;
  document.getElementById('priceRangeMin').value = 0;
  document.getElementById('priceRangeMax').value = sliderMax;
  updatePriceRangeLabels();
  document.getElementById('brandFilter').value = 'all';
  document.getElementById('sortSelect').value = 'default';
  document.querySelectorAll('#categoryFilter .chip').forEach((c,i) => c.classList.toggle('active', i === 0));
  applyFilters();
}

/* ═══════════════════════════════════════
   AUTOCOMPLETE
═══════════════════════════════════════ */
function showAutocomplete() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  const drop = document.getElementById('autocomplete');
  if (!q || q.length < 1) { drop.classList.add('hidden'); return; }

  const matches = allDevices.filter(d =>
    d.name.toLowerCase().includes(q) || d.brand.toLowerCase().includes(q)
  ).slice(0, 8);

  if (!matches.length) { drop.classList.add('hidden'); return; }

  drop.innerHTML = matches.map(d => `
    <div class="autocomplete-item" data-id="${d.id}">
      <img src="${d.image}" alt="${d.name}" onerror="this.src='https://via.placeholder.com/36x36/1a1a2e/ffffff?text=?'" />
      <div class="ac-info">
        <div class="ac-name">${highlight(d.name, q)}</div>
        <div class="ac-meta">${d.brand} · ${d.category}</div>
      </div>
      <div class="ac-price">${formatPrice(d.price)}</div>
    </div>
  `).join('');

  drop.querySelectorAll('.autocomplete-item').forEach(item => {
    item.addEventListener('click', () => {
      const dev = allDevices.find(d => d.id === parseInt(item.dataset.id));
      if (dev) { document.getElementById('searchInput').value = dev.name; applyFilters(); hideAutocomplete(); }
    });
  });

  drop.classList.remove('hidden');
}

function hideAutocomplete() {
  document.getElementById('autocomplete').classList.add('hidden');
}

function highlight(text, q) {
  const re = new RegExp(`(${q})`, 'gi');
  return text.replace(re, '<strong>$1</strong>');
}

/* ═══════════════════════════════════════
   VOICE SEARCH
═══════════════════════════════════════ */
function voiceSearch() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    showToast('🎤 Voice search not supported in this browser');
    return;
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SR();
  recognition.lang = 'en-US';
  recognition.onstart = () => document.getElementById('voiceBtn').classList.add('listening');
  recognition.onresult = e => {
    const t = e.results[0][0].transcript;
    document.getElementById('searchInput').value = t;
    applyFilters();
    showToast('🎤 Heard: ' + t);
  };
  recognition.onend = () => document.getElementById('voiceBtn').classList.remove('listening');
  recognition.start();
}

/* ═══════════════════════════════════════
   RENDER DEVICE GRID
═══════════════════════════════════════ */
function renderDeviceGrid() {
  const grid = document.getElementById('deviceGrid');
  const noRes = document.getElementById('noResults');
  document.getElementById('resultCount').textContent = `${filteredDevices.length} device${filteredDevices.length !== 1 ? 's' : ''} found`;

  if (!filteredDevices.length) {
    grid.innerHTML = '';
    noRes.classList.remove('hidden');
    return;
  }
  noRes.classList.add('hidden');

  grid.innerHTML = filteredDevices.map((d, i) => {
    const isSel = selectedIds.includes(d.id);
    const isFav = favorites.includes(d.id);
    const catIcon = d.category === 'mobile' ? '📱' : d.category === 'laptop' ? '💻' : '📟';
    const starsHtml = renderStars(d.rating);
    const detailPairs = getDeviceCardDetails(d);
    return `
    <div class="device-card ${isSel ? 'selected' : ''}" data-id="${d.id}" style="animation-delay:${Math.min(i * 0.03, 0.5)}s">
      <div class="card-top">
        <span class="card-cat-badge">${catIcon} ${d.category}</span>
        <button class="fav-btn ${isFav ? 'active' : ''}" data-id="${d.id}" title="Favourite">⭐</button>
      </div>
      <div class="card-info">
        <div class="card-name">${d.name}</div>
        <div class="card-brand">${d.brand}</div>
        <div class="card-details">
          ${detailPairs.map(([label, value]) => `
            <div class="card-detail">
              <span class="card-detail-label">${label}</span>
              <span class="card-detail-value">${value}</span>
            </div>
          `).join('')}
        </div>
        <div class="card-specs">
          <span class="spec-pill">🧠 ${d.specs.RAM}GB RAM</span>
          <span class="spec-pill">💾 ${formatStorage(d.specs.Storage)}</span>
          <span class="spec-pill">🔋 ${d.specs.Battery}${d.category === 'laptop' ? 'Wh' : 'mAh'}</span>
          ${d.specs['5G'] === 'Yes' ? '<span class="spec-pill">📶 5G</span>' : ''}
        </div>
        <div class="card-footer">
          <span class="card-price">${formatPrice(d.price)}</span>
          <span class="card-rating"><span class="stars">${starsHtml}</span> ${d.rating}</span>
        </div>
      </div>
      <button class="card-select-btn ${isSel ? 'selected-btn' : ''}" data-id="${d.id}">
        ${isSel ? '✓ Selected' : '+ Compare'}
      </button>
    </div>`;
  }).join('');

  // Bind card events
  grid.querySelectorAll('.card-select-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); toggleSelect(parseInt(btn.dataset.id)); });
  });
  grid.querySelectorAll('.fav-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); toggleFavorite(parseInt(btn.dataset.id)); });
  });
  grid.querySelectorAll('.device-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.fav-btn') || e.target.closest('.card-select-btn')) return;
      toggleSelect(parseInt(card.dataset.id));
    });
  });
}

function renderStars(rating) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5 ? 1 : 0;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(5 - full - half);
}

function formatStorage(gb) {
  return gb >= 1000 ? `${gb/1000}TB` : `${gb}GB`;
}

function convertUsdToInr(usdPrice) {
  return Math.round(Number(usdPrice) * USD_TO_INR_RATE);
}

function formatPrice(value, opts = {}) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
    notation: opts.compact ? 'compact' : 'standard'
  }).format(value);
}

function getPriceSliderMax() {
  const maxPrice = Math.max(...allDevices.map(d => d.price), 0);
  return Math.ceil(maxPrice / PRICE_RANGE_STEP) * PRICE_RANGE_STEP;
}

function updatePriceRangeLabels() {
  const sliderMax = getPriceSliderMax();
  document.getElementById('priceMin').textContent = formatPrice(priceMin);
  document.getElementById('priceMax').textContent = priceMax === sliderMax ? `${formatPrice(sliderMax)}+` : formatPrice(priceMax);
}

function syncPriceControls() {
  const sliderMin = document.getElementById('priceRangeMin');
  const sliderMax = document.getElementById('priceRangeMax');
  const maxPrice = getPriceSliderMax();

  sliderMin.max = maxPrice;
  sliderMax.max = maxPrice;
  sliderMin.step = PRICE_RANGE_STEP;
  sliderMax.step = PRICE_RANGE_STEP;
  sliderMin.value = 0;
  sliderMax.value = maxPrice;

  priceMin = 0;
  priceMax = maxPrice;
  updatePriceRangeLabels();
}

function getDeviceCardDetails(device) {
  const specs = device.specs || {};
  const details = [
    ['Processor', specs.Processor || 'N/A'],
    ['Display', specs.Display || 'N/A'],
    ['Camera', specs.Camera || specs.OS || 'N/A']
  ];

  return details;
}

/* ═══════════════════════════════════════
   SELECT / DESELECT
═══════════════════════════════════════ */
function toggleSelect(id) {
  if (selectedIds.includes(id)) {
    selectedIds = selectedIds.filter(x => x !== id);
  } else {
    if (selectedIds.length >= 5) { showToast('⚠️ Max 5 devices for comparison'); return; }
    selectedIds.push(id);
  }
  updateTray();
  renderDeviceGrid();
}

function clearSelected() {
  selectedIds = [];
  updateTray();
  renderDeviceGrid();
  closeComparison();
}

function updateTray() {
  const tray = document.getElementById('selectedTray');
  const count = document.getElementById('trayCount');
  const compareBtn = document.getElementById('compareBtn');
  const saveBtn = document.getElementById('saveComparisonBtn');

  count.textContent = `${selectedIds.length} / 5`;
  compareBtn.disabled = selectedIds.length < 2;
  saveBtn.disabled = selectedIds.length < 2;

  if (!selectedIds.length) {
    tray.innerHTML = '<span class="tray-empty-msg">Select devices above to compare…</span>';
    return;
  }

  tray.innerHTML = selectedIds.map(id => {
    const d = allDevices.find(x => x.id === id);
    const catIcon = d.category === 'mobile' ? '📱' : d.category === 'laptop' ? '💻' : '📟';
    return `<div class="tray-chip">
      <span class="cat-icon">${catIcon}</span>
      <span>${d.name}</span>
      <button class="tray-chip-remove" data-id="${id}">×</button>
    </div>`;
  }).join('');

  tray.querySelectorAll('.tray-chip-remove').forEach(btn => {
    btn.addEventListener('click', () => toggleSelect(parseInt(btn.dataset.id)));
  });
}

/* ═══════════════════════════════════════
   FAVOURITES
═══════════════════════════════════════ */
function toggleFavorite(id) {
  if (favorites.includes(id)) {
    favorites = favorites.filter(x => x !== id);
    showToast('💔 Removed from favourites');
  } else {
    favorites.push(id);
    showToast('⭐ Added to favourites');
  }
  localStorage.setItem('sf_favorites', JSON.stringify(favorites));
  renderDeviceGrid();
}

/* ═══════════════════════════════════════
   VIEW TOGGLE
═══════════════════════════════════════ */
function setView(list) {
  isListView = list;
  const grid = document.getElementById('deviceGrid');
  grid.classList.toggle('list-view', list);
  document.getElementById('gridViewBtn').classList.toggle('active', !list);
  document.getElementById('listViewBtn').classList.toggle('active', list);
}

/* ═══════════════════════════════════════
   COMPARISON TABLE
═══════════════════════════════════════ */
function openComparison() {
  const section = document.getElementById('comparisonSection');
  section.classList.remove('hidden');
  renderComparisonTable();
  drawChart();
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeComparison() {
  document.getElementById('comparisonSection').classList.add('hidden');
}

function renderComparisonTable() {
  const devices = selectedIds.map(id => allDevices.find(d => d.id === id));
  const wrap = document.getElementById('comparisonTable');

  // Build thead
  let thead = `<tr>
    <th class="dev-header-cell">Specification</th>
    ${devices.map(d => `
    <th class="dev-header-cell">
      <div class="dev-header-meta">${d.brand} · ${d.category}</div>
      <div class="dev-header-name">${d.name}</div>
      <div class="dev-header-price">${formatPrice(d.price)}</div>
      <button class="dev-remove-btn" data-id="${d.id}">×</button>
    </th>`).join('')}
  </tr>`;

  // Build rows
  let rows = '';
  Object.entries(SPEC_SECTIONS).forEach(([sectionName, keys]) => {
    // Filter in diff-only mode: show row only if values differ
    const visibleKeys = keys.filter(key => {
      if (!diffOnly) return true;
      const vals = devices.map(d => d.specs[key]);
      return new Set(vals.map(v => String(v))).size > 1;
    });
    if (!visibleKeys.length) return;

    rows += `<tr class="section-row" data-section="${sectionName}">
      <td colspan="${devices.length + 1}">${isExpanded ? '▾' : '▸'} ${sectionName}</td>
    </tr>`;

    if (isExpanded) {
      visibleKeys.forEach(key => {
        const vals = devices.map(d => d.specs[key] !== undefined ? d.specs[key] : '—');
        const highlights = getHighlights(key, vals);
        const maxVal = Math.max(...vals.filter(v => typeof v === 'number'));

        rows += `<tr class="spec-row" data-section="${sectionName}">
          <td>${key}</td>
          ${vals.map((v, i) => {
            const cls = highlights[i] ? (highlights[i] === 'best' ? 'best' : 'worst') : '';
            let bar = '';
            if (typeof v === 'number' && maxVal > 0) {
              const pct = Math.round((v / maxVal) * 100);
              bar = `<div class="spec-bar-wrap"><div class="spec-bar ${cls === 'best' ? '' : cls === 'worst' ? 'bar-worst' : 'bar-mid'}" style="width:${pct}%"></div></div>`;
            }
            const display = v === '—' ? `<span class="spec-val na">—</span>` : `<span class="spec-val ${cls}">${formatSpecVal(key, v, devices[i].category)}</span>`;
            return `<td>${display}${bar}</td>`;
          }).join('')}
        </tr>`;
      });
    }
  });

  // Price row always shown
  const priceVals = devices.map(d => d.price);
  const priceHighlights = getHighlights('Price', priceVals);
  rows += `<tr class="spec-row">
    <td>Price</td>
    ${priceVals.map((v,i) => `<td><span class="spec-val ${priceHighlights[i] ? (priceHighlights[i] === 'best' ? 'best' : 'worst') : ''}">${formatPrice(v)}</span></td>`).join('')}
  </tr>`;

  // Rating row
  const ratingVals = devices.map(d => d.rating);
  const ratingHighlights = getHighlights('rating_higher', ratingVals);
  rows += `<tr class="spec-row">
    <td>Rating</td>
    ${ratingVals.map((v,i) => `<td><span class="spec-val ${ratingHighlights[i] ? (ratingHighlights[i] === 'best' ? 'best' : 'worst') : ''}">${renderStars(v)} ${v}</span></td>`).join('')}
  </tr>`;

  wrap.innerHTML = `<table class="comparison-table"><thead>${thead}</thead><tbody>${rows}</tbody></table>`;

  // Remove btns
  wrap.querySelectorAll('.dev-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => { toggleSelect(parseInt(btn.dataset.id)); if (selectedIds.length >= 2) renderComparisonTable(); else closeComparison(); });
  });

  // Section collapse
  wrap.querySelectorAll('.section-row').forEach(row => {
    row.addEventListener('click', () => {
      const name = row.dataset.section;
      expandedSections[name] = expandedSections[name] === false ? true : false;
      renderComparisonTable();
    });
  });

  // AI suggestion
  renderAiSuggestion(devices);
}

function renderComparisonTable() {
  const devices = selectedIds.map(id => allDevices.find(d => d.id === id));
  const wrap = document.getElementById('comparisonTable');

  let thead = `<tr>
    <th class="dev-header-cell">Specification</th>
    ${devices.map(d => `
    <th class="dev-header-cell">
      <div class="dev-header-meta">${d.brand} · ${d.category}</div>
      <div class="dev-header-name">${d.name}</div>
      <div class="dev-header-price">${formatPrice(d.price)}</div>
      <button class="dev-remove-btn" data-id="${d.id}" aria-label="Remove device">&times;</button>
    </th>`).join('')}
  </tr>`;

  let rows = '';
  Object.entries(SPEC_SECTIONS).forEach(([sectionName, keys]) => {
    const visibleKeys = keys;
    if (!visibleKeys.length) return;

    rows += `<tr class="section-row" data-section="${sectionName}">
      <td colspan="${devices.length + 1}">${sectionName}</td>
    </tr>`;

    visibleKeys.forEach(key => {
      const vals = devices.map(d => d.specs[key] !== undefined ? d.specs[key] : '—');
      const highlights = getHighlights(key, vals);
      const maxVal = Math.max(...vals.filter(v => typeof v === 'number'));

      rows += `<tr class="spec-row" data-section="${sectionName}">
        <td>${key}</td>
        ${vals.map((v, i) => {
          const cls = highlights[i] ? (highlights[i] === 'best' ? 'best' : 'worst') : '';
          let bar = '';
          if (typeof v === 'number' && maxVal > 0) {
            const pct = Math.round((v / maxVal) * 100);
            bar = `<div class="spec-bar-wrap"><div class="spec-bar ${cls === 'best' ? '' : cls === 'worst' ? 'bar-worst' : 'bar-mid'}" style="width:${pct}%"></div></div>`;
          }
          const display = v === '—' ? `<span class="spec-val na">—</span>` : `<span class="spec-val ${cls}">${formatSpecVal(key, v, devices[i].category)}</span>`;
          return `<td>${display}${bar}</td>`;
        }).join('')}
      </tr>`;
    });
  });

  const priceVals = devices.map(d => d.price);
  const priceHighlights = getHighlights('Price', priceVals);
  rows += `<tr class="spec-row">
    <td>Price</td>
    ${priceVals.map((v,i) => `<td><span class="spec-val ${priceHighlights[i] ? (priceHighlights[i] === 'best' ? 'best' : 'worst') : ''}">${formatPrice(v)}</span></td>`).join('')}
  </tr>`;

  const ratingVals = devices.map(d => d.rating);
  const ratingHighlights = getHighlights('rating_higher', ratingVals);
  rows += `<tr class="spec-row">
    <td>Rating</td>
    ${ratingVals.map((v,i) => `<td><span class="spec-val ${ratingHighlights[i] ? (ratingHighlights[i] === 'best' ? 'best' : 'worst') : ''}">${renderStars(v)} ${v}</span></td>`).join('')}
  </tr>`;

  wrap.innerHTML = `<table class="comparison-table"><thead>${thead}</thead><tbody>${rows}</tbody></table>`;

  wrap.querySelectorAll('.dev-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      toggleSelect(parseInt(btn.dataset.id));
      if (selectedIds.length >= 2) renderComparisonTable();
      else closeComparison();
    });
  });

  renderAiSuggestion(devices);
}

function formatSpecVal(key, val, category) {
  if (key === 'Battery') return `${val}${category === 'laptop' ? ' Wh' : ' mAh'}`;
  if (key === 'RAM') return `${val} GB`;
  if (key === 'Storage') return formatStorage(val);
  if (key === 'Weight') return `${val} g`;
  if (key === 'Refresh Rate') return `${val} Hz`;
  return val;
}

function getHighlights(key, vals) {
  const nums = vals.map(v => typeof v === 'number' ? v : parseFloat(v)).filter(n => !isNaN(n));
  if (nums.length < 2) return vals.map(() => null);

  const max = Math.max(...nums);
  const min = Math.min(...nums);
  if (max === min) return vals.map(() => null);

  const lowerBetter = NUMERIC_LOWER_BETTER.has(key);
  return vals.map(v => {
    const n = typeof v === 'number' ? v : parseFloat(v);
    if (isNaN(n)) return null;
    if (lowerBetter) return n === min ? 'best' : n === max ? 'worst' : null;
    return n === max ? 'best' : n === min ? 'worst' : null;
  });
}

/* ═══════════════════════════════════════
   AI SUGGESTION
═══════════════════════════════════════ */
function getBestOverallReason(bestDevice, devices) {
  const reasons = [];
  const bestRam = Math.max(...devices.map(d => Number(d.specs.RAM) || 0));
  const bestStorage = Math.max(...devices.map(d => Number(d.specs.Storage) || 0));
  const bestBattery = Math.max(...devices.map(d => Number(d.specs.Battery) || 0));
  const bestRating = Math.max(...devices.map(d => Number(d.rating) || 0));
  const lightestWeight = Math.min(...devices.map(d => Number(d.specs.Weight) || Infinity));
  const lowestPrice = Math.min(...devices.map(d => Number(d.price) || Infinity));

  if ((Number(bestDevice.specs.RAM) || 0) === bestRam) reasons.push('top RAM');
  if ((Number(bestDevice.specs.Storage) || 0) === bestStorage) reasons.push('top storage');
  if ((Number(bestDevice.specs.Battery) || 0) === bestBattery) reasons.push('top battery');
  if ((Number(bestDevice.rating) || 0) === bestRating) reasons.push('highest rating');
  if ((Number(bestDevice.specs.Weight) || Infinity) === lightestWeight) reasons.push('lighter build');
  if ((Number(bestDevice.price) || Infinity) === lowestPrice) reasons.push('best price');

  return reasons.length ? reasons.slice(0, 3).join(', ') : 'balanced mix of performance, battery, rating, and price';
}

function renderAiSuggestion(devices) {
  const bar = document.getElementById('aiSuggestion');
  const maxPrice = Math.max(...devices.map(device => device.price), 1);

  // Score each device: higher RAM, Storage, Battery, Rating = better; lower Price, Weight = better
  const scores = devices.map(d => {
    let s = 0;
    s += (d.specs.RAM / 32) * 20;
    s += (Math.min(d.specs.Storage, 1024) / 1024) * 15;
    s += (Math.min(d.specs.Battery, 6000) / 6000) * 15;
    s += (d.rating / 5) * 25;
    s += (1 - d.price / maxPrice) * 20;
    s += (1 - Math.min(d.specs.Weight, 2000) / 2000) * 5;
    return { d, s };
  });

  scores.sort((a, b) => b.s - a.s);
  const best = scores[0].d;
  const cheapest = [...devices].sort((a,b) => a.price - b.price)[0];
  const highestRated = [...devices].sort((a,b) => b.rating - a.rating)[0];
  const bestReason = getBestOverallReason(best, devices);

  bar.innerHTML = `
    🤖 <strong>AI Suggestion:</strong>
    &nbsp;&nbsp;🏆 <strong>Best Overall:</strong> ${best.name} (${formatPrice(best.price)})
    &nbsp;·&nbsp; <strong>Based on:</strong> ${bestReason}
    &nbsp;·&nbsp; 💰 <strong>Best Value:</strong> ${cheapest.name} (${formatPrice(cheapest.price)})
    &nbsp;·&nbsp; ⭐ <strong>Highest Rated:</strong> ${highestRated.name} (${highestRated.rating}/5)
  `;
}

/* ═══════════════════════════════════════
   CHART
═══════════════════════════════════════ */
function drawChart() {
  const devices = selectedIds.map(id => allDevices.find(d => d.id === id));
  const canvas = document.getElementById('barChart');
  const ctx = canvas.getContext('2d');

  // Clear old chart
  if (chartInstance) { chartInstance = null; }
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const textColor = isLight ? '#4a4f70' : '#8b8fa8';
  const gridColor = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
  const COLORS = ['#6c63ff', '#00d4aa', '#ff6b6b', '#fbbf24', '#a78bfa'];

  const labels = devices.map(d => d.name.length > 18 ? d.name.slice(0,18) + '…' : d.name);
  const values = devices.map(d => {
    if (currentMetric === 'Price') return d.price;
    return d.specs[currentMetric] !== undefined ? Number(d.specs[currentMetric]) : 0;
  });

  const maxVal = Math.max(...values, 1);
  const W = canvas.offsetWidth || 800;
  const H = 300;
  canvas.width = W; canvas.height = H;

  const pad = { top: 30, right: 30, bottom: 60, left: 60 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;
  const barW = Math.min(80, (chartW / devices.length) * 0.55);
  const gap = chartW / devices.length;

  // Grid lines
  const gridCount = 5;
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  for (let i = 0; i <= gridCount; i++) {
    const y = pad.top + chartH - (i / gridCount) * chartH;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    ctx.fillStyle = textColor;
    ctx.font = '11px DM Sans, sans-serif';
    ctx.textAlign = 'right';
    const label = currentMetric === 'Price' ? formatPrice(Math.round(maxVal * i / gridCount), { compact: true }) : Math.round(maxVal * i / gridCount);
    ctx.fillText(label, pad.left - 8, y + 4);
  }
  ctx.setLineDash([]);

  // Bars
  devices.forEach((d, i) => {
    const val = values[i];
    const barH = (val / maxVal) * chartH;
    const x = pad.left + i * gap + (gap - barW) / 2;
    const y = pad.top + chartH - barH;

    // Bar gradient
    const grad = ctx.createLinearGradient(0, y, 0, y + barH);
    grad.addColorStop(0, COLORS[i % COLORS.length]);
    grad.addColorStop(1, COLORS[i % COLORS.length] + '55');
    ctx.fillStyle = grad;

    // Rounded top bar
    const r = Math.min(8, barW / 2, barH / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + barW - r, y);
    ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
    ctx.lineTo(x + barW, y + barH);
    ctx.lineTo(x, y + barH);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();

    // Value label on top
    ctx.fillStyle = COLORS[i % COLORS.length];
    ctx.font = 'bold 12px Syne, sans-serif';
    ctx.textAlign = 'center';
    const dispVal = currentMetric === 'Price' ? formatPrice(val, { compact: true }) : currentMetric === 'RAM' ? `${val}GB` : currentMetric === 'Storage' ? formatStorage(val) : currentMetric === 'Battery' ? `${val}` : `${val}`;
    ctx.fillText(dispVal, x + barW / 2, y - 8);

    // X label
    ctx.fillStyle = textColor;
    ctx.font = '11px DM Sans, sans-serif';
    ctx.textAlign = 'center';
    const maxLabelW = gap - 4;
    ctx.save();
    ctx.translate(x + barW / 2, pad.top + chartH + 16);
    const labelText = labels[i];
    if (labelText.length * 6 > maxLabelW) {
      ctx.rotate(-0.5);
      ctx.textAlign = 'right';
    }
    ctx.fillText(labelText, 0, 0);
    ctx.restore();
  });

  // Y axis label
  ctx.save();
  ctx.translate(14, H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = textColor;
  ctx.font = '12px DM Sans, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(currentMetric, 0, 0);
  ctx.restore();
}

function drawChart() {
  const devices = selectedIds.map(id => allDevices.find(d => d.id === id));
  const canvas = document.getElementById('barChart');
  const legend = document.getElementById('chartLegend');
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!devices.length) {
    if (legend) legend.innerHTML = '';
    return;
  }

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const textColor = isLight ? '#4a4f70' : '#8b8fa8';
  const gridColor = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
  const labelBg = isLight ? 'rgba(255,255,255,0.92)' : 'rgba(8,10,20,0.92)';
  const colors = ['#6c63ff', '#00d4aa', '#ff6b6b', '#fbbf24', '#14b8a6'];
  const width = canvas.offsetWidth || 800;
  const height = Math.max(380, Math.min(540, Math.round(width * 0.62)));
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.31;
  const levels = 5;
  const angleStep = (Math.PI * 2) / RADAR_METRICS.length;

  canvas.width = width;
  canvas.height = height;

  const normalizedSeries = devices.map(device => ({
    device,
    values: RADAR_METRICS.map(metric => normalizeRadarMetric(metric, devices, device))
  }));

  for (let level = 1; level <= levels; level++) {
    const levelRadius = (radius * level) / levels;
    ctx.beginPath();
    RADAR_METRICS.forEach((_, index) => {
      const angle = -Math.PI / 2 + index * angleStep;
      const x = centerX + Math.cos(angle) * levelRadius;
      const y = centerY + Math.sin(angle) * levelRadius;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  RADAR_METRICS.forEach((metric, index) => {
    const angle = -Math.PI / 2 + index * angleStep;
    const axisX = centerX + Math.cos(angle) * radius;
    const axisY = centerY + Math.sin(angle) * radius;
    const labelX = centerX + Math.cos(angle) * (radius + 34);
    const labelY = centerY + Math.sin(angle) * (radius + 34);

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(axisX, axisY);
    ctx.strokeStyle = gridColor;
    ctx.stroke();

    ctx.fillStyle = labelBg;
    ctx.beginPath();
    ctx.arc(labelX, labelY, 22, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = textColor;
    ctx.font = '600 11px DM Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(metric.label, labelX, labelY);
  });

  normalizedSeries.forEach(({ values }, deviceIndex) => {
    const color = colors[deviceIndex % colors.length];

    ctx.beginPath();
    values.forEach((value, index) => {
      const angle = -Math.PI / 2 + index * angleStep;
      const pointRadius = radius * value;
      const x = centerX + Math.cos(angle) * pointRadius;
      const y = centerY + Math.sin(angle) * pointRadius;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = `${color}22`;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.fill();
    ctx.stroke();

    values.forEach((value, index) => {
      const angle = -Math.PI / 2 + index * angleStep;
      const pointRadius = radius * value;
      const x = centerX + Math.cos(angle) * pointRadius;
      const y = centerY + Math.sin(angle) * pointRadius;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = isLight ? '#ffffff' : '#0b1020';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  });

  if (legend) {
    legend.innerHTML = devices.map((device, index) => `
      <div class="chart-legend-item">
        <span class="chart-legend-swatch" style="background:${colors[index % colors.length]}"></span>
        <span class="chart-legend-label">${device.name}</span>
      </div>
    `).join('');
  }
}

function normalizeRadarMetric(metric, devices, device) {
  const values = devices.map(item => getRadarMetricValue(metric, item));
  const current = getRadarMetricValue(metric, device);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);

  if (max === min) return 0.65;
  if (metric.higherBetter) return 0.2 + (((current - min) / (max - min)) * 0.8);
  return 0.2 + (((max - current) / (max - min)) * 0.8);
}

function getRadarMetricValue(metric, device) {
  if (metric.type === 'device') return Number(device[metric.key]) || 0;
  return Number(device.specs[metric.key]) || 0;
}

/* ═══════════════════════════════════════
   SAVE / LOAD COMPARISONS
═══════════════════════════════════════ */
function saveComparison() {
  if (selectedIds.length < 2) return;
  const names = selectedIds.map(id => allDevices.find(d => d.id === id)?.name).join(' vs ');
  const entry = { id: Date.now(), title: names, devices: [...selectedIds], date: new Date().toLocaleDateString() };
  savedComparisons.unshift(entry);
  if (savedComparisons.length > 10) savedComparisons.pop();
  localStorage.setItem('sf_saved', JSON.stringify(savedComparisons));
  updateSavedBadge();
  showToast('💾 Comparison saved!');
}

function updateSavedBadge() {
  const badge = document.getElementById('savedCount');
  if (savedComparisons.length > 0) {
    badge.textContent = savedComparisons.length;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function openSavedModal() {
  const modal = document.getElementById('savedModal');
  const list = document.getElementById('savedList');
  modal.classList.remove('hidden');

  if (!savedComparisons.length) {
    list.innerHTML = '<p class="saved-empty">No saved comparisons yet.</p>';
    return;
  }

  list.innerHTML = savedComparisons.map(c => `
    <div class="saved-item">
      <div class="saved-item-title">${c.title}</div>
      <div class="saved-item-devices">Saved on ${c.date} · ${c.devices.length} devices</div>
      <div class="saved-item-actions">
        <button class="btn-primary load-saved" data-id="${c.id}" style="padding:7px 14px;font-size:12px">Load</button>
        <button class="btn-ghost del-saved" data-id="${c.id}" style="font-size:12px">Delete</button>
      </div>
    </div>`).join('');

  list.querySelectorAll('.load-saved').forEach(btn => {
    btn.addEventListener('click', () => {
      const entry = savedComparisons.find(c => c.id === parseInt(btn.dataset.id));
      if (entry) {
        selectedIds = [...entry.devices];
        updateTray();
        renderDeviceGrid();
        closeSavedModal();
        openComparison();
      }
    });
  });

  list.querySelectorAll('.del-saved').forEach(btn => {
    btn.addEventListener('click', () => {
      savedComparisons = savedComparisons.filter(c => c.id !== parseInt(btn.dataset.id));
      localStorage.setItem('sf_saved', JSON.stringify(savedComparisons));
      updateSavedBadge();
      openSavedModal();
    });
  });
}

function closeSavedModal() {
  document.getElementById('savedModal').classList.add('hidden');
}

/* ═══════════════════════════════════════
   EXPORT
═══════════════════════════════════════ */
function exportComparison() {
  const section = document.getElementById('comparisonSection');
  // Use html2canvas polyfill via canvas trick
  showToast('📸 Screenshot: Use browser\'s Print → Save as PDF or Ctrl+Shift+S');
  window.print();
}

/* ═══════════════════════════════════════
   LOADING
═══════════════════════════════════════ */
async function exportComparison() {
  const source = document.getElementById('comparisonTable');
  if (!source || !source.firstElementChild) {
    showToast('No comparison table to export yet');
    return;
  }

  try {
    const clone = source.cloneNode(true);
    inlineComputedStyles(source, clone);
    clone.style.overflow = 'visible';
    clone.style.maxHeight = 'none';
    clone.style.width = `${source.scrollWidth}px`;
    const printWindow = window.open('', '_blank', 'width=1400,height=900');
    if (!printWindow) {
      showToast('Allow pop-ups to export the comparison table');
      return;
    }

    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim() || '#0b1020';
    const text = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#ffffff';

    printWindow.document.open();
    printWindow.document.write(`
      <!doctype html>
      <html>
      <head>
        <title>Comparison Table Export</title>
        <meta charset="utf-8" />
        <style>
          body {
            margin: 0;
            padding: 24px;
            background: ${bg};
            color: ${text};
            font-family: Arial, sans-serif;
          }
          .export-wrap {
            width: fit-content;
            max-width: none;
          }
          @page {
            size: landscape;
            margin: 12mm;
          }
        </style>
      </head>
      <body>
        <div class="export-wrap">${clone.outerHTML}</div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onload = () => {
      printWindow.print();
    };
    showToast('Comparison table opened for export');
  } catch (error) {
    console.error('Failed to export comparison table', error);
    showToast('Unable to export comparison table screenshot');
  }
}

function inlineComputedStyles(source, target) {
  const sourceNodes = [source, ...source.querySelectorAll('*')];
  const targetNodes = [target, ...target.querySelectorAll('*')];

  sourceNodes.forEach((sourceNode, index) => {
    const targetNode = targetNodes[index];
    if (!(targetNode instanceof HTMLElement)) return;
    const computed = getComputedStyle(sourceNode);
    targetNode.style.cssText = computed.cssText || Array.from(computed).map(prop => `${prop}:${computed.getPropertyValue(prop)};`).join('');
  });
}

function showSpinner(show) {
  document.getElementById('loadingSpinner').classList.toggle('hidden', !show);
  document.getElementById('deviceGrid').classList.toggle('hidden', show);
}

/* ═══════════════════════════════════════
   TOAST
═══════════════════════════════════════ */
function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

/* ═══════════════════════════════════════
   WINDOW RESIZE — REDRAW CHART
═══════════════════════════════════════ */
window.addEventListener('resize', () => {
  if (!document.getElementById('comparisonSection').classList.contains('hidden')) {
    requestAnimationFrame(drawChart);
  }
});
