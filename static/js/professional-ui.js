/**
 * Trust My Record - Professional UI Components
 * Toast notifications, modals, and UI enhancements
 */

// Toast Notification System
const TMR_UI = {
    toastContainer: null,
    
    init: function() {
        // Create toast container
        this.toastContainer = document.createElement('div');
        this.toastContainer.className = 'tmr-toast-container';
        document.body.appendChild(this.toastContainer);
        
        // Expose showToast globally
        window.showToast = this.showToast.bind(this);
        
        console.log('[TMR UI] Professional UI initialized');
    },
    
    /**
     * Show a toast notification
     * @param {string} message - Toast message
     * @param {string} type - 'success', 'error', 'warning', 'info'
     * @param {number} duration - Duration in ms (default 4000)
     */
    showToast: function(message, type = 'info', duration = 4000) {
        const toast = document.createElement('div');
        toast.className = `tmr-toast ${type}`;
        
        const icon = this.getIconForType(type);
        const title = this.getTitleForType(type);
        
        toast.innerHTML = `
            <span style="font-size: 20px;">${icon}</span>
            <div class="tmr-toast-content">
                <div class="tmr-toast-title">${title}</div>
                <div class="tmr-toast-message">${message}</div>
            </div>
            <button class="tmr-toast-close" onclick="this.parentElement.remove()">&times;</button>
        `;
        
        this.toastContainer.appendChild(toast);
        
        // Auto remove
        setTimeout(() => {
            toast.classList.add('hiding');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },
    
    getIconForType: function(type) {
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };
        return icons[type] || icons.info;
    },
    
    getTitleForType: function(type) {
        const titles = {
            success: 'Success',
            error: 'Error',
            warning: 'Warning',
            info: 'Info'
        };
        return titles[type] || 'Info';
    },
    
    /**
     * Confirm dialog
     */
    confirm: function(message, onConfirm, onCancel) {
        // Simple confirm for now
        if (confirm(message)) {
            onConfirm && onConfirm();
        } else {
            onCancel && onCancel();
        }
    },
    
    /**
     * Format currency
     */
    formatCurrency: function(amount) {
        const num = parseFloat(amount) || 0;
        if (num >= 0) {
            return `+$${num.toFixed(2)}`;
        } else {
            return `-$${Math.abs(num).toFixed(2)}`;
        }
    },
    
    /**
     * Format date
     */
    formatDate: function(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        
        // Less than 1 hour
        if (diff < 3600000) {
            const mins = Math.floor(diff / 60000);
            return mins < 1 ? 'Just now' : `${mins}m ago`;
        }
        
        // Less than 24 hours
        if (diff < 86400000) {
            const hours = Math.floor(diff / 3600000);
            return `${hours}h ago`;
        }
        
        // Less than 7 days
        if (diff < 604800000) {
            const days = Math.floor(diff / 86400000);
            return `${days}d ago`;
        }
        
        return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
    },
    
    /**
     * Create loading skeleton
     */
    createSkeleton: function(width = '100%', height = '20px') {
        const el = document.createElement('div');
        el.className = 'tmr-skeleton';
        el.style.width = width;
        el.style.height = height;
        return el;
    },
    
    /**
     * Debounce function
     */
    debounce: function(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },
    
    /**
     * Copy to clipboard
     */
    copyToClipboard: async function(text) {
        try {
            await navigator.clipboard.writeText(text);
            this.showToast('Copied to clipboard!', 'success');
            return true;
        } catch (err) {
            this.showToast('Failed to copy', 'error');
            return false;
        }
    }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    TMR_UI.init();
});

// Expose globally
window.TMR_UI = TMR_UI;
