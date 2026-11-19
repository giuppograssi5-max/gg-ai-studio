// GG Places: 3D map of the best restaurants, bars and clubs.
// Uses MapLibre GL (loaded on demand) with OpenFreeMap vector tiles, which include 3D buildings.
const MAPLIBRE = 'https://unpkg.com/maplibre-gl@5.24.1/dist/maplibre-gl';
const STYLE = 'https://tiles.openfreemap.org/styles/liberty';
export const COLORS = { restaurant: '#e4572e', bar: '#7b4fd6', club: '#e83e8c' };
const ICONS = { restaurant: '🍽', bar: '🍸', club: '🪩' };

let loading;
function loadLib() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  return loading ||= new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = MAPLIBRE + '.css';
    document.head.append(css);
    const s = document.createElement('script');
    s.src = MAPLIBRE + '.js'; s.async = true;
    s.onload = () => (window.maplibregl ? resolve(window.maplibregl) : reject(Error('map')));
    s.onerror = () => { loading = null; reject(Error('The 3D map could not be loaded.')); };
    document.head.append(s);
  });
}

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const WORLD = { center: [12, 30], zoom: 1.6, pitch: 0, bearing: 0 };
// Below this zoom the map is the world globe; from here on it loads the places in view by itself.
export const AREA_ZOOM = 13;
const POI_LAYER = 'gg-world-places';
const POI_KIND = ['match', ['get', 'subclass'], ['restaurant', 'fast_food', 'food_court'], 'restaurant', ['bar', 'pub', 'biergarten'], 'bar', 'nightclub', 'club', ''];
export function worldPlacesFilter(kind = 'all') {
  return kind === 'all' ? ['in', POI_KIND, ['literal', Object.keys(COLORS)]] : ['==', POI_KIND, kind];
}
const hasCoordinates = p => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;

export function createPlacesMap(container, { onSelect, onArea } = {}) {
  let map, lib, markers = [], popup, spin = null, pending = null, auto = 0, lastArea = null, wantArea = false;
  let worldKind = 'all', onlyDeals = false;
  const ready = loadLib().then(ml => {
    lib = ml;
    map = new ml.Map({ container, style: STYLE, ...WORLD, maxPitch: 75, attributionControl: { compact: true } });
    map.addControl(new ml.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new ml.FullscreenControl(), 'top-right');
    const geo = new ml.GeolocateControl({ positionOptions: { enableHighAccuracy: false }, fitBoundsOptions: { zoom: 15.5 } });
    geo.on('geolocate', () => { stopSpin(); wantArea = true; });
    map.addControl(geo, 'top-right');
    popup = new ml.Popup({ offset: 22, closeButton: true, maxWidth: '280px' });
    map.on('style.load', () => {
      try { map.setProjection({ type: 'globe' }); } catch {}
      // Vector tiles stream real venues worldwide as the user explores, independently of search.
      map.addLayer({
        id: POI_LAYER, type: 'circle', source: 'openmaptiles', 'source-layer': 'poi', minzoom: 12,
        filter: worldPlacesFilter(worldKind),
        layout: { visibility: onlyDeals ? 'none' : 'visible' },
        paint: {
          'circle-color': ['match', POI_KIND, 'restaurant', COLORS.restaurant, 'bar', COLORS.bar, COLORS.club],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 7, 17, 11],
          'circle-stroke-color': '#fff', 'circle-stroke-width': 3,
          'circle-pitch-alignment': 'viewport', 'circle-pitch-scale': 'viewport',
          'circle-opacity': 1, 'circle-stroke-opacity': 1,
        },
      });
    });
    map.on('click', POI_LAYER, e => {
      const f = e.features?.[0];
      if (!f || f.geometry.type !== 'Point') return;
      const props = f.properties || {}, type = props.subclass;
      const kind = /^(restaurant|fast_food|food_court)$/.test(type) ? 'restaurant' : type === 'nightclub' ? 'club' : 'bar';
      const [lon, lat] = f.geometry.coordinates;
      const p = { name: props.name || props['name:latin'] || kind, kind, lat, lon };
      stopSpin();
      popup.setLngLat(e.lngLat).setHTML(popupHtml(p)).addTo(map);
      onSelect?.(p);
    });
    map.on('mouseenter', POI_LAYER, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', POI_LAYER, () => { map.getCanvas().style.cursor = ''; });
    map.on('load', () => {
      // Make the 3D buildings a little softer so the markers stand out.
      if (map.getLayer('building-3d')) map.setPaintProperty('building-3d', 'fill-extrusion-opacity', 0.75);
      if (!pending) startSpin();
    });
    ['mousedown', 'touchstart', 'wheel'].forEach(ev => map.on(ev, stopSpin));
    // Tilt into 3D automatically when the user zooms from the globe down to street level.
    map.on('zoomend', e => { if (e.originalEvent && map.getZoom() >= 14 && map.getPitch() < 20) map.easeTo({ pitch: 55, duration: 700 }); });
    map.on('moveend', e => {
      clearTimeout(auto);
      const byUser = !!e.originalEvent || wantArea;
      wantArea = false;
      if (!byUser || !onArea || map.getZoom() < AREA_ZOOM) return;
      auto = setTimeout(() => {
        const c = map.getCenter();
        if (lastArea && dist(lastArea, c) < 1200) return;
        lastArea = { lat: c.lat, lng: c.lng };
        onArea({ lat: c.lat, lon: c.lng });
      }, 700);
    });
    // Wait for the initial style before fitting results or starting camera movements.
    return new Promise(resolve => map.once('load', () => resolve(map)));
  });

  const dist = (a, b) => { const r = Math.PI / 180, x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r; return Math.hypot(x, y) * 6371e3; };
  function stopSpin() { if (spin) { cancelAnimationFrame(spin); spin = null; } }
  function startSpin() {
    stopSpin();
    let lastT = performance.now();
    const step = t => {
      const dt = t - lastT; lastT = t;
      // World view: turn the globe. Street level: orbit around the 3D buildings.
      if (map.getZoom() < 5) { const c = map.getCenter(); map.setCenter([((c.lng + dt * 0.006 + 540) % 360) - 180, c.lat]); }
      else map.setBearing(map.getBearing() + dt * 0.004);
      spin = requestAnimationFrame(step);
    };
    spin = requestAnimationFrame(step);
  }

  function popupHtml(p) {
    const meta = [ICONS[p.kind] + ' ' + (p.cuisine || p.kind), p.address].filter(Boolean).map(esc).join(' · ');
    return `<div class="pm-pop"><b>${p.rank && p.rank <= 10 ? `#${p.rank} · ` : ''}${esc(p.name)}</b>${p.deal ? '<span class="places-badge">GG deal</span>' : ''}<small>${meta}</small>${p.hours ? `<small>🕑 ${esc(p.hours)}</small>` : ''}${p.deal ? `<small>🎁 ${esc(p.deal.discount)}</small>` : ''}</div>`;
  }

  function show(places, center, { fit = true } = {}) {
    if (!map) { pending = [places, center, { fit }]; return; }
    pending = null;
    markers.forEach(m => m.remove());
    markers = [];
    popup.remove();
    stopSpin();
    map.stop();
    const pts = places.filter(hasCoordinates);
    // Draw the best places last so they sit on top.
    [...pts].reverse().forEach(p => {
      const top = p.rank && p.rank <= 10;
      const elm = document.createElement('button');
      elm.type = 'button';
      elm.className = 'pm-pin' + (top ? ' is-top' : '') + (p.deal ? ' has-deal' : '');
      elm.style.setProperty('--pin', COLORS[p.kind] || '#111');
      elm.setAttribute('aria-label', `${p.name}, ${p.kind}${top ? `, top pick number ${p.rank}` : ''}`);
      elm.title = p.name;
      elm.innerHTML = `<i class="pm-shape" aria-hidden="true">${top ? p.rank : ''}</i><span class="pm-label">${esc(p.name)}</span>`;
      elm.onclick = e => { e.stopPropagation(); focus(p); onSelect?.(p); };
      markers.push(Object.assign(new lib.Marker({ element: elm, anchor: 'center', pitchAlignment: 'viewport', rotationAlignment: 'viewport' }).setLngLat([p.lon, p.lat]).addTo(map), { place: p }));
    });
    if (!fit) return;
    stopSpin();
    if (center) lastArea = { lat: center.lat, lng: center.lon };
    if (pts.length) {
      const b = new lib.LngLatBounds();
      pts.forEach(p => b.extend([p.lon, p.lat]));
      map.fitBounds(b, { padding: 70, pitch: 0, bearing: 0, maxZoom: 16, duration: 1800 });
    } else if (center) map.flyTo({ center: [center.lon, center.lat], zoom: 14.5, pitch: 60 });
  }

  function focus(p) {
    if (!map || !hasCoordinates(p)) return;
    stopSpin();
    map.flyTo({ center: [p.lon, p.lat], zoom: 17.2, pitch: 65, bearing: map.getBearing(), duration: 1400, essential: true });
    popup.setLngLat([p.lon, p.lat]).setHTML(popupHtml(p)).addTo(map);
    markers.forEach(m => m.getElement().classList.toggle('is-active', m.place === p));
  }

  return {
    ready,
    setFilters(kind = 'all', deals = false) {
      worldKind = kind; onlyDeals = deals;
      if (!map?.getLayer(POI_LAYER)) return;
      map.setFilter(POI_LAYER, worldPlacesFilter(kind));
      map.setLayoutProperty(POI_LAYER, 'visibility', deals ? 'none' : 'visible');
    },
    show(places, center, opts) {
      pending = [places, center, opts];
      return ready.then(() => {
        if (pending) { const latest = pending; pending = null; show(...latest); }
      });
    },
    world() { if (!map) return; stopSpin(); popup.remove(); lastArea = null; map.flyTo({ ...WORLD, duration: 2200 }); map.once('moveend', startSpin); },
    flyTo(lat, lon) { if (!map) return; stopSpin(); popup.remove(); wantArea = true; lastArea = null; map.flyTo({ center: [lon, lat], zoom: 15, pitch: 60, bearing: -20, duration: 3500, essential: true }); },
    focus: p => ready.then(() => focus(p)).catch(() => {}),
    resize: () => map?.resize(),
    toggle3d() {
      if (!map) return true;
      const flat = map.getPitch() > 5;
      map.easeTo({ pitch: flat ? 0 : 60, duration: 800 });
      return !flat;
    },
    spin: () => (spin ? (stopSpin(), false) : (map && startSpin(), true)),
  };
}
