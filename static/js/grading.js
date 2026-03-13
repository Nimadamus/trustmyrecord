/**
 * Auto-Grading Frontend Module
 * Handles pick grading status, results display, and admin controls
 * Updated for static site - uses TMR_GRADER instead of backend API
 */

class GradingUI {
    constructor() {
        // Static site mode - no API needed
        this.useStaticGrader = true;
    }

    /**
     * Get game result for a pick
     */
    async getGameResult(pickId) {
        if (this.useStaticGrader && window.TMR_GRADER) {
            const picks = TMR_GRADER.getPicks();
            const pick = picks.find(p => p.id === pickId);
            return pick || null;
        }
        
        // Fallback to API (for future backend integration)
        try {
            const response = await fetch(`${this.apiBase}/picks/${pickId}/result`);
            return await response.json();
        } catch (error) {
            console.error('Error fetching game result:', error);
            return null;
        }
    }

    /**
     * Manually grade a pick
     */
    async gradePick(pickId, result) {
        if (this.useStaticGrader && window.TMR_GRADER) {
            return TMR_GRADER.manualGrade(pickId, result);
        }
        
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${this.apiBase}/picks/${pickId}/grade`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ result })
            });
            return await response.json();
        } catch (error) {
            console.error('Error grading pick:', error);
            return { error: error.message };
        }
    }

    /**
     * Run bulk grading
     */
    async runBulkGrading() {
        if (this.useStaticGrader && window.TMR_GRADER) {
            const result = TMR_GRADER.runAutoGrading();
            return {
                success: true,
                graded: result.graded,
                message: `Graded ${result.graded} picks`,
                results: result.newResults
            };
        }
        
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${this.apiBase}/grade/run`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            return await response.json();
        } catch (error) {
            console.error('Error running grading:', error);
            return { error: error.message };
        }
    }

    /**
     * Get grading status
     */
    async getGradingStatus() {
        if (this.useStaticGrader && window.TMR_GRADER) {
            const picks = TMR_GRADER.getPicks();
            const pending = picks.filter(p => p.status === 'pending').length;
            const settled = picks.filter(p => p.status === 'settled').length;
            return { pending, settled, total: picks.length };
        }
        
        try {
            const response = await fetch(`${this.apiBase}/grade/status`);
            return await response.json();
        } catch (error) {
            console.error('Error fetching grading status:', error);
            return null;
        }
    }

    /**
     * Render grading status badge
     */
    renderStatusBadge(pick) {
        const status = pick.status === 'settled' ? pick.result : pick.status || 'pending';
        
        return TMR_GRADER ? TMR_GRADER.renderStatusBadge(pick.status || 'pending', pick.result) : '';
    }

    /**
     * Render game result overlay
     */
    renderGameResult(pick) {
        if (!pick || !pick.finalScore) return '';
        
        const isWin = pick.result === 'win';
        const isLoss = pick.result === 'loss';
        const resultClass = isWin ? 'win' : isLoss ? 'loss' : 'push';
        
        return `
            <div class="game-result-overlay ${resultClass}">
                <div class="final-score">
                    <span class="score">${pick.finalScore}</span>
                </div>
                <span class="status finished">FINAL</span>
            </div>
        `;
    }

    /**
     * Show grading modal
     */
    showGradingModal(pick) {
        const modal = document.createElement('div');
        modal.className = 'modal grading-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Grade Pick</h3>
                    <button class="close-btn" onclick="this.closest('.modal').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="pick-details">
                        <p><strong>${pick.team1}</strong> vs <strong>${pick.team2}</strong></p>
                        <p>${pick.pickTeam} ${pick.pickType} @ ${pick.odds}</p>
                    </div>
                    <div class="grading-actions" style="display: flex; gap: 12px; margin-top: 20px;">
                        <button class="tmr-btn tmr-btn-success" onclick="gradingUI.confirmGrade('${pick.id}', 'win')">
                            ✓ Win
                        </button>
                        <button class="tmr-btn tmr-btn-danger" onclick="gradingUI.confirmGrade('${pick.id}', 'loss')">
                            ✗ Loss
                        </button>
                        <button class="tmr-btn tmr-btn-secondary" onclick="gradingUI.confirmGrade('${pick.id}', 'push')">
                            ↔ Push
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.style.display = 'flex';
    }

    /**
     * Confirm grade selection
     */
    async confirmGrade(pickId, result) {
        const resultText = result.charAt(0).toUpperCase() + result.slice(1);
        if (confirm(`Are you sure you want to mark this pick as ${resultText}?`)) {
            const response = await this.gradePick(pickId, result);
            
            if (response.success) {
                this.showToast(`Pick graded as ${resultText}!`, 'success');
                // Close modal
                document.querySelector('.grading-modal')?.remove();
                // Refresh UI
                if (typeof loadMyPicks === 'function') {
                    loadMyPicks(window.currentPicksTab || 'pending');
                }
            } else {
                this.showToast(response.error || 'Grading failed', 'error');
            }
        }
    }

    /**
     * Add admin grading button
     */
    addAdminButton() {
        const existing = document.getElementById('adminGradeBtn');
        if (existing) return;
        
        const btn = document.createElement('button');
        btn.id = 'adminGradeBtn';
        btn.className = 'tmr-btn tmr-btn-primary';
        btn.innerHTML = '<span>⚡</span> Run Auto-Grading';
        btn.onclick = () => this.runBulkGrading();
        
        const target = document.querySelector('.mypicks-header') || document.querySelector('#mypicks .container');
        if (target) {
            target.appendChild(btn);
        }
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        if (window.showToast) {
            window.showToast(message, type);
        } else {
            // Fallback
            alert(message);
        }
    }

    /**
     * Initialize grading on a page
     */
    init() {
        console.log('[GradingUI] Initialized for static site');
        
        // Listen for picks graded events
        window.addEventListener('picksGraded', (e) => {
            if (e.detail && e.detail.graded > 0) {
                this.showToast(`${e.detail.graded} pick(s) auto-graded!`, 'success');
            }
        });
    }
}

// Initialize
const gradingUI = new GradingUI();

// Auto-grade function for index.html
window.autoGradeAll = async function() {
    const statusEl = document.getElementById('myPicksGradeStatus');
    if (statusEl) {
        statusEl.textContent = 'Grading picks...';
    }
    
    try {
        const result = await gradingUI.runBulkGrading();
        
        if (result.success) {
            if (statusEl) {
                statusEl.textContent = `✓ ${result.graded} picks graded`;
                setTimeout(() => statusEl.textContent = '', 3000);
            }
            return result;
        } else {
            if (statusEl) {
                statusEl.textContent = 'Grading failed';
            }
            return { success: false, error: result.error };
        }
    } catch (err) {
        if (statusEl) {
            statusEl.textContent = 'Error: ' + err.message;
        }
        return { success: false, error: err.message };
    }
};

// Initialize when DOM ready
document.addEventListener('DOMContentLoaded', () => {
    gradingUI.init();
});
