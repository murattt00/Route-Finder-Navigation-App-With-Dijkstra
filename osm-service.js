/**
 * OpenStreetMap Service (Düzeltilmiş Versiyon)
 * - Yol bağlantı tipleri (links) eklendi.
 * - Tek yön (One-way) desteği eklendi.
 * - Kopuk graf parçalarını (adacıkları) temizleme özelliği eklendi.
 */

class OSMService {
    constructor() {
        // Yedekli Overpass API sunucuları
        this.overpassUrls = [
            'https://overpass-api.de/api/interpreter',
            'https://overpass.kumi.systems/api/interpreter',
            'https://overpass.openstreetmap.ru/api/interpreter'
        ];
        this.currentUrlIndex = 0;
        this.cache = new Map(); // Önbellek
    }

    /**
     * Sıradaki API URL'sini getir
     */
    getNextUrl() {
        const url = this.overpassUrls[this.currentUrlIndex];
        this.currentUrlIndex = (this.currentUrlIndex + 1) % this.overpassUrls.length;
        return url;
    }

    /**
     * Belirli bir alan için yol ağını çeker
     * @param {Array} bounds - [[south, west], [north, east]]
     */
    async fetchRoadNetwork(bounds) {
        const cacheKey = bounds.toString();

        if (this.cache.has(cacheKey)) {
            console.log('Using cached road data');
            return this.cache.get(cacheKey);
        }

        const [south, west] = bounds[0];
        const [north, east] = bounds[1];

        // DÜZELTME 1: Regex sorgusuna '_link' tipleri eklendi (kavşaklar için kritik)
        const query = `
            [out:json][timeout:25];
            (
                way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|unclassified|service|road)$"]
                    (${south},${west},${north},${east});
            );
            out body;
            >;
            out skel qt;
        `;

        let lastError = null;
        for (let attempt = 0; attempt < this.overpassUrls.length; attempt++) {
            try {
                const url = this.getNextUrl();
                console.log(`Attempt ${attempt + 1}/${this.overpassUrls.length}: Fetching from ${url}`);

                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: 'data=' + encodeURIComponent(query)
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                console.log('OSM data received:', data.elements?.length, 'elements');

                if (!data.elements || data.elements.length === 0) {
                    throw new Error('No road data found in this area');
                }

                // Veriyi grafa çevir ve temizle
                const graphData = this.convertToGraph(data);

                this.cache.set(cacheKey, graphData);
                return graphData;

            } catch (error) {
                console.warn(`Attempt ${attempt + 1} failed:`, error.message);
                lastError = error;
                if (attempt < this.overpassUrls.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }

        throw lastError || new Error('Failed to fetch road network from all servers');
    }

    /**
     * İki nokta arasındaki alanı çeker
     */
    async fetchRoadNetworkForPoints(point1, point2, padding = 0.025) {
        const south = Math.min(point1[0], point2[0]) - padding;
        const north = Math.max(point1[0], point2[0]) + padding;
        const west = Math.min(point1[1], point2[1]) - padding;
        const east = Math.max(point1[1], point2[1]) + padding;

        console.log(`📍 Fetching area: [${south.toFixed(4)}, ${west.toFixed(4)}, ${north.toFixed(4)}, ${east.toFixed(4)}]`);
        return this.fetchRoadNetwork([[south, west], [north, east]]);
    }

    /**
     * OSM verisini Grafa dönüştürür
     */
    convertToGraph(osmData) {
        const nodes = new Map();
        const edges = {};
        const coordinates = {};

        // 1. Geçiş: Düğümleri topla
        osmData.elements.forEach(element => {
            if (element.type === 'node') {
                nodes.set(element.id, { lat: element.lat, lng: element.lon });
            }
        });

        // 2. Geçiş: Yolları (Ways) kenarlara (Edges) dönüştür
        osmData.elements.forEach(element => {
            if (element.type === 'way' && element.nodes && element.tags) {
                const wayNodes = element.nodes;
                
                // DÜZELTME 2: Tek yön kontrolü
                const isOneWay = element.tags.oneway === 'yes' || 
                                 element.tags.oneway === '1' || 
                                 element.tags.junction === 'roundabout';

                for (let i = 0; i < wayNodes.length - 1; i++) {
                    const node1 = nodes.get(wayNodes[i]);
                    const node2 = nodes.get(wayNodes[i + 1]);

                    if (!node1 || !node2) continue;

                    const nodeId1 = wayNodes[i].toString();
                    const nodeId2 = wayNodes[i + 1].toString();

                    // Koordinatları kaydet
                    coordinates[nodeId1] = [node1.lat, node1.lng];
                    coordinates[nodeId2] = [node2.lat, node2.lng];

                    const distance = this.haversineDistance(
                        [node1.lat, node1.lng],
                        [node2.lat, node2.lng]
                    );

                    if (!edges[nodeId1]) edges[nodeId1] = [];
                    if (!edges[nodeId2]) edges[nodeId2] = [];

                    // YÖN 1: A -> B (Her zaman ekle)
                    // (Aynı kenar daha önce eklendiyse tekrar ekleme - bazen OSM'de duplicate node olabilir)
                    if (!edges[nodeId1].some(e => e.node === nodeId2)) {
                        edges[nodeId1].push({ node: nodeId2, weight: distance });
                    }

                    // YÖN 2: B -> A (Sadece tek yön değilse ekle)
                    if (!isOneWay) {
                        if (!edges[nodeId2].some(e => e.node === nodeId1)) {
                            edges[nodeId2].push({ node: nodeId1, weight: distance });
                        }
                    }
                }
            }
        });

        const rawNodeCount = Object.keys(coordinates).length;
        console.log(`🗺️  Raw Graph created: ${rawNodeCount} nodes`);

        // DÜZELTME 3: Kopuk parçaları (izole adacıkları) temizle
        const cleanedData = this.keepLargestComponent(Object.keys(coordinates), edges);

        // Coordinates objesini de filtrele
        const finalCoordinates = {};
        cleanedData.nodes.forEach(id => {
            finalCoordinates[id] = coordinates[id];
        });

        console.log(`✨ Cleaned Graph: ${cleanedData.nodes.length} nodes (Removed ${rawNodeCount - cleanedData.nodes.length} disconnected nodes)`);

        return {
            nodes: cleanedData.nodes,
            edges: cleanedData.edges,
            coordinates: finalCoordinates,
            isOSM: true
        };
    }

    /**
     * DÜZELTME 3 (Yardımcı Fonksiyon): En büyük bağlı bileşeni bulur
     * Ana yola bağlı olmayan küçük yol parçalarını siler.
     */
    keepLargestComponent(allNodeIds, edges) {
        const visited = new Set();
        let maxComponent = [];

        // Tüm düğümleri gez ve grupları bul
        for (const nodeId of allNodeIds) {
            if (!visited.has(nodeId)) {
                const component = [];
                const stack = [nodeId];
                visited.add(nodeId);

                while (stack.length > 0) {
                    const current = stack.pop();
                    component.push(current);

                    const neighbors = edges[current] || [];
                    for (const edge of neighbors) {
                        if (!visited.has(edge.node)) {
                            visited.add(edge.node);
                            stack.push(edge.node);
                        }
                    }
                }

                if (component.length > maxComponent.length) {
                    maxComponent = component;
                }
            }
        }

        // Sadece en büyük gruptaki kenarları tut
        const validNodeSet = new Set(maxComponent);
        const newEdges = {};
        
        maxComponent.forEach(nodeId => {
            if (edges[nodeId]) {
                // Sadece hedefi de bu grupta olan kenarları al
                newEdges[nodeId] = edges[nodeId].filter(edge => validNodeSet.has(edge.node));
            }
        });

        return {
            nodes: maxComponent,
            edges: newEdges
        };
    }

    /**
     * Haversine Formülü ile mesafe hesaplama (km)
     */
    haversineDistance(coord1, coord2) {
        const R = 6371;
        const dLat = this.toRad(coord2[0] - coord1[0]);
        const dLon = this.toRad(coord2[1] - coord1[1]);
        
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(this.toRad(coord1[0])) * Math.cos(this.toRad(coord2[0])) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    toRad(degrees) {
        return degrees * Math.PI / 180;
    }

    /**
     * En yakın düğümü bulur
     */
    findNearestNode(coord, graphCoordinates) {
        let nearestNode = null;
        let minDistance = Infinity;

        for (const nodeId in graphCoordinates) {
            const nodeCoord = graphCoordinates[nodeId];
            const distance = this.haversineDistance(coord, nodeCoord);
            
            if (distance < minDistance) {
                minDistance = distance;
                nearestNode = nodeId;
            }
        }
        return { node: nearestNode, distance: minDistance };
    }

    clearCache() {
        this.cache.clear();
    }
}

// Module export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OSMService;
}