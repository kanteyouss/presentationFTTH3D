import * as BABYLON from 'babylonjs';
import { STAGES } from './constants';

export class AnimationController {
    constructor(scene, networkModel, sceneManager) {
        this.scene = scene;
        this.networkModel = networkModel;
        this.sceneManager = sceneManager;
        this.currentStep = -1;
        this.onStepChange = null;
    }

    setStep(stepIndex) {
        if (stepIndex === this.currentStep) return;
        this.currentStep = stepIndex;

        // Cinematic Camera is now entirely handled by CameraController.js
        // via UIManager, so we do not call sceneManager.animateCamera here.

        this.updateVisibility();
        if (this.onStepChange) this.onStepChange(stepIndex);
    }

    updateVisibility() {
        this.networkModel.updateVisibilityForStep(this.currentStep);

        // Stage 3+: SRO visible. Coverage polygons are a cinematic overlay shown
        // ONLY at the dedicated zone stages (7 = zones, 8 = diagnostic) so they
        // explain why the red buildings are non-eligible (they sit outside every
        // SRO polygon zone).
        const sroVisible = this.currentStep >= 3;
        const zonesVisible = this.currentStep === 7 || this.currentStep === 8;
        this.networkModel.equipments.sros.forEach(s => {
            s.visibility = sroVisible ? 1 : 0;
        });

        if (zonesVisible && (!this._coverageDiscs || this._coverageDiscs.length === 0)) {
            this._coverageDiscs = [];
            this.networkModel.equipments.sros.forEach(s => {
                const poly = this.networkModel.createCoveragePolygon(s.position, s.zone || s.metadata?.zone);
                if (poly) this._coverageDiscs.push(poly);
            });
        }

        if (!zonesVisible && this._coverageDiscs && this._coverageDiscs.length > 0) {
            this.networkModel.disposeCoverageCircles();
            this._coverageDiscs.forEach(d => {
                if (d._alphaObserver) this.networkModel.scene.onBeforeRenderObservable.remove(d._alphaObserver);
                if (!d.isDisposed()) d.dispose();
            });
            this._coverageDiscs = [];
        }
    }

}
