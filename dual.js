// ✅ Final working dual.js (dot density + bivariate + yield + base layer fix)

const geojsonUrl = 'data.geojson';

const view = new ol.View({ center: [0, 0], zoom: 2 });
const baseLayerA = new ol.layer.Tile({ source: new ol.source.OSM() });
const baseLayerB = new ol.layer.Tile({ source: new ol.source.OSM() });

const mapA = new ol.Map({ target: 'mapA', layers: [baseLayerA], view });
const mapB = new ol.Map({ target: 'mapB', layers: [baseLayerB], view });

let layerA = null;
let layerB = null;

function hexToRgb(hex) {
  const bigint = parseInt(hex.slice(1), 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}
function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}
function blendColors(hex1, hex2) {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  return rgbToHex(
    Math.round((r1 + r2) / 2),
    Math.round((g1 + g2) / 2),
    Math.round((b1 + b2) / 2)
  );
}
function abbrev(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n;
}
function getBreakClass(value, breaks) {
  if (!breaks || !Array.isArray(breaks) || breaks.length < 2) return 0;
  if (value === undefined || value === null || isNaN(value)) return 0;
  for (let i = 0; i < breaks.length - 1; i++) {
    if (value >= breaks[i] && value <= breaks[i + 1]) return i;
  }
  return 0;
}

function renderDotDensityLayer(features, year) {
  const areaField = `Area_${year}`;
  const prodField = `Prod_${year}`;
  const areaVals = features.map(f => f.get(areaField)).filter(v => typeof v === 'number');
  const prodVals = features.map(f => f.get(prodField)).filter(v => typeof v === 'number');
  if (!areaVals.length || !prodVals.length) return null;

  const areaBreaks = ss.jenks(areaVals, 8);
  const prodBreaks = ss.jenks(prodVals, 10);
  const prodRamp = ['#f7fbff','#e3eef7','#d0e2ef','#bcd5e7','#a9c9df','#95bcd6','#82b0ce','#6ea3c6','#5b97be','#478ab6'];

  const background = new ol.layer.Vector({
    source: new ol.source.Vector({ features }),
    style: f => {
      const v = f.get(prodField);
      const idx = getBreakClass(v, prodBreaks);
      return new ol.style.Style({
        fill: new ol.style.Fill({ color: prodRamp[idx] }),
        stroke: new ol.style.Stroke({ color: '#666', width: 0.3 })
      });
    }
  });

  const dots = [];
  features.forEach(f => {
    const area = f.get(areaField);
    const geometry = f.getGeometry();
    const cls = getBreakClass(area, areaBreaks);
    const dotCount = cls + 1;
    const extent = geometry.getExtent();
    for (let i = 0; i < dotCount; i++) {
      let tries = 0;
      let point;
      do {
        const [minX, minY, maxX, maxY] = extent;
        const x = minX + Math.random() * (maxX - minX);
        const y = minY + Math.random() * (maxY - minY);
        point = new ol.geom.Point([x, y]);
        tries++;
      } while (!geometry.intersectsCoordinate(point.getCoordinates()) && tries < 10);
      if (tries < 10) {
        const dot = new ol.Feature({ geometry: point });
        dot.set('class', cls);
        dots.push(dot);
      }
    }
  });

  const dotLayer = new ol.layer.Vector({
    source: new ol.source.Vector({ features: dots }),
    style: f => {
      const cls = f.get('class');
      return new ol.style.Style({
        image: new ol.style.Circle({
          radius: 2 + cls * 0.6,
          fill: new ol.style.Fill({ color: '#654321' }),
          stroke: new ol.style.Stroke({ color: '#222', width: 0.3 })
        })
      });
    }
  });

  return new ol.layer.Group({ layers: [background, dotLayer] });
}

function createLayerByMode(mode, year, callback) {
  fetch(geojsonUrl)
    .then(res => res.json())
    .then(data => {
      const format = new ol.format.GeoJSON();
      const features = format.readFeatures(data, { featureProjection: 'EPSG:3857' });
      if (!features.length) return callback(null);

      let styleFn;
      let vectorLayer = null;

      if (mode === 'yield') {
        const field = `Yield_${year}`;
        const values = features.map(f => f.get(field)).filter(v => typeof v === 'number');
        const breaks = ss.jenks(values, 6);
        const colors = ['#edf8e9','#bae4b3','#74c476','#31a354','#006d2c','#00441b'];
        styleFn = f => {
          const v = f.get(field);
          const idx = getBreakClass(v, breaks);
          return new ol.style.Style({
            fill: new ol.style.Fill({ color: colors[idx] }),
            stroke: new ol.style.Stroke({ color: '#555', width: 0.5 })
          });
        };
        vectorLayer = new ol.layer.Vector({
          source: new ol.source.Vector({ features }),
          style: styleFn
        });
      }

      else if (mode === 'dotdensity') {
        const layer = renderDotDensityLayer(features, year);
        if (!layer) return callback(null);
        vectorLayer = layer;
      }

      else if (mode === 'bivariate') {
        const pf = `Prod_${year}`;
        const af = `Area_${year}`;
        const pvals = features.map(f => f.get(pf)).filter(v => typeof v === 'number');
        const avals = features.map(f => f.get(af)).filter(v => typeof v === 'number');
        const pbreaks = ss.jenks(pvals, 5);
        const abreaks = ss.jenks(avals, 5);
        const pcolors = ['#edf8e9','#bae4b3','#74c476','#31a354','#006d2c'];
        const acolors = ['#fff5eb','#fee6ce','#fdae6b','#e6550d','#a63603'];
        const showArea = document.getElementById('showArea').checked;
        const showProd = document.getElementById('showProd').checked;
        renderBivariateMatrix('legendBox', showProd, showArea, pbreaks, abreaks);
        styleFn = f => {
          const a = f.get(af), p = f.get(pf);
          const ai = getBreakClass(a, abreaks);
          const pi = getBreakClass(p, pbreaks);
          let color = '#ccc';
          if (showArea && showProd) color = blendColors(acolors[ai], pcolors[pi]);
          else if (showArea) color = acolors[ai];
          else if (showProd) color = pcolors[pi];
          return new ol.style.Style({
            fill: new ol.style.Fill({ color }),
            stroke: new ol.style.Stroke({ color: '#444', width: 0.5 })
          });
        };
        vectorLayer = new ol.layer.Vector({
          source: new ol.source.Vector({ features }),
          style: styleFn
        });
      }

      callback(vectorLayer);
    })
    .catch(err => {
      console.error("Error loading GeoJSON:", err);
      callback(null);
    });
}

function updateMaps() {
  const mode = document.getElementById('mapMode').value;
  const yearA = document.getElementById('yearA').value;
  const yearB = document.getElementById('yearB').value;
  document.getElementById('yearLabelA').innerText = yearA;
  document.getElementById('yearLabelB').innerText = yearB;
  if (layerA) mapA.removeLayer(layerA);
  if (layerB) mapB.removeLayer(layerB);
  createLayerByMode(mode, yearA, layer => { if (layer) { layerA = layer; mapA.addLayer(layerA); } });
  createLayerByMode(mode, yearB, layer => { if (layer) { layerB = layer; mapB.addLayer(layerB); } });
}

document.getElementById('mapMode').addEventListener('change', updateMaps);
document.getElementById('yearA').addEventListener('input', updateMaps);
document.getElementById('yearB').addEventListener('input', updateMaps);
document.getElementById('showArea').addEventListener('change', updateMaps);
document.getElementById('showProd').addEventListener('change', updateMaps);

updateMaps();
