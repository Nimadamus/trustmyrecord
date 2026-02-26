/**
 * Email Verification Banner
 * Shows when user is logged in but email is not verified
 */

class VerificationBanner {
    constructor() {
        this.banner = null;
        this.init();
    }

    init() {
        // Check on page load
        this.checkAndShow();
        
        // Check when user logs in
        window.addEventListener('storage', (e) => {
            if (e.key === 'tmr_user' || e.key === 'currentUser') {
                this.checkAndShow();
            }
        });
    }

    checkAndShow() {
        const user = this.getCurrentUser();
        
        if (user && !user.email_verified) {
            this.show(user.email);
        } else {
            this.hide();
        }
    }

    getCurrentUser() {
        // Try backend API user first
        const tmrUser = localStorage.getItem('tmr_user');
        if (tmrUser) {
            try {
                return JSON.parse(tmrUser);
            } catch (e) {
                return null;
            }
        }
        
        // Fallback to old auth
        const currentUser = localStorage.getItem('currentUser');
        if (currentUser) {
            try {
                return JSON.parse(currentUser);
            } catch (e) {
                return null;
            }
        }
        
        return null;
    }

    show(email) {
        if (this.banner) {
            this.hide();
        }

        this.banner = document.createElement('div');
        this.banner.id = 'verification-banner';
        this.banner.innerHTML = `
            <div class="verification-banner-content">
                <span class="verification-icon">📧</span>
                <span class="verification-text">
                    Please verify your email <strong>${email}</strong> to make picks and join competitions.
                </span>
                <button class="verification-btn" onclick="verificationBanner.resendEmail('${email}')">
                    Resend Email
                </button>
                <button class="verification-close" onclick="verificationBanner.hide()">×</button>
            </div>
        `;

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            #verification-banner {
                background: linear-gradient(135deg, #f59e0b, #d97706);
                color: #fff;
                padding: 12px 20px;
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                z-index: 10000;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            }
            .verification-banner-content {
                max-width: 1200px;
                margin: 0 auto;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 16px;
                flex-wrap: wrap;
            }
            .verification-icon {
                font-size: 20px;
            }
            .verification-text {
                font-size: 14px;
            }
            .verification-btn {
                background: #fff;
                color: #d97706;
                border: none;
                padding: 8px 16px;
                border-radius: 6px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
            }
            .verification-btn:hover {
                background: #fef3c7;
            }
            .verification-btn:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }
            .verification-close {
                background: none;
                border: none;
                color: #fff;
                font-size: 24px;
                cursor: pointer;
                padding: 0 4px;
                margin-left: auto;
                opacity: 0.8;
            }
            .verification-close:hover {
                opacity: 1;
            }
            body.banner-visible {
                padding-top: 60px;
            }
            @media (max-width: 600px) {
                .verification-banner-content {
                    flex-direction: column;
                    text-align: center;
                    gap: 10px;
                }
                .verification-close {
                    position: absolute;
                    top: 8px;
                    right: 12px;
                }
            }
        `;

        if (!document.getElementById('verification-banner-styles')) {
            style.id = 'verification-banner-styles';
            document.head.appendChild(style);
        }

        document.body.insertBefore(this.banner, document.body.firstChild);
        document.body.classList.add('banner-visible');
    }

    hide() {
        if (this.banner) {
            this.banner.remove();
            this.banner = null;
            document.body.classList.remove('banner-visible');
        }
    }

    async resendEmail(email) {
        const btn = this.banner.querySelector('.verification-btn');
        btn.disabled = true;
        btn.textContent = 'Sending...';

        try {
            if (window.api && window.api.resendVerification) {
                await window.api.resendVerification(email);
                btn.textContent = 'Sent!';
                setTimeout(() => {
                    btn.textContent = 'Resend Email';
                    btn.disabled = false;
                }, 3000);
            } else {
                throw new Error('API not available');
            }
        } catch (error) {
            alert('Failed to resend: ' + error.message);
            btn.textContent = 'Resend Email';
            btn.disabled = false;
        }
    }
}

// Initialize
const verificationBanner = new VerificationBanner();
