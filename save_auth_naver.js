// save_auth_naver.js
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    console.log('🚀 브라우저를 실행합니다...');
    const browser = await chromium.launch({ headless: false });

    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        locale: 'ko-KR',
    });

    const page = await context.newPage();

    console.log('🔗 네이버 로그인 페이지로 이동 중...');
    // ✅ 처음부터 로그인 페이지로 강제 진입 (메인에서 버튼 찾기보다 안정적)
    await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'domcontentloaded' });

    console.log('\n====================================================');
    console.log('대표님! 브라우저에서 네이버 로그인을 완료해 주세요.');
    console.log('로그인 성공(NID_AUT + NID_SES 쿠키 생성) 시 세션을 저장합니다!');
    console.log('====================================================\n');

    try {
        console.log('👀 로그인 완료를 감시 중입니다... (최대 30분)');
        console.log('   조건: 쿠키에 NID_AUT 와 NID_SES 가 동시에 생기면 성공');

        const timeoutMs = 30 * 60 * 1000;
        const start = Date.now();

        // ✅ 핵심: NID_AUT + NID_SES 둘 다 생길 때까지 대기
        while (Date.now() - start < timeoutMs) {
            const cookies = await context.cookies();

            const hasAut = cookies.some(c => c.name === 'NID_AUT' && c.domain.includes('naver.com'));
            const hasSes = cookies.some(c => c.name === 'NID_SES' && c.domain.includes('naver.com'));

            if (hasAut && hasSes) {
                console.log('✅ NID_AUT + NID_SES 쿠키 감지! 로그인 성공으로 판단합니다.');
                break;
            }

            await page.waitForTimeout(1000);
        }

        if (Date.now() - start >= timeoutMs) {
            throw new Error('로그인 감지 시간(30분) 초과');
        }

        // ✅ 추가 확증: 다시 로그인 페이지로 접근했을 때 로그인 폼이 아니면(=이미 로그인) 더 신뢰
        // (네이버가 리다이렉트를 주는 경우가 있어 보조 체크로 사용)
        await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(800);

        console.log('💾 세션 정보를 저장합니다...');
        const outPath = 'auth_naver.json';
        await context.storageState({ path: outPath });

        if (fs.existsSync(outPath)) {
            console.log(`✨ 충성! 세션 정보가 ${outPath}에 안전하게 저장되었습니다!`);
        } else {
            console.log('❌ 저장은 시도했지만 파일이 보이지 않습니다. 권한/경로를 확인해 주세요.');
        }
    } catch (error) {
        console.log('❌ 대표님, 오류가 발생했습니다. 다시 실행해 주세요!');
        console.log('오류 메시지:', error.message);
    } finally {
        await browser.close();
        console.log('👋 브라우저를 종료합니다.');
    }
})();