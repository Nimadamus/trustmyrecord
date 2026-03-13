import re

file_path = r'C:\Users\Nima\trustmyrecord\index.html'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

changes = 0

# 1. Replace the ENTIRE forum CSS block with Two Plus Two classic vBulletin style
old_forum_css = """/* Forum 2+2 Grid Layout */
/* =====================================================
   FORUMS - TWO PLUS TWO STYLE TABLE LAYOUT
   ===================================================== */
.forum-container { max-width: 1100px; margin: 0 auto; padding: 20px; }
.forum-header { text-align: center; margin-bottom: 24px; }
.forum-header h2 { font-family: 'Orbitron', sans-serif; color: #fff; margin: 0 0 8px 0; font-size: 28px; }
.forum-header p { color: #6c7380; margin: 0 0 16px 0; }

.forum-search-bar { max-width: 500px; margin: 0 auto; }
.forum-search-bar input {
    width: 100%; padding: 10px 16px; background: #1a1d24; color: #fff;
    border: 1px solid #2d3340; border-radius: 8px; font-size: 14px; outline: none;
}
.forum-search-bar input:focus { border-color: #00ffff; }

.forum-stats-bar {
    display: flex; justify-content: center; gap: 32px; padding: 12px 0;
    margin-bottom: 20px; border-bottom: 1px solid #2d3340;
    font-size: 14px; color: #6c7380;
}
.forum-stats-bar strong { color: #00ffff; }

/* Category Group */
.forum-category-group { margin-bottom: 20px; border-radius: 8px; overflow: hidden; border: 1px solid #2d3340; }
.forum-group-header {
    background: linear-gradient(135deg, #0d1926, #142338); padding: 12px 16px;
    display: flex; align-items: center; gap: 10px;
    border-bottom: 2px solid #00ffff;
}
.forum-group-icon { font-size: 18px; }
.forum-group-name {
    font-family: 'Orbitron', sans-serif; font-size: 13px; font-weight: 700;
    color: #00ffff; letter-spacing: 1.5px; text-transform: uppercase;
}

/* Forum Table */
.forum-cat-table { width: 100%; border-collapse: collapse; }
.forum-cat-table thead th {
    background: #111820; color: #6c7380; font-size: 11px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 1px; padding: 8px 12px;
    text-align: center; border-bottom: 1px solid #2d3340;
}
.forum-cat-table thead th:first-child { text-align: left; }
.forum-col-threads, .forum-col-posts { width: 80px; text-align: center; }
.forum-col-last { width: 200px; }

/* Forum Row */
.forum-row {
    cursor: pointer; transition: background 0.15s;
    border-bottom: 1px solid rgba(255,255,255,0.04);
}
.forum-row:hover { background: rgba(0, 255, 255, 0.04); }
.forum-row:last-child { border-bottom: none; }
.forum-row td { padding: 14px 12px; vertical-align: middle; }

.forum-info { display: flex; align-items: center; gap: 14px; }
.forum-icon {
    width: 42px; height: 42px; border-radius: 10px; display: flex;
    align-items: center; justify-content: center; font-size: 22px;
    background: rgba(0, 255, 255, 0.08); flex-shrink: 0;
}
.forum-details { min-width: 0; }
.forum-name { font-size: 15px; font-weight: 600; color: #fff; margin-bottom: 2px; }
.forum-desc { font-size: 12px; color: #6c7380; line-height: 1.4; }

.forum-row td:nth-child(2), .forum-row td:nth-child(3) {
    text-align: center; font-size: 14px; font-weight: 600; color: #8899aa;
}

/* Last Post Column */
.forum-last-post { font-size: 12px; }
.forum-last-title { color: #b0bec5; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px; }
.forum-last-meta { color: #6c7380; }
.forum-last-meta strong { color: #00ffff; }
.forum-no-posts { color: #4a5568; font-size: 12px; font-style: italic; }

@media (max-width: 768px) {
    .forum-col-last { display: none; }
    .forum-col-threads, .forum-col-posts { width: 50px; }
    .forum-cat-table thead th:last-child { display: none; }
    .forum-stats-bar { gap: 16px; font-size: 12px; }
    .forum-name { font-size: 14px; }
    .forum-desc { display: none; }
}"""

new_forum_css = """/* =====================================================
   FORUMS - CLASSIC TWO PLUS TWO vBULLETIN STYLE
   ===================================================== */

/* --- CORE CONTAINER --- */
.forum-container {
    max-width: 1050px;
    margin: 0 auto;
    padding: 12px;
    font-family: Verdana, Arial, Helvetica, sans-serif;
    font-size: 13px;
    color: #444;
    background: #e8e8e8;
    min-height: 80vh;
}

/* --- BREADCRUMB --- */
.forum-breadcrumb {
    padding: 8px 0 10px;
    font-size: 12px;
    color: #666;
}
.forum-breadcrumb a {
    color: #0066cc;
    text-decoration: none;
    cursor: pointer;
    font-weight: 600;
}
.forum-breadcrumb a:hover { text-decoration: underline; }

/* --- FORUM HEADER --- */
.forum-header {
    text-align: left;
    margin-bottom: 10px;
}
.forum-header h2 {
    font-family: 'Orbitron', Verdana, sans-serif;
    color: #333;
    margin: 0 0 4px 0;
    font-size: 22px;
}
.forum-header p { color: #888; margin: 0; font-size: 12px; }

/* --- SEARCH BAR --- */
.forum-search-bar {
    max-width: 400px;
    margin: 0 0 10px;
}
.forum-search-bar input {
    width: 100%;
    padding: 7px 10px;
    background: #fff;
    color: #333;
    border: 1px solid #a8a8a8;
    border-radius: 3px;
    font-size: 12px;
    font-family: Verdana, sans-serif;
    outline: none;
}
.forum-search-bar input:focus {
    border-color: #336699;
    box-shadow: 0 0 3px rgba(51, 102, 153, 0.3);
}

/* --- STATS BAR --- */
.forum-stats-bar {
    display: flex;
    justify-content: flex-start;
    gap: 24px;
    padding: 8px 12px;
    margin-bottom: 12px;
    background: #fff;
    border: 1px solid #c8c8c8;
    border-radius: 3px;
    font-size: 12px;
    color: #666;
}
.forum-stats-bar strong { color: #336699; font-weight: 700; }

/* --- CATEGORY GROUPS --- */
.forum-category-group {
    margin-bottom: 16px;
    border: 1px solid #a8a8a8;
    border-radius: 0;
    overflow: hidden;
    background: #fff;
}
.forum-group-header {
    background: linear-gradient(180deg, #3b6d99 0%, #2c5577 100%);
    padding: 8px 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid #1e3f5a;
}
.forum-group-icon { font-size: 15px; }
.forum-group-name {
    font-family: Tahoma, Verdana, sans-serif;
    font-size: 12px;
    font-weight: 700;
    color: #fff;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    text-shadow: 0 1px 1px rgba(0,0,0,0.3);
}

/* --- CATEGORY TABLE --- */
.forum-cat-table {
    width: 100%;
    border-collapse: collapse;
}
.forum-cat-table thead th {
    background: linear-gradient(180deg, #d4dce4 0%, #bcc7d1 100%);
    color: #333;
    font-size: 11px;
    font-weight: 700;
    font-family: Tahoma, Verdana, sans-serif;
    text-transform: none;
    letter-spacing: 0;
    padding: 6px 10px;
    text-align: center;
    border-bottom: 1px solid #a8a8a8;
}
.forum-cat-table thead th:first-child { text-align: left; padding-left: 48px; }
.forum-col-threads, .forum-col-posts { width: 75px; text-align: center; }
.forum-col-last { width: 190px; }

/* --- FORUM ROWS --- */
.forum-row {
    cursor: pointer;
    transition: background 0.1s;
    border-bottom: 1px solid #ddd;
    background: #f5f7fa;
}
.forum-row:nth-child(even) { background: #eef1f5; }
.forum-row:hover { background: #dce6f0; }
.forum-row:last-child { border-bottom: none; }
.forum-row td { padding: 10px 10px; vertical-align: middle; }

.forum-info { display: flex; align-items: center; gap: 12px; }
.forum-icon {
    width: 36px;
    height: 36px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    background: linear-gradient(180deg, #4a86b8 0%, #336699 100%);
    flex-shrink: 0;
    color: #fff;
}
.forum-details { min-width: 0; }
.forum-name {
    font-size: 13px;
    font-weight: 700;
    color: #0066cc;
    margin-bottom: 2px;
}
.forum-name:hover { text-decoration: underline; }
.forum-desc { font-size: 11px; color: #777; line-height: 1.4; }

.forum-row td:nth-child(2), .forum-row td:nth-child(3) {
    text-align: center;
    font-size: 13px;
    font-weight: 600;
    color: #555;
}

/* --- LAST POST COLUMN --- */
.forum-last-post { font-size: 11px; }
.forum-last-title {
    color: #0066cc;
    margin-bottom: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 170px;
}
.forum-last-meta { color: #888; font-size: 11px; }
.forum-last-meta strong { color: #0066cc; font-weight: 600; }
.forum-no-posts { color: #999; font-size: 11px; font-style: italic; }

/* --- THREAD TABLE --- */
.forum-table.thread-table {
    width: 100%;
    border-collapse: collapse;
    background: #fff;
    border: 1px solid #a8a8a8;
}
.forum-table.thread-table thead th {
    background: linear-gradient(180deg, #d4dce4 0%, #bcc7d1 100%);
    color: #333;
    font-size: 11px;
    font-weight: 700;
    font-family: Tahoma, Verdana, sans-serif;
    padding: 6px 10px;
    text-align: center;
    border-bottom: 1px solid #a8a8a8;
}
.forum-table.thread-table thead th:first-child { text-align: left; padding-left: 12px; }

/* --- THREAD ROWS --- */
.thread-row {
    cursor: pointer;
    transition: background 0.1s;
    border-bottom: 1px solid #ddd;
    background: #f5f7fa;
}
.thread-row:nth-child(even) { background: #eef1f5; }
.thread-row:hover { background: #dce6f0; }
.thread-row td { padding: 8px 10px; vertical-align: middle; font-size: 12px; }
.thread-row td.thread-replies,
.thread-row td.thread-views { text-align: center; color: #555; font-weight: 600; }
.thread-row td.thread-lastpost { font-size: 11px; color: #888; }
.thread-row td.thread-lastpost strong { color: #0066cc; }

.thread-title-text {
    font-size: 13px;
    font-weight: 700;
    color: #0066cc;
    margin-bottom: 2px;
}
.thread-title-text:hover { text-decoration: underline; }
.thread-starter { font-size: 11px; color: #888; }
.thread-starter strong { color: #336699; }

.pinned-thread { background: #fffde6 !important; }
.pinned-thread:hover { background: #fff5c2 !important; }
.pin-icon { font-size: 12px; margin-right: 4px; }

/* --- FORUM TOOLBAR --- */
.forum-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 0;
    margin-bottom: 8px;
}
.forum-btn {
    background: linear-gradient(180deg, #6699cc 0%, #336699 100%);
    color: #fff;
    border: 1px solid #2c5577;
    border-radius: 3px;
    padding: 6px 16px;
    font-size: 12px;
    font-family: Tahoma, Verdana, sans-serif;
    font-weight: 700;
    cursor: pointer;
    text-shadow: 0 1px 1px rgba(0,0,0,0.2);
}
.forum-btn:hover {
    background: linear-gradient(180deg, #7ab3e0 0%, #4080b0 100%);
}
.forum-sort {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #555;
}
.forum-sort label { font-weight: 600; }
.forum-sort select {
    padding: 4px 8px;
    border: 1px solid #a8a8a8;
    border-radius: 3px;
    font-size: 12px;
    font-family: Verdana, sans-serif;
    background: #fff;
    color: #333;
}

/* --- POST TABLE (Thread Detail) --- */
.post-table {
    width: 100%;
    border-collapse: collapse;
    background: #fff;
    border: 1px solid #a8a8a8;
    margin-bottom: 8px;
}
.post-user-cell {
    width: 160px;
    background: linear-gradient(180deg, #e8eef4 0%, #dde4ec 100%);
    border-right: 1px solid #c8c8c8;
    padding: 10px;
    vertical-align: top;
    text-align: center;
}
.post-userinfo { text-align: center; }
.post-user-avatar {
    width: 80px;
    height: 80px;
    border-radius: 4px;
    border: 2px solid #a8a8a8;
    margin-bottom: 6px;
    cursor: pointer;
    object-fit: cover;
}
.post-username {
    font-size: 13px;
    font-weight: 700;
    color: #0066cc;
    margin-bottom: 4px;
}
.post-user-stats {
    font-size: 10px;
    color: #888;
    line-height: 1.6;
}

.post-content-cell {
    padding: 0;
    vertical-align: top;
}
.post-header-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 12px;
    background: linear-gradient(180deg, #d4dce4 0%, #c4ced8 100%);
    border-bottom: 1px solid #b8b8b8;
    font-size: 11px;
    color: #666;
}
.post-number { font-weight: 700; color: #336699; }
.post-date { color: #888; }

.thread-title-post {
    font-size: 16px;
    font-weight: 700;
    color: #333;
    margin: 12px 12px 4px;
    font-family: Tahoma, Verdana, sans-serif;
}
.post-message {
    padding: 12px;
    font-size: 13px;
    line-height: 1.7;
    color: #333;
}
.post-footer {
    padding: 8px 12px;
    border-top: 1px solid #ddd;
    display: flex;
    justify-content: flex-end;
}
.post-voting { display: flex; gap: 8px; }
.vote-btn-classic {
    background: linear-gradient(180deg, #f0f0f0 0%, #ddd 100%);
    border: 1px solid #b8b8b8;
    border-radius: 3px;
    padding: 3px 10px;
    font-size: 12px;
    cursor: pointer;
    color: #555;
}
.vote-btn-classic:hover { background: linear-gradient(180deg, #e0e8f0 0%, #c8d4e0 100%); }
.vote-btn-classic.voted { background: linear-gradient(180deg, #cde0f5 0%, #a8c8e8 100%); border-color: #6699cc; color: #336699; font-weight: 700; }

/* --- QUICK REPLY --- */
.quick-reply-box {
    background: #fff;
    border: 1px solid #a8a8a8;
    padding: 16px;
    margin-top: 12px;
}
.quick-reply-box h3 {
    font-family: Tahoma, Verdana, sans-serif;
    font-size: 14px;
    color: #333;
    margin: 0 0 10px;
    padding-bottom: 6px;
    border-bottom: 1px solid #ddd;
}
.quick-reply-box textarea {
    width: 100%;
    padding: 10px;
    border: 1px solid #a8a8a8;
    border-radius: 3px;
    font-size: 13px;
    font-family: Verdana, sans-serif;
    background: #fff;
    color: #333;
    resize: vertical;
    margin-bottom: 10px;
    box-sizing: border-box;
}
.quick-reply-box textarea:focus {
    border-color: #336699;
    outline: none;
}

/* --- CREATE THREAD MODAL --- */
.classic-modal {
    background: #f0f0f0 !important;
    border: 2px solid #336699 !important;
    border-radius: 4px !important;
    color: #333 !important;
    max-width: 600px;
}
.classic-modal h2 {
    font-family: Tahoma, Verdana, sans-serif !important;
    color: #fff !important;
    font-size: 16px !important;
    background: linear-gradient(180deg, #3b6d99, #2c5577) !important;
    margin: -20px -30px 16px !important;
    padding: 10px 16px !important;
    border-radius: 2px 2px 0 0;
}
.classic-modal .close-modal {
    color: #fff !important;
    z-index: 10;
}
.classic-modal .form-group {
    margin-bottom: 12px;
}
.classic-modal .form-group label {
    display: block;
    font-size: 12px;
    font-weight: 700;
    color: #333;
    margin-bottom: 4px;
    font-family: Tahoma, Verdana, sans-serif;
}
.classic-modal .form-group input,
.classic-modal .form-group textarea {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid #a8a8a8;
    border-radius: 3px;
    font-size: 13px;
    font-family: Verdana, sans-serif;
    background: #fff;
    color: #333;
    box-sizing: border-box;
}
.classic-modal .form-group input:focus,
.classic-modal .form-group textarea:focus {
    border-color: #336699;
    outline: none;
}

/* --- FORUM BANNER (override dark theme) --- */
#forums .page-banner.forum-banner {
    background: linear-gradient(135deg, #2c5577, #1e3f5a) !important;
    border: 1px solid #1e3f5a;
    margin-bottom: 12px;
}
#forums .page-banner.forum-banner .banner-content h2 {
    color: #fff;
    -webkit-text-fill-color: #fff;
}
#forums .page-banner.forum-banner .banner-content h2 .highlight {
    color: #ffd700;
    -webkit-text-fill-color: #ffd700;
}
#forums .page-banner.forum-banner .banner-content p {
    color: #c8d8e8;
}

/* --- LASTPOST META in threads list --- */
.lastpost-info { font-size: 11px; }
.lastpost-meta { color: #888; font-size: 11px; }
.lastpost-meta strong { color: #0066cc; }

/* --- MOBILE RESPONSIVE --- */
@media (max-width: 768px) {
    .forum-container { padding: 8px; }
    .forum-col-last { display: none; }
    .forum-col-threads, .forum-col-posts { width: 45px; }
    .forum-cat-table thead th:last-child { display: none; }
    .forum-table.thread-table thead th:last-child { display: none; }
    .thread-row td.thread-lastpost { display: none; }
    .forum-stats-bar { gap: 12px; font-size: 11px; flex-wrap: wrap; }
    .forum-name { font-size: 12px; }
    .forum-desc { display: none; }
    .post-user-cell { width: 90px; padding: 6px; }
    .post-user-avatar { width: 50px; height: 50px; }
    .post-username { font-size: 11px; }
    .post-user-stats { font-size: 9px; }
    .forum-toolbar { flex-direction: column; gap: 8px; align-items: flex-start; }
}"""

if old_forum_css in content:
    content = content.replace(old_forum_css, new_forum_css)
    changes += 1
    print(f"1. Replaced entire forum CSS block with 2+2 vBulletin style")
else:
    print("1. SKIPPED - Could not find old forum CSS block")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"\nDone! {changes} changes applied.")
