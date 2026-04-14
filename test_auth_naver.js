// test_auth_naver.js
const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ storageState: 'auth_naver.json' });
    const page = await context.newPage();

    await page.goto('https://www.naver.com', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    const cookies = await context.cookies();
    const hasAut = cookies.some(c => c.name === 'NID_AUT' && c.domain.includes('naver.com'));
    const hasSes = cookies.some(c => c.name === 'NID_SES' && c.domain.includes('naver.com'));

    console.log('NID_AUT:', hasAut ? '✅ YES' : '❌ NO');
    console.log('NID_SES:', hasSes ? '✅ YES' : '❌ NO');
    console.log('로그인 상태 판정:', (hasAut && hasSes) ? '✅ LOGGED IN' : '❌ NOT SURE / LOGGED OUT');

    await browser.close();
})();