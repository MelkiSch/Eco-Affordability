This is an interactive mapping dashboard of Belgium that visualizes the intersection between housing affordability and nature quality.

The project has been initialized in the following directory: 

index.html
: The main entry point. Houses the sidebar controls, legends, autocomplete lookup inputs, and map layouts.

app.css
: Contains the glassmorphism panel styling, customized Leaflet popups, scrollbars, animations, and bivariate grid structures.

app.js
: Core interactive logic. Manages TopoJSON conversions, dynamic index calculations (single weighted & bivariate), geocoder resolution, and Chart.js rendering.

municipality_data.json
: The high-fidelity consolidated database of 581 Belgian municipalities containing realistic prices, PFAS risks, air quality values, and organic farming ratios.

Gemeenten_Fusies.json
: Lightweight geographic boundary TopoJSON (WGS84).

generate_data.ps1
: PowerShell script utilized to compile the municipality database.

Interactive Features

Dual Visualizations:
Bivariate Matrix (Default): Colors polygons using a 3×3 grid comparing Eco Quality (dirty to clean) vs. Affordability (expensive to cheap). Easily flags the "Sweet Spot" (emerald green) and the "Worst Spot" (dark red).
Sweet Spot Index: Integrates a single, grade-based score (0 to 100) where users can dynamically change indicator weights (sliders) to calculate their custom livability score.

Address & Municipality Search:
Autocomplete dropdown matches typed inputs with French and Dutch names of the 581 municipalities.
Nominatim OpenStreetMap Geocoder API resolves typed street addresses inside Belgium, places a temporary pulsing marker, and zooms to the corresponding municipality boundary.

Provincial Comparison Charts:
Clicking a municipality draws a dynamic comparison bar chart showing how that commune's PFAS, Air, Farmland, and Price stand compared to its Province's average (rendered with Chart.js).
