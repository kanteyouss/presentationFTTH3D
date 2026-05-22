import { STAGES } from './constants';

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
        const overlay = document.createElement('div');
        overlay.id = 'ui-overlay';
        overlay.innerHTML = `
            <div class="panel">
                <h1>FTTH Urban Deployment</h1>
                <p id="stage-name" class="stage-name">${STAGES[0].name}</p>
                <p id="stage-desc">${STAGES[0].description}</p>

                <div class="steps-container">
                    ${STAGES.map(s => `
                        <div class="step-badge" id="step-${s.id}" data-id="${s.id}" title="${s.name}">
                            ${s.id + 1}
                        </div>
                    `).join('')}
                </div>

                <div class="controls">
                    <button id="prev-btn" title="Précédent (←)">◀</button>
                    <button id="auto-btn" class="auto-btn" title="Lecture auto (Espace)">▶ Auto</button>
                    <button id="next-btn" class="primary" title="Suivant (→)">Suivant ▶</button>
                </div>
            </div>
        `;

        const footer = document.createElement('div');
        footer.className = 'info-footer';
        footer.innerHTML = `<p>NRO &rarr; SRO &rarr; PBO | Vue Technique Opérateur</p>`;

        this.container.appendChild(overlay);
        this.container.appendChild(footer);

        this.updateUI(0);

        // Badge clicks
        overlay.querySelectorAll('.step-badge').forEach(b => {
            b.addEventListener('click', () => {
                const id = parseInt(b.dataset.id);
                this._goTo(id);
            });
        });

        // Navigation buttons
        document.getElementById('next-btn')?.addEventListener('click', () => this._next());
        document.getElementById('prev-btn')?.addEventListener('click', () => this._prev());
        document.getElementById('auto-btn')?.addEventListener('click', () => this._toggleAutoPlay());

        // Keyboard navigation — PowerPoint style
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

    _goTo(stepIndex) {
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
        if (btn) { btn.textContent = '⏸ Pause'; btn.classList.add('active'); }

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
        if (btn) { btn.textContent = '▶ Auto'; btn.classList.remove('active'); }
    }

    _toggleDistribution() {
        const model = this.controller.networkModel;
        if (!model) return;
        const nextValue = !model.viewOptions.showDistribution;
        model.setViewOptions({ showDistribution: nextValue });
        this._syncViewButtons();
        model.updateVisibilityForStep(this.controller.currentStep);
    }

    _toggleBundles() {
        const model = this.controller.networkModel;
        if (!model) return;
        const nextValue = !model.viewOptions.showBundles;
        model.setViewOptions({ showBundles: nextValue });
        this._syncViewButtons();
        model.updateVisibilityForStep(this.controller.currentStep);
    }

    _toggleSaturatedChambers() {
        const model = this.controller.networkModel;
        if (!model) return;
        const nextValue = !model.viewOptions.showSaturatedChambers;
        model.setViewOptions({ showSaturatedChambers: nextValue });
        this._syncViewButtons();
        model.updateVisibilityForStep(this.controller.currentStep);
    }

    _syncViewButtons() {
        const model = this.controller.networkModel;
        if (!model) return;
        const distBtn = document.getElementById('toggle-distribution-btn');
        const bundleBtn = document.getElementById('toggle-bundles-btn');
        const chamberBtn = document.getElementById('toggle-chambers-btn');

        if (distBtn) distBtn.classList.toggle('active', model.viewOptions.showDistribution);
        if (bundleBtn) bundleBtn.classList.toggle('active', model.viewOptions.showBundles);
        if (chamberBtn) chamberBtn.classList.toggle('active', model.viewOptions.showSaturatedChambers);
    }

    updateUI(stepIndex) {
        const badges = document.querySelectorAll('.step-badge');
        badges.forEach(b => {
            const id = parseInt(b.dataset.id);
            b.classList.toggle('active', id === stepIndex);
            b.classList.toggle('completed', id < stepIndex);
        });

        const nameEl = document.getElementById('stage-name');
        const descEl = document.getElementById('stage-desc');

        if (nameEl) nameEl.textContent = STAGES[stepIndex]?.name || '';
        if (descEl) {
            if (stepIndex === 1) {
                descEl.innerHTML = `<strong style="color:#00d2ff">DÉCISION OPÉRATEUR :</strong><br>Suite aux analyses SIG, l'opérateur valide le déploiement de l'architecture ZMD/ZTD.`;
            } else {
                descEl.textContent = STAGES[stepIndex]?.description || '';
            }
        }

        // Footer: eligibility stats at step 6+
        const footer = document.querySelector('.info-footer');
        if (stepIndex >= 6 && this.controller.networkModel) {
            const buildings = this.controller.networkModel.equipments.buildings;
            const eligible = buildings.filter(b => b.metadata.status === 'ELIGIBLE').length;
            const waiting = buildings.filter(b => b.metadata.status === 'WAITING').length;
            const nonEligible = buildings.filter(b => b.metadata.status === 'NON_ELIGIBLE').length;
            footer.innerHTML = `
                <span style="color:#2ed573">●</span> ${eligible} Éligibles &nbsp;|&nbsp;
                <span style="color:#ffa502">●</span> ${waiting} En Attente &nbsp;|&nbsp;
                <span style="color:#ff4757">●</span> ${nonEligible} Non Éligibles
            `;
        } else {
            footer.innerHTML = `<p>NRO &rarr; SRO &rarr; PBO | Vue Technique Opérateur</p>`;
        }

        // Non-eligibility diagnostic popup at step 6
        this._updateDiagnosticPopup(stepIndex);

        document.getElementById('next-btn').textContent = stepIndex === STAGES.length - 1 ? '✓ Fin' : 'Suivant ▶';
        document.getElementById('prev-btn').disabled = stepIndex === 0;
        this._syncViewButtons();
    }

    _updateDiagnosticPopup(stepIndex) {
        let popup = document.getElementById('diagnostic-popup');
        if (stepIndex === 7 && this.controller.networkModel) {
            const nonElig = this.controller.networkModel.equipments.buildings.find(b => b.metadata.status === 'NON_ELIGIBLE');
            if (nonElig) {
                if (!popup) {
                    popup = document.createElement('div');
                    popup.id = 'diagnostic-popup';
                    document.body.appendChild(popup);
                }
                popup.innerHTML = `
                    <div class="diag-icon">🔴</div>
                    <div class="diag-title">Bâtiment Non Éligible</div>
                    <div class="diag-reason">${nonElig.metadata.reason}</div>
                `;
                popup.classList.add('visible');
                return;
            }
        }
        if (popup) popup.classList.remove('visible');
    }

    // --- Equipment hover / modal helpers ---
    showHoverEquipment(imageUrl, title, clientX = 0, clientY = 0) {
        if (!this._hoverEl) {
            const el = document.createElement('div');
            el.id = 'equipment-preview';
            el.innerHTML = `
                <div class="preview-card">
                    <img class="preview-img" src="" alt="equip">
                    <div class="preview-title"></div>
                </div>
            `;
            document.body.appendChild(el);
            this._hoverEl = el;
            this._hoverImg = el.querySelector('.preview-img');
            this._hoverTitle = el.querySelector('.preview-title');
        }
        if (this._hoverImg.src !== imageUrl) this._hoverImg.src = imageUrl;
        this._hoverTitle.textContent = title || '';
        this._hoverEl.style.display = 'block';
        this._hoverEl.style.left = `${clientX + 12}px`;
        this._hoverEl.style.top = `${clientY + 12}px`;
    }

    hideHoverEquipment() {
        if (this._hoverEl) this._hoverEl.style.display = 'none';
    }

    showEquipmentModal(imageUrl, title) {
        if (!this._modalEl) {
            const el = document.createElement('div');
            el.id = 'equipment-modal';
            el.innerHTML = `
                <div class="modal-backdrop" id="equipment-modal-backdrop">
                    <div class="modal-card">
                        <button class="modal-close" id="equipment-modal-close">✕</button>
                        <div class="modal-title"></div>
                        <div class="modal-body"><img class="modal-img" src="" alt="equip"></div>
                    </div>
                </div>
            `;
            document.body.appendChild(el);
            this._modalEl = el;
            this._modalImg = el.querySelector('.modal-img');
            this._modalTitle = el.querySelector('.modal-title');
            el.querySelector('#equipment-modal-close').addEventListener('click', () => this.hideEquipmentModal());
            el.querySelector('#equipment-modal-backdrop').addEventListener('click', (e) => {
                if (e.target === e.currentTarget) this.hideEquipmentModal();
            });
        }
        // Reset any previous inline sizing
        if (this._modalImg.src !== imageUrl) {
            this._modalImg.style.width = '';
            this._modalImg.onload = () => {
                const natural = this._modalImg.naturalWidth || 0;
                if (natural > 0) {
                    // Aggressively upscale very small images for legibility,
                    // but remain responsive and respect modal max widths.
                    if (natural < 200) {
                        this._modalImg.style.width = 'min(720px, 92vw)';
                    } else if (natural < 800) {
                        this._modalImg.style.width = 'min(640px, 92vw)';
                    } else if (natural < 1200) {
                        this._modalImg.style.width = 'min(520px, 88vw)';
                    } else {
                        this._modalImg.style.width = '';
                    }
                } else {
                    this._modalImg.style.width = '';
                }
            };
            this._modalImg.src = imageUrl;
        }
        this._modalTitle.textContent = title || '';
        this._modalEl.style.display = 'block';
    }

    hideEquipmentModal() {
        if (this._modalEl) this._modalEl.style.display = 'none';
    }
}
