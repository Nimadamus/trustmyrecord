// =========================================================================
// ARCHIVED - DISABLED - NOT PART OF THE ACTIVE PRODUCT
// =========================================================================
// Retained as reference code only. No page loads this file: the wallet-connect
// card it drove (Connect Wallet button, BaseScan contract link, BASE MAINNET
// badge, "Claim (Coming Soon)") was removed from /wallet/ on 2026-08-04 and the
// <script> tag that included it was removed with it.
//
// It must not be reinstated. On-chain integration, token distribution and any
// language promising a future claim are on the must-stay-disabled list in
// trustmyrecord-backend/docs/compliance/README.md, pending the legal questions
// in that folder's OPEN_LEGAL_QUESTIONS.md (Q1, Q2).
//
// Kept rather than deleted so the history of what was built stays readable.
// =========================================================================

// TMR Coin (Base mainnet) wallet-connect widget. Entirely separate
// from the in-platform TMR Coin currency (backend-api.js's getCoinBalance/etc.) -- this
// only reads a real on-chain balance via /api/tmr-coin/*. No purchase, claim,
// or transfer action is wired here; the Claim button stays disabled until
// the backend feature flag (and required legal sign-off) is enabled.
(function () {
  var connectBtn = document.getElementById('tmrCoinConnectBtn');
  var disconnectedEl = document.getElementById('tmrCoinDisconnected');
  var connectedEl = document.getElementById('tmrCoinConnected');
  var hintEl = document.getElementById('tmrCoinHint');
  var addressEl = document.getElementById('tmrCoinAddress');
  var balanceEl = document.getElementById('tmrCoinBalance');
  var networkBadgeEl = document.getElementById('tmrCoinNetworkBadge');
  var explorerLinkEl = document.getElementById('tmrCoinExplorerLink');
  var verifiedBadgeEl = document.getElementById('tmrCoinVerifiedBadge');
  if (!connectBtn) return; // page doesn't have the widget

  function short(addr) {
    return addr.slice(0, 6) + '…' + addr.slice(-4);
  }

  function setHint(msg) {
    hintEl.textContent = msg || '';
  }

  async function getConfig() {
    return window.api.request('/tmr-coin/config', { cache: 'no-store' });
  }

  function renderPageInfo(cfg) {
    if (networkBadgeEl) networkBadgeEl.textContent = cfg.is_testnet ? 'BASE SEPOLIA (TESTNET)' : 'BASE MAINNET';
    if (explorerLinkEl && cfg.explorer_url) explorerLinkEl.href = cfg.explorer_url;
    if (verifiedBadgeEl) verifiedBadgeEl.hidden = !!cfg.explorer_verified;
  }

  async function ensureBaseNetwork(provider, cfg) {
    var network = await provider.getNetwork();
    if (Number(network.chainId) === cfg.chain_id) return;
    var hexChainId = '0x' + cfg.chain_id.toString(16);
    var isTestnet = cfg.is_testnet;
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexChainId }] });
    } catch (switchErr) {
      if (switchErr && switchErr.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: hexChainId,
            chainName: isTestnet ? 'Base Sepolia' : 'Base',
            nativeCurrency: isTestnet
              ? { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 }
              : { name: 'ETH', symbol: 'ETH', decimals: 18 },
            rpcUrls: [isTestnet ? 'https://sepolia.base.org' : 'https://mainnet.base.org'],
            blockExplorerUrls: [isTestnet ? 'https://sepolia.basescan.org' : 'https://basescan.org'],
          }],
        });
      } else {
        throw switchErr;
      }
    }
  }

  getConfig().then(renderPageInfo).catch(function () {});

  async function loadOnChainBalance(address, cfg) {
    if (!cfg.contract_address) {
      balanceEl.textContent = 'Contract not deployed yet';
      return;
    }
    var abi = ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'];
    var provider = new window.ethers.BrowserProvider(window.ethereum);
    var contract = new window.ethers.Contract(cfg.contract_address, abi, provider);
    var raw = await contract.balanceOf(address);
    var decimals = await contract.decimals();
    balanceEl.textContent = window.ethers.formatUnits(raw, decimals) + ' TMR';
  }

  async function linkWallet(address) {
    if (!window.api || !window.api.isLoggedIn || !window.api.isLoggedIn()) {
      setHint('Log in to link a wallet to your account (viewing balance still works without linking).');
      return;
    }
    try {
      var nonceRes = await window.api.request('/tmr-coin/link-wallet/nonce', { method: 'POST' });
      var signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [nonceRes.message, address],
      });
      await window.api.request('/tmr-coin/link-wallet', {
        method: 'POST',
        body: { walletAddress: address, signature: signature },
      });
      setHint('Wallet linked to your account.');
    } catch (err) {
      setHint('Wallet connected for viewing, but linking to your account failed: ' + (err && err.message ? err.message : 'unknown error'));
    }
  }

  async function connect() {
    if (!window.ethereum) {
      setHint('No wallet extension detected. Install MetaMask (or another injected wallet) to connect.');
      return;
    }
    connectBtn.disabled = true;
    setHint('Connecting…');
    try {
      var cfg = await getConfig();
      var accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      var address = accounts[0];
      var provider = new window.ethers.BrowserProvider(window.ethereum);
      await ensureBaseNetwork(provider, cfg);

      disconnectedEl.hidden = true;
      connectedEl.hidden = false;
      addressEl.textContent = short(address) + ' · ' + (cfg.is_testnet ? 'Base Sepolia' : 'Base');
      await loadOnChainBalance(address, cfg);
      await linkWallet(address);
    } catch (err) {
      setHint('Could not connect: ' + (err && err.message ? err.message : 'unknown error'));
    } finally {
      connectBtn.disabled = false;
    }
  }

  connectBtn.addEventListener('click', connect);
})();
