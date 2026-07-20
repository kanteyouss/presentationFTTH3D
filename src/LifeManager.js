import * as BABYLON from 'babylonjs';
import { NODES } from './RoadRouter';

const SKIN = '#e8d5c4';
const CLOTHES = ['#4a6fa5', '#c0392b', '#2d6a4f', '#6c5b7b', '#e07a5f', '#3d405b', '#d4a373'];
const DOG_FUR = ['#8B6914', '#5C4033', '#D2B48C', '#4A3728', '#696969'];

const EDGES = [
    ['NW', 'L_C'], ['L_C', 'C'], ['C', 'R_C'], ['R_C', 'NE'],
    ['NS', 'CX_BOT'], ['CX_BOT', 'C'], ['C', 'CX_TOP'], ['CX_TOP', 'NN'],
    ['W_MID_TOP', 'L_TOP'], ['L_TOP', 'CX_TOP'], ['CX_TOP', 'R_TOP'], ['R_TOP', 'E_MID_TOP'],
    ['W_MID_BOT', 'L_BOT'], ['L_BOT', 'CX_BOT'], ['CX_BOT', 'R_BOT'], ['R_BOT', 'E_MID_BOT'],
    ['L_S', 'L_BOT'], ['L_BOT', 'L_C'], ['L_C', 'L_TOP'], ['L_TOP', 'L_N'],
    ['R_S', 'R_BOT'], ['R_BOT', 'R_C'], ['R_C', 'R_TOP'], ['R_TOP', 'R_N'],
];

const OFFSET = 4.5;
const BIRD_CENTERS = [
    { x: -35, z: -35 }, { x: 35, z: 35 }, { x: 0, z: 55 }
];

let _matCache = {};

function _mat(scene, hex) {
    if (!_matCache[hex]) {
        const m = new BABYLON.StandardMaterial(`life_${hex.replace('#', '')}`, scene);
        m.diffuseColor = BABYLON.Color3.FromHexString(hex);
        _matCache[hex] = m;
    }
    return _matCache[hex];
}

function buildSidewalkPaths() {
    const paths = [];
    EDGES.forEach(([a, b]) => {
        const na = NODES[a], nb = NODES[b];
        const dx = nb.x - na.x;
        const dz = nb.z - na.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len < 1) return;
        const px = -dz / len * OFFSET;
        const pz = dx / len * OFFSET;
        for (let side = -1; side <= 1; side += 2) {
            paths.push([
                { x: na.x + px * side, z: na.z + pz * side },
                { x: nb.x + px * side, z: nb.z + pz * side }
            ]);
        }
    });
    return paths;
}

function chainPaths(paths, startIdx, count) {
    const result = [];
    let idx = startIdx;
    for (let i = 0; i < count; i++) {
        const p = paths[idx % paths.length];
        result.push(p[0], p[1]);
        idx = (idx + 1) % paths.length;
    }
    return result;
}

class Pedestrian {
    constructor(scene, position, waypoints) {
        this.scene = scene;
        this.waypoints = waypoints;
        this.waypointIndex = 0;
        this.progress = 0;
        this.speed = 1.2 + Math.random() * 0.8;

        this.segmentLengths = [];
        for (let i = 0; i < waypoints.length - 1; i++) {
            const dx = waypoints[i + 1].x - waypoints[i].x;
            const dz = waypoints[i + 1].z - waypoints[i].z;
            this.segmentLengths.push(Math.sqrt(dx * dx + dz * dz));
        }

        this.walkPhase = Math.random() * Math.PI * 2;
        this.root = new BABYLON.TransformNode('ped', scene);
        this.root.position = new BABYLON.Vector3(position.x, 0, position.z);

        const skinMat = _mat(scene, SKIN);
        const clothMat = _mat(scene, CLOTHES[Math.floor(Math.random() * CLOTHES.length)]);

        const head = BABYLON.MeshBuilder.CreateSphere('h', { diameter: 0.22 }, scene);
        head.parent = this.root;
        head.position = new BABYLON.Vector3(0, 1.55, 0);
        head.material = skinMat;

        const torso = BABYLON.MeshBuilder.CreateBox('t', { width: 0.5, height: 0.55, depth: 0.28 }, scene);
        torso.parent = this.root;
        torso.position = new BABYLON.Vector3(0, 1.1, 0);
        torso.material = clothMat;

        this.lArm = BABYLON.MeshBuilder.CreateBox('la', { width: 0.1, height: 0.45, depth: 0.1 }, scene);
        this.lArm.parent = this.root;
        this.lArm.position = new BABYLON.Vector3(-0.3, 0.9, 0);
        this.lArm.material = skinMat;

        this.rArm = BABYLON.MeshBuilder.CreateBox('ra', { width: 0.1, height: 0.45, depth: 0.1 }, scene);
        this.rArm.parent = this.root;
        this.rArm.position = new BABYLON.Vector3(0.3, 0.9, 0);
        this.rArm.material = skinMat;

        this.lLeg = BABYLON.MeshBuilder.CreateBox('ll', { width: 0.12, height: 0.5, depth: 0.12 }, scene);
        this.lLeg.parent = this.root;
        this.lLeg.position = new BABYLON.Vector3(-0.1, 0.25, 0);
        this.lLeg.material = _mat(scene, '#3d405b');

        this.rLeg = BABYLON.MeshBuilder.CreateBox('rl', { width: 0.12, height: 0.5, depth: 0.12 }, scene);
        this.rLeg.parent = this.root;
        this.rLeg.position = new BABYLON.Vector3(0.1, 0.25, 0);
        this.rLeg.material = _mat(scene, '#3d405b');
    }

    update(dt) {
        const segLen = this.segmentLengths[this.waypointIndex];
        if (!segLen || segLen === 0) return;

        this.progress += (this.speed * dt) / segLen;
        if (this.progress >= 1) {
            this.progress = 0;
            this.waypointIndex = (this.waypointIndex + 1) % (this.waypoints.length - 1);
        }

        const i0 = this.waypointIndex;
        const i1 = (i0 + 1) % this.waypoints.length;
        const p0 = this.waypoints[i0];
        const p1 = this.waypoints[i1];
        const t = this.progress;

        this.root.position.x = p0.x + (p1.x - p0.x) * t;
        this.root.position.z = p0.z + (p1.z - p0.z) * t;
        this.root.rotation.y = Math.atan2(p1.x - p0.x, p1.z - p0.z);

        this.walkPhase += dt * 8;
        this.root.position.y = 0.04 * Math.abs(Math.sin(this.walkPhase));

        const swing = 0.5 * Math.sin(this.walkPhase);
        this.lArm.rotation.z = swing;
        this.rArm.rotation.z = -swing;
        this.lLeg.rotation.z = -swing * 0.5;
        this.rLeg.rotation.z = swing * 0.5;
    }

    setEnabled(v) {
        this.root.setEnabled(v);
    }
}

class Dog {
    constructor(scene, position, waypoints) {
        this.scene = scene;
        this.waypoints = waypoints;
        this.waypointIndex = 0;
        this.progress = 0;
        this.speed = 1.8 + Math.random() * 0.5;

        this.segmentLengths = [];
        for (let i = 0; i < waypoints.length - 1; i++) {
            const dx = waypoints[i + 1].x - waypoints[i].x;
            const dz = waypoints[i + 1].z - waypoints[i].z;
            this.segmentLengths.push(Math.sqrt(dx * dx + dz * dz));
        }

        this.walkPhase = Math.random() * Math.PI * 2;
        this.tailPhase = Math.random() * Math.PI * 2;
        this.root = new BABYLON.TransformNode('dog', scene);
        this.root.position = new BABYLON.Vector3(position.x, 0, position.z);

        const fur = _mat(scene, DOG_FUR[Math.floor(Math.random() * DOG_FUR.length)]);
        const darkFur = _mat(scene, '#5C4033');

        const body = BABYLON.MeshBuilder.CreateBox('dog_body', { width: 0.3, height: 0.2, depth: 0.5 }, scene);
        body.parent = this.root;
        body.position = new BABYLON.Vector3(0, 0.25, 0);
        body.material = fur;

        const head = BABYLON.MeshBuilder.CreateSphere('dog_head', { diameter: 0.14 }, scene);
        head.parent = this.root;
        head.position = new BABYLON.Vector3(0, 0.35, 0.28);
        head.material = darkFur;

        for (let s = -1; s <= 1; s += 2) {
            for (let f = -1; f <= 1; f += 2) {
                const leg = BABYLON.MeshBuilder.CreateCylinder(`dog_leg_${s}_${f}`, {
                    height: 0.18, diameter: 0.04, tessellation: 6
                }, scene);
                leg.parent = this.root;
                leg.position = new BABYLON.Vector3(s * 0.1, 0.09, f * 0.18);
                leg.material = fur;
            }
        }

        this.tail = BABYLON.MeshBuilder.CreateCylinder('dog_tail', {
            height: 0.15, diameter: 0.025, tessellation: 6
        }, scene);
        this.tail.parent = this.root;
        this.tail.position = new BABYLON.Vector3(0, 0.3, -0.28);
        this.tail.rotation.x = 0.5;
        this.tail.material = fur;
    }

    update(dt) {
        const segLen = this.segmentLengths[this.waypointIndex];
        if (!segLen || segLen === 0) return;

        this.progress += (this.speed * dt) / segLen;
        if (this.progress >= 1) {
            this.progress = 0;
            this.waypointIndex = (this.waypointIndex + 1) % (this.waypoints.length - 1);
        }

        const i0 = this.waypointIndex;
        const i1 = (i0 + 1) % this.waypoints.length;
        const p0 = this.waypoints[i0];
        const p1 = this.waypoints[i1];
        const t = this.progress;

        this.root.position.x = p0.x + (p1.x - p0.x) * t;
        this.root.position.z = p0.z + (p1.z - p0.z) * t;
        this.root.rotation.y = Math.atan2(p1.x - p0.x, p1.z - p0.z);

        this.walkPhase += dt * 12;
        this.root.position.y = 0.03 * Math.abs(Math.sin(this.walkPhase));

        this.tailPhase += dt * 6;
        this.tail.rotation.z = 0.3 * Math.sin(this.tailPhase);
    }

    setEnabled(v) {
        this.root.setEnabled(v);
    }
}

class Bird {
    constructor(scene, center, radius, height, speed) {
        this.scene = scene;
        this.center = center;
        this.radius = radius || 8 + Math.random() * 5;
        this.height = height || 12 + Math.random() * 4;
        this.speed = speed || 1.5 + Math.random();
        this.angle = Math.random() * Math.PI * 2;
        this.wingPhase = Math.random() * Math.PI * 2;

        this.root = new BABYLON.TransformNode('bird', scene);
        this.root.position = new BABYLON.Vector3(center.x, this.height, center.z);

        const dark = _mat(scene, '#2d3436');

        const body = BABYLON.MeshBuilder.CreateSphere('bird_body', { diameter: 0.16 }, scene);
        body.parent = this.root;
        body.scaling = new BABYLON.Vector3(1, 0.7, 0.5);
        body.material = dark;

        this.lWing = BABYLON.MeshBuilder.CreateBox('bird_lw', { width: 0.3, height: 0.02, depth: 0.1 }, scene);
        this.lWing.parent = this.root;
        this.lWing.position = new BABYLON.Vector3(-0.08, 0.05, 0);
        this.lWing.material = dark;

        this.rWing = BABYLON.MeshBuilder.CreateBox('bird_rw', { width: 0.3, height: 0.02, depth: 0.1 }, scene);
        this.rWing.parent = this.root;
        this.rWing.position = new BABYLON.Vector3(0.08, 0.05, 0);
        this.rWing.material = dark;

        const tail = BABYLON.MeshBuilder.CreateBox('bird_tail', { width: 0.05, height: 0.02, depth: 0.1 }, scene);
        tail.parent = this.root;
        tail.position = new BABYLON.Vector3(0, 0.02, -0.12);
        tail.material = dark;
    }

    update(dt) {
        this.angle += dt * this.speed * 0.3;
        this.root.position.x = this.center.x + Math.cos(this.angle) * this.radius;
        this.root.position.z = this.center.z + Math.sin(this.angle) * this.radius;
        this.root.position.y = this.height + 0.5 * Math.sin(this.angle * 2);
        this.root.rotation.y = -this.angle + Math.PI / 2;

        this.wingPhase += dt * 10;
        const flap = 0.6 * Math.sin(this.wingPhase);
        this.lWing.rotation.x = flap;
        this.rWing.rotation.x = -flap;
    }

    setEnabled(v) {
        this.root.setEnabled(v);
    }
}

class Cat {
    constructor(scene, position) {
        this.scene = scene;
        this.root = new BABYLON.TransformNode('cat', scene);
        this.root.position = new BABYLON.Vector3(position.x, 0, position.z);
        this.root.rotation.y = Math.random() * Math.PI * 2;

        const fur = _mat(scene, ['#FF8C00', '#808080', '#000000', '#FFFFFF', '#8B4513'][Math.floor(Math.random() * 5)]);

        const body = BABYLON.MeshBuilder.CreateBox('cat_body', { width: 0.2, height: 0.15, depth: 0.35 }, scene);
        body.parent = this.root;
        body.position = new BABYLON.Vector3(0, 0.15, 0);
        body.material = fur;

        const head = BABYLON.MeshBuilder.CreateSphere('cat_head', { diameter: 0.12 }, scene);
        head.parent = this.root;
        head.position = new BABYLON.Vector3(0, 0.22, 0.2);
        head.material = fur;

        for (let s = -1; s <= 1; s += 2) {
            for (let f = -1; f <= 1; f += 2) {
                const leg = BABYLON.MeshBuilder.CreateCylinder(`cat_leg_${s}_${f}`, {
                    height: 0.1, diameter: 0.025, tessellation: 6
                }, scene);
                leg.parent = this.root;
                leg.position = new BABYLON.Vector3(s * 0.07, 0.05, f * 0.12);
                leg.material = fur;
            }
        }

        const tail = BABYLON.MeshBuilder.CreateCylinder('cat_tail', {
            height: 0.2, diameter: 0.02, tessellation: 6
        }, scene);
        tail.parent = this.root;
        tail.position = new BABYLON.Vector3(0, 0.2, -0.2);
        tail.rotation.x = 0.8;
        tail.material = fur;
    }

    update(dt) {}

    setEnabled(v) {
        this.root.setEnabled(v);
    }
}

export class LifeManager {
    constructor(scene) {
        this.scene = scene;
        this.pedestrians = [];
        this.dogs = [];
        this.birds = [];
        this.cats = [];
        this.visible = true;

        const paths = buildSidewalkPaths();
        if (paths.length === 0) return;

        for (let i = 0; i < 20; i++) {
            const pathIdx = Math.floor(Math.random() * paths.length);
            const p = paths[pathIdx];
            const t = Math.random();
            const pos = { x: p[0].x + (p[1].x - p[0].x) * t, z: p[0].z + (p[1].z - p[0].z) * t };
            const waypoints = chainPaths(paths, pathIdx, 2 + Math.floor(Math.random() * 2));
            const ped = new Pedestrian(scene, pos, waypoints);
            ped.progress = t;
            this.pedestrians.push(ped);
        }

        for (let i = 0; i < 5; i++) {
            const pathIdx = Math.floor(Math.random() * paths.length);
            const p = paths[pathIdx];
            const waypoints = chainPaths(paths, pathIdx, 1 + Math.floor(Math.random() * 2));
            this.dogs.push(new Dog(scene, p[0], waypoints));
        }

        BIRD_CENTERS.forEach(c => {
            for (let i = 0; i < 3; i++) {
                this.birds.push(new Bird(scene, c, 8 + Math.random() * 5, 12 + Math.random() * 4, 1.5 + Math.random()));
            }
        });

        for (let i = 0; i < 3; i++) {
            this.cats.push(new Cat(scene, {
                x: (Math.random() - 0.5) * 120,
                z: (Math.random() - 0.5) * 120
            }));
        }
    }

    update(dt) {
        if (!this.visible) return;
        this.pedestrians.forEach(p => p.update(dt));
        this.dogs.forEach(d => d.update(dt));
        this.birds.forEach(b => b.update(dt));
        this.cats.forEach(c => c.update(dt));
    }

    setVisible(visible) {
        this.visible = visible;
        this.pedestrians.forEach(p => p.setEnabled(visible));
        this.dogs.forEach(d => d.setEnabled(visible));
        this.birds.forEach(b => b.setEnabled(visible));
        this.cats.forEach(c => c.setEnabled(visible));
    }
}
