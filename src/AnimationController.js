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

        // Stage 4+: SRO + persistent coverage discs (kept here because they are
        // a temporary cinematic overlay rather than permanent network assets).
        const sroVisible = this.currentStep >= 4;
        this.networkModel.equipments.sros.forEach(s => {
            const wasInvisible = s.visibility === 0;
            s.visibility = sroVisible ? 1 : 0;

            if (this.currentStep === 4 && wasInvisible) {
                const disc = this.networkModel.createCoverageCircle(s.position);
                this._coverageDiscs = this._coverageDiscs || [];
                this._coverageDiscs.push(disc);
            }
        });

        if (this.currentStep !== 4 && this._coverageDiscs && this._coverageDiscs.length > 0) {
            this.networkModel.disposeCoverageCircles();
            this._coverageDiscs.forEach(d => {
                if (d._alphaObserver) this.networkModel.scene.onBeforeRenderObservable.remove(d._alphaObserver);
                if (!d.isDisposed()) d.dispose();
            });
            this._coverageDiscs = [];
        }
    }

    animateCable(cable) {
        cable.visibility = 0;
        const animation = new BABYLON.Animation(
            "cableGrow",
            "visibility",
            60,
            BABYLON.Animation.ANIMATIONTYPE_FLOAT,
            BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
        );

        const keys = [{ frame: 0, value: 0 }, { frame: 60, value: 1 }];
        animation.setKeys(keys);
        cable.animations.push(animation);
        this.scene.beginAnimation(cable, 0, 60, false);
    }
}
