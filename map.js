// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoibHlyeWEiLCJhIjoiY203Y3Z4cndpMDZ4MjJpcHl2dTZrNW42ZiJ9.FwVZs1_79pbcNyfEXPfERw';

// Initialize the map
const map = new mapboxgl.Map({
    container: 'map', // ID of the div where the map will render
    style: 'mapbox://styles/mapbox/dark-v11', // Map style
    center: [-71.09415, 42.36027], // [longitude, latitude]
    zoom: 12, // Initial zoom level
    minZoom: 5, // Minimum allowed zoom
    maxZoom: 18 // Maximum allowed zoom
});

// Initialize the SVG layer and stations
const svg = d3.select('#map').select('svg');
let stations = [];
let departures = new Map();
let arrivals = new Map();
let timeFilter = -1;
let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

const timeSlider = document.getElementById('time-slider');
const selectedTime = document.getElementById('selected-time');
const anyTimeLabel = document.getElementById('any-time');
const lineStyle = {
    'line-color': 'red',
    'line-width': 3,
    'line-opacity': 0.4
};

function formatTime(minutes) {
    const date = new Date(0, 0, 0, 0, minutes);  // Set hours & minutes
    return date.toLocaleString('en-US', { timeStyle: 'short' }); // Format as HH:MM AM/PM
  };

let filteredTrips = [];
let filteredArrivals = new Map();
let filteredDepartures = new Map();
let filteredStations = [];


map.on('load', () => { 
    map.addSource('boston_route', {
        type: 'geojson',
        data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson?...'
    });
    map.addSource('cambridge_route', {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
    });

    map.addLayer({
        id: 'bike-lanes',
        type: 'line',
        source: 'boston_route',
        paint: {
            ...lineStyle
        }
    });

    map.addLayer({
        id: 'cambridge-bike-lanes',
        type: 'line',
        source: 'cambridge_route',
        paint: {
            ...lineStyle
        }
    });

    // Load the nested JSON file
    const jsonurl = "bluebikes-stations.json";
    d3.json(jsonurl).then(jsonData => {
        console.log('Loaded JSON Data:', jsonData);  // Log to verify structure
        stations = jsonData.data.stations;
        console.log('Stations Array:', stations);

        // Load additional data from a CSV file
        const csvUrl = "https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv";
        d3.csv(csvUrl).then(csvData => {
            console.log('Loaded CSV Data:', csvData);  // Log to verify structure
            const trips = csvData;
            console.log('Trips Array:', trips);
            // Initialize departures
            departures = d3.rollup(
                trips,
                (v) => v.length,
                (d) => d.start_station_id,
            );

            // Initialize arrivals
            arrivals = d3.rollup(
                trips,
                (v) => v.length,
                (d) => d.end_station_id,
            );

            stations = stations.map((station) => {
                let id = station.short_name;
                station.arrivals = arrivals.get(id) ?? 0;
                station.departures = departures.get(id) ?? 0;
                station.totalTraffic = station.arrivals + station.departures;
                return station;
            });

            for (let trip of trips) {

                trip.started_at = new Date(trip.started_at);
                trip.ended_at = new Date(trip.ended_at);
            }

            function filterTripsbyTime() {
                filteredTrips = timeFilter === -1
                    ? trips
                    : trips.filter((trip) => {
                        const startedMinutes = minutesSinceMidnight(trip.started_at);
                        const endedMinutes = minutesSinceMidnight(trip.ended_at);
                        return (
                          Math.abs(startedMinutes - timeFilter) <= 60 ||
                          Math.abs(endedMinutes - timeFilter) <= 60
                        );
                      });
              
                filteredDepartures = d3.rollup(
                    filteredTrips,
                    (v) => v.length,
                    (d) => d.start_station_id,
                );
        
                filteredArrivals = d3.rollup(
                    filteredTrips,
                    (v) => v.length,
                    (d) => d.end_station_id,
                );
        
                filteredStations = stations.map((station) => {
                    station = { ...station };
                    let id = station.short_name;
                    station.arrivals = filteredArrivals.get(id) ?? 0;
                    station.departures = filteredDepartures.get(id) ?? 0;
                    station.totalTraffic = station.arrivals + station.departures;
                    return station;
                });
            
                // Update the radius scale based on filtered data
                const radiusScale = d3.scaleSqrt()
                    .domain([0, d3.max(filteredStations, (d) => d.totalTraffic)])
                    .range((timeFilter === -1) ? [0, 20] : [0, 20]);
            
                // Update the circle sizes based on the filtered data
                svg.selectAll('circle')
                    .data(filteredStations)
                    .attr('r', d => radiusScale(d.totalTraffic))
                    .style('--departure-ratio', (d) =>
                        stationFlow(d.departures / d.totalTraffic),
                );
                    // .attr('cx', d => getCoords(d).cx)
                    // .attr('cy', d => getCoords(d).cy);
            };

            function updateTimeDisplay() {
                timeFilter = Number(timeSlider.value);  // Get slider value
              
                if (timeFilter === -1) {
                  selectedTime.textContent = '';  // Clear time display
                  anyTimeLabel.style.display = 'block';  // Show "(any time)"
                } else {
                  selectedTime.textContent = formatTime(timeFilter);  // Display formatted time
                  anyTimeLabel.style.display = 'hiddden';  // Hide "(any time)"
                }
              
                filterTripsbyTime();  // Filter trips and update circle sizes
              };
    
              timeSlider.addEventListener('input', updateTimeDisplay);
              updateTimeDisplay();


            // Define the radius scale
            const radiusScale = d3.scaleSqrt()
                .domain([0, d3.max(stations, (d) => d.totalTraffic)])
                .range([0]);

            // Append circles to the SVG for each station
            circles = svg.selectAll('circle')
                .data(stations)
                .enter()
                .append('circle')
                .attr('r', d => radiusScale(d.totalTraffic)) // Set radius based on totalTraffic
                .attr('fill', 'cyan')  // Circle fill color
                .attr('stroke', 'red')    // Circle border color
                .attr('stroke-width', 1)    // Circle border thickness
                .attr('opacity', 0.6)      // Circle opacity    
                .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic)); // Set custom CSS property
            
            circles.each(function(d) {
                  // Add <title> for browser tooltips
                  d3.select(this)
                    .append('title')
                    .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
                });

            // Initial position update when map loads
            updatePositions();
            // Reposition markers on map interactions

            function minutesSinceMidnight(date) {
                return date.getHours() * 60 + date.getMinutes();
            }
        }).catch(error => {
            console.error('Error loading CSV:', error);  // Handle errors if CSV loading fails
        });
    }).catch(error => {
        console.error('Error loading JSON:', error);  // Handle errors if JSON loading fails
    });

});
let circles;

// Function to update circle positions when the map moves/zooms
function updatePositions() {
    circles
        .attr('cx', d => getCoords(d).cx)  // Set the x-position using projected coordinates
        .attr('cy', d => getCoords(d).cy); // Set the y-position using projected coordinates
}
map.on('move', updatePositions);     // Update during map movement
map.on('zoom', updatePositions);     // Update during zooming
map.on('resize', updatePositions);   // Update on window resize
map.on('moveend', updatePositions);  // Final adjustment after movement ends
            
function getCoords(station) {
    const point = new mapboxgl.LngLat(+station.lon, +station.lat);  // Convert lon/lat to Mapbox LngLat
    const { x, y } = map.project(point);  // Project to pixel coordinates
    return { cx: x, cy: y };  // Return as object for use in SVG attributes
}
