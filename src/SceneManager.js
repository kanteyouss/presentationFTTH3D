import * as BABYLON from 'babylonjs';
import { COLORS, NETWORK_CONFIG } from './constants';

export class SceneManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.engine = new BABYLON.Engine(this.canvas, true);
        this.scene = new BABYLON.Scene(this.engine);
        this.scene.clearColor = BABYLON.Color4.FromHexString(COLORS.BACKGROUND + 'FF');

        this.setupCamera();
        this.setupLights();
        this.setupEnvironment();

        window.addEventListener('resize', () => this.engine.resize());
        this.engine.runRenderLoop(() => this.scene.render());

        // Premium Effects
        this.glowLayer = new BABYLON.GlowLayer("glow", this.scene);
        this.glowLayer.intensity = 0.6;
    }

    setupCamera() {
        this.camera = new BABYLON.ArcRotateCamera(
            "camera",
            -Math.PI / 4,
            Math.PI / 3,
            80,
            new BABYLON.Vector3(0, 0, 0),
            this.scene
        );
        this.camera.attachControl(this.canvas, true);
        this.camera.lowerRadiusLimit = 5;
        this.camera.upperRadiusLimit = 200;
        this.camera.useAutoRotationBehavior = false;
        this.camera.wheelPrecision = 30;
    }

    animateCamera(targetPos, targetRadius, targetAlpha, targetBeta, duration = 1500) {
        const ease = new BABYLON.CubicEase();
        ease.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEINOUT);

        const animRadius = BABYLON.Animation.CreateAndStartAnimation("camRadius", this.camera, "radius", 60, 60 * (duration / 1000), this.camera.radius, targetRadius, 0, ease);
        const animAlpha = BABYLON.Animation.CreateAndStartAnimation("camAlpha", this.camera, "alpha", 60, 60 * (duration / 1000), this.camera.alpha, targetAlpha, 0, ease);
        const animBeta = BABYLON.Animation.CreateAndStartAnimation("camBeta", this.camera, "beta", 60, 60 * (duration / 1000), this.camera.beta, targetBeta, 0, ease);
        const animTarget = BABYLON.Animation.CreateAndStartAnimation("camTarget", this.camera, "target", 60, 60 * (duration / 1000), this.camera.target, new BABYLON.Vector3(targetPos.x, targetPos.y || 0, targetPos.z), 0, ease);
    }

    setupLights() {
        const hemiLight = new BABYLON.HemisphericLight("hemiLight", new BABYLON.Vector3(0, 1, 0), this.scene);
        hemiLight.intensity = 0.5;
        hemiLight.diffuse = new BABYLON.Color3(1, 1, 1);
        hemiLight.specular = new BABYLON.Color3(1, 1, 1);
        hemiLight.groundColor = new BABYLON.Color3(0.1, 0.1, 0.2);

        const dirLight = new BABYLON.DirectionalLight("dirLight", new BABYLON.Vector3(-1, -2, -1), this.scene);
        dirLight.position = new BABYLON.Vector3(20, 40, 20);
        dirLight.intensity = 0.8;

        this.shadowGenerator = new BABYLON.ShadowGenerator(1024, dirLight);
        this.shadowGenerator.useBlurExponentialShadowMap = true;
    }

    setupEnvironment() {
        // Ground with grid
        const ground = BABYLON.MeshBuilder.CreateGround("ground", {
            width: NETWORK_CONFIG.GROUND_SIZE,
            height: NETWORK_CONFIG.GROUND_SIZE
        }, this.scene);

        ground.material = new BABYLON.StandardMaterial("groundMat", this.scene);
        ground.material.diffuseColor = BABYLON.Color3.FromHexString("#d3ad8d"); // Dusty/Sandy ground
        ground.receiveShadows = true;

        // Emissive grid effect
        this.createGridLines();

        // Roads (Schematic)
        this.createRoads();
    }

    createGridLines() {
        const size = NETWORK_CONFIG.GROUND_SIZE;
        const step = 5;
        const points = [];
        for (let i = -size / 2; i <= size / 2; i += step) {
            points.push([new BABYLON.Vector3(i, 0.01, -size / 2), new BABYLON.Vector3(i, 0.01, size / 2)]);
            points.push([new BABYLON.Vector3(-size / 2, 0.01, i), new BABYLON.Vector3(size / 2, 0.01, i)]);
        }

        const gridLines = BABYLON.MeshBuilder.CreateLineSystem("gridLines", { lines: points }, this.scene);
        gridLines.color = BABYLON.Color3.FromHexString(COLORS.GRID);
        gridLines.alpha = 0.3;
    }

    createRoads() {
        const roadMat = new BABYLON.StandardMaterial("roadMat", this.scene);
        roadMat.diffuseColor = BABYLON.Color3.FromHexString(COLORS.ROAD);
        roadMat.specularColor = new BABYLON.Color3(0, 0, 0);

        const size = NETWORK_CONFIG.GROUND_SIZE;
        const mainWidth = 6;
        const sideWidth = 3;

        roadMat.diffuseColor = BABYLON.Color3.FromHexString("#2d3436");

        // Define Organic Road Segments (Abidjan style)
        const roads = [
            // Main Arteries (Wider)
            { from: { x: -75, z: 0 }, to: { x: 75, z: 10 }, width: 8, type: 'main' },
            { from: { x: 0, z: -75 }, to: { x: -10, z: 75 }, width: 8, type: 'main' },
            // Secondary Organic Streets (Non-perfect angles)
            { from: { x: -40, z: -75 }, to: { x: -30, z: 75 }, width: 4, type: 'secondary' },
            { from: { x: 40, z: -75 }, to: { x: 50, z: 75 }, width: 4, type: 'secondary' },
            { from: { x: -75, z: 30 }, to: { x: 75, z: 40 }, width: 4, type: 'secondary' },
            { from: { x: -75, z: -30 }, to: { x: 75, z: -40 }, width: 4, type: 'secondary' }
        ];

        roads.forEach((r, i) => {
            const distance = Math.sqrt(Math.pow(r.to.x - r.from.x, 2) + Math.pow(r.to.z - r.from.z, 2));
            const angle = Math.atan2(r.to.x - r.from.x, r.to.z - r.from.z);

            const road = BABYLON.MeshBuilder.CreatePlane(`road-${i}`, {
                width: r.width,
                height: distance
            }, this.scene);

            road.position = new BABYLON.Vector3((r.from.x + r.to.x) / 2, 0.05, (r.from.z + r.to.z) / 2);
            road.rotation.x = Math.PI / 2;
            road.rotation.z = angle;
            road.material = roadMat;
            road.receiveShadows = true;

            // Add some street props along the roads
            if (r.type === 'main') this.createStreetProps(r);
        });
    }

    createStreetProps(road) {
        const angle = Math.atan2(road.to.x - road.from.x, road.to.z - road.from.z);
        const dist = 25;
        const count = 3;
        for (let i = -count; i <= count; i++) {
            const pos = {
                x: ((road.from.x + road.to.x) / 2) + i * dist * Math.sin(angle + Math.PI / 2),
                z: ((road.from.z + road.to.z) / 2) + i * dist * Math.cos(angle + Math.PI / 2)
            };
            this.createTree({ x: pos.x + 6, z: pos.z });
            this.createLamp({ x: pos.x - 6, z: pos.z });

            // Add a car occasionally
            if (i % 2 === 0) {
                this.createCar({ x: pos.x + 4 * (Math.random() > 0.5 ? 1 : -1), z: pos.z + (Math.random() - 0.5) * 10 });
            }
        }
    }

    createCar(pos) {
        const body = BABYLON.MeshBuilder.CreateBox("car", { width: 2, height: 1, depth: 4 }, this.scene);
        body.position = new BABYLON.Vector3(pos.x, 0.6, pos.z);
        const mat = new BABYLON.StandardMaterial("carMat", this.scene);
        mat.diffuseColor = new BABYLON.Color3(Math.random(), Math.random(), Math.random());
        body.material = mat;
    }

    createTree(pos) {
        const trunk = BABYLON.MeshBuilder.CreateCylinder("trunk", { height: 2, diameter: 0.4 }, this.scene);
        trunk.position = new BABYLON.Vector3(pos.x, 1, pos.z);
        const leaves = BABYLON.MeshBuilder.CreateSphere("leaves", { diameter: 3 }, this.scene);
        leaves.position = new BABYLON.Vector3(pos.x, 3, pos.z);

        const trunkMat = new BABYLON.StandardMaterial("trunkMat", this.scene);
        trunkMat.diffuseColor = new BABYLON.Color3(0.4, 0.2, 0.1);
        trunk.material = trunkMat;

        const leavesMat = new BABYLON.StandardMaterial("leavesMat", this.scene);
        leavesMat.diffuseColor = new BABYLON.Color3(0.1, 0.5, 0.1);
        leaves.material = leavesMat;
    }

    createLamp(pos) {
        const pole = BABYLON.MeshBuilder.CreateCylinder("lampPole", { height: 6, diameter: 0.15 }, this.scene);
        pole.position = new BABYLON.Vector3(pos.x, 3, pos.z);
        const lightBox = BABYLON.MeshBuilder.CreateBox("lightBox", { size: 0.4 }, this.scene);
        lightBox.position = new BABYLON.Vector3(pos.x, 6, pos.z);

        const mat = new BABYLON.StandardMaterial("lampMat", this.scene);
        mat.diffuseColor = new BABYLON.Color3(0.3, 0.3, 0.3);
        mat.emissiveColor = new BABYLON.Color3(0.8, 0.8, 0.5);
        pole.material = mat;
        lightBox.material = mat;
    }
}
