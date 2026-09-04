/* Shared member credential for the sportsbook suites.
 *
 * A saved token file expires, and a run that carries an expired one still
 * exercises the board but reports a false failure on /api/auth/me. So the
 * harness mints its own short-lived token the same way routes/auth.js does,
 * from the API's signing secret kept OUTSIDE the repo. A saved token is still
 * honoured while it is actually valid.
 *
 *   --token <file>        a saved JWT; used only if it has >2 minutes left
 *   --jwt-secret <file>   the signing secret (default ~/.tmr_jwt_secret)
 *   --user <id>           the member to run as (default 1)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

function b64url(buf) {
    return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function signJwt(payload, secret) {
    const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = b64url(JSON.stringify(payload));
    const sig = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest();
    return `${head}.${body}.${b64url(sig)}`;
}
function jwtExpiry(tok) {
    try {
        const raw = tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(Buffer.from(raw, 'base64').toString('utf8')).exp || 0;
    } catch (_) { return 0; }
}
function firstFile(list) { for (const f of list) if (f && fs.existsSync(f)) return f; return ''; }

function resolveCredential(args) {
    args = args || {};
    const tokenPath = (args.token && args.token.trim()) || process.env.TMR_TEST_JWT_FILE || '';
    const secretPath = firstFile([
        args['jwt-secret'] && args['jwt-secret'].trim(),
        process.env.TMR_JWT_SECRET_FILE,
        path.join(os.homedir(), '.tmr_jwt_secret'),
    ]);
    const userId = Number(args.user || process.env.TMR_TEST_USER_ID || 1);

    if (tokenPath && fs.existsSync(tokenPath)) {
        const saved = fs.readFileSync(tokenPath, 'utf8').trim();
        if (jwtExpiry(saved) > Date.now() / 1000 + 120) {
            return { token: saved, userId, source: `saved token ${tokenPath}` };
        }
        console.log(`NOTE: ${tokenPath} is expired; minting a fresh test token instead.`);
    }
    if (secretPath) {
        const secret = fs.readFileSync(secretPath, 'utf8').trim();
        const now = Math.floor(Date.now() / 1000);
        return {
            token: signJwt({ userId, sessionId: `sbn-verify-${now}`, iat: now, exp: now + 3600 }, secret),
            userId,
            source: `minted for user ${userId} from ${secretPath}`,
        };
    }
    return { token: '', userId, source: '' };
}

module.exports = { resolveCredential, signJwt, jwtExpiry };
