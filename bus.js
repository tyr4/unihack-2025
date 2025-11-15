// ------------------------------------------------------------
// bus.js – GTFS-based routing (shapes.txt) + Geoapify for map tiles
// ------------------------------------------------------------

const minLon = 21.1350;
const minLat = 45.7100;
const maxLon = 21.3200;
const maxLat = 45.8050;

const agencyId = 8;

const urlRoutes    = "https://api.tranzy.ai/v1/opendata/routes";
const urlTrips     = "https://api.tranzy.ai/v1/opendata/trips";
const urlStopTimes = "https://api.tranzy.ai/v1/opendata/stop_times";
const urlStops     = "https://api.tranzy.ai/v1/opendata/stops";
const urlShapes    = "https://api.tranzy.ai/v1/opendata/shapes";  // NEW

let geoapifyApiKey = '';
let tranzyApiKey   = '';
let map            = null;

// ------------------------------------------------------------------
// 1. Load API keys from package.json
// ------------------------------------------------------------------
async function pullAPiKey() {
    const r = await fetch('package.json');
    if (!r.ok) throw new Error('package.json missing');
    const d = await r.json();
    geoapifyApiKey = d.geoapifyApiKey;
    tranzyApiKey   = d.tranzyApiKey;
    if (!geoapifyApiKey || !tranzyApiKey) throw new Error('API keys missing');
}

// ------------------------------------------------------------------
// 2. Helper – call Tranzy endpoints
// ------------------------------------------------------------------
async function getBusEndpoint(url) {
    const r = await fetch(url, {
        headers: {
            'Accept'      : 'application/json',
            'X-API-KEY'   : tranzyApiKey,
            'X-Agency-Id' : agencyId
        }
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
}

// ------------------------------------------------------------------
// 3. Get route + trip + shape_id
// ------------------------------------------------------------------
async function getRouteWithShape(shortName) {
    const routes = await getBusEndpoint(urlRoutes);
    const route  = routes.find(r => r.route_short_name === shortName);
    if (!route) throw new Error(`Route ${shortName} not found`);

    const trips = await getBusEndpoint(urlTrips);
    const trip  = trips.find(t => t.route_id === route.route_id);
    if (!trip) throw new Error('Trip not found');

    return { route, trip };
}

// ------------------------------------------------------------------
// 4. Get GTFS shape geometry (official route path)
// ------------------------------------------------------------------
async function getShapeGeometry(shapeId) {
    if (!shapeId) return null;

    const shapes = await getBusEndpoint(urlShapes);
    const shapePoints = shapes
        .filter(s => s.shape_id === shapeId)
        .sort((a, b) => a.shape_pt_sequence - b.shape_pt_sequence);

    if (shapePoints.length === 0) return null;

    const coords = shapePoints.map(p => [p.shape_pt_lon, p.shape_pt_lat]);
    console.log(`GTFS shape loaded: ${coords.length} points (shape_id: ${shapeId})`);

    return {
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: { name: "E8", source: "GTFS shapes.txt" }
    };
}

// ------------------------------------------------------------------
// 5. Fallback: Map Matching via Geoapify (only if no shape)
// ------------------------------------------------------------------
async function buildFallbackRoute(stops) {
    const MAX_WAYPOINTS = 100;
    if (stops.length <= 2) {
        const coords = stops.map(p => [p.lon, p.lat]);
        return {
            type: "Feature",
            geometry: { type: "LineString", coordinates: coords },
            properties: { name: "E8", source: "fallback straight" }
        };
    }

    const chunks = [];
    for (let i = 0; i < stops.length; i += MAX_WAYPOINTS) {
        chunks.push(stops.slice(i, i + MAX_WAYPOINTS));
    }

    const segments = [];
    console.log(`Map-matching fallback: ${stops.length} stops in ${chunks.length} chunk(s)…`);

    for (const [idx, chunk] of chunks.entries()) {
        const coordsStr = chunk.map(p => `${p.lon},${p.lat}`).join(';');
        const url = `https://api.geoapify.com/v1/map-matching?coordinates=${coordsStr}&mode=drive&apiKey=${geoapifyApiKey}`;

        try {
            const resp = await fetch(url);
            if (!resp.ok) continue;
            const data = await resp.json();
            const geom = data?.features?.[0]?.geometry;
            if (geom?.coordinates) {
                segments.push(geom.coordinates);
            }
        } catch (err) {
            console.warn(`Map-matching chunk ${idx + 1} failed:`, err);
        }
    }

    if (segments.length === 0) {
        console.warn("Map-matching failed → using straight line");
        const coords = stops.map(p => [p.lon, p.lat]);
        return {
            type: "Feature",
            geometry: { type: "LineString", coordinates: coords },
            properties: { name: "E8", source: "fallback straight" }
        };
    }

    const merged = segments[0].slice();
    for (let i = 1; i < segments.length; i++) {
        merged.push(...segments[i].slice(1));
    }

    return {
        type: "Feature",
        geometry: { type: "LineString", coordinates: merged },
        properties: { name: "E8", source: "Geoapify map-matching" }
    };
}

// ------------------------------------------------------------------
// 6. Main: Get route → shape → fallback
// ------------------------------------------------------------------
async function getRouteGeometry(shortName = "E8") {
    const { route, trip } = await getRouteWithShape(shortName);

    // 1. Try GTFS shape (official geometry)
    const shapeGeom = await getShapeGeometry(trip.shape_id);
    if (shapeGeom) {
        return shapeGeom;
    }

    console.warn(`No GTFS shape found for shape_id=${trip.shape_id}. Falling back to stop-based routing.`);

    // 2. Fallback: Use stop sequence + map matching
    const stopTimes = await getBusEndpoint(urlStopTimes);
    const ordered = stopTimes
        .filter(st => st.trip_id === trip.trip_id)
        .sort((a, b) => a.stop_sequence - b.stop_sequence);

    const stops = await getBusEndpoint(urlStops);
    const stopList = ordered.map(st => {
        const s = stops.find(x => x.stop_id === st.stop_id);
        return s ? { lon: +s.stop_lon, lat: +s.stop_lat } : null;
    }).filter(Boolean);

    if (stopList.length === 0) throw new Error("No stops found");

    return await buildFallbackRoute(stopList);
}

// ------------------------------------------------------------------
// 7. Initialise the map (MapLibre GL JS) – Geoapify only for tiles
// ------------------------------------------------------------------
function createMap() {
    map = new maplibregl.Map({
        container: 'myMap',
        style: `https://maps.geoapify.com/v1/styles/osm-bright/style.json?apiKey=${geoapifyApiKey}`,
        center: [(minLon + maxLon) / 2, (minLat + maxLat) / 2],
        zoom: 13,
        maxBounds: [[minLon, minLat], [maxLon, maxLat]],
        maxZoom: 32,
        minZoom: 12,
        attributionControl: false
    });

    map.on('load', () => {
        const el = document.querySelector('.maplibregl-control-container .maplibregl-attribution-container');
        if (el) el.style.display = 'none';
    });

    map.on('styleimagemissing', e => {
        if (!map.hasImage(e.id)) {
            map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
        }
    });
}

// ------------------------------------------------------------------
// 8. Draw route line
// ------------------------------------------------------------------
function drawRouteOnly(geoJson) {
    if (!map?.isStyleLoaded()) {
        map.once('load', () => drawRouteOnly(geoJson));
        return;
    }

    if (map.getSource('route')) {
        map.getSource('route').setData(geoJson);
    } else {
        map.addSource('route', { type: 'geojson', data: geoJson });
        map.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route',
            paint: {
                'line-color': '#d00',
                'line-width': 5,
                'line-opacity': 0.9
            }
        });
    }

    const bounds = new maplibregl.LngLatBounds();
    geoJson.geometry.coordinates.forEach(c => bounds.extend(c));
    map.fitBounds(bounds, { padding: 80, duration: 1500 });

    // Log source
    console.log(`Route rendered from: ${geoJson.properties.source || 'unknown'}`);
}

// ------------------------------------------------------------------
// 9. Main entry point
// ------------------------------------------------------------------
window.onload = async () => {
    try {
        await pullAPiKey();
        createMap();

        const routeGeoJson = await getRouteGeometry("33");  // Change route here
        drawRouteOnly(routeGeoJson);

    } catch (e) {
        console.error(e);
        alert('Failed to load route – open console (F12).');
    }
};