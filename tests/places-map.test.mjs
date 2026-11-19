import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlacesMap } from '../places-map.js';

test('search waits for the map and replaces dots with only the latest results', async () => {
  const markers = [], fits = [], cameras = [], frames = new Set(), layers = [], filters = [], visibility = [];
  let map;
  class MapMock {
    constructor() { map = this; this.events = {}; }
    on(event, fn) { (this.events[event] ||= []).push(fn); }
    once(event, fn) { this.on(event, fn); }
    emit(event) { for (const fn of this.events[event] || []) fn({}); }
    addControl() {}
    getLayer() { return false; }
    addLayer(layer) { layers.push(layer); }
    setProjection() {}
    setFilter(id, filter) { filters.push({ id, filter }); }
    setLayoutProperty(id, key, value) { visibility.push({ id, key, value }); }
    stop() {}
    fitBounds(bounds, camera) { fits.push(bounds.points); cameras.push(camera); }
  }
  class Control { on() {} }
  class Popup {
    remove() {}
  }
  class Marker {
    constructor({ element, anchor, pitchAlignment }) { this.element = element; this.anchor = anchor; this.pitchAlignment = pitchAlignment; markers.push(this); }
    setLngLat(point) { this.point = point; return this; }
    addTo() { return this; }
    remove() { this.removed = true; }
  }
  class Bounds {
    constructor() { this.points = []; }
    extend(point) { this.points.push(point); }
  }
  const original = Object.fromEntries(['window', 'document', 'requestAnimationFrame', 'cancelAnimationFrame'].map(k => [k, globalThis[k]]));
  try {
    globalThis.window = { maplibregl: { Map: MapMock, NavigationControl: Control, FullscreenControl: Control, GeolocateControl: Control, Popup, Marker, LngLatBounds: Bounds } };
    globalThis.document = { createElement: () => ({ style: { setProperty() {} }, setAttribute() {} }) };
    globalThis.requestAnimationFrame = fn => { frames.add(fn); return fn; };
    globalThis.cancelAnimationFrame = fn => frames.delete(fn);
    const pmap = createPlacesMap({});
    const old = pmap.show([{ name: 'Old', lat: 45, lon: 9 }]);
    const results = [
      { name: 'Trattoria', kind: 'restaurant', rank: 1, lat: 45, lon: 9 },
      { name: 'Disco', kind: 'club', rank: 2, lat: 45.01, lon: 9.01 },
      { name: 'Bar', kind: 'bar', rank: 3, lat: 45.02, lon: 9.02 },
      { name: 'Invalid', lat: NaN, lon: 9 },
    ];
    const latest = pmap.show(results);
    await Promise.resolve();
    assert.equal(markers.length, 0);
    map.emit('style.load');
    assert.equal(layers.length, 1, 'worldwide places load without a search response');
    assert.equal(layers[0].source, 'openmaptiles');
    assert.equal(layers[0]['source-layer'], 'poi');
    assert.equal(layers[0].type, 'circle');
    assert.equal(layers[0].paint['circle-pitch-scale'], 'viewport', 'venue dots keep their size in tilted views');
    assert.ok(layers[0].paint['circle-radius'][4] >= 7, 'world venues have a clearly visible minimum radius');
    map.getLayer = id => layers.find(l => l.id === id);
    pmap.setFilters('club', true);
    assert.equal(filters.at(-1).filter.at(-1), 'club');
    assert.equal(visibility.at(-1).value, 'none', 'ordinary venues hide in GG deals mode');
    pmap.setFilters('all', false);
    assert.equal(visibility.at(-1).value, 'visible');
    map.emit('load');
    await Promise.all([old, latest]);
    assert.equal(markers.length, 3);
    assert.deepEqual(new Set(markers.map(m => m.place.kind)), new Set(['restaurant', 'club', 'bar']));
    assert.ok(markers.every(m => m.anchor === 'center' && m.element.title === m.place.name));
    assert.equal(fits.length, 1);
    assert.equal(cameras[0].pitch, 0, 'results open from above so buildings do not obscure venues');
    assert.ok(markers.every(m => m.pitchAlignment === 'viewport'));
    assert.match(markers.find(m => m.place.name === 'Trattoria').element.innerHTML, /pm-label.*Trattoria/);
    assert.equal(frames.size, 0, 'search results stay still');
    await pmap.show([]);
    assert.ok(markers.every(m => m.removed), 'empty results clear previous dots');
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});
