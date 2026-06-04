// app.js - Belgium Eco-Housing Livability Map Logic

let map;
let geojsonLayer;
let topojsonData;
let municipalityData;
let selectedFeature = null;
let comparisonChart = null;

// Weights for Sweet Spot calculation (updated by UI sliders)
let weights = {
    price: 30,
    pfas: 30,
    air: 20,
    organic: 20
};

// Mode: 'single' (Sweet Spot Index) or 'bivariate' (Eco vs Price Matrix)
let mapMode = 'bivariate';

document.addEventListener('DOMContentLoaded', () => {
    initUI();
    initMap();
    loadData();
});

// Initialize dashboard UI interactions
function initUI() {
    // Sliders
    const sliders = ['price', 'pfas', 'air', 'organic'];
    sliders.forEach(key => {
        const slider = document.getElementById(`${key}-weight`);
        const valueSpan = document.getElementById(`${key}-weight-val`);
        if (slider && valueSpan) {
            slider.addEventListener('input', (e) => {
                weights[key] = parseInt(e.target.value);
                valueSpan.textContent = `${weights[key]}%`;
                updateMapColors();
                if (selectedFeature) {
                    showDetails(selectedFeature.properties);
                }
            });
        }
    });

    // Map Mode Toggles
    const btnSingle = document.getElementById('btn-mode-single');
    const btnBivariate = document.getElementById('btn-mode-bivariate');
    
    if (btnSingle && btnBivariate) {
        btnSingle.addEventListener('click', () => {
            mapMode = 'single';
            btnSingle.classList.add('bg-teal-600', 'text-white');
            btnSingle.classList.remove('bg-slate-800', 'text-slate-300');
            btnBivariate.classList.remove('bg-teal-600', 'text-white');
            btnBivariate.classList.add('bg-slate-800', 'text-slate-300');
            document.getElementById('weight-controls').classList.remove('opacity-40', 'pointer-events-none');
            document.getElementById('single-legend-container').classList.remove('hidden');
            document.getElementById('bivariate-legend-container').classList.add('hidden');
            updateMapColors();
        });

        btnBivariate.addEventListener('click', () => {
            mapMode = 'bivariate';
            btnBivariate.classList.add('bg-teal-600', 'text-white');
            btnBivariate.classList.remove('bg-slate-800', 'text-slate-300');
            btnSingle.classList.remove('bg-teal-600', 'text-white');
            btnSingle.classList.add('bg-slate-800', 'text-slate-300');
            // Bivariate uses fixed scales, disable weight sliders visually
            document.getElementById('weight-controls').classList.add('opacity-40', 'pointer-events-none');
            document.getElementById('single-legend-container').classList.add('hidden');
            document.getElementById('bivariate-legend-container').classList.remove('hidden');
            updateMapColors();
        });
    }

    // Search bar auto-complete & lookup
    const searchInput = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');
    
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            if (query.length < 2) {
                searchResults.classList.add('hidden');
                return;
            }

            const matches = [];
            for (const name in municipalityData) {
                const item = municipalityData[name];
                if (name.toLowerCase().includes(query) || 
                    (item.nameNew && item.nameNew.toLowerCase().includes(query)) ||
                    (item.province && item.province.toLowerCase().includes(query))) {
                    matches.push(item);
                }
            }

            // Display autocomplete suggestions
            if (matches.length > 0) {
                searchResults.innerHTML = '';
                matches.slice(0, 5).forEach(match => {
                    const li = document.createElement('li');
                    li.className = 'px-4 py-2 hover:bg-slate-700 cursor-pointer text-sm border-b border-slate-800 text-slate-200 flex justify-between';
                    li.innerHTML = `<span>${match.name}</span><span class="text-xs text-slate-400">${match.province}</span>`;
                    li.addEventListener('click', () => {
                        selectMunicipalityByName(match.name);
                        searchInput.value = match.name;
                        searchResults.classList.add('hidden');
                    });
                    searchResults.appendChild(li);
                });
                searchResults.classList.remove('hidden');
            } else {
                searchResults.classList.add('hidden');
            }
        });

        // Hide search suggestions on click outside
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
                searchResults.classList.add('hidden');
            }
        });
    }

    // Address Search (using Nominatim OSM geocoding API)
    const searchBtn = document.getElementById('search-btn');
    if (searchBtn && searchInput) {
        searchBtn.addEventListener('click', () => {
            const addressQuery = searchInput.value.trim();
            if (addressQuery.length > 0) {
                geocodeAddress(addressQuery);
            }
        });
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const addressQuery = searchInput.value.trim();
                if (addressQuery.length > 0) {
                    geocodeAddress(addressQuery);
                }
            }
        });
    }
}

// Initialize Leaflet Map
function initMap() {
    // Centered on Belgium (latitude 50.85, longitude 4.35)
    map = L.map('map', {
        zoomControl: false,
        attributionControl: false
    }).setView([50.8504, 4.3488], 9);

    L.control.zoom({
        position: 'bottomright'
    }).addTo(map);

    // Dark-themed tiles from CartoDB
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19
    }).addTo(map);
}

// Load TopoJSON boundaries & Municipality indicators
async function loadData() {
    try {
        const [topojsonResponse, dataResponse] = await Promise.all([
            fetch('Gemeenten_Fusies.json'),
            fetch('municipality_data.json')
        ]);

        topojsonData = await topojsonResponse.json();
        municipalityData = await dataResponse.json();

        // Convert TopoJSON to GeoJSON
        const geojsonData = topojson.feature(topojsonData, topojsonData.objects.Gemeenten);

        // Join data parameters into GeoJSON properties
        geojsonData.features.forEach(feature => {
            const name = feature.properties.NAME_4;
            const dataRecord = municipalityData[name];
            if (dataRecord) {
                // Merge data fields
                feature.properties.price = dataRecord.price;
                feature.properties.pfas = dataRecord.pfas;
                feature.properties.air = dataRecord.air;
                feature.properties.organic = dataRecord.organic;
                feature.properties.province = dataRecord.province;
                feature.properties.region = dataRecord.region;
            } else {
                // Baseline defaults if not matched
                feature.properties.price = 250000;
                feature.properties.pfas = 20;
                feature.properties.air = 40;
                feature.properties.organic = 2.0;
                feature.properties.province = feature.properties.NAME_2 || "Unknown";
                feature.properties.region = feature.properties.NAME_1 || "Unknown";
            }
        });

        // Add layer to map
        renderGeoJsonLayer(geojsonData);

        // Select a default municipality on load (e.g. Brussel)
        selectMunicipalityByName("Brussel");

    } catch (error) {
        console.error("Error loading data sources:", error);
    }
}

// Draw/Update GeoJSON layer
function renderGeoJsonLayer(geojsonData) {
    if (geojsonLayer) {
        map.removeLayer(geojsonLayer);
    }

    geojsonLayer = L.geoJson(geojsonData, {
        style: getFeatureStyle,
        onEachFeature: (feature, layer) => {
            layer.on({
                mouseover: highlightFeature,
                mouseout: resetHighlight,
                click: onFeatureClick
            });
        }
    }).addTo(map);
}

// Calculate the styles for each municipality polygon
function getFeatureStyle(feature) {
    const color = getFeatureColor(feature.properties);
    return {
        fillColor: color,
        weight: 1.2,
        opacity: 1,
        color: 'rgba(15, 23, 42, 0.4)', // Dark border
        fillOpacity: 0.8
    };
}

// Calculate color based on mode and attributes
function getFeatureColor(props) {
    if (mapMode === 'single') {
        const score = calculateSweetSpotScore(props);
        // Single color scale: Red (worst) -> Yellow -> Green (best/sweet spot)
        if (score > 75) return '#059669'; // Emerald Green
        if (score > 65) return '#10b981'; // Green
        if (score > 55) return '#84cc16'; // Lime Green
        if (score > 48) return '#eab308'; // Yellow
        if (score > 40) return '#f97316'; // Orange
        return '#dc2626'; // Red
    } else {
        // Bivariate map style: Eco Quality vs Affordability matrix
        const ecoScore = calculateEcoQualityScore(props);
        const price = props.price;

        // Categorize Eco Quality (1 = Dirty, 2 = Medium, 3 = Clean)
        let ecoCat = 2;
        if (ecoScore < 40) ecoCat = 1;
        else if (ecoScore > 65) ecoCat = 3;

        // Categorize Affordability (1 = Expensive, 2 = Medium, 3 = Cheap/Affordable)
        let affordCat = 2;
        if (price > 380000) affordCat = 1;
        else if (price < 240000) affordCat = 3;

        // 3x3 Bivariate Color Matrix
        if (ecoCat === 3 && affordCat === 3) return '#059669'; // Clean & Cheap (Sweet Spot) -> Emerald Green
        if (ecoCat === 3 && affordCat === 2) return '#0ea5e9'; // Clean & Mid Price -> Sky Blue
        if (ecoCat === 3 && affordCat === 1) return '#4f46e5'; // Clean & Expensive -> Indigo Blue
        
        if (ecoCat === 2 && affordCat === 3) return '#a7f3d0'; // Mid Clean & Cheap -> Mint Green
        if (ecoCat === 2 && affordCat === 2) return '#cbd5e1'; // Mid Clean & Mid Price -> Slate Grey
        if (ecoCat === 2 && affordCat === 1) return '#c084fc'; // Mid Clean & Expensive -> Lavender Purple
        
        if (ecoCat === 1 && affordCat === 3) return '#d97706'; // Dirty & Cheap -> Amber Orange
        if (ecoCat === 1 && affordCat === 2) return '#f87171'; // Dirty & Mid Price -> Light Red
        if (ecoCat === 1 && affordCat === 1) return '#7f1d1d'; // Dirty & Expensive (Worst Spot) -> Dark Red
    }
}

// Calculate standard Sweet Spot composite index (0-100, higher is better)
function calculateSweetSpotScore(props) {
    // Normalizations (0 is worst, 100 is best)
    const pfas_score = 100 - props.pfas;
    const air_score = 100 - props.air;
    
    // Price Normalization: €100k -> 100 (best/cheap), €800k -> 0 (worst/expensive)
    const price_score = Math.max(0, Math.min(100, 100 - ((props.price - 100000) / 700000) * 100));
    
    // Organic Farming Normalization: 0% -> 0, 30%+ -> 100
    const organic_score = Math.min(100, (props.organic / 30) * 100);

    const totalWeight = weights.price + weights.pfas + weights.air + weights.organic;
    if (totalWeight === 0) return 50;

    const weightedSum = (price_score * weights.price) + 
                        (pfas_score * weights.pfas) + 
                        (air_score * weights.air) + 
                        (organic_score * weights.organic);

    return Math.round(weightedSum / totalWeight);
}

// Eco-Quality sub-score helper (0-100, higher is cleaner nature)
function calculateEcoQualityScore(props) {
    const pfas_score = 100 - props.pfas;
    const air_score = 100 - props.air;
    const organic_score = Math.min(100, (props.organic / 30) * 100);
    
    // Fixed weights for Eco Quality: PFAS (40%), Air Quality (40%), Organic (20%)
    return Math.round((pfas_score * 0.40) + (air_score * 0.40) + (organic_score * 0.20));
}

// Interactive Map Hover Functions
function highlightFeature(e) {
    const layer = e.target;
    layer.setStyle({
        weight: 3,
        color: '#14b8a6', // Glowing Teal border
        fillOpacity: 0.95
    });

    if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
        layer.bringToFront();
    }

    // Show dynamic floating tooltip with municipality name
    layer.bindTooltip(`
        <div class="text-xs font-semibold">${layer.feature.properties.NAME_4}</div>
        <div class="text-[10px] text-slate-400">${layer.feature.properties.province}</div>
    `, {
        direction: 'top',
        sticky: true,
        className: 'glass-panel text-white border-0 shadow-lg px-2 py-1 rounded'
    }).openTooltip();
}

function resetHighlight(e) {
    geojsonLayer.resetStyle(e.target);
}

function onFeatureClick(e) {
    const layer = e.target;
    selectedFeature = layer.feature;
    showDetails(layer.feature.properties);
    map.fitBounds(layer.getBounds(), {
        padding: [100, 100],
        maxZoom: 12,
        animate: true,
        duration: 0.8
    });
}

// Update all colors on map sliders/controls change
function updateMapColors() {
    if (geojsonLayer) {
        geojsonLayer.eachLayer(layer => {
            const color = getFeatureColor(layer.feature.properties);
            layer.setStyle({
                fillColor: color
            });
        });
    }
}

// Select municipality from search autocomplete click
function selectMunicipalityByName(name) {
    if (!geojsonLayer) return;
    
    let targetLayer = null;
    geojsonLayer.eachLayer(layer => {
        if (layer.feature.properties.NAME_4.toLowerCase() === name.toLowerCase()) {
            targetLayer = layer;
        }
    });

    if (targetLayer) {
        selectedFeature = targetLayer.feature;
        showDetails(targetLayer.feature.properties);
        map.fitBounds(targetLayer.getBounds(), {
            padding: [100, 100],
            maxZoom: 12,
            animate: true,
            duration: 0.8
        });
        targetLayer.setStyle({
            weight: 3,
            color: '#14b8a6',
            fillOpacity: 0.95
        });
    }
}

// Show selected municipality details in sidebar
function showDetails(props) {
    // Calculate scores
    const sweetSpot = calculateSweetSpotScore(props);
    const ecoQuality = calculateEcoQualityScore(props);

    // Update Text Elements
    document.getElementById('detail-name').textContent = props.NAME_4;
    document.getElementById('detail-region-province').textContent = `${props.region} | Prov. ${props.province}`;
    document.getElementById('detail-price').textContent = `${props.price.toLocaleString('fr-BE')} €`;
    document.getElementById('detail-pfas').textContent = `${props.pfas}/100`;
    document.getElementById('detail-air').textContent = `${props.air}/100`;
    document.getElementById('detail-organic').textContent = `${props.organic}%`;

    // Dynamic color values for scores
    const sweetSpotSpan = document.getElementById('detail-score');
    sweetSpotSpan.textContent = `${sweetSpot}/100`;
    sweetSpotSpan.className = 'text-3xl font-bold ' + getScoreColorClass(sweetSpot);

    // Update progress bars
    updateProgressBar('progress-pfas', props.pfas, true);
    updateProgressBar('progress-air', props.air, true);
    updateProgressBar('progress-organic', (props.organic / 30) * 100, false); // 30% is max relative index
    updateProgressBar('progress-price', ((props.price - 100000) / 700000) * 100, true);

    // Show detail panels
    document.getElementById('placeholder-panel').classList.add('hidden');
    document.getElementById('detail-panel').classList.remove('hidden');

    // Render/Update comparison chart
    renderChart(props);
}

// Helper to color-code score text classes
function getScoreColorClass(score) {
    if (score > 70) return 'text-emerald-400';
    if (score > 55) return 'text-lime-400';
    if (score > 45) return 'text-amber-400';
    return 'text-red-400';
}

// Helper to update progress bar width and colors
function updateProgressBar(id, valuePercent, invertColor) {
    const bar = document.getElementById(id);
    if (!bar) return;
    const clampedVal = Math.max(2, Math.min(100, valuePercent));
    bar.style.width = `${clampedVal}%`;

    // High value is clean/good (for organic) vs high value is dirty/expensive (pfas, air, price)
    if (invertColor) {
        if (valuePercent > 65) bar.className = 'h-2 rounded bg-red-500';
        else if (valuePercent > 35) bar.className = 'h-2 rounded bg-amber-500';
        else bar.className = 'h-2 rounded bg-emerald-500';
    } else {
        if (valuePercent > 50) bar.className = 'h-2 rounded bg-emerald-500';
        else if (valuePercent > 20) bar.className = 'h-2 rounded bg-lime-500';
        else bar.className = 'h-2 rounded bg-amber-500';
    }
}

// Render dynamic comparison chart using Chart.js
function renderChart(props) {
    const ctx = document.getElementById('comparison-chart').getContext('2d');

    // Get provincial baselines by reading all municipalities in same province
    let provSumPrice = 0, provSumPfas = 0, provSumAir = 0, provSumOrg = 0, provCount = 0;
    let natSumPrice = 0, natSumPfas = 0, natSumAir = 0, natSumOrg = 0, natCount = 0;

    for (const name in municipalityData) {
        const item = municipalityData[name];
        natSumPrice += item.price;
        natSumPfas += item.pfas;
        natSumAir += item.air;
        natSumOrg += item.organic;
        natCount++;

        if (item.province === props.province) {
            provSumPrice += item.price;
            provSumPfas += item.pfas;
            provSumAir += item.air;
            provSumOrg += item.organic;
            provCount++;
        }
    }

    const provAvg = {
        price: Math.round(provSumPrice / provCount),
        pfas: Math.round(provSumPfas / provCount),
        air: Math.round(provSumAir / provCount),
        organic: Number((provSumOrg / provCount).toFixed(1))
    };

    const natAvg = {
        price: Math.round(natSumPrice / natCount),
        pfas: Math.round(natSumPfas / natCount),
        air: Math.round(natSumAir / natCount),
        organic: Number((natSumOrg / natCount).toFixed(1))
    };

    // Data values relative to national average (100% baseline)
    const datasets = {
        labels: ['Housing Price', 'PFAS Risk', 'Air Pollution', 'Organic Farmland'],
        selected: [
            Math.round((props.price / natAvg.price) * 100),
            Math.round((props.pfas / Math.max(1, natAvg.pfas)) * 100),
            Math.round((props.air / natAvg.air) * 100),
            Math.round((props.organic / Math.max(0.1, natAvg.organic)) * 100)
        ],
        province: [
            Math.round((provAvg.price / natAvg.price) * 100),
            Math.round((provAvg.pfas / Math.max(1, natAvg.pfas)) * 100),
            Math.round((provAvg.air / natAvg.air) * 100),
            Math.round((provAvg.organic / Math.max(0.1, natAvg.organic)) * 100)
        ]
    };

    if (comparisonChart) {
        comparisonChart.destroy();
    }

    comparisonChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: datasets.labels,
            datasets: [
                {
                    label: props.NAME_4,
                    data: datasets.selected,
                    backgroundColor: 'rgba(20, 184, 166, 0.7)', // Teal
                    borderColor: 'rgba(20, 184, 166, 1)',
                    borderWidth: 1,
                    borderRadius: 4
                },
                {
                    label: `Prov. ${props.province} Avg`,
                    data: datasets.province,
                    backgroundColor: 'rgba(148, 163, 184, 0.4)', // Slate Grey
                    borderColor: 'rgba(148, 163, 184, 0.8)',
                    borderWidth: 1,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.6)',
                        font: { family: 'Outfit' },
                        callback: function(value) { return value + '%'; }
                    },
                    title: {
                        display: true,
                        text: 'Relative to National Avg (100%)',
                        color: 'rgba(255, 255, 255, 0.4)',
                        font: { family: 'Outfit', size: 10 }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.8)',
                        font: { family: 'Outfit', weight: 'medium' }
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: 'rgba(255, 255, 255, 0.8)',
                        font: { family: 'Outfit' },
                        boxWidth: 12
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.raw}% of Belgian Avg`;
                        }
                    }
                }
            }
        }
    });
}

// Resolve Address Search via Nominatim OpenStreetMap Geocoding API
async function geocodeAddress(query) {
    const statusText = document.getElementById('search-status');
    statusText.textContent = "Searching address...";
    statusText.classList.remove('hidden');

    try {
        // Limit query to Belgium for accuracy
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=be&limit=1`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'BelgiumEcoHousingMapApp/1.0' // Nominatim usage policy request
            }
        });
        const results = await response.json();

        if (results && results.length > 0) {
            statusText.textContent = "Address resolved! Locating...";
            const lat = parseFloat(results[0].lat);
            const lon = parseFloat(results[0].lon);

            // Locate containing polygon
            const leafletLatLng = L.latLng(lat, lon);
            let containingFeature = null;

            geojsonLayer.eachLayer(layer => {
                const geom = layer.feature.geometry;
                if (isPointInPolygon(leafletLatLng, layer)) {
                    containingFeature = layer.feature;
                }
            });

            // Center and zoom map to coordinates
            map.setView([lat, lon], 13);
            
            // Add temporary marker
            const pulseIcon = L.divIcon({
                className: 'relative',
                html: '<div class="absolute -left-3 -top-3 w-6 h-6 bg-teal-500 rounded-full opacity-60 border border-white hotspot-pulse"></div>' +
                      '<div class="absolute -left-1.5 -top-1.5 w-3 h-3 bg-white rounded-full border border-teal-500"></div>',
                iconSize: [24, 24]
            });
            const marker = L.marker([lat, lon], { icon: pulseIcon }).addTo(map);

            // Remove marker after 5s
            setTimeout(() => {
                map.removeLayer(marker);
            }, 5000);

            if (containingFeature) {
                selectMunicipalityByName(containingFeature.properties.NAME_4);
                statusText.classList.add('hidden');
            } else {
                statusText.textContent = "Located coordinates, but could not map to a municipality boundary.";
                setTimeout(() => statusText.classList.add('hidden'), 3000);
            }
        } else {
            statusText.textContent = "No results found in Belgium. Try adding postal code or city.";
            setTimeout(() => statusText.classList.add('hidden'), 3500);
        }
    } catch (error) {
        console.error("Geocoding failed:", error);
        statusText.textContent = "Error connecting to geocoder. Try municipality search.";
        setTimeout(() => statusText.classList.add('hidden'), 3500);
    }
}

// Ray-casting algorithm to determine if search coordinate is inside a polygon
function isPointInPolygon(latlng, layer) {
    let layers = [];
    if (layer instanceof L.Polygon) {
        layers = [layer];
    } else if (layer instanceof L.MultiPolygon || layer instanceof L.FeatureGroup) {
        layer.eachLayer(l => layers.push(l));
    }

    const x = latlng.lng;
    const y = latlng.lat;

    for (let l = 0; l < layers.length; l++) {
        const poly = layers[l];
        // Standard polygon coordinate arrays (handling multi-dimensional arrays if nested)
        const latlngs = poly.getLatLngs();
        const rings = Array.isArray(latlngs[0]) ? latlngs : [latlngs];
        
        for (let r = 0; r < rings.length; r++) {
            const coords = rings[r][0] && Array.isArray(rings[r][0]) ? rings[r][0] : rings[r];
            let inside = false;
            for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
                const xi = coords[i].lng, yi = coords[i].lat;
                const xj = coords[j].lng, yj = coords[j].lat;

                const intersect = ((yi > y) !== (yj > y))
                    && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
                if (intersect) inside = !inside;
            }
            if (inside) return true;
        }
    }
    return false;
}
