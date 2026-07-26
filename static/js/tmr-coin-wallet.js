// TMR Coin (Base Sepolia testnet) wallet-connect widget. Entirely separate
// from TMR Competition Credits (backend-api.js's getCoinBalance/etc.) -- this
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

  async function ensureBaseSepoliaNetwork(provider, cfg) {
    var network = await provider.getNetwork();
    if (Number(network.chainId) === cfg.chain_id) return;
    var hexChainId = '0x' + cfg.chain_id.toString(16);
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexChainId }] });
    } catch (switchErr) {
      if (switchErr && switchErr.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: hexChainId,
            chainName: 'Base Sepolia',
            nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
            rpcUrls: ['https://sepolia.base.org'],
            blockExplorerUrls: ['https://sepolia.basescan.org'],
          }],
        });
      } else {
        throw switchErr;
      }
    }
  }

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
      await ensureBaseSepoliaNetwork(provider, cfg);

      disconnectedEl.hidden = true;
      connectedEl.hidden = false;
      addressEl.textContent = short(address) + ' · Base Sepolia';
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
