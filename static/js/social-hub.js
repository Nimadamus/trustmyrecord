// SOCIAL HUB - Trust My Record Social Media Features
// User profiles, messaging, search, and social interactions

// =====================================================
// PROFILE PAGE UPDATE
// =====================================================

function updateProfilePage() {
    const user = JSON.parse(localStorage.getItem('currentUser') || 'null');
    if (!user) return;

    // Update profile info
    const displayName = document.getElementById('profileDisplayName');
    const username = document.getElementById('profileUsername');
    const bio = document.getElementById('profileBio');
    const avatar = document.getElementById('profileAvatarImage');

    if (displayName) displayName.textContent = user.displayName || user.username;
    if (username) username.textContent = user.username;
    if (bio) bio.textContent = user.bio || 'No bio yet. Click Edit Profile to add one.';
    if (avatar && user.avatar) avatar.src = user.avatar;

    // Update stats
    updateProfileStats();

    // Inject social action hub if not exists
    injectSocialHub();
}

function updateProfileStats() {
    const picks = window._cachedBackendPicks || [];
    const graded = picks.filter(p => p.status === 'won' || p.status === 'lost');
    const wins = graded.filter(p => p.status === 'won').length;
    const losses = graded.filter(p => p.status === 'lost').length;

    let totalUnits = 0;
    graded.forEach(p => {
        totalUnits += (parseFloat(p.result_units) || 0);
    });

    const winRate = graded.length > 0 ? ((wins / graded.length) * 100).toFixed(1) : '0.0';
    const roi = graded.length > 0 ? ((totalUnits / graded.length) * 100).toFixed(1) : '0.0';

    // Update stat elements
    const els = {
        'profileTotalPicks': picks.length,
        'profileWinRate': winRate + '%',
        'profileUnits': (totalUnits > 0 ? '+' : '') + totalUnits.toFixed(2),
        'profileROI': roi + '%',
        'profileRecord': wins + '-' + losses
    };

    for (const [id, value] of Object.entries(els)) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }
}

// =====================================================
// SOCIAL ACTION HUB
// =====================================================

function injectSocialHub() {
    // Check if hub already exists
    if (document.getElementById('socialActionHub')) return;

    // Find the profile content area
    const profileCard = document.querySelector('.profile-left-column');
    if (!profileCard) return;

    const hubHTML = `
    <div id="socialActionHub" class="profile-card social-hub-card" style="margin-top: 20px;">
        <h3 style="margin-bottom: 20px; color: var(--neon-cyan);">Quick Actions</h3>
        <div class="social-action-grid">
            <button class="social-action-btn" onclick="showSection('picks')">
                <span class="action-icon">🎯</span>
                <span class="action-label">Make Picks</span>
            </button>
            <button class="social-action-btn" onclick="showSection('forums')">
                <span class="action-icon">💬</span>
                <span class="action-label">Forums</span>
            </button>
            <button class="social-action-btn" onclick="showSection('leaderboards')">
                <span class="action-icon">🏆</span>
                <span class="action-label">Leaderboards</span>
            </button>
            <button class="social-action-btn" onclick="showSection('feed')">
                <span class="action-icon">📰</span>
                <span class="action-label">Feed</span>
            </button>
            <button class="social-action-btn" onclick="openCreatePoll()">
                <span class="action-icon">📊</span>
                <span class="action-label">Create Poll</span>
            </button>
            <button class="social-action-btn" onclick="openCreateTrivia()">
                <span class="action-icon">🧠</span>
                <span class="action-label">Create Trivia</span>
            </button>
            <button class="social-action-btn" onclick="openUserSearch()">
                <span class="action-icon">🔍</span>
                <span class="action-label">Find Users</span>
            </button>
            <button class="social-action-btn" onclick="openMessages()">
                <span class="action-icon">✉️</span>
                <span class="action-label">Messages</span>
                <span class="msg-badge" id="unreadMsgBadge" style="display:none;">0</span>
            </button>
            <button class="social-action-btn" onclick="showSection('groups')">
                <span class="action-icon">👥</span>
                <span class="action-label">Groups</span>
            </button>
            <button class="social-action-btn" onclick="openChallenges()">
                <span class="action-icon">⚔️</span>
                <span class="action-label">Challenges</span>
            </button>
        </div>
    </div>

    <style>
    .social-hub-card {
        background: linear-gradient(135deg, rgba(0,255,255,0.05), rgba(255,215,0,0.05)) !important;
        border: 2px solid var(--neon-cyan) !important;
    }
    .social-action-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
    }
    .social-action-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 15px 10px;
        background: rgba(0,0,0,0.3);
        border: 1px solid rgba(0,255,255,0.3);
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.3s ease;
        position: relative;
    }
    .social-action-btn:hover {
        background: rgba(0,255,255,0.1);
        border-color: var(--neon-cyan);
        transform: translateY(-3px);
        box-shadow: 0 5px 20px rgba(0,255,255,0.2);
    }
    .action-icon {
        font-size: 1.8rem;
        margin-bottom: 8px;
    }
    .action-label {
        color: var(--text-primary);
        font-size: 0.85rem;
        font-weight: 600;
    }
    .msg-badge {
        position: absolute;
        top: 5px;
        right: 5px;
        background: var(--neon-red, #ff0040);
        color: white;
        font-size: 0.7rem;
        padding: 2px 6px;
        border-radius: 10px;
        font-weight: 700;
    }
    @media (max-width: 600px) {
        .social-action-grid {
            grid-template-columns: repeat(3, 1fr);
        }
        .social-action-btn {
            padding: 12px 8px;
        }
        .action-icon {
            font-size: 1.5rem;
        }
        .action-label {
            font-size: 0.75rem;
        }
    }
    </style>
    `;

    profileCard.insertAdjacentHTML('afterbegin', hubHTML);
    updateUnreadMessages();
}

// =====================================================
// USER SEARCH
// =====================================================

function openUserSearch() {
    let modal = document.getElementById('userSearchModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'userSearchModal';
        modal.className = 'modal';
        modal.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:10000;justify-content:center;align-items:center;';
        modal.innerHTML = `
            <div style="background:var(--card-bg,#1a1a2e);border:1px solid var(--neon-cyan);border-radius:16px;width:90%;max-width:500px;max-height:80vh;overflow:hidden;display:flex;flex-direction:column;">
                <div style="padding:20px;border-bottom:1px solid rgba(0,255,255,0.2);">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <h2 style="color:var(--neon-cyan);margin:0;">Find Users</h2>
                        <span onclick="closeUserSearch()" style="font-size:24px;cursor:pointer;color:var(--text-muted);">&times;</span>
                    </div>
                    <input type="text" id="userSearchInput" placeholder="Search by username..."
                           oninput="searchUsers(this.value)"
                           style="width:100%;padding:12px;margin-top:15px;background:rgba(0,0,0,0.3);border:1px solid rgba(0,255,255,0.3);border-radius:8px;color:white;font-size:1rem;">
                </div>
                <div id="userSearchResults" style="flex:1;overflow-y:auto;padding:15px;">
                    <p style="color:var(--text-muted);text-align:center;">Enter a username to search</p>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
    document.getElementById('userSearchInput').focus();
}

function closeUserSearch() {
    const modal = document.getElementById('userSearchModal');
    if (modal) modal.style.display = 'none';
}

function searchUsers(query) {
    const resultsDiv = document.getElementById('userSearchResults');
    if (!query || query.length < 2) {
        resultsDiv.innerHTML = '<p style="color:var(--text-muted);text-align:center;">Enter at least 2 characters</p>';
        return;
    }

    const users = JSON.parse(localStorage.getItem('trustmyrecord_users') || '[]');
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const matches = users.filter(u =>
        u.username.toLowerCase().includes(query.toLowerCase()) ||
        (u.displayName && u.displayName.toLowerCase().includes(query.toLowerCase()))
    ).filter(u => u.id !== currentUser.id);

    if (matches.length === 0) {
        resultsDiv.innerHTML = '<p style="color:var(--text-muted);text-align:center;">No users found</p>';
        return;
    }

    resultsDiv.innerHTML = matches.map(user => `
        <div style="display:flex;align-items:center;padding:12px;background:rgba(0,255,255,0.05);border-radius:8px;margin-bottom:10px;">
            <img src="${user.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + user.username}"
                 style="width:50px;height:50px;border-radius:50%;margin-right:15px;">
            <div style="flex:1;">
                <div style="font-weight:700;color:var(--text-primary);">${user.displayName || user.username}</div>
                <div style="color:var(--text-muted);font-size:0.85rem;">@${user.username}</div>
            </div>
            <div style="display:flex;gap:8px;">
                <button onclick="viewUserProfile('${user.id}')" style="background:var(--neon-cyan);color:#000;border:none;padding:8px 12px;border-radius:6px;cursor:pointer;font-weight:600;">View</button>
                <button onclick="sendMessageTo('${user.id}','${user.username}')" style="background:transparent;color:var(--neon-cyan);border:1px solid var(--neon-cyan);padding:8px 12px;border-radius:6px;cursor:pointer;">Message</button>
            </div>
        </div>
    `).join('');
}

function viewUserProfile(userId) {
    closeUserSearch();
    // Store the user ID to view
    localStorage.setItem('viewingUserId', userId);
    showSection('viewProfile');
    loadUserProfile(userId);
}

function loadUserProfile(userId) {
    const users = JSON.parse(localStorage.getItem('trustmyrecord_users') || '[]');
    const user = users.find(u => u.id === userId);
    if (!user) return;

    // Update profile section to show this user
    const displayName = document.getElementById('profileDisplayName');
    const username = document.getElementById('profileUsername');
    if (displayName) displayName.textContent = user.displayName || user.username;
    if (username) username.textContent = user.username;
}

// =====================================================
// MESSAGING SYSTEM
// =====================================================

function openMessages() {
    let modal = document.getElementById('messagesModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'messagesModal';
        modal.className = 'modal';
        modal.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:10000;justify-content:center;align-items:center;';
        modal.innerHTML = `
            <div style="background:var(--card-bg,#1a1a2e);border:1px solid var(--neon-cyan);border-radius:16px;width:90%;max-width:600px;height:80vh;display:flex;flex-direction:column;">
                <div style="padding:20px;border-bottom:1px solid rgba(0,255,255,0.2);display:flex;justify-content:space-between;align-items:center;">
                    <h2 style="color:var(--neon-cyan);margin:0;">Messages</h2>
                    <span onclick="closeMessages()" style="font-size:24px;cursor:pointer;color:var(--text-muted);">&times;</span>
                </div>
                <div id="conversationsList" style="flex:1;overflow-y:auto;padding:15px;">
                    <!-- Conversations will be loaded here -->
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
    loadConversations();
}

function closeMessages() {
    const modal = document.getElementById('messagesModal');
    if (modal) modal.style.display = 'none';
}

function loadConversations() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const messages = JSON.parse(localStorage.getItem('trustmyrecord_messages') || '[]');
    const users = JSON.parse(localStorage.getItem('trustmyrecord_users') || '[]');

    // Group messages by conversation
    const conversations = {};
    messages.forEach(msg => {
        if (msg.fromId === currentUser.id || msg.toId === currentUser.id) {
            const otherId = msg.fromId === currentUser.id ? msg.toId : msg.fromId;
            if (!conversations[otherId]) {
                conversations[otherId] = { messages: [], lastMessage: null };
            }
            conversations[otherId].messages.push(msg);
            if (!conversations[otherId].lastMessage || new Date(msg.timestamp) > new Date(conversations[otherId].lastMessage.timestamp)) {
                conversations[otherId].lastMessage = msg;
            }
        }
    });

    const listDiv = document.getElementById('conversationsList');
    const convIds = Object.keys(conversations);

    if (convIds.length === 0) {
        listDiv.innerHTML = `
            <div style="text-align:center;padding:40px;color:var(--text-muted);">
                <div style="font-size:3rem;margin-bottom:15px;">✉️</div>
                <p>No messages yet</p>
                <p style="font-size:0.85rem;margin-top:10px;">Search for users to start a conversation!</p>
                <button onclick="closeMessages();openUserSearch();" style="margin-top:15px;background:var(--neon-cyan);color:#000;border:none;padding:12px 24px;border-radius:8px;cursor:pointer;font-weight:700;">Find Users</button>
            </div>
        `;
        return;
    }

    listDiv.innerHTML = convIds.map(userId => {
        const conv = conversations[userId];
        const user = users.find(u => u.id === userId) || { username: 'Unknown', avatar: '' };
        const unread = conv.messages.filter(m => m.toId === currentUser.id && !m.read).length;

        return `
            <div onclick="openConversation('${userId}')" style="display:flex;align-items:center;padding:15px;background:rgba(0,255,255,0.05);border-radius:8px;margin-bottom:10px;cursor:pointer;${unread > 0 ? 'border-left:3px solid var(--neon-cyan);' : ''}">
                <img src="${user.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + user.username}"
                     style="width:50px;height:50px;border-radius:50%;margin-right:15px;">
                <div style="flex:1;overflow:hidden;">
                    <div style="font-weight:700;color:var(--text-primary);">${user.displayName || user.username}</div>
                    <div style="color:var(--text-muted);font-size:0.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${conv.lastMessage?.content || ''}</div>
                </div>
                ${unread > 0 ? `<span style="background:var(--neon-cyan);color:#000;padding:4px 10px;border-radius:12px;font-weight:700;font-size:0.8rem;">${unread}</span>` : ''}
            </div>
        `;
    }).join('');
}

function openConversation(userId) {
    const users = JSON.parse(localStorage.getItem('trustmyrecord_users') || '[]');
    const user = users.find(u => u.id === userId) || { username: 'Unknown' };
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const messages = JSON.parse(localStorage.getItem('trustmyrecord_messages') || '[]');

    // Mark messages as read
    const updatedMessages = messages.map(msg => {
        if (msg.fromId === userId && msg.toId === currentUser.id && !msg.read) {
            return { ...msg, read: true };
        }
        return msg;
    });
    localStorage.setItem('trustmyrecord_messages', JSON.stringify(updatedMessages));

    const convMessages = updatedMessages.filter(m =>
        (m.fromId === userId && m.toId === currentUser.id) ||
        (m.fromId === currentUser.id && m.toId === userId)
    ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const listDiv = document.getElementById('conversationsList');
    listDiv.innerHTML = `
        <div style="display:flex;align-items:center;padding-bottom:15px;border-bottom:1px solid rgba(0,255,255,0.2);margin-bottom:15px;">
            <button onclick="loadConversations()" style="background:none;border:none;color:var(--neon-cyan);cursor:pointer;font-size:1.2rem;margin-right:15px;">←</button>
            <img src="${user.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + user.username}" style="width:40px;height:40px;border-radius:50%;margin-right:12px;">
            <span style="font-weight:700;color:var(--text-primary);">${user.displayName || user.username}</span>
        </div>
        <div id="messageThread" style="flex:1;overflow-y:auto;padding-bottom:70px;">
            ${convMessages.map(msg => `
                <div style="display:flex;justify-content:${msg.fromId === currentUser.id ? 'flex-end' : 'flex-start'};margin-bottom:10px;">
                    <div style="max-width:75%;padding:12px 16px;border-radius:16px;background:${msg.fromId === currentUser.id ? 'linear-gradient(135deg,var(--neon-cyan),#00cccc)' : 'rgba(255,255,255,0.1)'};color:${msg.fromId === currentUser.id ? '#000' : 'var(--text-primary)'};">
                        <div>${msg.content}</div>
                        <div style="font-size:0.7rem;opacity:0.7;margin-top:5px;">${new Date(msg.timestamp).toLocaleTimeString()}</div>
                    </div>
                </div>
            `).join('')}
        </div>
        <div style="position:absolute;bottom:0;left:0;right:0;padding:15px;background:var(--card-bg);border-top:1px solid rgba(0,255,255,0.2);">
            <div style="display:flex;gap:10px;">
                <input type="text" id="messageInput" placeholder="Type a message..."
                       style="flex:1;padding:12px;background:rgba(0,0,0,0.3);border:1px solid rgba(0,255,255,0.3);border-radius:20px;color:white;">
                <button onclick="sendMessage('${userId}')" style="background:var(--neon-cyan);color:#000;border:none;padding:12px 20px;border-radius:20px;cursor:pointer;font-weight:700;">Send</button>
            </div>
        </div>
    `;

    // Scroll to bottom
    const thread = document.getElementById('messageThread');
    if (thread) thread.scrollTop = thread.scrollHeight;

    // Enter key to send
    document.getElementById('messageInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage(userId);
    });

    updateUnreadMessages();
}

function sendMessage(toUserId) {
    const input = document.getElementById('messageInput');
    const content = input.value.trim();
    if (!content) return;

    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const messages = JSON.parse(localStorage.getItem('trustmyrecord_messages') || '[]');

    const newMessage = {
        id: 'msg_' + Date.now(),
        fromId: currentUser.id,
        toId: toUserId,
        content,
        timestamp: new Date().toISOString(),
        read: false
    };

    messages.push(newMessage);
    localStorage.setItem('trustmyrecord_messages', JSON.stringify(messages));

    input.value = '';
    openConversation(toUserId);
}

function sendMessageTo(userId, username) {
    closeUserSearch();
    openMessages();
    setTimeout(() => openConversation(userId), 100);
}

function updateUnreadMessages() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const messages = JSON.parse(localStorage.getItem('trustmyrecord_messages') || '[]');
    const unread = messages.filter(m => m.toId === currentUser.id && !m.read).length;

    const badge = document.getElementById('unreadMsgBadge');
    if (badge) {
        if (unread > 0) {
            badge.textContent = unread;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    }
}

// =====================================================
// POLLS & TRIVIA
// =====================================================

function openCreatePoll() {
    let modal = document.getElementById('createPollModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'createPollModal';
        modal.className = 'modal';
        modal.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:10000;justify-content:center;align-items:center;';
        modal.innerHTML = `
            <div style="background:var(--card-bg,#1a1a2e);border:1px solid var(--neon-gold);border-radius:16px;width:90%;max-width:500px;padding:30px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                    <h2 style="color:var(--neon-gold);margin:0;">Create Poll</h2>
                    <span onclick="closeCreatePoll()" style="font-size:24px;cursor:pointer;color:var(--text-muted);">&times;</span>
                </div>
                <input type="text" id="pollQuestion" placeholder="Ask a question..." style="width:100%;padding:12px;margin-bottom:15px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,215,0,0.3);border-radius:8px;color:white;">
                <input type="text" id="pollOption1" placeholder="Option 1" style="width:100%;padding:12px;margin-bottom:10px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,215,0,0.3);border-radius:8px;color:white;">
                <input type="text" id="pollOption2" placeholder="Option 2" style="width:100%;padding:12px;margin-bottom:10px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,215,0,0.3);border-radius:8px;color:white;">
                <input type="text" id="pollOption3" placeholder="Option 3 (optional)" style="width:100%;padding:12px;margin-bottom:10px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,215,0,0.3);border-radius:8px;color:white;">
                <input type="text" id="pollOption4" placeholder="Option 4 (optional)" style="width:100%;padding:12px;margin-bottom:20px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,215,0,0.3);border-radius:8px;color:white;">
                <button onclick="submitPoll()" style="width:100%;background:linear-gradient(135deg,var(--neon-gold),#ffaa00);color:#000;border:none;padding:15px;border-radius:8px;font-weight:700;cursor:pointer;font-size:1rem;">Create Poll</button>
            </div>
        `;
        document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
}

function closeCreatePoll() {
    const modal = document.getElementById('createPollModal');
    if (modal) modal.style.display = 'none';
}

function submitPoll() {
    const question = document.getElementById('pollQuestion').value.trim();
    const options = [
        document.getElementById('pollOption1').value.trim(),
        document.getElementById('pollOption2').value.trim(),
        document.getElementById('pollOption3').value.trim(),
        document.getElementById('pollOption4').value.trim()
    ].filter(o => o);

    if (!question || options.length < 2) {
        alert('Please enter a question and at least 2 options');
        return;
    }

    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const polls = JSON.parse(localStorage.getItem('trustmyrecord_polls') || '[]');

    const newPoll = {
        id: 'poll_' + Date.now(),
        authorId: currentUser.id,
        authorUsername: currentUser.username,
        question,
        options: options.map(o => ({ text: o, votes: 0 })),
        timestamp: new Date().toISOString(),
        totalVotes: 0
    };

    polls.push(newPoll);
    localStorage.setItem('trustmyrecord_polls', JSON.stringify(polls));

    alert('Poll created successfully!');
    closeCreatePoll();
}

function openCreateTrivia() {
    let modal = document.getElementById('createTriviaModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'createTriviaModal';
        modal.className = 'modal';
        modal.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:10000;justify-content:center;align-items:center;';
        modal.innerHTML = `
            <div style="background:var(--card-bg,#1a1a2e);border:1px solid var(--neon-purple);border-radius:16px;width:90%;max-width:500px;padding:30px;max-height:80vh;overflow-y:auto;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                    <h2 style="color:var(--neon-purple);margin:0;">Create Trivia</h2>
                    <span onclick="closeCreateTrivia()" style="font-size:24px;cursor:pointer;color:var(--text-muted);">&times;</span>
                </div>
                <input type="text" id="triviaQuestion" placeholder="Trivia question..." style="width:100%;padding:12px;margin-bottom:15px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,0,255,0.3);border-radius:8px;color:white;">
                <p style="color:var(--text-muted);margin-bottom:10px;font-size:0.85rem;">Enter 4 options (mark the correct one):</p>
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                    <input type="radio" name="correctAnswer" value="0" checked>
                    <input type="text" id="triviaOption0" placeholder="Option A" style="flex:1;padding:12px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,0,255,0.3);border-radius:8px;color:white;">
                </div>
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                    <input type="radio" name="correctAnswer" value="1">
                    <input type="text" id="triviaOption1" placeholder="Option B" style="flex:1;padding:12px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,0,255,0.3);border-radius:8px;color:white;">
                </div>
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                    <input type="radio" name="correctAnswer" value="2">
                    <input type="text" id="triviaOption2" placeholder="Option C" style="flex:1;padding:12px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,0,255,0.3);border-radius:8px;color:white;">
                </div>
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
                    <input type="radio" name="correctAnswer" value="3">
                    <input type="text" id="triviaOption3" placeholder="Option D" style="flex:1;padding:12px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,0,255,0.3);border-radius:8px;color:white;">
                </div>
                <button onclick="submitTrivia()" style="width:100%;background:linear-gradient(135deg,var(--neon-purple),#cc00cc);color:white;border:none;padding:15px;border-radius:8px;font-weight:700;cursor:pointer;font-size:1rem;">Create Trivia</button>
            </div>
        `;
        document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
}

function closeCreateTrivia() {
    const modal = document.getElementById('createTriviaModal');
    if (modal) modal.style.display = 'none';
}

function submitTrivia() {
    const question = document.getElementById('triviaQuestion').value.trim();
    const options = [
        document.getElementById('triviaOption0').value.trim(),
        document.getElementById('triviaOption1').value.trim(),
        document.getElementById('triviaOption2').value.trim(),
        document.getElementById('triviaOption3').value.trim()
    ];
    const correctAnswer = parseInt(document.querySelector('input[name="correctAnswer"]:checked').value);

    if (!question || options.some(o => !o)) {
        alert('Please fill in all fields');
        return;
    }

    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const trivia = JSON.parse(localStorage.getItem('trustmyrecord_trivia') || '[]');

    const newTrivia = {
        id: 'trivia_' + Date.now(),
        authorId: currentUser.id,
        authorUsername: currentUser.username,
        question,
        options,
        correctAnswer,
        timestamp: new Date().toISOString()
    };

    trivia.push(newTrivia);
    localStorage.setItem('trustmyrecord_trivia', JSON.stringify(trivia));

    alert('Trivia question created successfully!');
    closeCreateTrivia();
}

// =====================================================
// CHALLENGES
// =====================================================

function openChallenges() {
    alert('Challenges feature coming soon! Challenge other users to head-to-head pick competitions.');
}

// =====================================================
// INITIALIZE
// =====================================================

document.addEventListener('DOMContentLoaded', function() {
    // Check if user is logged in and update profile
    const user = JSON.parse(localStorage.getItem('currentUser') || 'null');
    if (user) {
        setTimeout(updateProfilePage, 500);
    }
});

// Export functions
window.updateProfilePage = updateProfilePage;
window.updateProfileStats = updateProfileStats;
window.openUserSearch = openUserSearch;
window.closeUserSearch = closeUserSearch;
window.searchUsers = searchUsers;
window.viewUserProfile = viewUserProfile;
window.openMessages = openMessages;
window.closeMessages = closeMessages;
window.openConversation = openConversation;
window.sendMessage = sendMessage;
window.sendMessageTo = sendMessageTo;
window.openCreatePoll = openCreatePoll;
window.closeCreatePoll = closeCreatePoll;
window.submitPoll = submitPoll;
window.openCreateTrivia = openCreateTrivia;
window.closeCreateTrivia = closeCreateTrivia;
window.submitTrivia = submitTrivia;
window.openChallenges = openChallenges;
