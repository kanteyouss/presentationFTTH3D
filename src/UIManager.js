import { STAGES, EQUIPMENT_DATA } from './constants';

const TAG_MAP = {
    0: 'Analyse', 1: 'Architecture', 2: 'Équipement',
    3: 'Câblage', 4: 'Équipement', 5: 'Câblage',
    6: 'Équipement', 7: 'Diagnostic'
};

export class UIManager {
    constructor(container, animationController, cameraController) {
        this.container = container;
        this.controller = animationController;
        this.cam = cameraController;
        this._autoPlayTimer = null;
        this._isAutoPlaying = false;
        this.init();
    }

    init() {
        this._updateBadges(0);
        this.updateUI(0);

        // Badge clicks
        document.querySelectorAll('.step-badge').forEach(b => {
            b.addEventListener('click', () => {
                const id = parseInt(b.dataset.id);
                this._goTo(id);
            });
        });

        // Navigation buttons
        document.getElementById('next-btn')?.addEventListener('click', () => this._next());
        document.getElementById('prev-btn')?.addEventListener('click', () => this._prev());
        document.getElementById('auto-btn')?.addEventListener('click', () => this._toggleAutoPlay());

        // Modal close
        document.querySelector('#equipment-modal .modal-close')?.addEventListener('click', () => this.hideEquipmentModal());
        document.querySelector('#equipment-modal .modal-backdrop')?.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) this.hideEquipmentModal();
        });

        // Diagnostic popup close
        document.getElementById('diag-close')?.addEventListener('click', () => this._hideDiagnosticPopup());

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            switch (e.key) {
                case 'ArrowRight':
                case 'PageDown':
                case 'Enter':
                    e.preventDefault();
                    this._next();
                    break;
                case 'ArrowLeft':
                case 'PageUp':
                    e.preventDefault();
                    this._prev();
                    break;
                case ' ':
                    e.preventDefault();
                    this._toggleAutoPlay();
                    break;
                case 'Escape':
                    e.preventDefault();
                    this._stopAutoPlay();
                    if (this.cam) this.cam.releaseControl();
                    break;
                case 'Home':
                    e.preventDefault();
                    this._goTo(0);
                    break;
                case 'End':
                    e.preventDefault();
                    this._goTo(STAGES.length - 1);
                    break;
            }
        });
    }

    _updateBadges(currentStep) {
        const container = document.getElementById('steps-container');
        container.innerHTML = STAGES.map((s, i) => `
            <div class="step-item">
                <div class="step-badge ${i === currentStep ? 'active' : ''} ${i < currentStep ? 'completed' : ''}"
                     data-id="${s.id}"
                     role="button"
                     tabindex="0"
                     aria-label="${s.name}${i === currentStep ? ' (étape en cours)' : ''}"
                     title="${s.name}">
                    ${i < currentStep ? '&#10003;' : i + 1}
                    <span class="step-label">${s.name}</span>
                </div>
            </div>
        `).join('');
    }

    _goTo(stepIndex) {
        this.hideEquipmentModal();
        try {
            if (this.controller && this.controller.networkModel && typeof this.controller.networkModel.togglePinnedEquipmentBadge === 'function') {
                this.controller.networkModel.togglePinnedEquipmentBadge(null);
            }
        } catch (e) {
            // ignore
        }

        this._stopAutoPlay();
        this.controller.setStep(stepIndex);
        if (this.cam) this.cam.goToStage(stepIndex);
        this.updateUI(stepIndex);
    }

    _next() {
        const next = Math.min(this.controller.currentStep + 1, STAGES.length - 1);
        this._goTo(next);
        if (next === STAGES.length - 1) this._stopAutoPlay();
    }

    _prev() {
        const prev = Math.max(this.controller.currentStep - 1, 0);
        this._goTo(prev);
    }

    _toggleAutoPlay() {
        if (this._isAutoPlaying) {
            this._stopAutoPlay();
        } else {
            this._startAutoPlay();
        }
    }

    _startAutoPlay(interval = 6000) {
        this._isAutoPlaying = true;
        const btn = document.getElementById('auto-btn');
        if (btn) {
            btn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                Pause
            `;
            btn.classList.add('active');
        }

        this._autoPlayTimer = setInterval(() => {
            const next = this.controller.currentStep + 1;
            if (next >= STAGES.length) {
                this._stopAutoPlay();
            } else {
                this._goTo(next);
            }
        }, interval);
    }

    _stopAutoPlay() {
        this._isAutoPlaying = false;
        clearInterval(this._autoPlayTimer);
        const btn = document.getElementById('auto-btn');
        if (btn) {
            btn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>
                Lecture automatique
            `;
            btn.classList.remove('active');
        }
    }

    updateUI(stepIndex) {
        this._updateBadges(stepIndex);

        const fill = document.getElementById('progress-fill');
        if (fill) {
            const pct = (stepIndex / (STAGES.length - 1)) * 100;
            fill.style.width = `${Math.round(pct)}%`;
        }

        const stepNum = document.getElementById('step-num');
        if (stepNum) stepNum.textContent = stepIndex + 1;

        const tag = document.getElementById('stage-tag');
        if (tag) tag.textContent = TAG_MAP[stepIndex] || '';

        const nameEl = document.getElementById('stage-name');
        const descEl = document.getElementById('stage-desc');

        if (nameEl) nameEl.textContent = STAGES[stepIndex]?.name || '';
        if (descEl) {
            if (stepIndex === 1) {
                descEl.innerHTML = '<strong style="color:var(--accent-light)">DÉCISION OPÉRATEUR :</strong><br>Suite aux analyses SIG, l\'opérateur valide le déploiement de l\'architecture ZMD/ZTD.';
            } else {
                descEl.textContent = STAGES[stepIndex]?.description || '';
            }
        }

        // Footer: eligibility stats at step 6+
        const footer = document.getElementById('info-footer');
        if (stepIndex >= 6 && this.controller.networkModel) {
            const buildings = this.controller.networkModel.equipments.buildings;
            const eligible = buildings.filter(b => b.metadata.status === 'ELIGIBLE').length;
            const nonEligible = buildings.filter(b => b.metadata.status === 'NON_ELIGIBLE').length;

            document.getElementById('eligible-count').textContent = eligible;
            document.getElementById('noneligible-count').textContent = nonEligible;
            footer.classList.add('visible');
        } else {
            footer.classList.remove('visible');
        }

        // Non-eligibility diagnostic popup at step 7
        this._updateDiagnosticPopup(stepIndex);

        const nextBtn = document.getElementById('next-btn');
        if (nextBtn) {
            if (stepIndex === STAGES.length - 1) {
                nextBtn.innerHTML = '&#10003; Fin';
            } else {
                nextBtn.innerHTML = 'Suivant <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>';
            }
        }

        document.getElementById('prev-btn').disabled = stepIndex === 0;
    }

    _updateDiagnosticPopup(stepIndex) {
        const popup = document.getElementById('diagnostic-popup');
        if (!popup) return;

        if (stepIndex === 7 && this.controller.networkModel) {
            const nonElig = this.controller.networkModel.equipments.buildings.find(b => b.metadata.status === 'NON_ELIGIBLE');
            if (nonElig) {
                const reason = nonElig.metadata.reason || 'Bâtiment hors couverture';
                let details = '';

                const distPBO = nonElig.metadata.nearestPboDist;
                const distSRO = nonElig.metadata.nearestSroDist;
                const inSro = nonElig.metadata.inSroCoverage;

                if (distPBO != null) details += `Distance au PBO le plus proche : ${Math.round(distPBO)}m. `;
                if (distSRO != null) details += `Distance au SRO le plus proche : ${Math.round(distSRO)}m.`;

                if (inSro) {
                    details += ' Le bâtiment est en zone SRO mais trop éloigné d\'un PBO. Solution : extension capillaire ou nouveau PBO.';
                } else {
                    details += ' Le bâtiment est hors zone SRO. Solution : recalage de zone ou extension du réseau de distribution.';
                }

                popup.querySelector('.diag-title').textContent = 'Bâtiment Non Raccordable';
                popup.querySelector('.diag-reason').textContent = reason;
                popup.querySelector('.diag-details').textContent = details;
                popup.classList.add('visible');
                return;
            }
        }
        popup.classList.remove('visible');
    }

    _hideDiagnosticPopup() {
        const popup = document.getElementById('diagnostic-popup');
        if (popup) popup.classList.remove('visible');
    }

    // --- Equipment hover / modal helpers ---
    showHoverEquipment(imageUrl, title, clientX = 0, clientY = 0) {
        const el = document.getElementById('equipment-preview');
        if (!el) return;
        const img = el.querySelector('.preview-img');
        const titleEl = el.querySelector('.preview-title');
        if (img && imageUrl) img.src = imageUrl;
        if (titleEl) titleEl.textContent = title || '';
        el.style.display = 'block';
        el.style.left = `${clientX + 12}px`;
        el.style.top = `${clientY + 12}px`;
    }

    hideHoverEquipment() {
        const el = document.getElementById('equipment-preview');
        if (el) el.style.display = 'none';
    }

    showEquipmentModal(imageUrl, title) {
        const modal = document.getElementById('equipment-modal');
        if (!modal) return;
        const img = modal.querySelector('.modal-img');
        const titleEl = modal.querySelector('.modal-title');

        if (img && imageUrl) img.src = imageUrl;
        if (titleEl) titleEl.textContent = title || '';

        // Populate metadata from EQUIPMENT_DATA
        const type = (title || '').split(' ')[0];
        const data = EQUIPMENT_DATA[type] || {};

        const setMeta = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value || '—';
        };
        setMeta('modal-type', data.type || '—');
        setMeta('modal-range', data.range || '—');
        setMeta('modal-capacity', data.capacity || '—');
        setMeta('modal-zone', data.zone || '—');

        modal.style.display = 'block';
    }

    hideEquipmentModal() {
        const modal = document.getElementById('equipment-modal');
        if (modal) modal.style.display = 'none';
    }
}
