import * as BABYLON from 'babylonjs';

// ============================================================
// Per-stage camera configuration
// Each stage has: target, radius, alpha, beta, orbitSpeed, label
// ============================================================
const STAGE_CAMS = [
    {
        // 0 – SIG Analysis: aerial sweep
        target: { x: 0, y: 0, z: 0 },
        radius: 100, alpha: -Math.PI / 4, beta: 0.55,
        orbitSpeed: 0.0003, orbitEnabled: true,
        label: 'Vue aérienne SIG – Analyse de densité'
    },
    {
        // 1 – Operator decision: slow tilt down
        target: { x: 5, y: 0, z: 5 },
        radius: 80, alpha: -Math.PI / 3, beta: 0.75,
        orbitSpeed: 0, orbitEnabled: false,
        label: 'Décision Opérateur – Architecture ZMD/ZTD'
    },
    {
        // 2 – NRO: tight zoom with slow orbit
        target: { x: -68, y: 3, z: -58 },
        radius: 20, alpha: -Math.PI / 1.4, beta: Math.PI / 3.5,
        orbitSpeed: 0.0006, orbitEnabled: true,
        label: 'NRO – Cœur du réseau FTTH'
    },
    {
        // 3 – Transport: tracking along main artery
        target: { x: -5, y: 0, z: 5 },
        radius: 50, alpha: -Math.PI / 2.2, beta: Math.PI / 3.8,
        orbitSpeed: 0.0002, orbitEnabled: true,
        label: 'Câbles Transport – Axes principaux'
    },
    {
        // 4 – SRO: hover over first SRO with slow turn
        target: { x: -10, y: 1.5, z: -10 },
        radius: 26, alpha: -Math.PI / 2.8, beta: Math.PI / 3.5,
        orbitSpeed: 0.0007, orbitEnabled: true,
        label: 'SRO – Zone de couverture locale'
    },
    {
        // 5 – Distribution: street-level tracking (Intersection L_TOP)
        target: { x: -35, y: 0, z: 35 },
        radius: 36, alpha: -Math.PI / 2, beta: Math.PI / 3.2,
        orbitSpeed: 0.0002, orbitEnabled: true,
        label: 'Câbles Distribution – Liaisons quartier'
    },
    {
        // 6 – PBO: tight focus on pole zone (Specific extra PBO)
        target: { x: 65, y: 6.5, z: 55 },
        radius: 16, alpha: -Math.PI / 1.8, beta: Math.PI / 3.2,
        orbitSpeed: 0.0008, orbitEnabled: true,
        label: "PBO – Bilan d'éligibilité final"
    },
    {
        // 7 – Non-eligible building: dynamically adjusted in goToStage()
        target: { x: -35, y: 2, z: -35 },
        radius: 18, alpha: -Math.PI / 2.2, beta: Math.PI / 3,
        orbitSpeed: 0.0004, orbitEnabled: true,
        label: 'Bâtiment Non-Éligible – Hors couverture capillaire'
    }
];

export class CameraController {
    /**
     * @param {BABYLON.ArcRotateCamera} camera
     * @param {BABYLON.Scene} scene
     * @param {HTMLCanvasElement} canvas
     */
    constructor(camera, scene, canvas) {
        this.camera = camera;
        this.scene = scene;
        this.canvas = canvas;

        this.currentStage = -1;
        this.networkModel = null;
        this._orbitObserver = null;
        this._userTookControl = false;
        this._orbitAngle = this.camera.alpha;

        // Detect manual interaction
        this._bindUserInteraction();
    }

    // --------------------------------------------------------
    // Public API
    // --------------------------------------------------------

    goToStage(index) {
        const cfg = STAGE_CAMS[Math.min(index, STAGE_CAMS.length - 1)];
        if (!cfg) return;
        this.currentStage = index;
        this._userTookControl = false;
        // À l'étape 7, dynamiquement cibler un bâtiment NON_ELIGIBLE
        let targetCfg = { ...cfg };
        if (index === 7 && this.networkModel) {
            const nonEligibleBuilding = this.networkModel.getNonEligibleBuilding();
            if (nonEligibleBuilding) {
                const height = nonEligibleBuilding.metadata.dimensions?.h || 2;
                targetCfg = {
                    ...cfg,
                    target: { x: nonEligibleBuilding.position.x, y: height + 2, z: nonEligibleBuilding.position.z }
                };
            }
        }

        this._animateTo(targetCfg);
        this._stopOrbit();

        if (cfg.orbitEnabled) {
            this._startOrbit(cfg.orbitSpeed);
        }
        this._updateLabel(cfg.label);
    }

    /** Let the user take back free camera control */
    releaseControl() {
        this._userTookControl = true;
        this._stopOrbit();
        this._hideLabel();
    }

    // --------------------------------------------------------
    // Internal
    // --------------------------------------------------------

    _animateTo(cfg, duration = 2000) {
        // Stop any currently running animations on the camera to prevent stuttering
        this.scene.stopAnimation(this.camera);
        if (this.camera.animations) {
            this.camera.animations = [];
        }

        const fps = 60;
        const frames = Math.round(fps * (duration / 1000));
        const ease = new BABYLON.CubicEase();
        ease.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEINOUT);

        [
            ['radius', this.camera.radius, cfg.radius],
            ['alpha', this.camera.alpha, cfg.alpha],
            ['beta', this.camera.beta, cfg.beta]
        ].forEach(([prop, from, to]) => {
            BABYLON.Animation.CreateAndStartAnimation(
                `cam-${prop}`, this.camera, prop,
                fps, frames, from, to,
                BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT,
                ease
            );
        });

        // Animate target separately
        const startTarget = this.camera.target.clone();
        const endTarget = new BABYLON.Vector3(cfg.target.x, cfg.target.y || 0, cfg.target.z);
        BABYLON.Animation.CreateAndStartAnimation(
            'cam-target', this.camera, 'target',
            fps, frames, startTarget, endTarget,
            BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT,
            ease
        );

        this._orbitAngle = cfg.alpha;
    }

    _startOrbit(speed) {
        if (this._orbitObserver) return;
        this._orbitAngle = this.camera.alpha;
        this._orbitObserver = this.scene.onBeforeRenderObservable.add(() => {
            if (this._userTookControl) return;
            this._orbitAngle += speed;
            this.camera.alpha = this._orbitAngle;
        });
    }

    _stopOrbit() {
        if (this._orbitObserver) {
            this.scene.onBeforeRenderObservable.remove(this._orbitObserver);
            this._orbitObserver = null;
        }
    }

    _updateLabel(text) {
        let el = document.getElementById('cam-label');
        if (!el) {
            el = document.createElement('div');
            el.id = 'cam-label';
            document.body.appendChild(el);
        }
        el.textContent = text;
        el.classList.add('visible');
    }

    _hideLabel() {
        const el = document.getElementById('cam-label');
        if (el) el.classList.remove('visible');
    }

    _bindUserInteraction() {
        let lastAlpha = this.camera.alpha;
        let lastBeta = this.camera.beta;
        let lastRadius = this.camera.radius;

        this.scene.onBeforeRenderObservable.add(() => {
            const moved =
                Math.abs(this.camera.alpha - lastAlpha) > 0.003 ||
                Math.abs(this.camera.beta - lastBeta) > 0.003 ||
                Math.abs(this.camera.radius - lastRadius) > 0.5;

            if (moved && !this._userTookControl) {
                // Check if the animation is still running (rough heuristic)
                const anims = this.scene.getAnimationRatioToRef ? [] : this.scene.animatables;
                const hasCamAnim = (anims || []).some(a => a.target === this.camera);
                if (!hasCamAnim) {
                    this._userTookControl = true;
                    this._stopOrbit();
                    this._hideLabel();
                    this._showResumeHint();
                }
            }
            lastAlpha = this.camera.alpha;
            lastBeta = this.camera.beta;
            lastRadius = this.camera.radius;
        });
    }

    _showResumeHint() {
        let hint = document.getElementById('resume-hint');
        if (!hint) {
            hint = document.createElement('div');
            hint.id = 'resume-hint';
            hint.textContent = '🎥 Caméra libre — Cliquez sur Reprendre vue';
            document.body.appendChild(hint);
        }
        hint.classList.add('visible');
        clearTimeout(this._hintTimer);
        this._hintTimer = setTimeout(() => hint.classList.remove('visible'), 4000);
    }
}
