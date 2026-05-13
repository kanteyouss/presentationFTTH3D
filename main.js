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

function closestRoadSegment(point) {
    let bestSegment = ROAD_SEGMENTS[0];
    let bestDistance = Infinity;

    ROAD_SEGMENTS.forEach(segment => {
        const midPoint = {
            x: (segment.from.x + segment.to.x) / 2,
            z: (segment.from.z + segment.to.z) / 2
        };
        const distance = dist2d(point, midPoint);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestSegment = segment;
        }
    });

    return bestSegment;
}

// ============================================================
// Network build
// ============================================================
function initNetwork() {
    network.createBuildings();

    const nro = network.createNRO();

    NETWORK_CONFIG.SRO_POSITIONS.forEach((pos, i) => {
        const sro = network.createSRO(pos, i);
        // Transport cables follow roads at aerial height (8m = top of pole)
        // Transport cables follow roads underground (buried backbone)
        // use a small height (near ground) for routing; NetworkModel will offset
        // transport cables slightly below ground level for visual correctness.
        const points = network.getPath(nro.position, sro.position, 0.3);
        network.createCable(`transport-${i}`, points, 'transport');
    });

    // (Removed legacy aerial feeder loops that started directly in the air from SRO)

    // === 10 strategically placed PBOs around SRO zones ===
    const PBO_POSITIONS = [
        // Zone SRO-A (-10, -10)
        { x: -25, z: -15, sroId: 0 },
        { x: -5, z: -25, sroId: 0 },
        { x: 5, z: -8, sroId: 0 },
        // Zone SRO-B (30, -40)
        { x: 15, z: -50, sroId: 1 },
        { x: 35, z: -55, sroId: 1 },
        { x: 45, z: -35, sroId: 1 },
        // Zone SRO-C (-30, 35)
        { x: -45, z: 30, sroId: 2 },
        { x: -30, z: 50, sroId: 2 },
        { x: -10, z: 40, sroId: 2 },
        { x: -50, z: 45, sroId: 2 }
    ];

    PBO_POSITIONS.forEach((pboPos, idx) => {
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

    // Dynamic eligibility: SRO radius 50m, PBO threshold 300m
    network.computeEligibility(50, 300);

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
