const minLon = 21.1350;
const minLat = 45.7100;
const maxLon = 21.3200;
const maxLat = 45.8050;

const agendyId = 8;

const urlRoutes = "https://api.tranzy.ai/v1/opendata/routes";
const urlTrips = "https://api.tranzy.ai/v1/opendata/trips";
const urlStopTimes = "https://api.tranzy.ai/v1/opendata/stop_times";
const urlStops = "https://api.tranzy.ai/v1/opendata/stops";

let geoapifyApiKey;
let routingUrl;
let tranzyApiKey;

let stationNames = [];
let coordonates = [
    45.7606, 21.2084,
    45.7580, 21.2140,
    45.7575, 21.2300,
    45.7558, 21.2297,
    45.7520, 21.2350,
    45.7490, 21.2410,
]
const waypointString = coordonates.map(p => `${p[1]},${p[0]}`).join('|');

async function pullAPiKey() {
    const response = await fetch('package.json');
    const data = await response.json();
    geoapifyApiKey = data.geoapifyApiKey;
    tranzyApiKey = data.tranzyApiKey;
    return geoapifyApiKey, tranzyApiKey;
}

async function getBusEndpoint(url) {
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'X-API-KEY': tranzyApiKey,
                'X-Agency-Id': agendyId
            }
        });
        const data = await response.json();
        return data;
    }
    catch (error) {
        console.error('Error fetching data:', error);
    }}

async function getRouteShortName() {
    const route_short_name = "E8"
    const routes = await getBusEndpoint(urlRoutes);
    const requiredRoutes = routes.filter(route => route.route_short_name === route_short_name);
    routeId = requiredRoutes[0].route_id;
    console.log(routeId);
    getTripId(routeId);
}

async function getTripId(trip_id){
    const trips = await getBusEndpoint(urlTrips);
    const requiredTrips = trips.filter(trip => trip.route_id === trip_id);
    const tripId = requiredTrips[0].trip_id;
    console.log(tripId);
    getStopId(tripId);
}

async function getStopId(stopId){
    const stopTimes = await getBusEndpoint(urlStopTimes);
    const requiredStopTimes = stopTimes.filter(stopTime => stopTime.trip_id === stopId);
    const stopIdsList = requiredStopTimes.map(stopTime => stopTime.stop_id);

    stopIdsList.forEach(trip => {
        stationNames.push(trip.trip_headsign);
    })

    console.log(stopIdsList);
    getCords(stopIdsList);
}

async function getCords(stopIdsList){
    const stops = await getBusEndpoint(urlStops);
    stopIdsList.forEach(stopId => {
        const stop = stops.find(s => s.stop_id === stopId);
        if (stop) {
            stationNames.push({ name: stop.stop_name, lat: stop.stop_lat, lon: stop.stop_lon });
            coordonates.push(stop.stop_lat, stop.stop_lon);
        }
    });
    console.log(stationNames);
    console.log(coordonates);
}

async function create_map() {
    const map = new maplibregl.Map({
        container: 'myMap',
        style: `https://maps.geoapify.com/v1/styles/osm-bright/style.json?apiKey=${geoapifyApiKey}`,
        center: [(minLon + maxLon) / 2, (minLat + maxLat) / 2],
        zoom: 13,
        attributionControl: false,
        maxBounds: [[minLon, minLat], [maxLon, maxLat]],
        maxZoom: 32,
        minZoom: 12
    });

    map.on('styleimagemissing', (e) => {
        const id = e.id;

        // Skip if already added
        if (map.hasImage(id)) return;

        // Add a transparent 1×1 PNG as a placeholder
        const emptyImage = new Uint8Array([0, 0, 0, 0]); // RGBA transparent pixel
        map.addImage(id, { width: 1, height: 1, data: emptyImage });
    });

    map.on('load', () => {
        const bounds = [[minLon, minLat], [maxLon, maxLat]];
        map.fitBounds(bounds, { padding: 60, duration: 1500 });
    });

    map.on('load', async () => {
        try {
            // console.log('Fetching:', routingUrl);  // ← check console
            const res = await fetch(routingUrl);
            if (!res.ok) {
                const err = await res.text();
                throw new Error(`HTTP ${res.status}: ${err}`);
            }
            const data = await res.json();

            if (!data.features || data.features.length === 0) {
                throw new Error('No route returned');
            }

            const route = data.features[0];

            // Draw route
            map.addSource('route', { type: 'geojson', data: route });
            map.addLayer({
                id: 'route-line',
                type: 'line',
                source: 'route',
                paint: { 'line-color': '#007cbf', 'line-width': 6 }
            });

            // // Draw markers
            // waypoints.forEach((p, i) => {
            //     new maplibregl.Marker({ color: '#d00' })
            //         .setLngLat([p[1], p[0]])
            //         .setPopup(new maplibregl.Popup().setText(`Stop ${i+1}`))
            //         .addTo(map);
            // });

            // Fit to route
            const bounds = new maplibregl.LngLatBounds();
            route.geometry.coordinates.forEach(c => bounds.extend(c));
            map.fitBounds(bounds, { padding: 80, duration: 1000 });

        } catch (err) {
            console.error('Routing failed:', err);
            alert('Routing failed – open console (F12) for details');
        }
    });
}

function buildRouteURL(coords) {
    const waypoints = [];
    for (let i = 0; i < coords.length; i += 2) {
        waypoints.push(`${coords[i]},${coords[i + 1]}`);
    }
    routingUrl = `https://api.geoapify.com/v1/routing?waypoints=${waypoints.join('|')}&mode=transit&traffic=approximated&type=less_maneuvers&apiKey=${geoapifyApiKey}`;
    return routingUrl;
}

window.onload = async function() {
    await pullAPiKey()
    await create_map();
    await buildRouteURL(coordonates);

    await getRouteShortName()
}

