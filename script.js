/**
 * Smart Route Navigator - OpenStreetMap Version
 * Uses Leaflet.js for map visualization and Dijkstra's algorithm for pathfinding
 * Fetches real road data from OpenStreetMap using Overpass API
 */

// Global variables
let map;
let osmService;
let markers = {};
let pathLine = null;
let showRoads = false;
let waypointMarkers = []; // Track waypoint circle markers

// OSM specific variables
let osmStartCoord = null;
let osmEndCoord = null;
let osmWaypoints = []; // Array of waypoint coordinates
let osmGraphData = null;
let osmRoadLines = [];
let osmNodeMarkers = [];

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    initializeMap();
    initializeOSMService();
    setupEventListeners();
});

/**
 * Initialize OSM Service
 */
function initializeOSMService() {
    osmService = new OSMService();
}

/**
 * Initialize Leaflet map
 */
function initializeMap() {
    // Initialize map centered on Turkey (Muğla region)
    map = L.map('map').setView([37.2153, 28.3636], 13);

    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);

    // Add click event to map
    map.on('click', handleMapClick);
    
    // Set cursor style
    document.getElementById('map').classList.add('osm-mode');
}

/**
 * Handle map click event
 */
function handleMapClick(e) {
    const clickCoord = [e.latlng.lat, e.latlng.lng];
    handleOSMMapClick(clickCoord);
}

/**
 * Handle map click in OSM mode
 */
function handleOSMMapClick(coord) {
    if (!osmStartCoord) {
        osmStartCoord = coord;
        addOSMMarker(coord, 'start');
        document.getElementById('osm-start').textContent = `${coord[0].toFixed(5)}, ${coord[1].toFixed(5)}`;
        updateOSMFindButton();
    } else if (!osmEndCoord) {
        osmEndCoord = coord;
        addOSMMarker(coord, 'end');
        document.getElementById('osm-end').textContent = `${coord[0].toFixed(5)}, ${coord[1].toFixed(5)}`;
        updateOSMFindButton();
    } else {
        // Add as waypoint
        osmWaypoints.push(coord);
        addOSMMarker(coord, `waypoint-${osmWaypoints.length - 1}`);
        updateWaypointsList();
    }
}

/**
 * Add marker for OSM mode
 */
function addOSMMarker(coord, type) {
    let icon, label;
    
    if (type === 'start') {
        icon = '🟢';
        label = 'Start';
    } else if (type === 'end') {
        icon = '🔴';
        label = 'End';
    } else if (type.startsWith('waypoint-')) {
        const num = parseInt(type.split('-')[1]) + 1;
        icon = '🔵';
        label = `Waypoint ${num}`;
    }
    
    const marker = L.marker(coord, {
        icon: L.divIcon({
            className: 'click-marker',
            html: `<div style="font-size: 30px; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">${icon}</div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 30]
        })
    }).addTo(map);

    marker.bindPopup(`<b>${label}</b><br>Lat: ${coord[0].toFixed(5)}<br>Lng: ${coord[1].toFixed(5)}`);
    
    markers[type] = marker;
}

/**
 * Update waypoints list display
 */
function updateWaypointsList() {
    const list = document.getElementById('waypoints-list');
    if (osmWaypoints.length === 0) {
        list.textContent = 'None';
    } else {
        list.textContent = `${osmWaypoints.length} point(s)`;
    }
}

/**
 * Update OSM find button state
 */
function updateOSMFindButton() {
    const btn = document.getElementById('osm-find-path-btn');
    btn.disabled = !(osmStartCoord && osmEndCoord);
}

/**
 * Clear OSM selection
 */
function clearOSMSelection() {
    // Remove all markers (start, end, waypoints)
    Object.keys(markers).forEach(key => {
        if (markers[key]) {
            map.removeLayer(markers[key]);
        }
    });
    
    // Remove waypoint circle markers from animation
    waypointMarkers.forEach(marker => {
        if (marker) map.removeLayer(marker);
    });
    waypointMarkers = [];
    
    if (pathLine) {
        map.removeLayer(pathLine);
        pathLine = null;
    }
    
    osmRoadLines.forEach(line => map.removeLayer(line));
    osmRoadLines = [];
    osmNodeMarkers.forEach(marker => map.removeLayer(marker));
    osmNodeMarkers = [];
    
    markers = {};
    osmStartCoord = null;
    osmEndCoord = null;
    osmWaypoints = [];
    osmGraphData = null;
    
    document.getElementById('osm-start').textContent = 'Not selected';
    document.getElementById('osm-end').textContent = 'Not selected';
    document.getElementById('result-box').style.display = 'none';
    updateWaypointsList();
    updateOSMFindButton();
}

/**
 * Find path using OpenStreetMap data with waypoint optimization
 */
async function findOSMPath() {
    if (!osmStartCoord || !osmEndCoord) {
        alert('Please select both start and end points on the map!');
        return;
    }

    showLoading(true);

    try {
        // If no waypoints, use simple Dijkstra
        if (osmWaypoints.length === 0) {
            await findSimpleOSMPath();
        } else {
            // With waypoints, find optimal order
            await findOptimalWaypointRoute();
        }
    } catch (error) {
        console.error('Error finding OSM path:', error);
        alert('Error loading road data: ' + error.message);
    } finally {
        showLoading(false);
    }
}

/**
 * Find simple path without waypoints
 */
async function findSimpleOSMPath() {
    console.log('Fetching road network between:', osmStartCoord, 'and', osmEndCoord);
    
    osmGraphData = await osmService.fetchRoadNetworkForPoints(osmStartCoord, osmEndCoord);
    
    console.log('Fetched graph data:', osmGraphData);
    
    if (!osmGraphData || osmGraphData.nodes.length < 2) {
        throw new Error('Not enough road data found in this area.');
    }

    const startResult = osmService.findNearestNode(osmStartCoord, osmGraphData.coordinates);
    const endResult = osmService.findNearestNode(osmEndCoord, osmGraphData.coordinates);

    if (!startResult.node || !endResult.node) {
        throw new Error('Could not find road nodes near selected points.');
    }

    console.log('Start node:', startResult.node, 'Distance:', startResult.distance.toFixed(3), 'km');
    console.log('End node:', endResult.node, 'Distance:', endResult.distance.toFixed(3), 'km');
    console.log('Road network nodes:', osmGraphData.nodes.length);

    const osmDijkstra = new Dijkstra(osmGraphData);
    const result = osmDijkstra.findShortestPath(startResult.node, endResult.node);

    if (result.distance === -1 || result.path.length === 0) {
        throw new Error('No path found between selected points.');
    }

    if (showRoads) {
        displayOSMRoadNetwork();
    }

    displayOSMPath(result.path, osmGraphData.coordinates);
    displayOSMResults(result, startResult.distance + endResult.distance);
}

/**
 * Find optimal route through all waypoints (TSP with Brute Force)
 */
async function findOptimalWaypointRoute() {
    console.log('🎯 Finding optimal route through', osmWaypoints.length, 'waypoints');
    
    // Fetch larger area covering all points
    const allPoints = [osmStartCoord, ...osmWaypoints, osmEndCoord];
    const bounds = calculateBounds(allPoints);
    osmGraphData = await osmService.fetchRoadNetwork(bounds);
    
    if (!osmGraphData || osmGraphData.nodes.length < 2) {
        throw new Error('Not enough road data found in this area.');
    }

    console.log('Graph loaded:', osmGraphData.nodes.length, 'nodes');

    // Find nearest nodes for all points
    const startNode = osmService.findNearestNode(osmStartCoord, osmGraphData.coordinates);
    const endNode = osmService.findNearestNode(osmEndCoord, osmGraphData.coordinates);
    const waypointNodes = osmWaypoints.map(wp => 
        osmService.findNearestNode(wp, osmGraphData.coordinates)
    );

    if (!startNode.node || !endNode.node || waypointNodes.some(wn => !wn.node)) {
        throw new Error('Could not find road nodes near all points.');
    }

    console.log('All points mapped to road nodes ✓');

    // Find optimal order of waypoints using brute force TSP
    const dijkstra = new Dijkstra(osmGraphData);
    const optimalOrder = findOptimalWaypointOrder(
        startNode.node,
        endNode.node,
        waypointNodes.map(wn => wn.node),
        dijkstra
    );

    console.log('✨ Optimal order found:', optimalOrder.order);
    console.log('📏 Total distance:', optimalOrder.totalDistance.toFixed(3), 'km');

    // Build complete path following optimal order
    const completePath = [];
    const segments = [];
    
    for (let i = 0; i < optimalOrder.segments.length; i++) {
        const segment = optimalOrder.segments[i];
        segments.push({
            from: i === 0 ? 'Start' : `Waypoint ${optimalOrder.order[i-1] + 1}`,
            to: i === optimalOrder.segments.length - 1 ? 'End' : `Waypoint ${optimalOrder.order[i] + 1}`,
            distance: segment.distance,
            path: segment.path
        });
        
        // Add path nodes (avoid duplicates at junctions)
        if (i === 0) {
            completePath.push(...segment.path);
        } else {
            completePath.push(...segment.path.slice(1));
        }
    }

    // Display the route
    if (showRoads) {
        displayOSMRoadNetwork();
    }

    displayOSMPath(completePath, osmGraphData.coordinates, segments);
    displayWaypointResults(optimalOrder, segments);
}

/**
 * Calculate bounds covering all points
 */
function calculateBounds(points) {
    const lats = points.map(p => p[0]);
    const lngs = points.map(p => p[1]);
    const padding = 0.03; // Larger padding for multiple waypoints
    
    return [
        [Math.min(...lats) - padding, Math.min(...lngs) - padding],
        [Math.max(...lats) + padding, Math.max(...lngs) + padding]
    ];
}

/**
 * Find optimal waypoint order using Brute Force (all permutations)
 */
function findOptimalWaypointOrder(startNode, endNode, waypointNodes, dijkstra) {
    const n = waypointNodes.length;
    
    if (n === 0) {
        return { order: [], totalDistance: 0, segments: [] };
    }

    if (n > 8) {
        alert('⚠️ Too many waypoints (>8). Using greedy algorithm instead of optimal.');
        return findGreedyWaypointOrder(startNode, endNode, waypointNodes, dijkstra);
    }

    console.log(`🔄 Testing ${factorial(n)} permutations...`);

    let bestOrder = null;
    let bestDistance = Infinity;
    let bestSegments = null;

    // Generate all permutations
    const permutations = generatePermutations([...Array(n).keys()]);
    
    for (const perm of permutations) {
        // Build route: start -> wp[perm[0]] -> ... -> wp[perm[n-1]] -> end
        const segments = [];
        let totalDist = 0;
        let prevNode = startNode;

        // Calculate distance for this permutation
        let validRoute = true;
        for (let i = 0; i < perm.length; i++) {
            const currentNode = waypointNodes[perm[i]];
            const result = dijkstra.findShortestPath(prevNode, currentNode);
            
            if (result.distance === -1) {
                validRoute = false;
                break;
            }
            
            segments.push(result);
            totalDist += result.distance;
            prevNode = currentNode;
        }

        if (!validRoute) continue;

        // Final segment to end
        const finalSegment = dijkstra.findShortestPath(prevNode, endNode);
        if (finalSegment.distance === -1) continue;
        
        segments.push(finalSegment);
        totalDist += finalSegment.distance;

        // Check if this is the best so far
        if (totalDist < bestDistance) {
            bestDistance = totalDist;
            bestOrder = perm;
            bestSegments = segments;
        }
    }

    if (bestOrder === null) {
        throw new Error('Could not find valid route through all waypoints.');
    }

    return {
        order: bestOrder,
        totalDistance: bestDistance,
        segments: bestSegments
    };
}

/**
 * Greedy algorithm for many waypoints (fallback)
 */
function findGreedyWaypointOrder(startNode, endNode, waypointNodes, dijkstra) {
    const unvisited = new Set(waypointNodes.map((_, i) => i));
    const order = [];
    const segments = [];
    let totalDist = 0;
    let current = startNode;

    while (unvisited.size > 0) {
        let nearest = null;
        let nearestDist = Infinity;
        let nearestIdx = null;
        let nearestPath = null;

        for (const idx of unvisited) {
            const result = dijkstra.findShortestPath(current, waypointNodes[idx]);
            if (result.distance !== -1 && result.distance < nearestDist) {
                nearestDist = result.distance;
                nearest = waypointNodes[idx];
                nearestIdx = idx;
                nearestPath = result;
            }
        }

        if (nearest === null) break;

        unvisited.delete(nearestIdx);
        order.push(nearestIdx);
        segments.push(nearestPath);
        totalDist += nearestDist;
        current = nearest;
    }

    const finalSegment = dijkstra.findShortestPath(current, endNode);
    if (finalSegment.distance === -1) {
        throw new Error('Could not complete route to end point.');
    }

    segments.push(finalSegment);
    totalDist += finalSegment.distance;

    return { order, totalDistance: totalDist, segments };
}

/**
 * Generate all permutations of an array
 */
function generatePermutations(arr) {
    if (arr.length <= 1) return [arr];
    
    const result = [];
    for (let i = 0; i < arr.length; i++) {
        const current = arr[i];
        const remaining = arr.slice(0, i).concat(arr.slice(i + 1));
        const perms = generatePermutations(remaining);
        
        for (const perm of perms) {
            result.push([current, ...perm]);
        }
    }
    
    return result;
}

/**
 * Calculate factorial
 */
function factorial(n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}

/**
 * Display OSM road network on map
 */
function displayOSMRoadNetwork() {
    // Clear existing road lines
    osmRoadLines.forEach(line => map.removeLayer(line));
    osmRoadLines = [];
    osmNodeMarkers.forEach(marker => map.removeLayer(marker));
    osmNodeMarkers = [];

    const drawnEdges = new Set();

    for (let nodeId in osmGraphData.edges) {
        const neighbors = osmGraphData.edges[nodeId];
        const nodeCoord = osmGraphData.coordinates[nodeId];

        if (!nodeCoord) continue;

        neighbors.forEach(neighbor => {
            const edgeKey = [nodeId, neighbor.node].sort().join('-');
            
            if (drawnEdges.has(edgeKey)) return;
            drawnEdges.add(edgeKey);

            const neighborCoord = osmGraphData.coordinates[neighbor.node];
            if (!neighborCoord) return;
            
            const line = L.polyline([nodeCoord, neighborCoord], {
                color: '#94a3b8',
                weight: 2,
                opacity: 0.4
            }).addTo(map);

            osmRoadLines.push(line);
        });

        // Add small markers for intersection nodes
        const marker = L.circleMarker(nodeCoord, {
            radius: 3,
            fillColor: '#3498db',
            color: 'white',
            weight: 1,
            opacity: 0.7,
            fillOpacity: 0.6
        }).addTo(map);

        osmNodeMarkers.push(marker);
    }
}

/**
 * Display path on map for OSM mode with animation
 */
function displayOSMPath(path, coordinates, segments = null) {
    // Remove existing path
    if (pathLine) {
        map.removeLayer(pathLine);
        pathLine = null;
    }

    // Convert path node IDs to coordinates
    const pathCoords = path.map(nodeId => coordinates[nodeId]).filter(coord => coord);

    if (pathCoords.length === 0) {
        console.error('No valid coordinates for path');
        return;
    }

    // Fit map to show entire route first
    if (pathCoords.length > 0) {
        map.fitBounds(pathCoords, { padding: [50, 50] });
    }

    // Animate path drawing
    animatePathDrawing(pathCoords, segments);
}

/**
 * Animate path drawing step by step
 */
function animatePathDrawing(pathCoords, segments = null) {
    let currentIndex = 0;
    const animationSpeed = 50; // milliseconds between steps
    
    // Clear old waypoint markers
    waypointMarkers.forEach(marker => map.removeLayer(marker));
    waypointMarkers = [];
    
    // Create initial empty polyline
    pathLine = L.polyline([], {
        color: '#e74c3c',
        weight: 5,
        opacity: 0.8
    }).addTo(map);

    // Add waypoint markers if segments exist
    if (segments && segments.length > 1) {
        // Mark segment boundaries with small markers
        segments.forEach((segment, idx) => {
            if (idx < segments.length - 1) {
                const segmentEndCoord = osmGraphData.coordinates[segment.path[segment.path.length - 1]];
                if (segmentEndCoord) {
                    const marker = L.circleMarker(segmentEndCoord, {
                        radius: 6,
                        fillColor: '#3498db',
                        color: 'white',
                        weight: 2,
                        opacity: 1,
                        fillOpacity: 1
                    }).addTo(map).bindPopup(`<b>${segment.to}</b>`);
                    
                    waypointMarkers.push(marker);
                }
            }
        });
    }

    // Animation function
    function drawNextSegment() {
        if (currentIndex < pathCoords.length) {
            pathLine.addLatLng(pathCoords[currentIndex]);
            currentIndex++;
            setTimeout(drawNextSegment, animationSpeed);
        }
    }

    // Start animation
    drawNextSegment();
}

/**
 * Display results for waypoint route
 */
function displayWaypointResults(optimalOrder, segments) {
    const resultBox = document.getElementById('result-box');
    resultBox.style.display = 'block';

    const totalDistance = optimalOrder.totalDistance;
    const timeMinutes = (totalDistance / 40) * 60;

    document.getElementById('total-distance').textContent = totalDistance.toFixed(2) + ' km';
    document.getElementById('est-time').textContent = 
        `${Math.floor(timeMinutes)} min (${(timeMinutes / 60).toFixed(1)} hrs)`;
    
    // Build route order string
    let routeOrder = 'Start';
    optimalOrder.order.forEach((wpIdx, i) => {
        routeOrder += ` → WP${wpIdx + 1}`;
    });
    routeOrder += ' → End';

    document.getElementById('node-count').textContent = 
        `${segments.length} segments, ${optimalOrder.order.length} waypoints`;

    // Show segment breakdown
    let segmentDetails = '<b>Route:</b> ' + routeOrder + '<br><br><b>Segments:</b><br>';
    segments.forEach((seg, idx) => {
        segmentDetails += `${idx + 1}. ${seg.from} → ${seg.to}: ${seg.distance.toFixed(2)} km<br>`;
    });
    
    document.getElementById('path-nodes').innerHTML = segmentDetails;
}

/**
 * Display results for OSM path
 */
function displayOSMResults(result, walkingDistance) {
    const resultBox = document.getElementById('result-box');
    resultBox.style.display = 'block';

    const totalDistance = result.distance + walkingDistance;
    const timeMinutes = (totalDistance / 40) * 60;

    document.getElementById('total-distance').textContent = 
        `${totalDistance.toFixed(2)} km`;
    
    document.getElementById('est-time').textContent = 
        timeMinutes < 1 ? '< 1 min' : `~${Math.round(timeMinutes)} min`;

    document.getElementById('node-count').textContent = 
        `${result.path.length} intersections`;
    
    // For OSM, show simplified path info
    document.getElementById('path-nodes').textContent = 
        `Route via ${result.path.length} road intersections`;

    console.log('OSM Dijkstra Results:', result);
}

/**
 * Show/hide loading indicator
 */
function showLoading(show) {
    document.getElementById('loading-box').style.display = show ? 'flex' : 'none';
    document.getElementById('osm-find-path-btn').disabled = show;
}

/**
 * Reset selection
 */
function resetSelection() {
    clearOSMSelection();
}

/**
 * Toggle road network visibility
 */
function toggleRoads() {
    showRoads = !showRoads;
    
    const btn = document.getElementById('toggle-nodes-btn');
    btn.textContent = showRoads ? '🔗 Hide Roads' : '🔗 Show Roads';
    
    if (osmGraphData) {
        // Clear or show OSM road network
        osmRoadLines.forEach(line => map.removeLayer(line));
        osmNodeMarkers.forEach(marker => map.removeLayer(marker));
        osmRoadLines = [];
        osmNodeMarkers = [];
        
        if (showRoads) {
            displayOSMRoadNetwork();
        }
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    document.getElementById('reset-btn').addEventListener('click', resetSelection);
    document.getElementById('toggle-nodes-btn').addEventListener('click', toggleRoads);
    document.getElementById('osm-find-path-btn').addEventListener('click', findOSMPath);
}

// Add custom CSS for markers
const style = document.createElement('style');
style.textContent = `
    .click-marker {
        text-align: center;
    }
`;
document.head.appendChild(style);
