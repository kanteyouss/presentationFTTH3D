import './style.css';
import * as BABYLON from 'babylonjs';
import { SceneManager } from './src/SceneManager';
import { NetworkModel } from './src/NetworkModel';
import { AnimationController } from './src/AnimationController';
import { CameraController } from './src/CameraController';
import { UIManager } from './src/UIManager';
import { NETWORK_CONFIG } from './src/constants';

const canvas = document.getElementById('canvas');
const sceneMgr = new SceneManager(canvas);
const network = new NetworkModel(sceneMgr.scene, sceneMgr.shadowGenerator);

// Cinematic camera controller
const camerCtrl = new CameraController(sceneMgr.camera, sceneMgr.scene, canvas);

// Donner accès à networkModel pour ciblage dynamique à l'étape 7
camerCtrl.networkModel = network;

// Animation controller gets sceneManager for legacy compatibility
const animController = new AnimationController(sceneMgr.scene, network, sceneMgr);

// UI gets camera controller for Resume button
const ui = new UIManager(document.getElementById('app'), animController, camerCtrl);

// ============================================================
// Road definitions (mirrors SceneManager road layout)
// ============================================================
const ROAD_SEGMENTS = [
    { from: { x: -75, z: 5 }, to: { x: 75, z: 5 } },
    { from: { x: -5, z: -75 }, to: { x: -5, z: 75 } },
    { from: { x: -35, z: -75 }, to: { x: -30, z: 75 } },
    { from: { x: 45, z: -75 }, to: { x: 50, z: 75 } },
    { from: { x: -75, z: 35 }, to: { x: 75, z: 35 } },
    { from: { x: -75, z: -35 }, to: { x: 75, z: -35 } }
];

function dist2d(a, b) {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
}

function projectPointToSegment(point, segment) {
    const ax = segment.from.x;
    const az = segment.from.z;
    const bx = segment.to.x;
    const bz = segment.to.z;

    const abx = bx - ax;
    const abz = bz - az;
    const apx = point.x - ax;
    const apz = point.z - az;
    const abLenSq = abx * abx + abz * abz;

    if (abLenSq === 0) return { x: ax, z: az };
    const t = Math.max(0, Math.min(1, (apx * abx + apz * abz) / abLenSq));
    return { x: ax + abx * t, z: az + abz * t };
}

function closestRoadSegment(point) {
    let bestSegment = ROAD_SEGMENTS[0];
    let bestDistance = Infinity;

    ROAD_SEGMENTS.forEach(segment => {
        const projected = projectPointToSegment(point, segment);
        const distance = dist2d(point, projected);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestSegment = segment;
        }
    });

    return bestSegment;
}

function generatePBOPositions(buildings, sroPositions, homesPerPbo = 10) {
    const zones = sroPositions.map((sro, sroId) => ({ sroId, sro, buildings: [] }));

    buildings.forEach(b => {
        let nearest = 0;
        let nearestDist = Infinity;
        sroPositions.forEach((sro, idx) => {
            const d = dist2d({ x: b.position.x, z: b.position.z }, sro);
            if (d < nearestDist) {
                nearestDist = d;
                nearest = idx;
            }
        });
        zones[nearest].buildings.push({ x: b.position.x, z: b.position.z });
    });

    const pboPositions = [];
    zones.forEach(zone => {
        if (zone.buildings.length === 0) return;

        const desiredPboCount = Math.max(1, Math.ceil(zone.buildings.length / homesPerPbo));
        const sortedByAngle = [...zone.buildings].sort((a, b) => {
            const aa = Math.atan2(a.z - zone.sro.z, a.x - zone.sro.x);
            const ab = Math.atan2(b.z - zone.sro.z, b.x - zone.sro.x);
            return aa - ab;
        });

        for (let i = 0; i < desiredPboCount; i++) {
            const idx = Math.min(
                sortedByAngle.length - 1,
                Math.floor(((i + 0.5) * sortedByAngle.length) / desiredPboCount)
            );
            const seed = sortedByAngle[idx];
            const nearRoad = closestRoadSegment(seed);
            const snapped = projectPointToSegment(seed, nearRoad);

            const tooClose = pboPositions.some(p => dist2d(p, snapped) < 8);
            if (!tooClose) {
                pboPositions.push({ x: snapped.x, z: snapped.z, sroId: zone.sroId });
            }
        }
    });

    return pboPositions;
}

// ============================================================
// Network build
// ============================================================
function initNetwork() {
    network.createBuildings();

    const nro = network.createNRO();
    const sroMeshes = [];

    NETWORK_CONFIG.SRO_POSITIONS.forEach((pos, i) => {
        const sro = network.createSRO(pos, i);
        sroMeshes.push(sro);
        // Transport cables follow roads at aerial height (8m = top of pole)
        // Transport cables follow roads underground (buried backbone)
        // use a small height (near ground) for routing; NetworkModel will offset
        // transport cables slightly below ground level for visual correctness.
        const points = network.getPath(nro.position, sro.position, 0.3);
        network.createCable(`transport-${i}`, points, 'transport');
    });

    const pboPositions = generatePBOPositions(
        network.equipments.buildings,
        NETWORK_CONFIG.SRO_POSITIONS,
        NETWORK_CONFIG.PBO_HOMES_TARGET
    );

    const extraPboPositions = [
        { x: 65, z: 55, sroId: 3 },
        { x: 50, z: 60, sroId: 3 }
    ];
    pboPositions.push(...extraPboPositions);

    const pboCountBySro = new Map();
    pboPositions.forEach(p => {
        pboCountBySro.set(p.sroId, (pboCountBySro.get(p.sroId) || 0) + 1);
    });

    pboPositions.forEach((pboPos, idx) => {
        // Create a real pole for each PBO (height 8m)
        const pd = network.createPole({ x: pboPos.x, z: pboPos.z }, 8);
        const pbo = network.createPBO(pd, `pbo-${idx}`);
        
        // Feeder from SRO to this PBO
        const sro = NETWORK_CONFIG.SRO_POSITIONS[pboPos.sroId];
        
        // Vary the aerial height based on PBO index (around the PBO attachment point)
        const aerialHeight = pbo.position.y || 6.5; // connect directly to the PBO height
        
        // 1. Sort du bas du SRO (0.1m, à la surface)
        // 2. Suit le sol / trottoirs
        // 3. Rejoint le pied du poteau
        const path = network.getPath(sro, pboPos, 0.1);
        
        // 4. Monte verticalement le long du poteau
        path.push({ x: pboPos.x, y: aerialHeight, z: pboPos.z });
        
        network.createCable(`pbo-feeder-${idx}`, path, 'distribution');
    });

    sroMeshes.forEach((sro, idx) => {
        sro.metadata = {
            ...(sro.metadata || {}),
            pboCount: pboCountBySro.get(idx) || 0
        };
    });

    // Dynamic eligibility with realistic capillary threshold
    network.computeEligibility(
        NETWORK_CONFIG.SRO_COVERAGE_RADIUS,
        NETWORK_CONFIG.PBO_ELIGIBILITY_RADIUS
    );

    const stats = {
        eligible: network.equipments.buildings.filter(b => b.metadata.status === 'ELIGIBLE').length,
        waiting: network.equipments.buildings.filter(b => b.metadata.status === 'WAITING').length,
        nonEligible: network.equipments.buildings.filter(b => b.metadata.status === 'NON_ELIGIBLE').length
    };
    console.log('[FTTH] Eligibility Stats:', stats);

    // Start at step 0 with cinematic camera
    animController.setStep(0);
    ui.updateUI(0);
    camerCtrl.goToStage(0);
}

initNetwork();
