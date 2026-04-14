const { chromium } = require('playwright');

function isKakaoOrTistoryLoggedIn(url) {
    // 로그인 성공 후 보통 manage나 tistory 메인/관리로 이동
    return /tistory\.com\/manage/.test(url);
}

(async () => {
    const CDP = 'http://127.0.0.1:9222';
    const OUT = 'auth_kakao.json';

    console.log('🔌 원격 디버깅 크롬에 접속합니다:', CDP);

    let browser;
    try {
        browser = await chromium.connectOverCDP(CDP);
    } catch (e) {
        console.log('❌ CDP 접속 실패. 크롬을 --remote-debugging-port=9222 로 실행했는지 확인하세요.');
        console.log('오류:', e.message);
        return;
    }

    // CDP로 붙으면 context가 여러 개 있을 수 있음
    const contexts = browser.contexts();
    if (!contexts.length) {
        console.log('❌ attach된 Chrome에서 context를 찾지 못했습니다.');
        return;
    }
    const context = contexts[0];

    // 새 탭을 하나 열어 로그인 페이지로 이동(기존 탭 건드리기 싫으면 이 방식이 안전)
    const page = await context.newPage();

    console.log('🔗 티스토리 로그인 페이지로 이동 중...');
    await page.goto('https://www.tistory.com/auth/login', { waitUntil: 'domcontentloaded' });

    console.log('\n====================================================');
    console.log('대표님! (사람이 연 크롬)에서 티스토리(카카오) 로그인을 완료해 주세요.');
    console.log('로그인 완료 후 /manage 로 들어가면 자동으로 세션을 저장합니다.');
    console.log('====================================================\n');

    try {
        console.log('👀 로그인 상태를 감시 중입니다... (최대 30분)');

        // ✅ "로그인 성공" 판별: URL이 manage로 이동하거나, 로그아웃/프로필 관련 요소가 보이면 성공
        await Promise.race([
            page.waitForURL('**/manage/**', { timeout: 1800000 }),
            page.waitForURL('**/manage', { timeout: 1800000 }),
            page.waitForFunction(() => /tistory\.com\/manage/.test(location.href), null, { timeout: 1800000 }),
            page.locator('.link_profile').waitFor({ state: 'attached', timeout: 1800000 }),
            page.locator('.btn_logout').waitFor({ state: 'attached', timeout: 1800000 }),
        ]);

        console.log('✅ 로그인 성공이 감지되었습니다! 세션 정보를 저장합니다...');
        await page.waitForTimeout(1500);

        // ✅ 중요한 점:
        // - connectOverCDP로 붙은 경우, storageState에는 "그 크롬 프로필의 쿠키/스토리지"가 저장됩니다.
        // - 이후 자동화 스크립트에서 newContext({ storageState })로 가져다 쓸 수 있습니다.
        await context.storageState({ path: OUT });

        console.log(`✨ 세션 정보가 ${OUT}에 저장되었습니다!`);
        console.log('   (이제 post_tistory_from_doc.js에서 storageState로 재사용 가능)');
    } catch (error) {
        console.log('❌ 시간이 너무 지체되었거나 오류가 발생했습니다. 다시 실행해 주세요!');
        console.log('오류 메시지:', error.message);
    } finally {
        // ❗주의: CDP 연결을 닫아도 "사람이 연 크롬"은 종료되지 않습니다.
        // Playwright의 browser.close()는 연결 종료로 동작하지만, 환경에 따라 크롬까지 닫히는 경우가 있어
        // 안전하게 disconnect 성격으로만 두고 싶으면 close를 생략해도 됩니다.
        try {
            await browser.close();
        } catch { }
        console.log('👋 (CDP) 연결을 종료합니다. 크롬 창은 그대로 열려있습니다.');
    }
})();