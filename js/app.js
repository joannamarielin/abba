/**
 * Adventures with Babe - Arseniy's 32nd Birthday Edition
 * Core Interactive Application Engine
 */

(function () {
  'use strict';

  // --- LOCAL STORAGE KEY ---
  const STORAGE_KEY = 'babe_adventures_v1';

  // --- APPLICATION STATE ---
  let state = {
    adventures: [],
    activeCategory: 'all',
    activeTags: new Set(),
    searchQuery: '',
    activeStatus: 'all', // 'all' | 'bucket' | 'done' | 'favorite'
    currentView: 'grid',  // 'grid' | 'map'
    currentModalAdvId: null,
    rouletteAdvId: null,
    user: {
      completed: [],
      favorites: [],
      ratings: {},
      dates: {},
      notes: {},
      photos: {},
      itinerary: [],
      customAdventures: []
    }
  };

  // --- LEAFLET MAP OBJECTS ---
  let map = null;
  let markersLayer = null;

  // --- LOAD & SAVE PERSISTENT DATA ---
  function loadUserData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state.user = {
          completed: parsed.completed || [],
          favorites: parsed.favorites || [],
          ratings: parsed.ratings || {},
          dates: parsed.dates || {},
          notes: parsed.notes || {},
          photos: parsed.photos || {},
          itinerary: parsed.itinerary || [],
          customAdventures: parsed.customAdventures || []
        };
      }
    } catch (e) {
      console.warn('Failed to load user state from localStorage', e);
    }
  }

  function saveUserData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.user));
      updatePassportTracker();
      updateItineraryBadge();
    } catch (e) {
      console.warn('Failed to save user state', e);
    }
  }

  // --- COMBINE BUILT-IN + CUSTOM ADVENTURES ---
  function initAdventures() {
    loadUserData();
    const builtIn = typeof ADVENTURES_DATA !== 'undefined' ? ADVENTURES_DATA : [];
    state.adventures = [...builtIn, ...state.user.customAdventures];
  }

  // --- FILTERING LOGIC ---
  function getFilteredAdventures() {
    const q = state.searchQuery.toLowerCase().trim();

    return state.adventures.filter((adv) => {
      // 1. Category Filter
      if (state.activeCategory !== 'all' && adv.category !== state.activeCategory) {
        return false;
      }

      // 2. Status Filter
      const isDone = state.user.completed.includes(adv.id);
      const isFav = state.user.favorites.includes(adv.id);

      if (state.activeStatus === 'done' && !isDone) return false;
      if (state.activeStatus === 'favorite' && !isFav) return false;
      if (state.activeStatus === 'bucket' && isDone) return false;

      // 3. Quick Tag Filter
      if (state.activeTags.size > 0) {
        for (const tag of state.activeTags) {
          const matchTag = adv.tags && adv.tags.includes(tag);
          const matchDrive = tag === 'Local SF' && adv.driveTime && adv.driveTime.includes('Local');
          const matchDayTrip = tag === 'Day Trip' && adv.driveTime && !adv.driveTime.includes('Local');
          const matchOnlySF = tag === 'Only in SF' && (adv.category === 'unique' || (adv.tags && adv.tags.includes('Only in SF')));
          const matchBurger = tag === 'Smash Burger Hit' && ((adv.tags && adv.tags.includes('Smash Burger Hit')) || (adv.arseniyHighlights && adv.arseniyHighlights.toLowerCase().includes('smash')));
          const matchAnimal = tag === 'Feed Animals' && adv.naomiAnimals;
          const matchCraft = tag === 'Arts & Crafts' && adv.naomiCrafts;
          const matchSunset = tag === 'Sunset Views' && adv.sunsetSpot;

          if (!matchTag && !matchDrive && !matchDayTrip && !matchOnlySF && !matchBurger && !matchAnimal && !matchCraft && !matchSunset) {
            return false;
          }
        }
      }

      // 4. Search Query Filter
      if (q) {
        const textToSearch = [
          adv.title,
          adv.neighborhood,
          adv.address,
          adv.description,
          adv.arseniyHighlights,
          adv.joannaVeggiePick,
          adv.naomiNote,
          adv.instagramHandle,
          (adv.tags || []).join(' ')
        ].filter(Boolean).join(' ').toLowerCase();

        if (!textToSearch.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }

  // --- RENDER CARD GRID ---
  function renderCards() {
    const grid = document.getElementById('cards-grid');
    if (!grid) return;

    const items = getFilteredAdventures();
    document.getElementById('displayed-count').textContent = items.length;

    // Update status tab counts
    document.getElementById('count-all').textContent = state.adventures.length;
    document.getElementById('count-done').textContent = state.user.completed.length;
    document.getElementById('count-fav').textContent = state.user.favorites.length;

    if (items.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1.5rem; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-subtle);">
          <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">🔍</div>
          <h3 style="font-family: var(--font-serif); font-size: 1.3rem; margin-bottom: 0.5rem;">No adventures match those filters</h3>
          <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1.25rem;">Try clearing your search query or selecting a different category.</p>
          <button class="btn btn-secondary" id="btn-reset-filters">Reset All Filters</button>
        </div>
      `;
      const resetBtn = document.getElementById('btn-reset-filters');
      if (resetBtn) {
        resetBtn.addEventListener('click', resetFilters);
      }
      return;
    }

    grid.innerHTML = items.map((adv) => {
      const isDone = state.user.completed.includes(adv.id);
      const isFav = state.user.favorites.includes(adv.id);
      const catClass = `cat-${adv.category}`;
      const catLabels = {
        hike: '🌅 Urban Hike',
        food: '🍔 Foodie Gem',
        family: '👧🐾 Naomi Approved',
        unique: '✨ Only in SF'
      };

      // Highlights logic
      let highlightHtml = '';
      if (adv.arseniyFoodPick) {
        highlightHtml += `
          <div class="highlight-chip chip-arseniy-food">
            <span>🥩🍺</span>
            <span><strong>Arseniy:</strong> ${adv.arseniyFoodPick.replace(/Arseniy'?s?\s*(Food|Smash Burger Hit|Special|Sips)?:?\s*/i, '').slice(0, 70)}...</span>
          </div>
        `;
      } else if (adv.arseniyHighlights && adv.arseniyHighlights.toLowerCase().includes('smash')) {
        highlightHtml += `
          <div class="highlight-chip chip-burger">
            <span>🍔</span>
            <span><strong>Arseniy:</strong> Smash Burger Hit</span>
          </div>
        `;
      }
      if (adv.joannaVeggiePick) {
        highlightHtml += `
          <div class="highlight-chip chip-veggie">
            <span>🌱</span>
            <span><strong>Joanna:</strong> ${adv.joannaVeggiePick.replace(/Joanna's Veggie Pick:\s*/i, '').slice(0, 75)}...</span>
          </div>
        `;
      }
      if (adv.naomiAnimals) {
        highlightHtml += `
          <div class="highlight-chip chip-naomi">
            <span>🐐</span>
            <span><strong>Naomi:</strong> Animal Feeding &amp; Petting</span>
          </div>
        `;
      } else if (adv.naomiCrafts) {
        highlightHtml += `
          <div class="highlight-chip chip-naomi">
            <span>🎨</span>
            <span><strong>Naomi:</strong> Hands-On Arts &amp; Crafts</span>
          </div>
        `;
      } else if (adv.sunsetSpot) {
        highlightHtml += `
          <div class="highlight-chip chip-sunset">
            <span>🌇</span>
            <span><strong>Golden Hour:</strong> Panoramic Sunset Lookout</span>
          </div>
        `;
      }

      return `
        <article class="adventure-card ${isDone ? 'is-completed' : ''}" data-id="${adv.id}">
          <div class="card-image-box">
            <img src="${adv.image || 'https://images.unsplash.com/photo-1506146332389-18140dc7b2fb?w=800'}" alt="${adv.title}" class="card-img" loading="lazy">
            <div class="card-badge-top-left">
              <span class="card-cat-badge ${catClass}">${catLabels[adv.category] || 'Adventure'}</span>
            </div>
            <button class="card-fav-btn ${isFav ? 'favorited' : ''}" data-action="toggle-fav" data-id="${adv.id}" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
            </button>
          </div>

          <div class="card-content">
            <div class="card-meta-row">
              <span class="meta-loc">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                ${adv.neighborhood}
              </span>
              <span class="meta-time">${adv.driveTime || 'Local SF'}</span>
            </div>

            <h3 class="card-title">${adv.title}</h3>
            <p class="card-desc">${adv.description}</p>

            <div class="card-highlights">
              ${highlightHtml}
            </div>
          </div>

          <div class="card-footer">
            <a href="${adv.instagramUrl || '#'}" target="_blank" rel="noopener" class="card-ig-link" title="Inspired by ${adv.instagramHandle}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
              <span>${adv.instagramHandle || '@bayarea'}</span>
            </a>

            <div class="card-action-btns">
              <button class="done-check-btn ${isDone ? 'completed' : ''}" data-action="toggle-done" data-id="${adv.id}" title="${isDone ? 'Mark as not done' : 'Mark as done'}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                <span>${isDone ? 'Done' : 'Mark Done'}</span>
              </button>
              <button class="details-btn" data-action="open-modal" data-id="${adv.id}">
                Details
              </button>
            </div>
          </div>
        </article>
      `;
    }).join('');

    // Attach card event listeners
    grid.querySelectorAll('[data-action="toggle-fav"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(btn.dataset.id);
      });
    });

    grid.querySelectorAll('[data-action="toggle-done"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDone(btn.dataset.id);
      });
    });

    grid.querySelectorAll('[data-action="open-modal"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openModal(btn.dataset.id);
      });
    });

    grid.querySelectorAll('.adventure-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        // Prevent opening if clicked on a button or link
        if (e.target.closest('button') || e.target.closest('a')) return;
        openModal(card.dataset.id);
      });
    });
  }

  // --- TOGGLE DONE & FAVORITES ---
  function toggleFavorite(id) {
    const idx = state.user.favorites.indexOf(id);
    if (idx > -1) {
      state.user.favorites.splice(idx, 1);
      showToast('Removed from favorites');
    } else {
      state.user.favorites.push(id);
      showToast('Added to favorites ❤️');
    }
    saveUserData();
    renderCards();
    if (state.currentView === 'map') updateMapMarkers();
  }

  function toggleDone(id) {
    const idx = state.user.completed.indexOf(id);
    if (idx > -1) {
      state.user.completed.splice(idx, 1);
      showToast('Marked as not yet done');
    } else {
      state.user.completed.push(id);
      showToast('Adventures with Babe conquered! 🎉');
      triggerCelebration();
    }
    saveUserData();
    renderCards();
    if (state.currentView === 'map') updateMapMarkers();
  }

  // --- RESET ALL FILTERS ---
  function resetFilters() {
    state.activeCategory = 'all';
    state.activeTags.clear();
    state.searchQuery = '';
    state.activeStatus = 'all';

    document.getElementById('search-input').value = '';
    document.getElementById('search-clear').classList.remove('visible');

    document.querySelectorAll('.cat-pill').forEach((p) => p.classList.toggle('active', p.dataset.cat === 'all'));
    document.querySelectorAll('.tag-filter-chip').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.status-tab').forEach((s) => s.classList.toggle('active', s.dataset.status === 'all'));

    renderCards();
    if (state.currentView === 'map') updateMapMarkers();
  }

  // --- PASSPORT TRACKER & MILESTONES ---
  function updatePassportTracker() {
    const completedCount = state.user.completed.length;
    const target = 32;
    const pct = Math.min(100, Math.round((completedCount / target) * 100));

    const trackerCompleted = document.getElementById('tracker-completed');
    const progressFill = document.getElementById('progress-fill');
    if (trackerCompleted) trackerCompleted.textContent = completedCount;
    if (progressFill) progressFill.style.width = `${pct}%`;

    // Milestones logic
    const completedAdv = state.adventures.filter((a) => state.user.completed.includes(a.id));
    const sunsetCount = completedAdv.filter((a) => a.sunsetSpot).length;
    const burgerCount = completedAdv.filter((a) => a.category === 'food' || (a.arseniyHighlights && a.arseniyHighlights.toLowerCase().includes('burger'))).length;
    const animalCount = completedAdv.filter((a) => a.naomiAnimals).length;
    const craftCount = completedAdv.filter((a) => a.naomiCrafts).length;
    const nightCount = completedAdv.filter((a) => a.category === 'unique').length;

    updateBadge('badge-sunset', sunsetCount, 3, '🌅 Sunset Chaser');
    updateBadge('badge-burger', burgerCount, 3, '🍔 Burger Connoisseur');
    updateBadge('badge-animal', animalCount, 2, "🐾 Naomi's Animal Hero");
    updateBadge('badge-craft', craftCount, 2, '🎨 Master Crafter');
    updateBadge('badge-night', nightCount, 2, '🪩 SF Night Owl');

    const badgeLevel32 = document.getElementById('badge-level32');
    if (badgeLevel32) {
      if (completedCount >= 32) {
        badgeLevel32.classList.add('unlocked');
        badgeLevel32.textContent = '👑 Level 32 Legend (UNLOCKED!)';
      } else {
        badgeLevel32.classList.remove('unlocked');
        badgeLevel32.textContent = '👑 Level 32 Legend!';
      }
    }
  }

  function updateBadge(id, current, goal, label) {
    const el = document.getElementById(id);
    if (!el) return;
    if (current >= goal) {
      el.classList.add('unlocked');
      el.textContent = `${label} (${current}/${goal} Unlocked!)`;
    } else {
      el.classList.remove('unlocked');
      el.textContent = `${label} (${current}/${goal})`;
    }
  }

  // --- LEAFLET MAP ENGINE ---
  function initMap() {
    const mapEl = document.getElementById('map-view');
    if (!mapEl || typeof L === 'undefined') return;

    if (map) {
      setTimeout(() => {
        map.invalidateSize();
        updateMapMarkers();
      }, 50);
      return;
    }

    // SF Bay Area center
    map = L.map('map-view', {
      center: [37.765, -122.435],
      zoom: 11,
      zoomControl: true
    });

    // CARTO Basemaps API Key (CARTO requires ?key= parameter)
    const CARTO_API_KEY = 'cb1_45w5_1_a9d39b5254641fc66a510c73';

    // Reliable OpenStreetMap Standard Layer
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    });

    // CARTO Basemap Styles with ?key= and cache-busting v=2 to clear any cached watermarked tiles
    const voyagerLayer = L.tileLayer(`https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${CARTO_API_KEY}&v=2`, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
    });

    const darkMatterLayer = L.tileLayer(`https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=${CARTO_API_KEY}&v=2`, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
    });

    const positronLayer = L.tileLayer(`https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png?key=${CARTO_API_KEY}&v=2`, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
    });

    // Automatic Fallback Guard: If CARTO tiles report policy block or error, swap to OSM
    let fallbackTriggered = false;
    function onCartoError() {
      if (!fallbackTriggered) {
        fallbackTriggered = true;
        console.warn('CARTO basemap tile issue detected. Seamlessly activating OpenStreetMap fallback.');
        if (map.hasLayer(voyagerLayer)) map.removeLayer(voyagerLayer);
        if (map.hasLayer(darkMatterLayer)) map.removeLayer(darkMatterLayer);
        if (map.hasLayer(positronLayer)) map.removeLayer(positronLayer);
        if (!map.hasLayer(osmLayer)) osmLayer.addTo(map);
      }
    }

    voyagerLayer.on('tileerror', onCartoError);
    darkMatterLayer.on('tileerror', onCartoError);
    positronLayer.on('tileerror', onCartoError);

    // Default: try CARTO Voyager
    voyagerLayer.addTo(map);

    // Layer switcher control for map themes
    L.control.layers({
      "🌅 CARTO Voyager (Golden Hour)": voyagerLayer,
      "🌃 CARTO Dark Matter (Night SF)": darkMatterLayer,
      "✨ CARTO Positron (Clean Light)": positronLayer,
      "🗺️ OpenStreetMap (Standard)": osmLayer
    }, null, { position: 'topright' }).addTo(map);

    markersLayer = L.layerGroup().addTo(map);
    updateMapMarkers();
  }

  function updateMapMarkers() {
    if (!map || !markersLayer) return;
    markersLayer.clearLayers();

    const items = getFilteredAdventures();
    const bounds = [];

    const categoryColors = {
      hike: '#ea580c',
      food: '#f43f5e',
      family: '#10b981',
      unique: '#8b5cf6'
    };

    items.forEach((adv) => {
      if (!adv.lat || !adv.lng) return;

      const color = categoryColors[adv.category] || '#f59e0b';
      const isDone = state.user.completed.includes(adv.id);

      const customIcon = L.divIcon({
        className: 'custom-map-pin',
        html: `
          <div style="
            width: 32px;
            height: 32px;
            background: ${color};
            border: 2px solid ${isDone ? '#34d399' : '#ffffff'};
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 10px rgba(0,0,0,0.5);
          ">
            <span style="transform: rotate(45deg); font-size: 13px;">${isDone ? '✓' : '📍'}</span>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
      });

      const marker = L.marker([adv.lat, adv.lng], { icon: customIcon });

      const popupContent = `
        <div class="map-popup-card">
          <img src="${adv.image || 'https://images.unsplash.com/photo-1506146332389-18140dc7b2fb?w=800'}" alt="${adv.title}" class="map-popup-img">
          <div class="map-popup-body">
            <div class="map-popup-cat">${adv.category.toUpperCase()} • ${adv.driveTime || 'Local SF'}</div>
            <div class="map-popup-title">${adv.title}</div>
            <div class="map-popup-loc">${adv.neighborhood}</div>
            <div class="map-popup-actions">
              <button class="map-popup-btn primary" onclick="window.appOpenModal('${adv.id}')">View Details</button>
              <a class="map-popup-btn" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adv.title + ' ' + adv.address)}" target="_blank" rel="noopener">Directions</a>
            </div>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent);
      markersLayer.addLayer(marker);
      bounds.push([adv.lat, adv.lng]);
    });

    if (bounds.length > 0 && state.currentView === 'map') {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }

  // --- ADVENTURE DETAIL MODAL ---
  function openModal(id) {
    const adv = state.adventures.find((a) => a.id === id);
    if (!adv) return;

    state.currentModalAdvId = id;
    const modal = document.getElementById('detail-modal');

    // Populate modal fields
    document.getElementById('modal-img').src = adv.image || 'https://images.unsplash.com/photo-1506146332389-18140dc7b2fb?w=800';
    document.getElementById('modal-img').alt = adv.title;

    const catBadge = document.getElementById('modal-cat-tag');
    catBadge.textContent = adv.category.toUpperCase();
    catBadge.className = `modal-cat-tag cat-${adv.category}`;

    document.getElementById('modal-title').textContent = adv.title;
    document.getElementById('modal-neighborhood').textContent = adv.neighborhood;
    document.getElementById('modal-drive-time').textContent = `${adv.driveTime} • ${adv.duration || '1.5 hrs'}`;

    const igLink = document.getElementById('modal-ig-link');
    igLink.textContent = adv.instagramHandle || '@bayarea';
    igLink.href = adv.instagramUrl || '#';

    document.getElementById('modal-desc').textContent = adv.description;

    // Feature boxes
    const boxArseniy = document.getElementById('box-arseniy');
    const modalArseniyText = document.getElementById('modal-arseniy-text');
    if (adv.arseniyHighlights) {
      boxArseniy.style.display = 'flex';
      modalArseniyText.textContent = adv.arseniyHighlights;
    } else {
      boxArseniy.style.display = 'none';
    }

    const boxArseniyFood = document.getElementById('box-arseniy-food');
    const modalArseniyFoodText = document.getElementById('modal-arseniy-food-text');
    if (adv.arseniyFoodPick) {
      boxArseniyFood.style.display = 'flex';
      modalArseniyFoodText.textContent = adv.arseniyFoodPick;
    } else {
      boxArseniyFood.style.display = 'none';
    }

    const boxJoanna = document.getElementById('box-joanna');
    const modalJoannaText = document.getElementById('modal-joanna-text');
    if (adv.joannaVeggiePick) {
      boxJoanna.style.display = 'flex';
      modalJoannaText.textContent = adv.joannaVeggiePick;
    } else {
      boxJoanna.style.display = 'none';
    }

    const boxNaomi = document.getElementById('box-naomi');
    const modalNaomiText = document.getElementById('modal-naomi-text');
    if (adv.naomiNote) {
      boxNaomi.style.display = 'flex';
      modalNaomiText.textContent = adv.naomiNote;
    } else {
      boxNaomi.style.display = 'none';
    }

    const boxTips = document.getElementById('box-tips');
    const modalTipsText = document.getElementById('modal-tips-text');
    const tipsContent = [adv.bestTime ? `Best Time: ${adv.bestTime}` : '', adv.tips ? `Insider Tip: ${adv.tips}` : ''].filter(Boolean).join(' • ');
    if (tipsContent) {
      boxTips.style.display = 'flex';
      modalTipsText.textContent = tipsContent;
    } else {
      boxTips.style.display = 'none';
    }

    // Populate user journal
    const isDone = state.user.completed.includes(id);
    document.getElementById('journal-status').value = isDone ? 'completed' : 'bucket';
    document.getElementById('journal-date').value = state.user.dates[id] || '';
    document.getElementById('journal-notes').value = state.user.notes[id] || '';

    // Star rating
    const currentRating = state.user.ratings[id] || 0;
    updateStarUI(currentRating);

    // Photos preview
    renderModalPhotoPreviews(id);

    // Itinerary button state
    updateModalItineraryBtn(id);

    // Google Maps link
    const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adv.title + ' ' + (adv.address || adv.neighborhood))}`;
    document.getElementById('modal-btn-maps').href = mapsLink;

    modal.classList.add('open');
  }

  function closeModal() {
    document.getElementById('detail-modal').classList.remove('open');
    state.currentModalAdvId = null;
  }

  function updateStarUI(rating) {
    document.querySelectorAll('#modal-star-rating .star-btn').forEach((btn) => {
      const star = parseInt(btn.dataset.star, 10);
      btn.classList.toggle('active', star <= rating);
    });
  }

  function renderModalPhotoPreviews(id) {
    const container = document.getElementById('photo-preview-grid');
    container.innerHTML = '';
    const photos = state.user.photos[id] || [];
    photos.forEach((src) => {
      const img = document.createElement('img');
      img.src = src;
      img.className = 'photo-thumb';
      container.appendChild(img);
    });
  }

  function updateModalItineraryBtn(id) {
    const inItinerary = state.user.itinerary.includes(id);
    const btnText = document.getElementById('modal-itinerary-text');
    if (inItinerary) {
      btnText.textContent = 'Remove from Weekend Date';
    } else {
      btnText.textContent = 'Add to Weekend Date';
    }
  }

  // --- SAVE JOURNAL ENTRY ---
  function saveJournalEntry() {
    const id = state.currentModalAdvId;
    if (!id) return;

    const statusVal = document.getElementById('journal-status').value;
    const dateVal = document.getElementById('journal-date').value;
    const notesVal = document.getElementById('journal-notes').value.trim();

    if (statusVal === 'completed') {
      if (!state.user.completed.includes(id)) {
        state.user.completed.push(id);
        triggerCelebration();
      }
    } else {
      const idx = state.user.completed.indexOf(id);
      if (idx > -1) state.user.completed.splice(idx, 1);
    }

    if (dateVal) state.user.dates[id] = dateVal;
    if (notesVal) state.user.notes[id] = notesVal;

    saveUserData();
    renderCards();
    if (state.currentView === 'map') updateMapMarkers();
    showToast('Adventure memory saved! 💖');
  }

  // --- PHOTO UPLOAD HANDLER ---
  function handlePhotoUpload(e) {
    const file = e.target.files[0];
    const id = state.currentModalAdvId;
    if (!file || !id) return;

    const reader = new FileReader();
    reader.onload = function (evt) {
      const dataUrl = evt.target.result;
      if (!state.user.photos[id]) state.user.photos[id] = [];
      state.user.photos[id].push(dataUrl);
      saveUserData();
      renderModalPhotoPreviews(id);
      showToast('Photo uploaded to your journal!');
    };
    reader.readAsDataURL(file);
  }

  // --- ADVENTURE ROULETTE (SURPRISE US!) ---
  function openRouletteModal() {
    const pool = getFilteredAdventures();
    const candidateList = pool.length > 0 ? pool : state.adventures;

    const modal = document.getElementById('roulette-modal');
    const slot = document.getElementById('roulette-slot');
    const viewBtn = document.getElementById('btn-view-roulette-choice');
    viewBtn.style.display = 'none';

    slot.innerHTML = `
      <div style="color: var(--text-muted); font-size: 1rem;">
        Ready to discover our next adventure with Babe?
      </div>
    `;

    modal.classList.add('open');
  }

  function spinRoulette() {
    const pool = getFilteredAdventures();
    const candidates = pool.length > 0 ? pool : state.adventures;
    if (candidates.length === 0) return;

    const slot = document.getElementById('roulette-slot');
    const viewBtn = document.getElementById('btn-view-roulette-choice');
    const spinBtn = document.getElementById('btn-spin-roulette');

    slot.classList.add('spinning');
    spinBtn.disabled = true;
    viewBtn.style.display = 'none';

    let count = 0;
    const maxCycles = 25;
    const interval = setInterval(() => {
      const randomAdv = candidates[Math.floor(Math.random() * candidates.length)];
      slot.innerHTML = `
        <div style="font-size: 0.85rem; color: var(--accent-amber); font-weight: 700; text-transform: uppercase;">${randomAdv.category}</div>
        <div style="font-family: var(--font-serif); font-size: 1.4rem; font-weight: 700; color: #fff; margin: 0.4rem 0;">${randomAdv.title}</div>
        <div style="font-size: 0.85rem; color: var(--text-secondary);">${randomAdv.neighborhood} • ${randomAdv.driveTime || 'Local SF'}</div>
      `;

      count++;
      if (count >= maxCycles) {
        clearInterval(interval);
        slot.classList.remove('spinning');
        spinBtn.disabled = false;

        // Final Pick
        const winningAdv = candidates[Math.floor(Math.random() * candidates.length)];
        state.rouletteAdvId = winningAdv.id;

        slot.innerHTML = `
          <div style="font-size: 0.85rem; color: var(--accent-teal); font-weight: 700; text-transform: uppercase;">✨ Arseniy's Adventure Pick! ✨</div>
          <div style="font-family: var(--font-serif); font-size: 1.5rem; font-weight: 700; color: #fff; margin: 0.5rem 0;">${winningAdv.title}</div>
          <div style="font-size: 0.9rem; color: var(--accent-amber); margin-bottom: 0.5rem;">${winningAdv.neighborhood} (${winningAdv.driveTime || 'Local SF'})</div>
          <p style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4; max-width: 380px;">${winningAdv.description.slice(0, 140)}...</p>
        `;

        viewBtn.style.display = 'inline-flex';
        triggerCelebration();
      }
    }, 80);
  }

  // --- WEEKEND ITINERARY PLANNER ---
  function toggleItineraryItem(id) {
    const idx = state.user.itinerary.indexOf(id);
    if (idx > -1) {
      state.user.itinerary.splice(idx, 1);
      showToast('Removed from weekend date');
    } else {
      state.user.itinerary.push(id);
      showToast('Added to weekend date plan! 🗺️');
    }
    saveUserData();
    updateModalItineraryBtn(id);
    renderItineraryDrawer();
  }

  function updateItineraryBadge() {
    const countEl = document.getElementById('itinerary-count');
    if (countEl) countEl.textContent = state.user.itinerary.length;
  }

  function renderItineraryDrawer() {
    const listEl = document.getElementById('itinerary-list');
    if (!listEl) return;

    const ids = state.user.itinerary;
    if (ids.length === 0) {
      listEl.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 3rem 1rem;">
          No adventures added yet! Click <strong>"Add to Weekend Date"</strong> on any card to build this weekend's date route.
        </div>
      `;
      return;
    }

    listEl.innerHTML = ids.map((id, index) => {
      const adv = state.adventures.find((a) => a.id === id);
      if (!adv) return '';

      return `
        <div class="itinerary-item">
          <div class="itinerary-step-num">${index + 1}</div>
          <div class="itinerary-item-info">
            <div class="itinerary-item-title">${adv.title}</div>
            <div class="itinerary-item-loc">${adv.neighborhood} • ${adv.driveTime || 'Local SF'}</div>
          </div>
          <button style="color: var(--text-muted); padding: 0.4rem;" onclick="window.appRemoveItinerary('${adv.id}')" title="Remove stop">&times;</button>
        </div>
      `;
    }).join('');
  }

  function printItinerary() {
    const ids = state.user.itinerary;
    if (ids.length === 0) {
      showToast('Add some adventures to your weekend date first!');
      return;
    }

    const items = ids.map((id, i) => {
      const adv = state.adventures.find((a) => a.id === id);
      return `${i + 1}. ${adv.title} (${adv.neighborhood})\n   Drive: ${adv.driveTime}\n   Tip: ${adv.tips || 'Enjoy together!'}`;
    }).join('\n\n');

    const itineraryText = `✨ Adventures with Babe: Weekend Date Itinerary ✨\nFor Arseniy's 32nd Birthday Celebration\n\n${items}\n\nHave the best time together! ❤️`;

    navigator.clipboard.writeText(itineraryText).then(() => {
      showToast('Itinerary copied to clipboard! Ready to text to Babe 💌');
    }).catch(() => {
      window.print();
    });
  }

  function clearItinerary() {
    state.user.itinerary = [];
    saveUserData();
    renderItineraryDrawer();
    showToast('Weekend itinerary cleared');
  }

  // --- CELEBRATION CONFETTI ---
  function triggerCelebration() {
    if (typeof confetti === 'function') {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#f59e0b', '#f43f5e', '#10b981', '#fbbf24', '#8b5cf6']
      });
    }
  }

  // --- TOAST NOTIFICATIONS ---
  function showToast(msg) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>✨</span><span>${msg}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  // --- GLOBAL ATTACHMENTS FOR INLINE ONCLICK (POPUP & DRAWER) ---
  window.appOpenModal = function (id) {
    openModal(id);
  };

  window.appRemoveItinerary = function (id) {
    toggleItineraryItem(id);
  };

  // --- EVENT LISTENERS INITIALIZATION ---
  function setupEventListeners() {
    // 1. Search Input
    const searchInput = document.getElementById('search-input');
    const searchClear = document.getElementById('search-clear');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        searchClear.classList.toggle('visible', state.searchQuery.length > 0);
        renderCards();
        if (state.currentView === 'map') updateMapMarkers();
      });
    }
    if (searchClear) {
      searchClear.addEventListener('click', () => {
        state.searchQuery = '';
        searchInput.value = '';
        searchClear.classList.remove('visible');
        renderCards();
        if (state.currentView === 'map') updateMapMarkers();
      });
    }

    // 2. Category Pills
    document.querySelectorAll('.cat-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.cat-pill').forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        state.activeCategory = pill.dataset.cat;
        renderCards();
        if (state.currentView === 'map') updateMapMarkers();
      });
    });

    // 3. Quick Tag Filter Chips
    document.querySelectorAll('.tag-filter-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const tag = chip.dataset.tag;
        if (state.activeTags.has(tag)) {
          state.activeTags.delete(tag);
          chip.classList.remove('active');
        } else {
          state.activeTags.add(tag);
          chip.classList.add('active');
        }
        renderCards();
        if (state.currentView === 'map') updateMapMarkers();
      });
    });

    // 4. Status Tabs
    document.querySelectorAll('.status-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.status-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        state.activeStatus = tab.dataset.status;
        renderCards();
        if (state.currentView === 'map') updateMapMarkers();
      });
    });

    // 5. View Switch (Grid vs Map)
    const viewGridBtn = document.getElementById('view-grid-btn');
    const viewMapBtn = document.getElementById('view-map-btn');
    const cardsGrid = document.getElementById('cards-grid');
    const mapView = document.getElementById('map-view');

    if (viewGridBtn && viewMapBtn) {
      viewGridBtn.addEventListener('click', () => {
        state.currentView = 'grid';
        viewGridBtn.classList.add('active');
        viewMapBtn.classList.remove('active');
        cardsGrid.style.display = 'grid';
        mapView.classList.remove('active');
      });

      viewMapBtn.addEventListener('click', () => {
        state.currentView = 'map';
        viewMapBtn.classList.add('active');
        viewGridBtn.classList.remove('active');
        cardsGrid.style.display = 'none';
        mapView.classList.add('active');
        initMap();
        setTimeout(() => {
          if (map) {
            map.invalidateSize();
            updateMapMarkers();
          }
        }, 150);
      });
    }

    // 6. Confetti & Celebration Button
    const btnConfetti = document.getElementById('btn-confetti');
    if (btnConfetti) {
      btnConfetti.addEventListener('click', () => {
        triggerCelebration();
        showToast("Happy 32nd Birthday, Arseniy! 🎂🎉");
      });
    }

    // 7. Roulette Buttons
    const btnRoulette = document.getElementById('btn-roulette');
    if (btnRoulette) {
      btnRoulette.addEventListener('click', openRouletteModal);
    }
    const rouletteCloseBtn = document.getElementById('roulette-close-btn');
    if (rouletteCloseBtn) {
      rouletteCloseBtn.addEventListener('click', () => {
        document.getElementById('roulette-modal').classList.remove('open');
      });
    }
    const btnSpin = document.getElementById('btn-spin-roulette');
    if (btnSpin) {
      btnSpin.addEventListener('click', spinRoulette);
    }
    const btnViewChoice = document.getElementById('btn-view-roulette-choice');
    if (btnViewChoice) {
      btnViewChoice.addEventListener('click', () => {
        document.getElementById('roulette-modal').classList.remove('open');
        if (state.rouletteAdvId) {
          openModal(state.rouletteAdvId);
        }
      });
    }

    // 8. Modal Close Buttons
    const modalCloseBtn = document.getElementById('modal-close-btn');
    if (modalCloseBtn) {
      modalCloseBtn.addEventListener('click', closeModal);
    }
    const detailModal = document.getElementById('detail-modal');
    if (detailModal) {
      detailModal.addEventListener('click', (e) => {
        if (e.target === detailModal) closeModal();
      });
    }

    // 9. Star Rating Click Handlers
    document.querySelectorAll('#modal-star-rating .star-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const star = parseInt(btn.dataset.star, 10);
        const id = state.currentModalAdvId;
        if (id) {
          state.user.ratings[id] = star;
          updateStarUI(star);
        }
      });
    });

    // 10. Photo Upload & Save Journal
    const photoInput = document.getElementById('journal-photo-input');
    if (photoInput) {
      photoInput.addEventListener('change', handlePhotoUpload);
    }
    const btnSaveJournal = document.getElementById('btn-save-journal');
    if (btnSaveJournal) {
      btnSaveJournal.addEventListener('click', saveJournalEntry);
    }

    // 11. Itinerary Actions
    const btnOpenItinerary = document.getElementById('btn-open-itinerary');
    const itineraryDrawer = document.getElementById('itinerary-drawer');
    const itineraryCloseBtn = document.getElementById('itinerary-close-btn');
    if (btnOpenItinerary) {
      btnOpenItinerary.addEventListener('click', () => {
        renderItineraryDrawer();
        itineraryDrawer.classList.add('open');
      });
    }
    if (itineraryCloseBtn) {
      itineraryCloseBtn.addEventListener('click', () => {
        itineraryDrawer.classList.remove('open');
      });
    }

    const modalBtnItinerary = document.getElementById('modal-btn-itinerary');
    if (modalBtnItinerary) {
      modalBtnItinerary.addEventListener('click', () => {
        if (state.currentModalAdvId) {
          toggleItineraryItem(state.currentModalAdvId);
        }
      });
    }

    const btnPrintItinerary = document.getElementById('btn-print-itinerary');
    if (btnPrintItinerary) {
      btnPrintItinerary.addEventListener('click', printItinerary);
    }
    const btnClearItinerary = document.getElementById('btn-clear-itinerary');
    if (btnClearItinerary) {
      btnClearItinerary.addEventListener('click', clearItinerary);
    }

    // 12. Add Custom Adventure Form
    const btnAddCustom = document.getElementById('btn-add-custom');
    const customModal = document.getElementById('custom-modal');
    const customCloseBtn = document.getElementById('custom-close-btn');
    const customForm = document.getElementById('custom-adventure-form');

    if (btnAddCustom) {
      btnAddCustom.addEventListener('click', () => {
        customModal.classList.add('open');
      });
    }
    if (customCloseBtn) {
      customCloseBtn.addEventListener('click', () => {
        customModal.classList.remove('open');
      });
    }
    if (customForm) {
      customForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const title = document.getElementById('custom-title').value.trim();
        const category = document.getElementById('custom-category').value;
        const neighborhood = document.getElementById('custom-neighborhood').value.trim();
        const address = document.getElementById('custom-address').value.trim();
        const desc = document.getElementById('custom-desc').value.trim();
        const arseniy = document.getElementById('custom-arseniy') ? document.getElementById('custom-arseniy').value.trim() : '';
        const veggie = document.getElementById('custom-veggie').value.trim();
        const naomi = document.getElementById('custom-naomi').value.trim();

        const customAdv = {
          id: 'custom-' + Date.now(),
          title,
          category,
          neighborhood,
          address: address || neighborhood,
          driveTime: 'Custom Spot',
          duration: 'Flexible',
          bestTime: 'Whenever Babe wants to go!',
          sunsetSpot: category === 'hike',
          naomiApproved: Boolean(naomi),
          naomiAnimals: false,
          naomiCrafts: false,
          naomiNote: naomi,
          arseniyHighlights: 'Custom curated adventure added by Joanna for Arseniy!',
          arseniyFoodPick: arseniy,
          joannaVeggiePick: veggie,
          instagramHandle: '@custom.babe',
          instagramUrl: '#',
          tags: ['Custom Adventure'],
          description: desc,
          tips: 'Added to our custom 32nd birthday adventure collection.',
          image: 'https://images.unsplash.com/photo-1506146332389-18140dc7b2fb?w=800'
        };

        state.user.customAdventures.push(customAdv);
        state.adventures.push(customAdv);
        saveUserData();
        customForm.reset();
        customModal.classList.remove('open');
        renderCards();
        showToast('Secret adventure added to our passport! ✨');
      });
    }

    // Keyboard ESC listener
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal();
        if (customModal) customModal.classList.remove('open');
        const rouletteModal = document.getElementById('roulette-modal');
        if (rouletteModal) rouletteModal.classList.remove('open');
        if (itineraryDrawer) itineraryDrawer.classList.remove('open');
      }
    });
  }

  // --- APPLICATION BOOTSTRAP ---
  function init() {
    initAdventures();
    setupEventListeners();
    renderCards();
    updatePassportTracker();
    updateItineraryBadge();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
