/**
 * Auto-Grading Frontend Module
 * Handles pick grading status, results display, and admin controls
 */

class GradingUI {
    constructor() {
        this.apiBase = '/api';
    }

    /**
     * Get game result for a pick
     */
    async getGameResult(pickId) {
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
    async gradePick(pickId) {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${this.apiBase}/picks/${pickId}/grade`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            return await response.json();
        } catch (error) {
            console.error('Error grading pick:', error);
            return { error: error.message };
        }
    }

    /**
     * Run bulk grading (admin)
     */
    async runBulkGrading() {
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
        const status = pick.status || 'pending';
        const statusClasses = {
            'pending': 'badge-pending',
            'won': 'badge-won',
            'lost': 'badge-lost',
            'push': 'badge-push'
        };
        
        const statusText = {
            'pending': '⏳ Pending',
            'won': '✅ Won',
            'lost': '❌ Lost',
            'push': '🔄 Push'
        };

        return `
            <span class="status-badge ${statusClasses[status]}" data-pick-id="${pick.id}">
                ${statusText[status]}
                ${pick.auto_graded ? '<small>(auto)</small>' : ''}
            </span>
        `;
    }

    /**
     * Render game result overlay
     */
    renderGameResult(gameResult) {
        if (!gameResult) return '';
        
        return `
            <div class="game-result-overlay">
                <div class="final-score">
                    <span class="score">${gameResult.home_score ?? '-'}</span>
                    <span class="divider">-</span>
                    <span class="score">${gameResult.away_score ?? '-'}</span>
                </div>
                ${gameResult.finished ? 
                    '<span class="status finished">FINAL</span>' : 
                    '<span class="status live">LIVE</span>'
                }
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
                    <button class="close-btn">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="pick-details">
                        <p><strong>${pick.team1}</strong> vs <strong>${pick.team2}</strong></p>
                        <p>${pick.pick_selection}</p>
                        <p>@ ${pick.odds}</p>
                    </div>
                    <div class="grading-actions">
                        <button class="btn btn-won" onclick="gradingUI.confirmGrade(${pick.id}, 'won')">
                            ✅ Won
                        </button>
                        <button class="btn btn-lost" onclick="gradingUI.confirmGrade(${pick.id}, 'lost')">
                            ❌ Lost
                        </button>
                        <button class="btn btn-push" onclick="gradingUI.confirmGrade(${pick.id}, 'push')">
                            🔄 Push
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        modal.querySelector('.close-btn').addEventListener('click', () => {
            modal.remove();
        });
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }

    /**
     * Confirm manual grade
     */
    async confirmGrade(pickId, result) {
        if (!confirm(`Mark this pick as ${result.toUpperCase()}?`)) return;
        
        const data = await this.gradePick(pickId);
        
        if (data.success) {
            this.showToast(`Pick marked as ${result.toUpperCase()}!`, 'success');
            // Refresh the pick display
            location.reload();
        } else {
            this.showToast(data.error || 'Failed to grade pick', 'error');
        }
    }

    /**
     * Show admin grading panel
     */
    async showAdminPanel() {
        const status = await this.getGradingStatus();
        
        const panel = document.createElement('div');
        panel.className = 'admin-grading-panel';
        panel.innerHTML = `
            <div class="panel-header">
                <h3>🤖 Auto-Grading Control</h3>
                <button class="close-btn">&times;</button>
            </div>
            <div class="panel-stats">
                <div class="stat">
                    <span class="stat-value">${status?.pending_picks || 0}</span>
                    <span class="stat-label">Pending</span>
                </div>
                <div class="stat">
                    <span class="stat-value">${status?.recently_graded || 0}</span>
                    <span class="stat-label">Last 24h</span>
                </div>
                <div class="stat">
                    <span class="stat-value">${status?.total_graded || 0}</span>
                    <span class="stat-label">Total Graded</span>
                </div>
            </div>
            <div class="panel-actions">
                <button class="btn btn-primary btn-run" id="runGrading">
                    <span class="icon">⚡</span> Run Grading Now
                </button>
                <p class="info-text">Auto-grading runs every 15 minutes</p>
            </div>
            <div class="grading-log" id="gradingLog"></div>
        `;
        
        document.body.appendChild(panel);
        
        panel.querySelector('.close-btn').addEventListener('click', () => {
            panel.remove();
        });
        
        document.getElementById('runGrading').addEventListener('click', async () => {
            const btn = document.getElementById('runGrading');
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> Grading...';
            
            const result = await this.runBulkGrading();
            
            const log = document.getElementById('gradingLog');
            const entry = document.createElement('div');
            entry.className = `log-entry ${result.success ? 'success' : 'error'}`;
            entry.innerHTML = `
                <span class="time">${new Date().toLocaleTimeString()}</span>
                <span class="message">${result.graded || 0} picks graded</span>
            `;
            log.prepend(entry);
            
            btn.disabled = false;
            btn.innerHTML = '<span class="icon">⚡</span> Run Grading Now';
        });
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * Initialize grading on a page
     */
    init() {
        // Add grading badges to all pick cards
        document.querySelectorAll('[data-pick-id]').forEach(el => {
            const pickId = el.dataset.pickId;
            this.fetchAndDisplayGameResult(pickId, el);
        });
        
        // Add admin button if user is admin
        if (window.currentUser?.is_admin) {
            this.addAdminButton();
        }
    }

    /**
     * Fetch and display game result for a pick
     */
    async fetchAndDisplayGameResult(pickId, element) {
        const result = await this.getGameResult(pickId);
        if (result && result.home_score !== undefined) {
            const overlay = this.renderGameResult(result);
            element.insertAdjacentHTML('beforeend', overlay);
        }
    }

    /**
     * Add admin grading button
     */
    addAdminButton() {
        const adminNav = document.querySelector('.admin-nav') || document.querySelector('nav');
        if (adminNav) {
            const btn = document.createElement('button');
            btn.className = 'btn btn-grading-admin';
            btn.innerHTML = '🤖 Grading';
            btn.addEventListener('click', () => this.showAdminPanel());
            adminNav.appendChild(btn);
        }
    }
}

// Global instance
const gradingUI = new GradingUI();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    gradingUI.init();
});

// Export for use in other modules
window.GradingUI = GradingUI;
window.gradingUI = gradingUI;
