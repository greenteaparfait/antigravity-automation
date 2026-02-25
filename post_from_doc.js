const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

function parseDocToTitleAndBody(docText) {
    // 첫 번째 [제목: ... ]만 찾는다
    const re = /\[\s*제목\s*:\s*([\s\S]*?)\s*\]/m;
    const m = docText.match(re);

    if (!m) {
        return {
            title: '제목 없음',
            body: docText.trim(),
            found: false,
        };
    }

    const title = m[1].replace(/\s+/g, ' ').trim();

    // ✅ 첫 번째 매치(= m[0])만 문서에서 제거
    // 나머지 [제목: ... ]들은 본문에 그대로 남음
    const body = docText.replace(re, '').trim();

    return { title, body, found: true };
}

(async () => {
    if (!fs.existsSync('auth.json')) {
        console.log('❌ auth.json 파일이 없습니다! 먼저 node save_auth.js를 실행해서 로그인해 주세요.');
        return;
    }

    // ====== 문서 경로 받기 ======
    const docPath = process.argv[2];
    if (!docPath) {
        console.log('❌ 사용법: node post_from_doc.js <문서경로>\n예) node post_from_doc.js ./post.txt');
        return;
    }
    if (!fs.existsSync(docPath)) {
        console.log(`❌ 문서 파일이 없습니다: ${docPath}`);
        return;
    }

    const blogName = 'greentam';

    // ====== 문서 읽기 (UTF-8) ======
    const rawDoc = fs.readFileSync(docPath, 'utf8');

    // ====== 제목/본문 파싱 ======
    const { title: postTitle, body: postContentText, found } = parseDocToTitleAndBody(rawDoc);

    if (!found) {
        const fallbackTitle = path.basename(docPath, path.extname(docPath));
        console.log(`⚠️ [제목: ... ] 패턴이 없어 제목을 기본값으로 사용합니다: ${fallbackTitle}`);
    }
    console.log('🧾 Parsed Title:', postTitle);
    console.log('🧾 Body length:', postContentText.length);

    console.log('🚀 저장된 세션으로 브라우저를 실행합니다...');
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ storageState: 'auth.json' });
    const page = await context.newPage();

    const dumpDebug = async (label) => {
        console.log(`\n===== DEBUG (${label}) =====`);
        console.log('URL:', page.url());

        const frames = page.frames();
        console.log('Frames count:', frames.length);
        frames.forEach((f, i) => console.log(`  [${i}] ${f.url().slice(0, 160)}`));

        const activeEl = await page.evaluate(() => {
            const el = document.activeElement;
            const html = el?.outerHTML || '';
            return html.length > 260 ? html.slice(0, 260) + '...' : html;
        }).catch(() => null);
        console.log('Active element:', activeEl);

        const counts = {
            titleTextarea: await page.locator('#post-title-inp').count().catch(() => 0),
            editorIframe: await page.locator('#editor-tistory_ifr').count().catch(() => 0),
            editorHidden: await page.locator('#editor-tistory').count().catch(() => 0),
        };
        console.log('Counts:', counts);
        console.log('===========================\n');
    };

    const fillTitle = async () => {
        const title = page.locator('#post-title-inp');
        await title.waitFor({ state: 'visible', timeout: 30000 });
        await title.click();
        await title.fill(postTitle);
        console.log('✅ 제목 입력 완료 (#post-title-inp)');
    };

    const fillBodyTinyMCE = async () => {
        // 1) iframe 대기
        await page.waitForSelector('#editor-tistory_ifr', { timeout: 30000 });
        console.log('✅ 에디터 iframe 감지 (#editor-tistory_ifr)');

        const editorFrame = page.frameLocator('#editor-tistory_ifr');
        const body = editorFrame.locator('body');

        // 2) iframe 내부 body가 준비될 때까지
        await body.waitFor({ state: 'visible', timeout: 30000 });

        // 3) body 클릭 → 포커스 확보
        await body.click();

        // 4) 기존 내용 제거
        await page.keyboard.press('Control+A').catch(() => { });
        await page.keyboard.press('Backspace').catch(() => { });

        // 5) 텍스트 입력
        await page.keyboard.type(postContentText, { delay: 10 });

        console.log('✅ 본문 입력 완료 (TinyMCE iframe 내부)');
    };

    const verify = async () => {
        const titleVal = await page.locator('#post-title-inp').inputValue().catch(() => '');
        console.log('🔎 VERIFY title:', titleVal);

        const editorFrame = page.frameLocator('#editor-tistory_ifr');
        const bodyText = await editorFrame.locator('body').innerText().catch(() => '');
        console.log('🔎 VERIFY body length:', bodyText.length);
        console.log('🔎 VERIFY body preview:', bodyText.replace(/\s+/g, ' ').slice(0, 140));

        const hidden = await page.locator('#editor-tistory').inputValue().catch(() => '');
        console.log('🔎 VERIFY hidden(#editor-tistory) length:', hidden.length);
    };

    try {
        console.log('🔗 글쓰기 화면 진입...');
        const writeUrl = `https://${blogName}.tistory.com/manage/newpost/?type=post&returnURL=%2Fmanage%2Fposts%2F`;
        await page.goto(writeUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2500);
        await dumpDebug('after newpost');

        await fillTitle();
        await dumpDebug('after title');

        await fillBodyTinyMCE();
        await dumpDebug('after body');

        await verify();

        console.log('\n====================================================');
        console.log('✅ 문서에서 제목/본문 파싱 후 입력 성공.');
        console.log('   이제 발행 버튼 selector만 잡으면 자동 발행까지 연결됩니다.');
        console.log('====================================================\n');
    } catch (e) {
        console.log('❌ 에러:', e.message);
        await dumpDebug('on error');
    } finally {
        // 확인 위해 브라우저는 열어둠
        // await browser.close();
    }
})();