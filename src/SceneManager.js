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
        this.glowLayer.intensity = 0.7;

        // Post-processing
        this.setupPostProcessing();

        // Ciel, nuages, avions
        this._cloudMeshes = [];
        this._planes = [];
        this.createSkyDome();
        this.createClouds();
        this.createPlanes();

        // Mise à jour des avions dans la boucle de rendu
        this._planeObserver = this.scene.onBeforeRenderObservable.add(() => {
            const dt = this.engine.getDeltaTime() / 1000;
            this.updatePlanes(dt);
        });
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

    setupLights() {
        // Lumière hémisphérique — ciel bleu doux, reflet sol vert
        const hemiLight = new BABYLON.HemisphericLight("hemiLight", new BABYLON.Vector3(0, 1, 0), this.scene);
        hemiLight.intensity = 0.55;
        hemiLight.diffuse = BABYLON.Color3.FromHexString('#b8d4f0');
        hemiLight.specular = BABYLON.Color3.FromHexString('#446688');
        hemiLight.groundColor = BABYLON.Color3.FromHexString('#4a7c3f');

        // Soleil directionnel avec ombres portées douces
        const dirLight = new BABYLON.DirectionalLight("dirLight", new BABYLON.Vector3(-0.5, -1, -0.3), this.scene);
        dirLight.position = new BABYLON.Vector3(30, 60, 30);
        dirLight.intensity = 1.5;
        dirLight.diffuse = BABYLON.Color3.FromHexString('#fff4e6');

        // Shadow map haute qualité avec adoucissement
        this.shadowGenerator = new BABYLON.ShadowGenerator(2048, dirLight);
        this.shadowGenerator.useBlurExponentialShadowMap = true;
        this.shadowGenerator.blurKernel = 12;
        this.shadowGenerator.usePoissonSampling = true;
        this.shadowGenerator.bias = 0.0008;
        this.shadowGenerator.normalBias = 0.05;
        this.shadowGenerator.forceBackFacesOnly = true;

        // Tone mapping cinématographique (ACES)
        this.scene.imageProcessingConfiguration.toneMappingEnabled = true;
        this.scene.imageProcessingConfiguration.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
        this.scene.imageProcessingConfiguration.contrast = 1.08;
        this.scene.imageProcessingConfiguration.exposure = 1.0;
    }

    setupEnvironment() {
        // Sol herbeux procédural (texture canvas)
        const ground = BABYLON.MeshBuilder.CreateGround("ground", {
            width: NETWORK_CONFIG.GROUND_SIZE,
            height: NETWORK_CONFIG.GROUND_SIZE
        }, this.scene);

        const grassTex = this.createProceduralGrassTexture();
        ground.material = new BABYLON.StandardMaterial("groundMat", this.scene);
        ground.material.diffuseTexture = grassTex;
        ground.material.specularColor = BABYLON.Color3.Black();
        ground.receiveShadows = true;

        // Grille subtile (lecture SIG)
        this.createGridLines();

        // Routes avec marquages
        this.createRoads();

        // Végétation supplémentaire en bordure de scène
        this.plantTrees();
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

            this.createRoadMarkings(road, r, distance);

            // Add some street props along the roads
            if (r.type === 'main') this.createStreetProps(r);
        });

        this.createIntersectionMarkings();
    }

    createRoadMarkings(roadMesh, roadDef, distance) {
        const markingMat = new BABYLON.StandardMaterial(`markingMat-${roadDef.from.x}-${roadDef.from.z}`, this.scene);
        markingMat.diffuseColor = new BABYLON.Color3(1, 1, 1);
        markingMat.emissiveColor = new BABYLON.Color3(0.18, 0.18, 0.18);
        markingMat.specularColor = new BABYLON.Color3(0, 0, 0);

        const surfaceLift = 0.02;

        const makeStripe = (offset, stripeLength, stripeWidth, index, alongOffset = 0) => {
            const stripe = BABYLON.MeshBuilder.CreatePlane(`stripe-${roadDef.from.x}-${roadDef.from.z}-${offset}-${index}`, {
                width: stripeWidth,
                height: stripeLength
            }, this.scene);
            stripe.parent = roadMesh;
            stripe.position = new BABYLON.Vector3(offset, alongOffset, surfaceLift);
            stripe.material = markingMat;
        };

        // Edge lines for all roads
        const edgeOffset = roadDef.width * 0.46;
        makeStripe(edgeOffset, distance, 0.16, 0);
        makeStripe(-edgeOffset, distance, 0.16, 1);

        // Main axes: central and lane separation
        if (roadDef.type === 'main') {
            const dashLength = 3.2;
            const gap = 2.2;
            const period = dashLength + gap;
            const dashCount = Math.max(1, Math.floor(distance / period));

            for (let i = 0; i < dashCount; i++) {
                const t = (i + 0.5) / dashCount;
                const along = -distance / 2 + t * distance;

                const centerDash = BABYLON.MeshBuilder.CreatePlane(`center-dash-${roadDef.from.x}-${roadDef.from.z}-${i}`, {
                    width: 0.18,
                    height: Math.min(dashLength, distance / dashCount * 0.7)
                }, this.scene);
                centerDash.parent = roadMesh;
                centerDash.position = new BABYLON.Vector3(0, along, surfaceLift + 0.001);
                centerDash.material = markingMat;
            }

            // Light lane separators to suggest 2x2 lanes
            const laneOffset = roadDef.width * 0.22;
            const laneCount = Math.max(1, Math.floor(distance / (period * 1.1)));
            for (let i = 0; i < laneCount; i++) {
                const t = (i + 0.5) / laneCount;
                const along = -distance / 2 + t * distance;

                const left = BABYLON.MeshBuilder.CreatePlane(`lane-left-${roadDef.from.x}-${roadDef.from.z}-${i}`, {
                    width: 0.12,
                    height: Math.min(2.2, distance / laneCount * 0.6)
                }, this.scene);
                left.parent = roadMesh;
                left.position = new BABYLON.Vector3(laneOffset, along, surfaceLift + 0.001);
                left.material = markingMat;

                const right = left.clone(`lane-right-${roadDef.from.x}-${roadDef.from.z}-${i}`);
                right.parent = roadMesh;
                right.position = new BABYLON.Vector3(-laneOffset, along, surfaceLift + 0.001);
            }
        }
    }

    createIntersectionMarkings() {
        const roadAngle = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
        const mainRoadA = roadAngle({ x: -75, z: 0 }, { x: 75, z: 10 });
        const mainRoadB = roadAngle({ x: 0, z: -75 }, { x: -10, z: 75 });

        const crossings = [
            { x: -5, z: 5, angle: mainRoadA },
            { x: -5, z: 35, angle: mainRoadA },
            { x: -5, z: -35, angle: mainRoadA },
            { x: -35, z: 5, angle: mainRoadB },
            { x: 47, z: 5, angle: mainRoadB }
        ];

        const stopBars = [
            { x: -14, z: 5, angle: -Math.PI / 2 },
            { x: 6, z: 5, angle: Math.PI / 2 },
            { x: -5, z: 13, angle: 0 },
            { x: -5, z: -3, angle: Math.PI }
        ];

        const markingMat = new BABYLON.StandardMaterial('intersectionMarkingMat', this.scene);
        markingMat.diffuseColor = new BABYLON.Color3(1, 1, 1);
        markingMat.emissiveColor = new BABYLON.Color3(0.18, 0.18, 0.18);
        markingMat.specularColor = new BABYLON.Color3(0, 0, 0);

        crossings.forEach((c, idx) => {
            const stripeCount = 6;
            for (let i = 0; i < stripeCount; i++) {
                const stripe = BABYLON.MeshBuilder.CreatePlane(`crosswalk-${idx}-${i}`, {
                    width: 0.45,
                    height: 2.3
                }, this.scene);
                const lateral = (i - (stripeCount - 1) / 2) * 0.72;
                stripe.position = new BABYLON.Vector3(
                    c.x + lateral * Math.cos(c.angle),
                    0.074,
                    c.z - lateral * Math.sin(c.angle)
                );
                stripe.rotation.x = Math.PI / 2;
                stripe.rotation.z = c.angle;
                stripe.material = markingMat;
            }
        });

        stopBars.forEach((s, idx) => {
            const bar = BABYLON.MeshBuilder.CreatePlane(`stop-bar-${idx}`, {
                width: 0.35,
                height: 3.2
            }, this.scene);
            bar.position = new BABYLON.Vector3(s.x, 0.074, s.z);
            bar.rotation.x = Math.PI / 2;
            bar.rotation.z = s.angle;
            bar.material = markingMat;

            const arrow = BABYLON.MeshBuilder.CreateDisc(`dir-arrow-${idx}`, {
                radius: 0.48,
                tessellation: 3
            }, this.scene);
            arrow.position = new BABYLON.Vector3(s.x, 0.075, s.z + 1.6 * Math.cos(s.angle));
            arrow.rotation.x = Math.PI / 2;
            arrow.rotation.z = s.angle;
            arrow.material = markingMat;
        });
    }

    createStreetProps(road) {
        const angle = Math.atan2(road.to.x - road.from.x, road.to.z - road.from.z);
        const dist = 25;
        const count = 3;
        for (let i = -count; i <= count; i++) {
            const pos = {
                x: ((road.from.x + road.to.x) / 2) + i * dist * Math.cos(angle),
                z: ((road.from.z + road.to.z) / 2) + i * dist * Math.sin(angle)
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

    createTree(pos, variant = 0) {
        const trunkH = 1.8 + (variant % 3) * 0.5;
        const crownD = 2.5 + (variant % 3) * 1.2;

        const trunk = BABYLON.MeshBuilder.CreateCylinder("trunk", {
            height: trunkH, diameter: 0.25 + (variant % 3) * 0.08, tessellation: 6
        }, this.scene);
        trunk.position = new BABYLON.Vector3(pos.x, trunkH / 2, pos.z);

        const leaves = BABYLON.MeshBuilder.CreateSphere("leaves", {
            diameter: crownD, segments: 6
        }, this.scene);
        leaves.position = new BABYLON.Vector3(pos.x, trunkH + crownD * 0.35, pos.z);

        const trunkMat = new BABYLON.StandardMaterial("trunkMat", this.scene);
        trunkMat.diffuseColor = new BABYLON.Color3(0.35, 0.2, 0.08);
        trunkMat.specularColor = BABYLON.Color3.Black();
        trunk.material = trunkMat;

        const greenBase = 0.35 + (variant % 4) * 0.1;
        const leavesMat = new BABYLON.StandardMaterial("leavesMat", this.scene);
        leavesMat.diffuseColor = new BABYLON.Color3(0.04, greenBase, 0.04);
        leavesMat.specularColor = BABYLON.Color3.Black();
        leaves.material = leavesMat;

        trunk.receiveShadows = true;
        leaves.receiveShadows = true;
        this.shadowGenerator?.addShadowCaster(trunk);
        this.shadowGenerator?.addShadowCaster(leaves);
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

    // ================================================================
    // Texture d'herbe procédurale (DynamicTexture canvas)
    // ================================================================
    createProceduralGrassTexture() {
        const size = 512;
        const dt = new BABYLON.DynamicTexture("grassTex", { width: size, height: size }, this.scene, false);
        const ctx = dt.getContext();

        // Fond vert prairie
        ctx.fillStyle = '#5a8a4a';
        ctx.fillRect(0, 0, size, size);

        // Bruit chromatique vert (variation pixel)
        const imageData = ctx.getImageData(0, 0, size, size);
        for (let i = 0; i < imageData.data.length; i += 4) {
            const noise = (Math.random() - 0.5) * 40;
            imageData.data[i] = Math.min(255, Math.max(0, imageData.data[i] + noise));
            imageData.data[i + 1] = Math.min(255, Math.max(0, imageData.data[i + 1] + noise * 0.7));
            imageData.data[i + 2] = Math.min(255, Math.max(0, imageData.data[i + 2] + noise * 0.4));
        }
        ctx.putImageData(imageData, 0, 0);

        // Brins d'herbe individuels (traits fins)
        for (let i = 0; i < 3000; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const g = 100 + Math.random() * 80;
            ctx.strokeStyle = `rgb(35, ${g}, 25)`;
            ctx.lineWidth = 1 + Math.random() * 1.5;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.bezierCurveTo(
                x + (Math.random() - 0.5) * 4, y - 2 - Math.random() * 4,
                x + (Math.random() - 0.5) * 4, y - 3 - Math.random() * 6,
                x + (Math.random() - 0.5) * 3, y - 3 - Math.random() * 8
            );
            ctx.stroke();
        }

        dt.update();
        dt.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
        dt.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
        dt.uScale = 6;
        dt.vScale = 6;
        return dt;
    }

    // ================================================================
    // Dôme céleste avec gradient procédural
    // ================================================================
    createSkyDome() {
        const sky = BABYLON.MeshBuilder.CreateSphere("skyDome", { diameter: 900, segments: 16 }, this.scene);

        const skyMat = new BABYLON.StandardMaterial("skyMat", this.scene);

        const dt = new BABYLON.DynamicTexture("skyGrad", { width: 1, height: 256 }, this.scene, false);
        const ctx = dt.getContext();
        const grad = ctx.createLinearGradient(0, 0, 0, 256);
        grad.addColorStop(0.0, '#0b1d3a');
        grad.addColorStop(0.2, '#1e4d8c');
        grad.addColorStop(0.45, '#4a90c4');
        grad.addColorStop(0.7, '#7db8e0');
        grad.addColorStop(1.0, '#c8e0f0');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 1, 256);
        dt.update();

        skyMat.emissiveTexture = dt;
        skyMat.backFaceCulling = false;
        skyMat.disableLighting = true;
        sky.material = skyMat;
        sky.infiniteDistance = true;
    }

    // ================================================================
    // Nuages procéduraux (sphères blanches groupées)
    // ================================================================
    createClouds() {
        const cloudMat = new BABYLON.StandardMaterial("cloudMat", this.scene);
        cloudMat.diffuseColor = new BABYLON.Color3(1, 1, 1);
        cloudMat.alpha = 0.6;
        cloudMat.backFaceCulling = false;
        cloudMat.disableLighting = true;
        cloudMat.specularColor = BABYLON.Color3.Black();

        // Groupes de nuages répartis dans le ciel
        const groups = [
            { x: -50, z: -40, w: 18, d: 10, h: 45, n: 5 },
            { x: 35, z: 50, w: 14, d: 8, h: 50, n: 4 },
            { x: 60, z: -30, w: 20, d: 12, h: 42, n: 6 },
            { x: -30, z: 60, w: 12, d: 10, h: 48, n: 4 },
            { x: 0, z: -50, w: 16, d: 8, h: 52, n: 5 },
            { x: -65, z: 20, w: 10, d: 7, h: 46, n: 3 },
            { x: 45, z: -55, w: 15, d: 9, h: 44, n: 4 }
        ];

        groups.forEach((g, gi) => {
            for (let i = 0; i < g.n; i++) {
                const puff = BABYLON.MeshBuilder.CreateSphere(
                    `cloud-${gi}-${i}`,
                    { diameter: 1 + Math.random() * 0.5, segments: 6 },
                    this.scene
                );
                puff.position = new BABYLON.Vector3(
                    g.x + (Math.random() - 0.5) * g.w,
                    g.h + Math.random() * 2,
                    g.z + (Math.random() - 0.5) * g.d
                );
                puff.scaling = new BABYLON.Vector3(
                    3 + Math.random() * 5,
                    0.5 + Math.random() * 0.4,
                    2.5 + Math.random() * 4
                );
                puff.material = cloudMat;
                this._cloudMeshes.push(puff);
            }
        });
    }

    // ================================================================
    // Avions de ligne (primitives) — vol circulaire
    // ================================================================
    createPlanes() {
        const configs = [
            { y: 55, radius: 70, speed: 0.08 },
            { y: 65, radius: 90, speed: 0.12 },
            { y: 48, radius: 55, speed: 0.06 }
        ];

        configs.forEach((cfg, idx) => {
            this._buildPlane(cfg, idx);
        });
    }

    _buildPlane(cfg, idx) {
        const root = new BABYLON.TransformNode(`plane-root-${idx}`, this.scene);
        root.position = new BABYLON.Vector3(0, cfg.y, 0);

        const bodyMat = new BABYLON.StandardMaterial(`planeBody-${idx}`, this.scene);
        bodyMat.diffuseColor = BABYLON.Color3.FromHexString('#e8e8f0');
        bodyMat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.3);

        const wingMat = new BABYLON.StandardMaterial(`planeWing-${idx}`, this.scene);
        wingMat.diffuseColor = BABYLON.Color3.FromHexString('#c0c8d0');
        wingMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.15);

        const accentMat = new BABYLON.StandardMaterial(`planeAccent-${idx}`, this.scene);
        accentMat.diffuseColor = BABYLON.Color3.FromHexString('#d04040');

        const darkMat = new BABYLON.StandardMaterial(`planeDark-${idx}`, this.scene);
        darkMat.diffuseColor = BABYLON.Color3.FromHexString('#3a3a44');

        // Fuselage
        const fuse = BABYLON.MeshBuilder.CreateBox(`fuse-${idx}`, {
            width: 0.25, height: 0.22, depth: 1.0
        }, this.scene);
        fuse.parent = root;
        fuse.material = bodyMat;

        // Ailes principales
        const wings = BABYLON.MeshBuilder.CreateBox(`wings-${idx}`, {
            width: 1.8, height: 0.03, depth: 0.25
        }, this.scene);
        wings.parent = root;
        wings.position = new BABYLON.Vector3(0, -0.02, -0.05);
        wings.material = wingMat;

        // Dérive verticale (queue)
        const tailV = BABYLON.MeshBuilder.CreateBox(`tailV-${idx}`, {
            width: 0.03, height: 0.3, depth: 0.15
        }, this.scene);
        tailV.parent = root;
        tailV.position = new BABYLON.Vector3(0, 0.18, 0.4);
        tailV.material = accentMat;

        // Stabilisateur horizontal
        const tailH = BABYLON.MeshBuilder.CreateBox(`tailH-${idx}`, {
            width: 0.5, height: 0.03, depth: 0.12
        }, this.scene);
        tailH.parent = root;
        tailH.position = new BABYLON.Vector3(0, 0, 0.4);
        tailH.material = wingMat;

        // Cockpit
        const cockpit = BABYLON.MeshBuilder.CreateBox(`cockpit-${idx}`, {
            width: 0.18, height: 0.12, depth: 0.15
        }, this.scene);
        cockpit.parent = root;
        cockpit.position = new BABYLON.Vector3(0, 0.08, -0.45);
        cockpit.material = darkMat;

        // Nacelles moteurs
        for (let s = -1; s <= 1; s += 2) {
            const engine = BABYLON.MeshBuilder.CreateCylinder(`engine-${idx}-${s}`, {
                height: 0.15, diameter: 0.08, tessellation: 6
            }, this.scene);
            engine.parent = root;
            engine.position = new BABYLON.Vector3(s * 0.5, -0.12, -0.15);
            engine.material = darkMat;
        }

        this._planes.push({
            root,
            angle: Math.random() * Math.PI * 2,
            radius: cfg.radius,
            height: cfg.y,
            speed: cfg.speed,
            rollPhase: Math.random() * Math.PI * 2
        });
    }

    updatePlanes(dt) {
        for (const plane of this._planes) {
            plane.angle += dt * plane.speed;
            plane.rollPhase += dt * 0.4;

            const cx = Math.cos(plane.angle);
            const sx = Math.sin(plane.angle);

            plane.root.position.x = cx * plane.radius;
            plane.root.position.z = sx * plane.radius;
            plane.root.position.y = plane.height + 1.5 * Math.sin(plane.angle * 2);

            // Cap (direction du vol)
            plane.root.rotation.y = -plane.angle - Math.PI / 2;

            // Roulis doux
            plane.root.rotation.z = 0.08 * Math.sin(plane.rollPhase);

            // Tangage léger
            plane.root.rotation.x = 0.04 * Math.sin(plane.angle * 1.5);
        }
    }

    // ================================================================
    // Post-processing : Bloom + Tonemapping
    // ================================================================
    setupPostProcessing() {
        try {
            const pipeline = new BABYLON.DefaultRenderingPipeline(
                "defaultPipeline", true, this.scene
            );
            pipeline.bloomEnabled = true;
            pipeline.bloomThreshold = 0.65;
            pipeline.bloomWeight = 0.35;
            pipeline.bloomKernel = 64;
            pipeline.bloomScale = 0.5;
        } catch (e) {
            console.warn('Post-processing pipeline non disponible:', e);
        }
    }

    // ================================================================
    // Plantation d'arbres supplémentaires
    // ================================================================
    plantTrees() {
        // Bordures de terrain (périmètre)
        const half = NETWORK_CONFIG.GROUND_SIZE / 2 - 5;
        for (let i = 0; i < 30; i++) {
            const side = Math.floor(i / 8);
            let x, z;
            switch (side % 4) {
                case 0: x = -half + (i % 8) * 10; z = -half; break;
                case 1: x = half; z = -half + (i % 8) * 10; break;
                case 2: x = half - (i % 8) * 10; z = half; break;
                default: x = -half; z = half - (i % 8) * 10; break;
            }
            this.createTree({ x, z }, i % 4);
        }

        // Alignement le long des routes secondaires
        const roadTrees = [
            { x: -35, z: -65 }, { x: -35, z: -55 }, { x: -35, z: 45 }, { x: -35, z: 55 }, { x: -35, z: 65 },
            { x: 47, z: -65 }, { x: 47, z: -55 }, { x: 47, z: 45 }, { x: 47, z: 55 }, { x: 47, z: 65 },
            { x: -65, z: 35 }, { x: -55, z: 35 }, { x: 55, z: 35 }, { x: 65, z: 35 },
            { x: -65, z: -35 }, { x: -55, z: -35 }, { x: 55, z: -35 }, { x: 65, z: -35 }
        ];
        roadTrees.forEach((pos, i) => this.createTree(pos, i % 4));
    }
}
