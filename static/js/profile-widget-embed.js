(function() {
    const script = document.currentScript;
    if (!script) return;

    const username = (script.dataset.username || '').trim();
    if (!username) return;

    const theme = (script.dataset.theme || 'dark').trim().toLowerCase();
    const compact = ['1', 'true', 'yes'].includes(String(script.dataset.compact || '').toLowerCase());
    const refresh = Math.max(15000, parseInt(script.dataset.refresh || '30000', 10) || 30000);
    const base = new URL(script.src, window.location.href).origin;
    const widgetUrl = new URL('/profile-widget.html', base);
    widgetUrl.searchParams.set('user', username);
    widgetUrl.searchParams.set('theme', theme === 'light' ? 'light' : 'dark');
    if (compact) widgetUrl.searchParams.set('compact', '1');
    widgetUrl.searchParams.set('refresh', String(refresh));

    const iframe = document.createElement('iframe');
    iframe.src = widgetUrl.toString();
    iframe.loading = 'lazy';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.style.width = script.dataset.width || '100%';
    iframe.style.maxWidth = script.dataset.maxWidth || '420px';
    iframe.style.height = script.dataset.height || (compact ? '190px' : '260px');
    iframe.style.border = '0';
    iframe.style.overflow = 'hidden';
    iframe.style.background = 'transparent';
    iframe.setAttribute('scrolling', 'no');
    iframe.setAttribute('title', 'TrustMyRecord Profile Widget for ' + username);

    script.insertAdjacentElement('afterend', iframe);

    window.addEventListener('message', function(event) {
        if (!event || !event.data || event.data.type !== 'tmr-profile-widget-height') return;
        const height = parseInt(event.data.height, 10);
        if (Number.isFinite(height) && height > 0) {
            iframe.style.height = height + 'px';
        }
    });
})();
