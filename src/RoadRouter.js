/**
 * RoadRouter — Routes cable paths strictly along the road network.
 *
 * The road layout is described as a set of waypoints (intersections)
 * connected by edges. Dijkstra's algorithm finds the shortest road-
 * following path between any two world positions.
 *
 * All coordinates are in XZ plane (Y is height, handled by caller).
 */

// ============================================================
// Road Network Graph
// ============================================================
// Nodes are named intersections / key points along roads.
// Edges connect adjacent nodes along road segments.
const NODES = {
    // Main arteries
    NW: { x: -75, z: 5 },
    NE: { x: 75, z: 5 },
    NS: { x: -5, z: -75 },
    NN: { x: -5, z: 75 },

    // Main intersection (centre city)
    C: { x: -5, z: 5 },

    // Secondary horizontal roads
    W_MID_TOP: { x: -75, z: 35 },
    E_MID_TOP: { x: 75, z: 35 },
    W_MID_BOT: { x: -75, z: -35 },
    E_MID_BOT: { x: 75, z: -35 },

    // Intersections – horizontal roads × main vertical
    CX_TOP: { x: -5, z: 35 },
    CX_BOT: { x: -5, z: -35 },

    // Left vertical secondary
    L_N: { x: -35, z: 75 },
    L_TOP: { x: -35, z: 35 },
    L_C: { x: -35, z: 5 },
    L_BOT: { x: -35, z: -35 },
    L_S: { x: -35, z: -75 },

    // Right vertical secondary
    R_N: { x: 47, z: 75 },
    R_TOP: { x: 47, z: 35 },
    R_C: { x: 47, z: 5 },
    R_BOT: { x: 47, z: -35 },
    R_S: { x: 47, z: -75 },

    // NRO area node
    NRO: { x: -60, z: -50 },
};

// Directed edges (bidirectional — we add both directions)
const EDGES_DEF = [
    // Main horizontal artery
    ['NW', 'L_C'], ['L_C', 'C'], ['C', 'R_C'], ['R_C', 'NE'],
    // Main vertical artery
    ['NS', 'CX_BOT'], ['CX_BOT', 'C'], ['C', 'CX_TOP'], ['CX_TOP', 'NN'],
    // Top secondary horizontal
    ['W_MID_TOP', 'L_TOP'], ['L_TOP', 'CX_TOP'], ['CX_TOP', 'R_TOP'], ['R_TOP', 'E_MID_TOP'],
    // Bottom secondary horizontal
    ['W_MID_BOT', 'L_BOT'], ['L_BOT', 'CX_BOT'], ['CX_BOT', 'R_BOT'], ['R_BOT', 'E_MID_BOT'],
    // Left vertical secondary
    ['L_S', 'L_BOT'], ['L_BOT', 'L_C'], ['L_C', 'L_TOP'], ['L_TOP', 'L_N'],
    // Right vertical secondary
    ['R_S', 'R_BOT'], ['R_BOT', 'R_C'], ['R_C', 'R_TOP'], ['R_TOP', 'R_N'],
    // NRO connection to nearest road node
    ['NRO', 'L_S'], ['NRO', 'L_BOT'],
];

// Build adjacency list with edge weights (Euclidean distance)
function buildGraph() {
    const graph = {};
    Object.keys(NODES).forEach(k => { graph[k] = []; });

    EDGES_DEF.forEach(([a, b]) => {
        const na = NODES[a], nb = NODES[b];
        const d = dist2d(na, nb);
        graph[a].push({ node: b, cost: d });
        graph[b].push({ node: a, cost: d });
    });
    return graph;
}

function dist2d(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);
}

const GRAPH = buildGraph();

// ============================================================
// Dijkstra's algorithm
// ============================================================
function dijkstra(startKey, endKey) {
    const dist = {};
    const prev = {};
    const visited = new Set();
    Object.keys(NODES).forEach(k => { dist[k] = Infinity; prev[k] = null; });
    dist[startKey] = 0;

    // Simple priority queue using sorted array (sufficient for ~20 nodes)
    const queue = [{ key: startKey, cost: 0 }];

    while (queue.length > 0) {
        queue.sort((a, b) => a.cost - b.cost);
        const { key: u } = queue.shift();
        if (visited.has(u)) continue;
        visited.add(u);
        if (u === endKey) break;

        (GRAPH[u] || []).forEach(({ node: v, cost }) => {
            const alt = dist[u] + cost;
            if (alt < dist[v]) {
                dist[v] = alt;
                prev[v] = u;
                queue.push({ key: v, cost: alt });
            }
        });
    }

    // Reconstruct path
    const path = [];
    let cur = endKey;
    while (cur) {
        path.unshift(cur);
        cur = prev[cur];
    }
    return path.length > 1 ? path : null;
}

// ============================================================
// Public API
// ============================================================

/**
 * Find the nearest road graph node to an XZ world position.
 */
function nearestNode(pos) {
    let best = null;
    let bestDist = Infinity;
    Object.entries(NODES).forEach(([key, n]) => {
        const d = dist2d(pos, n);
        if (d < bestDist) { bestDist = d; best = key; }
    });
    return best;
}

/**
 * Compute a road-following 3D waypoint path from `from` to `to`.
 * @param {{x,z,y?}} from
 * @param {{x,z,y?}} to
 * @param {number} height – Y of the cable above ground
 * @returns {Array<{x,y,z}>}
 */
function smoothPath(points, cornerRadius = 5) {
    if (points.length < 3) return points;

    const smoothed = [points[0]];
    
    for (let i = 1; i < points.length - 1; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const next = points[i + 1];
        
        // Vector from prev to curr
        const v1 = {
            x: curr.x - prev.x,
            z: curr.z - prev.z
        };
        const len1 = Math.sqrt(v1.x * v1.x + v1.z * v1.z);
        if (len1 === 0) continue;
        
        // Vector from curr to next
        const v2 = {
            x: next.x - curr.x,
            z: next.z - curr.z
        };
        const len2 = Math.sqrt(v2.x * v2.x + v2.z * v2.z);
        if (len2 === 0) continue;
        
        // Normalized vectors
        const u1 = { x: v1.x / len1, z: v1.z / len1 };
        const u2 = { x: v2.x / len2, z: v2.z / len2 };
        
        // Interpolation distance along each segment
        const d = Math.min(cornerRadius, len1 * 0.3, len2 * 0.3);
        
        // Entry point (d distance before corner)
        const entry = {
            x: curr.x - u1.x * d,
            z: curr.z - u1.z * d,
            y: curr.y
        };
        smoothed.push(entry);
        
        // Exit point (d distance after corner)
        const exit = {
            x: curr.x + u2.x * d,
            z: curr.z + u2.z * d,
            y: curr.y
        };
        
        // Quadratic Bézier curve: P(t) = (1-t)²P0 + 2(1-t)tP1 + t²P2
        // where P0=entry, P1=curr (control point), P2=exit
        for (let t = 0.25; t < 1; t += 0.25) {
            const mt = 1 - t;
            const bezierPt = {
                x: mt * mt * entry.x + 2 * mt * t * curr.x + t * t * exit.x,
                z: mt * mt * entry.z + 2 * mt * t * curr.z + t * t * exit.z,
                y: curr.y
            };
            smoothed.push(bezierPt);
        }
        
        smoothed.push(exit);
    }
    
    smoothed.push(points[points.length - 1]);
    return smoothed;
}

export function routeCable(from, to, height = 0.3) {
    const startNode = nearestNode(from);
    const endNode = nearestNode(to);

    let pathKeys;
    if (startNode === endNode) {
        pathKeys = [startNode];
    } else {
        pathKeys = dijkstra(startNode, endNode);
    }

    if (!pathKeys) {
        // Fallback: L-shaped corner path
        return [
            { x: from.x, y: height, z: from.z },
            { x: from.x, y: height, z: to.z },
            { x: to.x, y: height, z: to.z }
        ];
    }

    // Build 3D path: start → road nodes → end
    const pts = [];
    pts.push({ x: from.x, y: height, z: from.z });
    pathKeys.forEach(k => {
        const n = NODES[k];
        pts.push({ x: n.x, y: height, z: n.z });
    });
    pts.push({ x: to.x, y: height, z: to.z });

    // Remove accidental duplicate points so the tube does not fold back on itself.
    const cleaned = [];
    pts.forEach(p => {
        const last = cleaned[cleaned.length - 1];
        if (!last || last.x !== p.x || last.y !== p.y || last.z !== p.z) {
            cleaned.push(p);
        }
    });

    // Smooth corners to avoid sharp angle deformations in the tube geometry
    const smoothed = smoothPath(cleaned, 5);

    return smoothed;
}

export { NODES };
