const minLon = 21.1350;
const minLat = 45.7100;
const maxLon = 21.3200;
const maxLat = 45.8050;


fetch('package.json') // Fetch the JSON file
    .then(response => response.json()) // Parse JSON
    .then(data => console.log(data)) // Work with JSON data


async function create_map() {
    const map = new maplibregl.Map({
        container: 'map', // container id
        style: 'https://demotiles.maplibre.org/globe.json', // style URL
        center: [0, 0], // starting position [lng, lat]
        zoom: 2 // starting zoom
    });

    map.on('load', () => {
        const bounds = [[minLon, minLat], [maxLon, maxLat]];
        map.fitBounds(bounds, { padding: 60, duration: 1500 });

        // NO BUTTONS ADDED → clean map!
    });
}




