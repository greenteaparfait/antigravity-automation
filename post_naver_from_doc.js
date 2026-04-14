// naver_publish_from_doc.js
// 사용법: node naver_publish_from_doc.js ./post.txt
//
// - auth_naver.json 세션으로 네이버 블로그 글쓰기 진입
// - [제목: ... ] 첫 번째만 제목으로 파싱, 나머지는 본문에 남김
// - 제목/본문 입력 (DOM 기반: input/textarea/contenteditable/iframe 탐색)
// - 실패 시 스샷 저장 + 브라우저 열어둠

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const AUTH_PATH = 'auth_naver.json';

// ⚠️ 여기 오타 가능성 큼: 'greentam-' -> 'greentam'
const BLOG_ID = 'greentam-';
const WRITE_URL = `https://blog.naver.com/${encodeURIComponent(BLOG_ID)}?Redirect=Write&`;

function parseDocToTitleAndBody(docText) {
    // 첫 번째 [제목: ...] 만 제목으로 쓰고, 나머지는 본문에 남김
    const re = /\[\s*제목\s*:\s*([\s\S]*?)\s*\]/m;
    const m = docText.match(re);
    if (!m) return { title: '제목 없음', body: docText.trim(), found: false };
    const title = m[1].replace(/\s+/g, ' ').trim();
    const body = docText.replace(re, '').trim();
    return { title, body, found: true };
}

function isOnLoginPage(url) {
    return url.includes('nid.naver.com') || url.includes('nidlogin') || url.includes('login.naver');
}

async function hasNaverLoginCookies(context) {
    const cookies = await context.cookies().catch(() => []);
    const hasAut = cookies.some(c => c.name === 'NID_AUT' && (c.domain || '').includes('naver.com'));
    const hasSes = cookies.some(c => c.name === 'NID_SES' && (c.domain || '').includes('naver.com'));
    return hasAut && hasSes;
}

async function waitUntilLoggedIn(page, context, timeoutMs = 30 * 60 * 1000) {
    console.log('👀 로그인 완료를 감시 중입니다... (최대 30분)');
    console.log('   조건: NID_AUT + NID_SES 쿠키 존재');
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const ok = await hasNaverLoginCookies(context);
        if (ok) return true;
        await page.waitForTimeout(1000);
    }
    return false;
}

async function maximizeLike(page) {
    await page.keyboard.press('F11').catch(() => { });
}

async function scrollEditorTop(page) {
    await page.evaluate(() => {
        window.scrollTo(0, 0);

        const candidates = Array.from(document.querySelectorAll('div, main, section'))
            .map(el => {
                const st = getComputedStyle(el);
                const r = el.getBoundingClientRect();
                const scrollable = (st.overflowY === 'auto' || st.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 200;
                const big = r.width > 600 && r.height > 400;
                return { el, scrollable, big, area: r.width * r.height };
            })
            .filter(x => x.scrollable && x.big)
            .sort((a, b) => b.area - a.area);

        if (candidates.length) candidates[0].el.scrollTop = 0;
    }).catch(() => { });
}

async function closeHelpAggressively(page) {
    // ESC 몇 번
    for (let i = 0; i < 3; i++) {
        await page.keyboard.press('Escape').catch(() => { });
        await page.waitForTimeout(150);
    }

    // 텍스트/aria 기반 닫기 후보
    const btnCandidates = [
        'button:has-text("닫기")',
        'button:has-text("접기")',
        'button[aria-label*="닫기"]',
        'button[aria-label*="접기"]',
        'button[title*="닫기"]',
        'button[title*="접기"]',
    ];
    for (const sel of btnCandidates) {
        const n = await page.locator(sel).count().catch(() => 0);
        if (n > 0) {
            await page.locator(sel).first().click().catch(() => { });
            await page.waitForTimeout(200);
            break;
        }
    }

    // 마지막 수단: 우측 fixed 패널 숨김
    await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('body *'));
        const targets = [];
        for (const el of els) {
            const st = window.getComputedStyle(el);
            if (st.position !== 'fixed') continue;
            const r = el.getBoundingClientRect();
            const nearRight = r.right > window.innerWidth - 2 && r.width > 260 && r.height > 200;
            if (!nearRight) continue;
            const zi = parseInt(st.zIndex || '0', 10);
            if (Number.isFinite(zi) && zi >= 10) targets.push(el);
        }
        targets.slice(0, 3).forEach(el => {
            el.setAttribute('data-ag-hidden', '1');
            el.style.display = 'none';
        });
    }).catch(() => { });
}

// ✅ 레이아웃이 오른쪽으로 밀리는 현상 완화용 CSS 주입
async function injectLayoutFixCSS(page) {
    await page.addStyleTag({
        content: `
      /* 오른쪽 패널/도움말이 레이아웃 밀 때 대비 */
      [data-ag-hidden="1"] { display:none !important; }

      /* 에디터 전체 폭이 이상하게 좁아지는 케이스 완화 */
      body { overflow-x:hidden !important; }

      /* 너무 공격적이지 않게 “가운데 정렬/최대폭”만 살짝 보정 */
      main, #wrap, #container, .wrap, .container {
        max-width: 1200px !important;
        margin-left: auto !important;
        margin-right: auto !important;
      }
    `
    }).catch(() => { });
}

async function pasteText(page, text) {
    // 클립보드 쓰기 → Ctrl+V (한글/이모지 안정)
    await page.evaluate(async (t) => {
        await navigator.clipboard.writeText(t);
    }, text);
    await page.keyboard.press('Control+V').catch(() => { });
    await page.waitForTimeout(120);
}

async function clickInIframe(page, iframeIndex, rx, ry) {
    // rx, ry: iframe 내부 상대좌표(0~1)
    const iframe = page.locator('iframe').nth(iframeIndex);
    const box = await iframe.boundingBox().catch(() => null);
    if (!box) return false;

    const x = Math.round(box.x + box.width * rx);
    const y = Math.round(box.y + box.height * ry);

    await page.mouse.click(x, y, { clickCount: 1 }).catch(() => { });
    await page.waitForTimeout(120);
    return true;
}

async function fillTitleNaverStable(page, title) {
    // 네이버 블로그 제목 고정 셀렉터
    const selectors = [
        '#post-title-inp',
        'textarea.textarea_tit',
        'textarea[placeholder="제목을 입력하세요"]',
        'textarea[placeholder*="제목"]'
    ];

    for (const sel of selectors) {
        const loc = page.locator(sel).first();
        const count = await loc.count().catch(() => 0);
        if (!count) continue;

        const box = await loc.boundingBox().catch(() => null);
        if (!box || box.width < 200) continue;

        await loc.click({ timeout: 5000 }).catch(() => { });
        await page.waitForTimeout(100);

        // 완전 삭제
        await page.keyboard.press('Control+A').catch(() => { });
        await page.keyboard.press('Backspace').catch(() => { });
        await page.waitForTimeout(80);

        await page.keyboard.insertText(title);
        await page.waitForTimeout(120);

        console.log(`✅ 제목 입력 완료(메인 textarea): ${sel}`);
        return true;
    }

    console.log('❌ 제목 textarea를 찾지 못했습니다.');
    return false;
}

async function fillBodyFixedAppend(page, bodyText) {
    // ✅ iframe(0) 조금 아래 = 본문 영역으로 가정
    const clicked = await clickInIframe(page, 0, 0.50, 0.30);
    if (!clicked) {
        console.log('❌ 본문 입력 실패: iframe(0) boundingBox 없음');
        return false;
    }

    // ✅ 덮어쓰기 금지: 기존 내용(제목)을 지우지 않는다
    // 커서를 문서 끝으로 이동하고 새 줄로 내려서 본문 시작
    await page.keyboard.press('Control+End').catch(() => { });
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter').catch(() => { });
    await page.keyboard.press('Enter').catch(() => { });
    await page.waitForTimeout(80);

    await pasteText(page, bodyText);

    console.log('✅ 본문 입력 완료(append, iframe 고정)');
    return true;
}

(async () => {
    if (!fs.existsSync(AUTH_PATH)) {
        console.log(`❌ ${AUTH_PATH} 파일이 없습니다! 먼저 node save_auth_naver.js를 실행해서 로그인해 주세요.`);
        return;
    }

    const docPath = process.argv[2];
    if (!docPath) {
        console.log('❌ 사용법: node naver_publish_from_doc.js <문서경로>\n예) node naver_publish_from_doc.js ./post.txt');
        return;
    }
    if (!fs.existsSync(docPath)) {
        console.log(`❌ 문서 파일이 없습니다: ${docPath}`);
        return;
    }

    const rawDoc = fs.readFileSync(docPath, 'utf8');
    const { title: postTitle, body: postBody, found } = parseDocToTitleAndBody(rawDoc);

    if (!found) {
        const fallbackTitle = path.basename(docPath, path.extname(docPath));
        console.log(`⚠️ [제목: ... ] 패턴이 없어 제목을 기본값으로 사용합니다: ${fallbackTitle}`);
    }

    console.log('🧾 Parsed Title:', postTitle);
    console.log('🧾 Body length:', postBody.length);

    const browser = await chromium.launch({
        headless: false,
        args: [
            '--window-size=1920,1080',
            '--force-device-scale-factor=1',
            '--high-dpi-support=1',
        ],
    });
    const context = await browser.newContext({
        storageState: AUTH_PATH,
        viewport: null,
        locale: 'ko-KR',
    });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const page = await context.newPage();

    try {
        console.log('🚀 저장된 세션으로 브라우저를 실행합니다...');
        console.log('🔗 네이버 블로그 글쓰기 화면 진입...');
        await page.goto(WRITE_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => { });
        await page.waitForTimeout(2000);

        await maximizeLike(page);

        // 로그인 페이지로 튕기면 수동 로그인 후 이어가기
        if (isOnLoginPage(page.url())) {
            console.log('\n====================================================');
            console.log('⚠️ 글쓰기 대신 로그인 화면으로 이동했습니다.');
            console.log('   브라우저에서 직접 로그인 완료해 주세요.');
            console.log('   로그인 성공을 감지하면 글쓰기 화면으로 재진입합니다.');
            console.log('====================================================\n');

            const ok = await waitUntilLoggedIn(page, context);
            if (!ok) throw new Error('로그인 감지 시간(30분) 초과');

            console.log('✅ 로그인 감지! 글쓰기 화면으로 재진입합니다...');
            await page.goto(WRITE_URL, { waitUntil: 'domcontentloaded' });
            await page.waitForLoadState('networkidle').catch(() => { });
            await page.waitForTimeout(2500);

            // 로그인 직후 세션 갱신 저장(권장)
            await context.storageState({ path: AUTH_PATH });
            console.log(`💾 로그인 후 세션을 ${AUTH_PATH}로 갱신 저장했습니다.`);
        }

        if (isOnLoginPage(page.url())) {
            throw new Error('로그인 후에도 글쓰기 페이지가 로그인으로 리다이렉트됩니다. (추가 인증/권한 문제 가능)');
        }

        // ✅ 레이아웃 보정 + 도움말 패널 정리
        await injectLayoutFixCSS(page);
        await closeHelpAggressively(page);
        await scrollEditorTop(page);
        await page.waitForTimeout(600);

        // 1) 제목 입력
        console.log('✍️ 제목 입력...');
        const okTitle = await fillTitleNaverStable(page, postTitle);

        // 2) 본문 입력
        console.log('✍️ 본문 입력...');
        const okBody = await fillBodyFixedAppend(page, postBody);

        // 디버그 스샷
        await page.screenshot({ path: 'naver_write_filled.png', fullPage: true }).catch(() => { });
        console.log('📸 스샷 저장: naver_write_filled.png');

        if (!okTitle || !okBody) {
            console.log('⚠️ 제목/본문 중 일부 입력이 확실치 않습니다. 브라우저에서 확인해 주세요.');
        }

        // ✅ 여기서 멈춤(발행 안 함)
        console.log('\n====================================================');
        console.log('🛑 발행 단계는 스킵합니다. (내용 확인에서 멈춤)');
        console.log('   입력된 내용 확인 후, 수동으로 발행하세요.');
        console.log('====================================================\n');
        return;

    } catch (e) {
        console.log('❌ 에러:', e.message);
        console.log('현재 URL:', page.url());
        await page.screenshot({ path: 'naver_error.png', fullPage: true }).catch(() => { });
        console.log('📸 에러 스샷 저장: naver_error.png');
    } finally {
        // 확인 위해 열어둠
        // await browser.close();
    }
})();