const { chromium } = require('playwright');

(async () => {
    console.log('🚀 브라우저를 실행합니다...');
    const browser = await chromium.launch({ headless: false }); // 대표님 보시게 화면 띄웁니다!
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('🔗 티스토리 로그인 페이지로 이동 중...');
    await page.goto('https://www.tistory.com/auth/login');

    console.log('\n====================================================');
    console.log('대표님! 브라우저에서 티스토리(카카오) 로그인을 완료해 주세요.');
    console.log('로그인이 완료되고 대시보드가 보일 때까지 제가 지키고 있겠습니다!');
    console.log('====================================================\n');

    try {
        console.log('👀 로그인 상태를 감시 중입니다... (최대 30분)');

        // 여러 가지 조건 중 하나라도 만족되면 로그인 성공으로 간주합니다.
        await Promise.race([
            page.waitForURL('**/manage/**', { timeout: 1800000 }),
            page.waitForURL('**/manage', { timeout: 1800000 }),
            page.waitForSelector('.link_profile', { timeout: 1800000 }),
            page.waitForSelector('.btn_logout', { timeout: 1800000 })
        ]);

        console.log('✅ 로그인 성공이 감지되었습니다! 세션 정보를 저장합니다...');
        await page.waitForTimeout(2000); // 안정화 대기

        await context.storageState({ path: 'auth.json' });
        console.log('✨ 충성! 세션 정보가 auth.json에 안전하게 저장되었습니다!');
    } catch (error) {
        console.log('❌ 대표님, 시간이 너무 지체되었거나 오류가 발생했습니다. 다시 실행해 주세요!');
        console.log('오류 메시지:', error.message);
    } finally {
        await browser.close();
        console.log('👋 브라우저를 종료합니다.');
    }
})();
