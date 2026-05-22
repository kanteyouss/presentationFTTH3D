import * as BABYLON from 'babylonjs';
import { COLORS, NETWORK_CONFIG } from './constants';
import { routeCable } from './RoadRouter';
import NRO_IMG from './image/NRO.png';
import SRO_IMG from './image/SRO.png';
import PBO_IMG from './image/PBO.png';

export class NetworkModel {
    constructor(scene, shadowGenerator) {
        this.scene = scene;
        this.shadowGenerator = shadowGenerator;
        this.equipments = { nro: null, sros: [], pbos: [], buildings: [] };
        this.cables = { transport: [], distribution: [], distributionBundles: [], ducts: [], chambers: [] };
        this.viewOptions = {
            showDistribution: true,
            showBundles: true,
            showSaturatedChambers: false
        };
        this._matCache = {};
        this._bundleRegistry = new Map();
        this._ductRegistry = new Map();
        this._chamberRegistry = new Map();
        this._equipmentBadges = new Map();
        this._pinnedEquipment = null;
    }

    _badgeTextureForType(type) {
        if (type === 'NRO') return NRO_IMG;
        if (type === 'SRO') return SRO_IMG;
        if (type === 'PBO') return PBO_IMG;
        return null;
    }

    _badgeLayoutForType(type) {
        if (type === 'NRO') return { width: 5.2, height: 3.0, yOffset: 4.2 };
        if (type === 'SRO') return { width: 3.6, height: 2.2, yOffset: 2.8 };
        return { width: 2.8, height: 1.8, yOffset: 2.0 }; // PBO default
    }

    _resolveEquipmentMesh(mesh) {
        if (!mesh) return null;

        // Walk up parent chain in case the user points a child mesh.
        let current = mesh;
        while (current) {
            const type = current.metadata?.equipmentType;
            if (type === 'NRO' || type === 'SRO' || type === 'PBO') {
                return current;
            }
            current = current.parent;
        }
        return null;
    }

    _ensureEquipmentBadge(mesh) {
        if (!mesh) return null;
        if (this._equipmentBadges.has(mesh.uniqueId)) {
            return this._equipmentBadges.get(mesh.uniqueId);
        }

        const type = mesh.metadata?.equipmentType;
        const textureUrl = this._badgeTextureForType(type);
        const layout = this._badgeLayoutForType(type);
        if (!textureUrl) return null;

        const badge = BABYLON.MeshBuilder.CreatePlane(`badge-${mesh.name}`, {
            width: layout.width,
            height: layout.height
        }, this.scene);
        badge.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
        badge.isPickable = false;
        badge.parent = mesh;
        badge.position = new BABYLON.Vector3(0, layout.yOffset, 0);

        const mat = new BABYLON.StandardMaterial(`badge-mat-${mesh.name}`, this.scene);
        mat.diffuseTexture = new BABYLON.Texture(textureUrl, this.scene);
        mat.diffuseTexture.hasAlpha = true;
        mat.useAlphaFromDiffuseTexture = true;
        mat.emissiveColor = BABYLON.Color3.White().scale(0.45);
        mat.backFaceCulling = false;
        badge.material = mat;
        badge.visibility = 0;

        this._equipmentBadges.set(mesh.uniqueId, badge);
        return badge;
    }

    _showOnlyBadge(mesh) {
        this._equipmentBadges.forEach(badge => {
            badge.visibility = 0;
        });
        if (!mesh) return;
        const badge = this._ensureEquipmentBadge(mesh);
        if (badge) badge.visibility = 1;
    }

    previewEquipmentBadge(mesh) {
        if (this._pinnedEquipment) return;
        const eq = this._resolveEquipmentMesh(mesh);
        this._showOnlyBadge(eq);
    }

    togglePinnedEquipmentBadge(mesh) {
        const eq = this._resolveEquipmentMesh(mesh);
        if (!eq) {
            this._pinnedEquipment = null;
            this._showOnlyBadge(null);
            return null;
        }

        if (this._pinnedEquipment && this._pinnedEquipment.uniqueId === eq.uniqueId) {
            this._pinnedEquipment = null;
            this._showOnlyBadge(null);
            return null;
        }

        this._pinnedEquipment = eq;
        this._showOnlyBadge(eq);
        return eq;
    }

    _getOrCreateMat(name, hexColor) {
        if (this._matCache[name]) return this._matCache[name];
        const mat = new BABYLON.StandardMaterial(name, this.scene);
        mat.diffuseColor = BABYLON.Color3.FromHexString(hexColor);
        this._matCache[name] = mat;
        return mat;
    }

    _roundPoint(point, precision = 1) {
        const factor = 10 ** precision;
        return `${Math.round(point.x * factor) / factor}:${Math.round(point.y * factor) / factor}:${Math.round(point.z * factor) / factor}`;
    }

    _pathSignature(points, precision = 1) {
        return points.map(point => this._roundPoint(point, precision)).join('|');
    }

    _buildTubePath(points, type) {
        return points.map(point => {
            if (type === 'transport') {
                const y = (point.y !== undefined ? point.y : 0.3) - 0.25;
                return new BABYLON.Vector3(point.x, y, point.z);
            }
            return new BABYLON.Vector3(point.x, point.y || 0.2, point.z);
        });
    }

    _createBundleMesh(name, path, radius, colorHex) {
        const bundle = BABYLON.MeshBuilder.CreateTube(name, {
            path,
            radius,
            cap: BABYLON.Mesh.CAP_ALL,
            updatable: true
        }, this.scene);

        const mat = new BABYLON.StandardMaterial(`${name}Mat`, this.scene);
        mat.diffuseColor = BABYLON.Color3.FromHexString(colorHex);
        mat.emissiveColor = BABYLON.Color3.FromHexString(colorHex).scale(0.22);
        bundle.material = mat;
        bundle.visibility = 0;
        return bundle;
    }

    _refreshBundleMesh(bundleRecord) {
        if (bundleRecord.mesh && !bundleRecord.mesh.isDisposed()) {
            bundleRecord.mesh.dispose();
        }
        const growth = 1 + Math.max(0, bundleRecord.count - 1) * NETWORK_CONFIG.BUNDLE_GROWTH;
        const radius = bundleRecord.baseRadius * growth;
        bundleRecord.mesh = this._createBundleMesh(bundleRecord.name, bundleRecord.path, radius, bundleRecord.color);
        bundleRecord.mesh.metadata = {
            kind: 'distributionBundle',
            bundleId: bundleRecord.id,
            count: bundleRecord.count
        };
        return bundleRecord.mesh;
    }

    _registerChamber(point, sourceName) {
        const key = this._roundPoint(point, 1);
        let chamber = this._chamberRegistry.get(key);

        if (!chamber) {
            const chamberMesh = BABYLON.MeshBuilder.CreateCylinder(`chamber-${key.replace(/[:.]/g, '-')}`, {
                height: 0.1,
                diameter: 0.95,
                tessellation: 16
            }, this.scene);

            const chamberMat = new BABYLON.StandardMaterial(`chamberMat-${key.replace(/[:.]/g, '-')}`, this.scene);
            chamberMat.diffuseColor = BABYLON.Color3.FromHexString('#3b3f46');
            chamberMat.emissiveColor = BABYLON.Color3.FromHexString('#3b3f46').scale(0.08);
            chamberMesh.position = new BABYLON.Vector3(point.x, 0.05, point.z);
            chamberMesh.material = chamberMat;
            chamberMesh.visibility = 0;
            chamberMesh.metadata = {
                kind: 'chamber',
                capacity: NETWORK_CONFIG.CHAMBER_CAPACITY,
                used: 0,
                saturated: false,
                sourceNames: []
            };

            chamber = chamberMesh;
            this._chamberRegistry.set(key, chamber);
            this.cables.chambers.push(chamber);
        }

        chamber.metadata.used += 1;
        if (!chamber.metadata.sourceNames.includes(sourceName)) {
            chamber.metadata.sourceNames.push(sourceName);
        }
        chamber.metadata.saturated = chamber.metadata.used >= chamber.metadata.capacity;
        return chamber;
    }

    _registerDuct(signature, path) {
        let ductRecord = this._ductRegistry.get(signature);
        if (!ductRecord) {
            const ductMesh = this._createBundleMesh(`duct-${this._ductRegistry.size}`, path, NETWORK_CONFIG.DUCT_RADIUS, '#1f2a38');
            ductMesh.metadata = {
                kind: 'duct',
                capacity: NETWORK_CONFIG.DUCT_CAPACITY,
                used: 0,
                saturated: false
            };
            ductMesh.visibility = 0;

            ductRecord = {
                id: `duct-${this._ductRegistry.size}`,
                signature,
                path,
                mesh: ductMesh
            };
            this._ductRegistry.set(signature, ductRecord);
            this.cables.ducts.push(ductMesh);
        }

        ductRecord.mesh.metadata.used += 1;
        ductRecord.mesh.metadata.saturated = ductRecord.mesh.metadata.used >= ductRecord.mesh.metadata.capacity;
        return ductRecord.mesh;
    }

    _projectPointToSegment(point, segment) {
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

    _closestRoadPoint(point) {
        const roads = [
            { from: { x: -75, z: 0 }, to: { x: 75, z: 10 } },
            { from: { x: 0, z: -75 }, to: { x: -10, z: 75 } },
            { from: { x: -40, z: -75 }, to: { x: -30, z: 75 } },
            { from: { x: 40, z: -75 }, to: { x: 50, z: 75 } },
            { from: { x: -75, z: 30 }, to: { x: 75, z: 40 } },
            { from: { x: -75, z: -30 }, to: { x: 75, z: -40 } }
        ];

        let best = null;
        let bestDist = Infinity;
        roads.forEach(segment => {
            const projected = this._projectPointToSegment(point, segment);
            const d = Math.sqrt((projected.x - point.x) ** 2 + (projected.z - point.z) ** 2);
            if (d < bestDist) {
                bestDist = d;
                best = projected;
            }
        });
        return best || point;
    }

    _decorateBuilding(building, type, seed = 0) {
        const { w, d, h } = building.metadata.dimensions;
        const style = (seed % 3);

        // Facade variation while keeping existing base mesh
        const paletteApartment = ['#c6cdd5', '#bfc7d1', '#d1cbc2', '#c9d2c0'];
        const paletteHouse = ['#d6c9b5', '#cbb7a3', '#c2b0a5', '#bfb9ad'];
        const colorHex = (type === 'Apartment' ? paletteApartment : paletteHouse)[seed % 4];
        if (building.material) {
            building.material.diffuseColor = BABYLON.Color3.FromHexString(colorHex);
            building.material.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
        }

        const winMat = this._getOrCreateMat(`winMat-${style}`, style === 0 ? '#8ec9ff' : (style === 1 ? '#a8d8ff' : '#9fd0f6'));
        winMat.emissiveColor = BABYLON.Color3.FromHexString('#8ec9ff').scale(0.12);

        const doorMat = this._getOrCreateMat(`doorMat-${style}`, style === 0 ? '#5a4638' : (style === 1 ? '#6b5240' : '#4f3d31'));
        const roofMat = this._getOrCreateMat(`roofMat-${style}`, style === 0 ? '#6f737a' : (style === 1 ? '#626972' : '#737b85'));

        // Windows repeated by floor and by bay
        const floorHeight = type === 'Apartment' ? 2.7 : 2.4;
        const rows = Math.max(1, Math.floor((h - 1.4) / floorHeight));
        const frontCols = Math.max(1, Math.floor((w - 1.2) / 1.5));
        const sideCols = Math.max(1, Math.floor((d - 1.2) / 1.6));
        const winW = Math.min(0.85, Math.max(0.45, w * 0.2));
        const winH = type === 'Apartment' ? 0.85 : 0.72;
        const winDepth = 0.06;

        const placeWindow = (x, y, z, isSide = false) => {
            const windowMesh = BABYLON.MeshBuilder.CreateBox(`win-${building.name}-${x.toFixed(2)}-${y.toFixed(2)}-${z.toFixed(2)}`, {
                width: isSide ? winDepth : winW,
                height: winH,
                depth: isSide ? winW : winDepth
            }, this.scene);
            windowMesh.parent = building;
            windowMesh.position = new BABYLON.Vector3(x, y, z);
            windowMesh.material = winMat;
        };

        for (let r = 0; r < rows; r++) {
            const y = -h / 2 + 1.15 + r * floorHeight;
            if (y > h / 2 - 0.8) break;

            for (let c = 0; c < frontCols; c++) {
                const x = -w / 2 + ((c + 1) * w) / (frontCols + 1);
                placeWindow(x, y, d / 2 + 0.04, false);
                placeWindow(x, y, -d / 2 - 0.04, false);
            }

            // Side facades for taller buildings
            if (type === 'Apartment' || rows > 2) {
                for (let c = 0; c < sideCols; c++) {
                    const z = -d / 2 + ((c + 1) * d) / (sideCols + 1);
                    placeWindow(w / 2 + 0.04, y, z, true);
                    placeWindow(-w / 2 - 0.04, y, z, true);
                }
            }
        }

        // Main door oriented toward nearest road
        const roadPoint = this._closestRoadPoint({ x: building.position.x, z: building.position.z });
        const dx = roadPoint.x - building.position.x;
        const dz = roadPoint.z - building.position.z;
        const door = BABYLON.MeshBuilder.CreateBox(`door-${building.name}`, {
            width: 0.9,
            height: 2.05,
            depth: 0.08
        }, this.scene);
        door.parent = building;
        door.material = doorMat;

        if (Math.abs(dx) >= Math.abs(dz)) {
            const side = dx >= 0 ? 1 : -1;
            door.position = new BABYLON.Vector3((w / 2 + 0.05) * side, -h / 2 + 1.02, 0);
            door.rotation.y = Math.PI / 2;
        } else {
            const side = dz >= 0 ? 1 : -1;
            door.position = new BABYLON.Vector3(0, -h / 2 + 1.02, (d / 2 + 0.05) * side);
            door.rotation.y = 0;
        }

        // Roof details: parapet + technical units (AC / local equipment)
        if (type === 'Apartment') {
            const parapetThickness = 0.15;
            const parapetHeight = 0.28;
            const topY = h / 2 + parapetHeight / 2;

            const north = BABYLON.MeshBuilder.CreateBox(`roof-parapet-n-${building.name}`, {
                width: w + parapetThickness * 2,
                height: parapetHeight,
                depth: parapetThickness
            }, this.scene);
            north.parent = building;
            north.position = new BABYLON.Vector3(0, topY, d / 2 + parapetThickness / 2);
            north.material = roofMat;

            const south = north.clone(`roof-parapet-s-${building.name}`);
            south.parent = building;
            south.position = new BABYLON.Vector3(0, topY, -d / 2 - parapetThickness / 2);

            const east = BABYLON.MeshBuilder.CreateBox(`roof-parapet-e-${building.name}`, {
                width: parapetThickness,
                height: parapetHeight,
                depth: d + parapetThickness * 2
            }, this.scene);
            east.parent = building;
            east.position = new BABYLON.Vector3(w / 2 + parapetThickness / 2, topY, 0);
            east.material = roofMat;

            const west = east.clone(`roof-parapet-w-${building.name}`);
            west.parent = building;
            west.position = new BABYLON.Vector3(-w / 2 - parapetThickness / 2, topY, 0);

            const equipmentCount = 1 + (seed % 3);
            for (let i = 0; i < equipmentCount; i++) {
                const unit = BABYLON.MeshBuilder.CreateBox(`roof-unit-${building.name}-${i}`, {
                    width: 0.8,
                    height: 0.45,
                    depth: 0.6
                }, this.scene);
                unit.parent = building;
                unit.position = new BABYLON.Vector3(
                    -w * 0.25 + i * 0.9,
                    h / 2 + 0.25,
                    -d * 0.2 + (i % 2) * 0.8
                );
                unit.material = roofMat;
            }

            if (seed % 2 === 0) {
                const ac = BABYLON.MeshBuilder.CreateBox(`roof-ac-${building.name}`, {
                    width: 0.65,
                    height: 0.4,
                    depth: 0.5
                }, this.scene);
                ac.parent = building;
                ac.position = new BABYLON.Vector3(w * 0.22, h / 2 + 0.22, d * 0.18);
                ac.material = roofMat;
            }
        } else {
            const ridge = BABYLON.MeshBuilder.CreateBox(`roof-ridge-${building.name}`, {
                width: w + 0.2,
                height: 0.35,
                depth: 0.35
            }, this.scene);
            ridge.parent = building;
            ridge.position = new BABYLON.Vector3(0, h / 2 + 0.16, 0);
            ridge.material = roofMat;
        }
    }

    createBuildings() {
        const clusters = [
            { x: -35, z: -35, type: 'Apartment', count: 18 },
            { x: 35, z: 35, type: 'Apartment', count: 18 },
            { x: -55, z: 45, type: 'House', count: 25 },
            { x: 55, z: -45, type: 'House', count: 25 },
            { x: 0, z: 55, type: 'Mixed', count: 20 },
            { x: 0, z: -55, type: 'Mixed', count: 20 }
        ];

        const matAppart = new BABYLON.StandardMaterial("appartMat", this.scene);
        matAppart.diffuseColor = BABYLON.Color3.FromHexString(COLORS.BUILDING);

        const matHouse = new BABYLON.StandardMaterial("houseMat", this.scene);
        matHouse.diffuseColor = BABYLON.Color3.FromHexString("#a4b0be");

        let totalCount = 0;
        clusters.forEach((cluster) => {
            for (let i = 0; i < cluster.count; i++) {
                const type = cluster.type === 'Mixed' ? (Math.random() > 0.5 ? 'Apartment' : 'House') : cluster.type;
                const isApartment = type === 'Apartment';

                const h = isApartment ? (8 + Math.random() * 8) : (3 + Math.random() * 3);
                const w = isApartment ? (4 + Math.random() * 2) : (3 + Math.random() * 1);
                const d = isApartment ? (4 + Math.random() * 2) : (3 + Math.random() * 1);

                const b = BABYLON.MeshBuilder.CreateBox(`building-${totalCount}`, { width: w, height: h, depth: d }, this.scene);

                const offsetX = (Math.random() - 0.5) * 40;
                const offsetZ = (Math.random() - 0.5) * 40;
                if (Math.abs(cluster.x + offsetX) < 5 || Math.abs(cluster.z + offsetZ) < 5) continue;

                b.position = new BABYLON.Vector3(cluster.x + offsetX, h / 2, cluster.z + offsetZ);
                b.rotation.y = (Math.random() - 0.5) * 0.4;
                b.material = (isApartment ? matAppart : matHouse).clone(`mat-${totalCount}`);

                // Status will be computed dynamically after network is built
                b.metadata = {
                    eligible: false,
                    status: 'UNKNOWN',
                    reason: '',
                    type: type,
                    dimensions: { w, d, h }
                };

                this._decorateBuilding(b, type, totalCount);

                this.shadowGenerator.addShadowCaster(b);
                this.equipments.buildings.push(b);
                totalCount++;
            }
        });
    }

    /**
     * Compute eligibility for every building based on:
     * 1. SRO coverage (building must be within sroRadius of at least one SRO)
     * 2. PBO proximity (building must be within pboThreshold of at least one PBO)
     *
     * @param {number} sroRadius  – max distance to an SRO to be "covered" (default 50)
     * @param {number} pboThreshold – max distance to a PBO for eligibility (default 300, per spec)
     */
    computeEligibility(sroRadius = 50, pboThreshold = 300) {
        this.lastEligibilityConfig = { sroRadius, pboThreshold };
        const sroStats = this.equipments.sros.map(() => ({
            coveredBuildings: 0,
            estimatedSubscribers: 0
        }));

        this.equipments.buildings.forEach(b => {
            // 1. Check SRO coverage
            let inSroCoverage = false;
            let nearestSroDist = Infinity;
            let nearestSroIndex = -1;
            this.equipments.sros.forEach((s, idx) => {
                const d = BABYLON.Vector3.Distance(
                    new BABYLON.Vector3(b.position.x, 0, b.position.z),
                    new BABYLON.Vector3(s.position.x, 0, s.position.z)
                );
                if (d < nearestSroDist) {
                    nearestSroDist = d;
                    nearestSroIndex = idx;
                }
                if (d <= sroRadius) inSroCoverage = true;
            });

            // 2. Check PBO proximity (only PBO meshes, not poles)
            let nearestPboDist = Infinity;
            this.equipments.pbos.forEach(p => {
                if (!p.name.startsWith('pbo-')) return; // skip poles
                const d = BABYLON.Vector3.Distance(
                    new BABYLON.Vector3(b.position.x, 0, b.position.z),
                    new BABYLON.Vector3(p.position.x, 0, p.position.z)
                );
                if (d < nearestPboDist) nearestPboDist = d;
            });

            b.metadata._nearestSroDist = nearestSroDist;
            b.metadata._nearestPboDist = nearestPboDist;
            b.metadata._nearestSroIndex = nearestSroIndex;
            b.metadata._inSroCoverage = inSroCoverage;

            // Determine status (FTTH field logic):
            // - Close to a PBO => eligible (drop can be provisioned)
            // - In SRO zone but too far from PBO => waiting for capillary extension
            // - Outside SRO zone and no nearby PBO => non-eligible
            if (nearestPboDist <= pboThreshold) {
                b.metadata.status = 'ELIGIBLE';
                b.metadata.eligible = true;
                b.metadata.reason = '';
            } else if (inSroCoverage) {
                b.metadata.status = 'WAITING';
                b.metadata.eligible = false;
                b.metadata.reason = `Distance au PBO trop importante (${Math.round(nearestPboDist)}m > seuil ${pboThreshold}m)`;
            } else {
                b.metadata.status = 'NON_ELIGIBLE';
                b.metadata.eligible = false;
                b.metadata.reason = `Hors zone de couverture SRO (distance: ${Math.round(nearestSroDist)}m)`;
            }

            if (inSroCoverage && nearestSroIndex >= 0) {
                sroStats[nearestSroIndex].coveredBuildings += 1;
                sroStats[nearestSroIndex].estimatedSubscribers += b.metadata.type === 'Apartment' ? 6 : 2;
            }
        });

        // Keep at least 2 red buildings for the final diagnostic stage.
        const nonEligible = this.equipments.buildings.filter(b => b.metadata.status === 'NON_ELIGIBLE');
        if (nonEligible.length === 0 && this.equipments.buildings.length > 0) {
            const candidates = [...this.equipments.buildings].sort((a, b) => {
                const pboDelta = (b.metadata._nearestPboDist ?? 0) - (a.metadata._nearestPboDist ?? 0);
                if (pboDelta !== 0) return pboDelta;
                return (b.metadata._nearestSroDist ?? 0) - (a.metadata._nearestSroDist ?? 0);
            });

            let forced = 0;
            for (const b of candidates) {
                if (forced >= 2) break;
                b.metadata.status = 'NON_ELIGIBLE';
                b.metadata.eligible = false;
                b.metadata.reason = `Bâtiment trop éloigné du PBO (${Math.round(b.metadata._nearestPboDist || 0)}m).`;
                forced++;
            }
        }

        this.equipments.buildings.forEach(b => {
            delete b.metadata._nearestSroDist;
            delete b.metadata._nearestPboDist;
            delete b.metadata._nearestSroIndex;
            delete b.metadata._inSroCoverage;
        });

        this.equipments.sros.forEach((sro, idx) => {
            sro.metadata = {
                ...(sro.metadata || {}),
                coverageRadius: sroRadius,
                coveredBuildings: sroStats[idx].coveredBuildings,
                estimatedSubscribers: sroStats[idx].estimatedSubscribers
            };
        });
    }

    createCoverageCircle(pos, radius = 50) {
        const disc = BABYLON.MeshBuilder.CreateDisc(`coverageDisc-${pos.x}`, {
            radius: radius,
            tessellation: 64
        }, this.scene);
        disc.position = new BABYLON.Vector3(pos.x, 0.25, pos.z);
        disc.rotation.x = Math.PI / 2;

        const mat = new BABYLON.StandardMaterial(`coverageMat-${pos.x}`, this.scene);
        mat.diffuseColor = BABYLON.Color3.FromHexString(COLORS.ACCENT);
        mat.emissiveColor = BABYLON.Color3.FromHexString(COLORS.ACCENT).scale(0.5);
        mat.alpha = 0.25;
        mat.backFaceCulling = false;
        disc.material = mat;

        // Pulsing scale animation — stays alive until dispose() is called
        const anim = new BABYLON.Animation(
            'discPulse', 'scaling',
            30,
            BABYLON.Animation.ANIMATIONTYPE_VECTOR3,
            BABYLON.Animation.ANIMATIONLOOPMODE_CYCLE
        );
        const ease = new BABYLON.SineEase();
        ease.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEINOUT);
        anim.setEasingFunction(ease);

        anim.setKeys([
            { frame: 0, value: new BABYLON.Vector3(0.8, 0.8, 0.8) },
            { frame: 30, value: new BABYLON.Vector3(1.0, 1.0, 1.0) },
            { frame: 60, value: new BABYLON.Vector3(0.8, 0.8, 0.8) }
        ]);

        disc.animations = [anim];
        this.scene.beginAnimation(disc, 0, 60, true); // loop = true

        // Alpha pulse via beforeRender
        let t = 0;
        const obs = this.scene.onBeforeRenderObservable.add(() => {
            t += 0.04;
            mat.alpha = 0.1 + 0.2 * Math.abs(Math.sin(t));
        });
        disc._alphaObserver = obs;

        return disc;
    }

    disposeCoverageCircles() {
        (this._coverageDiscs || []).forEach(d => {
            if (d._alphaObserver) this.scene.onBeforeRenderObservable.remove(d._alphaObserver);
            d.dispose();
        });
        this._coverageDiscs = [];
    }

    /**
     * Retourne le premier bâtiment NON_ELIGIBLE trouvé
     */
    getNonEligibleBuilding() {
        return this.equipments.buildings.find(b => b.metadata.status === 'NON_ELIGIBLE');
    }

    /**
     * Retourne des informations d'affichage pour un mesh d'équipement (image, titre)
     * @param {BABYLON.AbstractMesh|null} mesh
     * @returns {{image: string, title: string, mesh: BABYLON.AbstractMesh}|null}
     */
    getEquipmentInfo(mesh) {
        const eq = this._resolveEquipmentMesh(mesh);
        if (!eq) return null;
        const type = eq.metadata?.equipmentType;
        const image = this._badgeTextureForType(type);
        if (!image) return null;
        let title = type || 'Equipment';
        if (type === 'SRO') {
            const m = eq.name.match(/sro-(\d+)/);
            title = `SRO ${m ? m[1] : ''}`;
        } else if (type === 'PBO') {
            const m = eq.name.match(/pbo-(\d+)/);
            title = `PBO ${m ? m[1] : ''}`;
        } else if (type === 'NRO') {
            title = 'NRO';
        }
        return { image, title, mesh: eq };
    }

    setAnalysisMode(mode) {
        this.equipments.buildings.forEach((b, i) => {
            if (mode === 'density') {
                if (b.metadata.type === "Apartment") b.material.diffuseColor = BABYLON.Color3.FromHexString("#ffa502");
                else b.material.diffuseColor = BABYLON.Color3.FromHexString("#2ed573");
            }
            else if (mode === 'eligibility') {
                if (b.metadata.status === 'NON_ELIGIBLE') {
                    b.material.diffuseColor = BABYLON.Color3.FromHexString(COLORS.NON_ELIGIBLE);
                }
                else if (b.metadata.status === 'WAITING') b.material.diffuseColor = BABYLON.Color3.FromHexString(COLORS.WAITING);
                else {
                    b.material.diffuseColor = BABYLON.Color3.FromHexString(COLORS.ELIGIBLE);
                }
            }
            else {
                b.material.diffuseColor = BABYLON.Color3.FromHexString(b.metadata.type === "Apartment" ? COLORS.BUILDING : "#a4b0be");
            }
        });
    }

    createNRO() {
        const nro = BABYLON.MeshBuilder.CreateBox("nro", { width: 6, height: 4, depth: 6 }, this.scene);
        nro.position = new BABYLON.Vector3(NETWORK_CONFIG.NRO_POS.x, 2, NETWORK_CONFIG.NRO_POS.z);
        nro.isPickable = true;
        nro.metadata = { ...(nro.metadata || {}), equipmentType: 'NRO' };

        const mat = new BABYLON.StandardMaterial("nroMat", this.scene);
        mat.diffuseColor = BABYLON.Color3.FromHexString(COLORS.HUB);
        mat.emissiveColor = BABYLON.Color3.FromHexString(COLORS.HUB).scale(0.4);
        nro.material = mat;

        this.shadowGenerator.addShadowCaster(nro);
        this.equipments.nro = nro;
        nro.visibility = 0;
        this._ensureEquipmentBadge(nro);
        return nro;
    }

    createSRO(pos, id) {
        const model = NETWORK_CONFIG.SRO_POSITIONS.find(s => s.x === pos.x && s.z === pos.z);
        const sro = BABYLON.MeshBuilder.CreateBox(`sro-${id}`, { width: 1.2, height: 2.2, depth: 0.8 }, this.scene);
        sro.position = new BABYLON.Vector3(pos.x, 1.1, pos.z);
        sro.isPickable = true;
        sro.metadata = { ...(model || {}), equipmentType: 'SRO' };

        const mat = new BABYLON.StandardMaterial(`sroMat-${id}`, this.scene);
        mat.diffuseColor = BABYLON.Color3.FromHexString(COLORS.CABINET);
        mat.emissiveColor = BABYLON.Color3.FromHexString(COLORS.CABINET).scale(0.2);
        sro.material = mat;

        this.shadowGenerator.addShadowCaster(sro);
        this.equipments.sros.push(sro);
        sro.visibility = 0;
        this._ensureEquipmentBadge(sro);
        return sro;
    }

    /**
     * Place a telecom pole along a road.
     * @param {object} pos  – {x, z} world position
     * @param {number} height – pole height in metres (default 8)
     */
    createPole(pos, height = 8) {
        const poleMat = this._getOrCreateMat('poleMat', '#3d3d3d');

        // Pole shaft
        const pole = BABYLON.MeshBuilder.CreateCylinder(`pole-${pos.x}-${pos.z}`, {
            height: height,
            diameter: 0.18,
            tessellation: 8
        }, this.scene);
        pole.position = new BABYLON.Vector3(pos.x, height / 2, pos.z);
        pole.material = poleMat;
        pole.visibility = 0;

        // Top crossarm (simple box)
        const arm = BABYLON.MeshBuilder.CreateBox(`arm-${pos.x}`, { width: 1.4, height: 0.1, depth: 0.12 }, this.scene);
        arm.position = new BABYLON.Vector3(pos.x, height - 0.15, pos.z);
        arm.material = poleMat;
        arm.parent = null;
        arm.visibility = 0;

        // Cable bracket at PBO attachment height (6.5m)
        const bracket = BABYLON.MeshBuilder.CreateBox(`bracket-${pos.x}`, { width: 0.4, height: 0.08, depth: 0.08 }, this.scene);
        bracket.position = new BABYLON.Vector3(pos.x, 6.5, pos.z);
        bracket.material = poleMat;
        bracket.visibility = 0;

        this.equipments.pbos.push(pole, arm, bracket); // tracked for visibility
        return { pole, arm, bracket, topY: height, pboY: 6.5, pos };
    }

    /**
     * Create a PBO box fixed to a pole at the bracket height.
     */
    createPBO(poleData, id) {
        const { pos, pboY } = typeof poleData === 'object' && poleData.pos
            ? poleData
            : { pos: poleData, pboY: 6.5 };

        const pbo = BABYLON.MeshBuilder.CreateBox(`pbo-${id}`, { width: 0.45, height: 0.55, depth: 0.35 }, this.scene);
        // Fixed on pole at bracket height — offset slightly in front of pole
        pbo.position = new BABYLON.Vector3(pos.x + 0.3, pboY, pos.z + 0.3);
        pbo.isPickable = true;
        pbo.metadata = { ...(pbo.metadata || {}), equipmentType: 'PBO' };

        const mat = new BABYLON.StandardMaterial(`pboMat-${id}`, this.scene);
        mat.diffuseColor = BABYLON.Color3.FromHexString(COLORS.BOX);
        mat.emissiveColor = BABYLON.Color3.FromHexString(COLORS.BOX).scale(0.15);
        pbo.material = mat;

        this.shadowGenerator.addShadowCaster(pbo);
        pbo.visibility = 0;
        this.equipments.pbos.push(pbo);
        this._ensureEquipmentBadge(pbo);
        return pbo;
    }

    /**
     * Generate a catenary (sagging) cable path between two 3D points.
     * @param {BABYLON.Vector3} a  – start
     * @param {BABYLON.Vector3} b  – end
     * @param {number} segments    – number of interpolation points
     * @param {number} sag         – vertical sag at mid-span (metres)
     */
    _catenaryPath(a, b, segments = 12, sag = 0.3) {
        const pts = [];
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const x = a.x + (b.x - a.x) * t;
            const z = a.z + (b.z - a.z) * t;
            // Parabolic sag: 0 at ends, max at centre
            const y = a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t);
            pts.push(new BABYLON.Vector3(x, y, z));
        }
        return pts;
    }

    /**
     * Create a full pole run along a road section with PBOs and catenary cables.
     * @param {object} from        – {x, z}
     * @param {object} to          – {x, z}
     * @param {number} spacing     – metres between poles
     * @param {number} sroPos      – {x, z} origin of distribution cable
     */
    createPoleRun(from, to, spacing = 30) {
        const dx = to.x - from.x;
        const dz = to.z - from.z;
        const totalDist = Math.sqrt(dx * dx + dz * dz);
        if (totalDist < 1) return [];

        const ux = dx / totalDist;
        const uz = dz / totalDist;

        const poleCount = Math.floor(totalDist / spacing) + 1;
        const poleData = [];

        for (let i = 0; i < poleCount; i++) {
            const t = i * spacing;
            const px = from.x + ux * t;
            const pz = from.z + uz * t;

            const pd = this.createPole({ x: px, z: pz }, 8);
            const pbo = this.createPBO(pd, `run-${px.toFixed(0)}-${pz.toFixed(0)}`);
            pd.pbo = pbo;
            poleData.push(pd);
        }

        const spanPaths = [];
        for (let i = 0; i < poleData.length - 1; i++) {
            const a = new BABYLON.Vector3(poleData[i].pos.x, poleData[i].topY - 0.1, poleData[i].pos.z);
            const b = new BABYLON.Vector3(poleData[i + 1].pos.x, poleData[i + 1].topY - 0.1, poleData[i + 1].pos.z);
            const spanPath = this._catenaryPath(a, b, 14, 0.35);
            spanPaths.push(spanPath);
        }

        // One cable per span keeps the geometry stable and visually realistic.
        // The bundling logic in createCable merges identical traces where needed.
        spanPaths.forEach((spanPath, index) => {
            this.createCable(`aerial-span-${from.x.toFixed(0)}-${from.z.toFixed(0)}-${index}`, spanPath, 'distribution');
        });

        return poleData;
    }

    createCable(name, points, type) {
        const path = this._buildTubePath(points, type);

        if (type === 'transport') {
            const tube = BABYLON.MeshBuilder.CreateTube(name, {
                path,
                radius: NETWORK_CONFIG.TRANSPORT_RADIUS,
                cap: BABYLON.Mesh.CAP_ALL,
                updatable: true
            }, this.scene);

            const mat = new BABYLON.StandardMaterial(`${name}Mat`, this.scene);
            mat.diffuseColor = BABYLON.Color3.FromHexString(COLORS.TRANSPORT);
            mat.emissiveColor = BABYLON.Color3.FromHexString(COLORS.TRANSPORT).scale(0.25);
            tube.material = mat;
            tube.visibility = 0;
            tube.metadata = { kind: 'transportCable', name };

            const signature = this._pathSignature(path, 1);
            this._registerDuct(signature, path);

            for (let i = 1; i < path.length - 1; i++) {
                this._registerChamber(path[i], name);
            }

            this.cables.transport.push(tube);
            return tube;
        }

        const signature = this._pathSignature(path, 1);
        let bundleRecord = this._bundleRegistry.get(signature);
        if (!bundleRecord) {
            bundleRecord = {
                id: `bundle-${this._bundleRegistry.size}`,
                name,
                signature,
                path,
                baseRadius: NETWORK_CONFIG.DISTRIBUTION_RADIUS,
                color: COLORS.DISTRIBUTION,
                count: 1,
                mesh: null
            };
            this._bundleRegistry.set(signature, bundleRecord);
            this._refreshBundleMesh(bundleRecord);
            this.cables.distributionBundles.push(bundleRecord.mesh);
        } else {
            bundleRecord.count += 1;
            this._refreshBundleMesh(bundleRecord);
        }

        return bundleRecord.mesh;
    }

    setViewOptions(options = {}) {
        this.viewOptions = {
            ...this.viewOptions,
            ...options
        };
        return this.viewOptions;
    }

    updateVisibilityForStep(stepIndex) {
        this.setAnalysisMode(
            stepIndex === 0 ? 'density' : (stepIndex >= 6 ? 'eligibility' : 'normal')
        );

        if (this.equipments.nro) {
            this.equipments.nro.visibility = stepIndex >= 2 ? 1 : 0;
        }

        this.cables.transport.forEach(cable => {
            cable.visibility = stepIndex >= 3 ? 1 : 0;
        });

        this.cables.ducts.forEach(duct => {
            duct.visibility = stepIndex >= 3 ? 1 : 0;
            if (duct.material) {
                const saturated = Boolean(duct.metadata?.saturated);
                duct.material.alpha = saturated ? 0.42 : 0.25;
                duct.material.emissiveColor = saturated ? BABYLON.Color3.FromHexString('#ff4757').scale(0.35) : BABYLON.Color3.FromHexString('#1f2a38').scale(0.12);
            }
        });

        this.cables.chambers.forEach(chamber => {
            const visible = stepIndex >= 3;
            chamber.visibility = visible ? 1 : 0;
            if (!visible || !chamber.material) return;

            if (chamber.metadata?.saturated && this.viewOptions.showSaturatedChambers) {
                chamber.material.diffuseColor = BABYLON.Color3.FromHexString(COLORS.NON_ELIGIBLE);
                chamber.material.emissiveColor = BABYLON.Color3.FromHexString(COLORS.NON_ELIGIBLE).scale(0.3);
                chamber.material.alpha = 0.95;
            } else {
                chamber.material.diffuseColor = BABYLON.Color3.FromHexString('#3b3f46');
                chamber.material.emissiveColor = BABYLON.Color3.FromHexString('#3b3f46').scale(0.08);
                chamber.material.alpha = 0.9;
            }
        });

        this.equipments.sros.forEach(sro => {
            sro.visibility = stepIndex >= 4 ? 1 : 0;
        });

        const distributionVisible = stepIndex >= 5 && this.viewOptions.showDistribution;
        const bundleVisible = stepIndex >= 5 && this.viewOptions.showBundles;
        this.cables.distribution.forEach(cable => {
            cable.visibility = distributionVisible ? 1 : 0;
        });
        this.cables.distributionBundles.forEach(bundle => {
            bundle.visibility = bundleVisible ? 1 : 0;
        });

        if (this.equipments.pbos) {
            this.equipments.pbos.forEach(pbo => {
                pbo.visibility = stepIndex >= 6 ? 1 : 0;
            });
        }
    }

    /**
     * Return a road-following waypoint path from `from` to `to`.
     * Delegates to RoadRouter (Dijkstra on road intersection graph).
     * Falls back to L-shape corner if router returns no path.
     */
    getPath(from, to, height = 0.3) {
        return routeCable(from, to, height);
    }
}
