const { JSDOM, VirtualConsole } = require('jsdom');

const pageUrl = process.argv[2] || 'https://trustmyrecord.com/handicappers/';
const requiredUsers = ['BetLegend', 'mikeybalhansports'];

process.on('unhandledRejection', error => {
  console.warn('Ignored page rejection:', error && error.message ? error.message : error);
});

async function main() {
  const virtualConsole = new VirtualConsole();
  const consoleErrors = [];
  virtualConsole.on('error', message => consoleErrors.push(String(message)));
  virtualConsole.on('jsdomError', () => {});

  const url = pageUrl + (pageUrl.includes('?') ? '&' : '?') + 'verify=' + Date.now();
  const dom = await JSDOM.fromURL(url, {
    resources: 'usable',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.fetch = fetch;
    }
  });

  const { document } = dom.window;
  let rows = [];
  for (let attempt = 0; attempt < 60; attempt += 1) {
    rows = Array.from(document.querySelectorAll('.hm-member-row'));
    const status = document.querySelector('#hmStatus')?.textContent || '';
    if (rows.length >= requiredUsers.length && !/Loading/i.test(status)) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const rendered = rows.map(row => {
    const username = row.getAttribute('data-username') || '';
    const expected = '/profile/?user=' + encodeURIComponent(username);
    const name = row.querySelector('.hm-profile-name');
    const avatar = row.querySelector('.hm-avatar-link');
    return {
      username,
      expected,
      nameHref: name?.getAttribute('href') || '',
      avatarHref: avatar?.getAttribute('href') || '',
      nameLabel: name?.getAttribute('aria-label') || '',
      avatarLabel: avatar?.getAttribute('aria-label') || ''
    };
  });

  const status = document.querySelector('#hmStatus')?.textContent || '';
  const missing = requiredUsers.filter(username => !rendered.some(row => row.username === username));
  const badLinks = rendered
    .filter(row => requiredUsers.includes(row.username))
    .filter(row => row.nameHref !== row.expected || row.avatarHref !== row.expected || !row.nameLabel || !row.avatarLabel);

  const result = { url: pageUrl, status, rowCount: rows.length, rendered, consoleErrors };
  console.log(JSON.stringify(result, null, 2));

  if (/Loading/i.test(status)) throw new Error('Handicappers page is still in loading state');
  if (missing.length) throw new Error('Missing active members: ' + missing.join(', '));
  if (badLinks.length) throw new Error('Bad profile links: ' + JSON.stringify(badLinks));

  dom.window.close();
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
