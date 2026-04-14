// attach_to_human_chrome_tistory.js
// 사용법: node attach_to_human_chrome_tistory.js ./post.txt
// 전제: 크롬을 --remote-debugging-port=9222 로 사람이 먼저 실행해 둬야 함

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

function normalizeNewlines(s) {
    return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}
function escapeHtml(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function preserveSpacesHtml(line) {
    line = line.replace(/\t/g, '    ');
    return line.replace(/ {2,}/g, (m) => '&nbsp;'.repeat(m.length));
}
function textToTistoryHtml(text) {
    const t = normalizeNewlines(text).replace(/\n+$/g, '');
    if (!t.trim()) return '<p></p>';

    const lines = t.split('\n');
    return lines
        .map((line) => {
            if (line.trim() === '') return '<p>&nbsp;</p>';
            const safe = preserveSpacesHtml(escapeHtml(line));
            return `<p>${safe}</p>`;
        })
        .join('\n');
}

// ✅ [제목:], [카테고리:], [태그:] 파싱 + 본문에서 제거
function parseDoc(docText) {
    let body = docText;

    const pickFirst = (re) => {
        const m = body.match(re);
        if (!m) return null;
        body = body.replace(re, '').trim();
        return (m[1] ?? '').replace(/\s+/g, ' ').trim();
    };

    const title = pickFirst(/\[\s*제목\s*:\s*([\s\S]*?)\s*\]/m) || '제목 없음';
    const category = pickFirst(/\[\s*카테고리\s*:\s*([\s\S]*?)\s*\]/m) || null;

    const tagLine = pickFirst(/\[\s*태그\s*:\s*([\s\S]*?)\s*\]/m);
    let tags = [];
    if (tagLine) {
        // "#AAA, #BBB" / "AAA, BBB" / "#AAA #BBB" 등 최대한 유연하게
        tags = tagLine
            .split(/[,，]/g)
            .flatMap((chunk) => chunk.split(/\s+/g))
            .map((t) => t.trim())
            .filter(Boolean)
            .map((t) => (t.startsWith('#') ? t.slice(1) : t))
            .filter(Boolean);

        // 중복 제거
        tags = Array.from(new Set(tags));
    }

    return { title, category, tags, body: body.trim() };
}

(async () => {
    // ====== 문서 경로 ======
    const docPath = process.argv[2];
    if (!docPath) {
        console.log('❌ 사용법: node attach_to_human_chrome_tistory.js <문서경로>\n예) node attach_to_human_chrome_tistory.js ./post.txt');
        return;
    }
    if (!fs.existsSync(docPath)) {
        console.log(`❌ 문서 파일이 없습니다: ${docPath}`);
        return;
    }

    const blogName = 'greentam';
    const rawDoc = normalizeNewlines(fs.readFileSync(docPath, 'utf8'));

    const { title: postTitle, category: postCategory, tags: postTags, body: postContentText } = parseDoc(rawDoc);
    const postContentHtml = textToTistoryHtml(postContentText);

    console.log('🧾 Parsed Meta');
    console.log('  - title     :', postTitle);
    console.log('  - category  :', postCategory || '(none)');
    console.log('  - tags      :', postTags.length ? postTags.join(', ') : '(none)');

    // ====== 이미 열린 크롬(원격디버깅)에 attach ======
    // chrome.exe --remote-debugging-port=9222 --user-data-dir="C:\chrome-playwright-profile"
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');

    const contexts = browser.contexts();
    if (!contexts.length) {
        console.log('❌ attach된 Chrome에서 context를 찾지 못했습니다. 크롬을 원격디버깅으로 실행했는지 확인하세요.');
        return;
    }
    const context = contexts[0];

    const page = await context.newPage();

    const waitTinyMCEReady = async () => {
        await page.waitForFunction(() => {
            return !!(window.tinymce && window.tinymce.get && window.tinymce.get('editor-tistory'));
        }, { timeout: 30000 });
    };

    const fillTitle = async () => {
        const title = page.locator('#post-title-inp');
        await title.waitFor({ state: 'visible', timeout: 30000 });
        await title.click();
        await title.fill(postTitle);
        console.log('✅ 제목 입력 완료');
    };

    const fillBody = async () => {
        await page.waitForSelector('#editor-tistory_ifr', { timeout: 30000 });
        await waitTinyMCEReady();

        await page.evaluate((html) => {
            const ed = window.tinymce.get('editor-tistory');
            ed.focus();
            ed.setContent(html);
            ed.save();
        }, postContentHtml);

        await page.keyboard.press('Escape').catch(() => { });
        console.log('✅ 본문 입력 완료');
    };

    // ✅ “보이게만” (클릭 X)
    const forceShowBottomBarOnly = async () => {
        await page.keyboard.press('Escape').catch(() => { });
        await page.click('body', { position: { x: 10, y: 10 } }).catch(() => { });
        await page.waitForTimeout(200);

        await page.evaluate(() => {
            const findByText = (re) => {
                const all = Array.from(document.querySelectorAll('button,a,span,div'));
                return all.find(el => re.test((el.textContent || '').trim()));
            };

            const done = findByText(/완료/);
            const preview = findByText(/미리보기/);
            const anchor = done || preview;
            if (!anchor) return;

            let p = anchor instanceof HTMLElement ? anchor.parentElement : null;
            let bar = null;

            while (p && p !== document.body) {
                const cs = window.getComputedStyle(p);
                if (cs.position === 'fixed' || cs.position === 'sticky') { bar = p; break; }
                p = p.parentElement;
            }
            bar = bar || (anchor.closest && anchor.closest('div')) || anchor.parentElement;
            if (!bar) return;

            bar.style.display = 'flex';
            bar.style.visibility = 'visible';
            bar.style.opacity = '1';
            bar.style.transform = 'translateY(0)';
            bar.style.pointerEvents = 'auto';
            bar.style.position = 'fixed';
            bar.style.left = '0';
            bar.style.right = '0';
            bar.style.bottom = '0';
            bar.style.zIndex = '2147483647';
        });

        console.log('✅ 하단 바(미리보기/완료) 노출 처리 완료 (클릭 없음)');
    };

    // =========================
    // ✅ 카테고리 선택 자동화
    // =========================
    const selectCategory = async (categoryName) => {
        if (!categoryName) return;

        const tryClicks = async (locators) => {
            for (const loc of locators) {
                try {
                    if (await loc.count()) {
                        await loc.first().click({ timeout: 2000 });
                        return true;
                    }
                } catch (_) { }
            }
            return false;
        };

        // 1) 카테고리 드롭다운 버튼/영역 열기 (가능성 높은 후보들)
        // - "카테고리" 텍스트가 들어간 버튼/영역
        // - combobox role
        const opened =
            await tryClicks([
                page.getByRole('combobox', { name: /카테고리/i }),
                page.getByRole('button', { name: /카테고리/i }),
                page.locator('button:has-text("카테고리")'),
                page.locator('div:has-text("카테고리")').locator('button'),
            ]);

        // 위에서 못 열었으면 DOM에서 “카테고리” 라벨 주변을 찾아 클릭
        if (!opened) {
            try {
                const ok = await page.evaluate(() => {
                    const label = Array.from(document.querySelectorAll('*'))
                        .find(el => /카테고리/.test((el.textContent || '').trim()));
                    if (!label) return false;

                    // 가까운 클릭 가능한 요소 탐색
                    const clickable = label.closest('label,div,li,section') || label.parentElement;
                    if (!clickable) return false;

                    const btn = clickable.querySelector('button,[role="button"],[role="combobox"],.dropdown,.selectbox');
                    if (btn) { btn.click(); return true; }
                    clickable.click();
                    return true;
                });
                if (!ok) console.log('⚠️ 카테고리 드롭다운을 여는 데 실패(셀렉터 불일치)');
            } catch (_) {
                console.log('⚠️ 카테고리 드롭다운을 여는 데 실패(예외)');
            }
        }

        await page.waitForTimeout(300);

        // 2) 열린 목록에서 categoryName 클릭
        // - 메뉴 아이템은 보통 role=option / li / button / a 로 존재
        const optionCandidates = [
            page.getByRole('option', { name: new RegExp(categoryName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }),
            page.getByRole('menuitem', { name: new RegExp(categoryName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }),
            page.locator('li:has-text("' + categoryName + '")'),
            page.locator('button:has-text("' + categoryName + '")'),
            page.locator('a:has-text("' + categoryName + '")'),
            page.locator('div[role="listbox"] >> text=' + categoryName),
        ];

        let picked = false;
        for (const opt of optionCandidates) {
            try {
                if (await opt.first().isVisible({ timeout: 1500 })) {
                    await opt.first().click();
                    picked = true;
                    break;
                }
            } catch (_) { }
        }

        if (picked) {
            console.log(`✅ 카테고리 선택 완료: ${categoryName}`);
        } else {
            console.log(`⚠️ 카테고리 "${categoryName}" 옵션을 찾지 못했습니다.`);
            console.log('➡️ 기본값 "카테고리 없음"으로 선택 시도...');

            const defaultName = '카테고리 없음';

            const defaultCandidates = [
                page.getByRole('option', { name: defaultName }),
                page.getByRole('menuitem', { name: defaultName }),
                page.locator(`li:has-text("${defaultName}")`),
                page.locator(`button:has-text("${defaultName}")`),
                page.locator(`a:has-text("${defaultName}")`)
            ];

            let defaultPicked = false;

            for (const opt of defaultCandidates) {
                try {
                    if (await opt.first().isVisible({ timeout: 1500 })) {
                        await opt.first().click();
                        defaultPicked = true;
                        break;
                    }
                } catch (_) { }
            }

            if (defaultPicked) {
                console.log(`✅ 기본 카테고리 선택 완료: ${defaultName}`);
            } else {
                console.log(`❌ 기본 카테고리 "${defaultName}"도 찾지 못했습니다.`);
                await page.keyboard.press('Escape').catch(() => { });
            }
        }
    };

    // =========================
    // ✅ 태그 입력 자동화
    // =========================
    const fillTags = async (tags) => {
        if (!tags || !tags.length) return;

        // 태그 입력은 보통 페이지 하단 → 스크롤 내려서 노출
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(600);

        // 후보: input placeholder에 태그/Tag 관련 문자열
        const candidates = [
            page.locator('input[placeholder*="태그"]'),
            page.locator('input[aria-label*="태그"]'),
            page.locator('input[placeholder*="Tag" i]'),
            page.locator('input[aria-label*="Tag" i]'),
            // label이 "태그"인 곳 주변 input
            page.locator(':text("태그")').locator('..').locator('input'),
            page.locator('label:has-text("태그")').locator('..').locator('input'),
        ];

        let tagInput = null;
        for (const loc of candidates) {
            try {
                if (await loc.count()) {
                    const first = loc.first();
                    await first.scrollIntoViewIfNeeded().catch(() => { });
                    if (await first.isVisible({ timeout: 1500 })) {
                        tagInput = first;
                        break;
                    }
                }
            } catch (_) { }
        }

        if (!tagInput) {
            console.log('⚠️ 태그 입력창을 찾지 못했습니다. (UI/셀렉터 변경 가능)');
            return;
        }

        await tagInput.click({ timeout: 5000 }).catch(() => { });
        await page.waitForTimeout(150);

        // 티스토리 태그 입력은 "입력 후 Enter"로 chip 생성되는 경우가 많음
        for (const t of tags) {
            const clean = String(t).trim().replace(/^#/, '');
            if (!clean) continue;
            await tagInput.type(clean, { delay: 20 });
            await page.keyboard.press('Enter').catch(() => { });
            await page.waitForTimeout(120);
        }

        console.log(`✅ 태그 입력 완료: ${tags.map(t => (t.startsWith('#') ? t : '#' + t)).join(', ')}`);
    };

    // ====== 글쓰기 페이지로 이동 & 작업 ======
    const writeUrl = `https://${blogName}.tistory.com/manage/newpost/?type=post&returnURL=%2Fmanage%2Fposts%2F`;
    console.log('🔗 글쓰기 화면 진입...');
    await page.goto(writeUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // 1) 제목/본문
    await fillTitle();
    await fillBody();

    // 2) 카테고리/태그
    await selectCategory(postCategory);
    await fillTags(postTags);

    // 3) 하단 바 노출(클릭 X)
    await forceShowBottomBarOnly();

    console.log('\n====================================================');
    console.log('✅ 사람이 열어둔 Chrome(원격디버깅)에 attach해서 입력 완료');
    console.log('✅ 카테고리/태그 자동 입력 완료 (가능한 셀렉터들로 폴백)');
    console.log('✅ 하단 바는 보이게만 처리, 클릭은 하지 않음');
    console.log('====================================================\n');

    // await browser.close(); // CDP 연결 종료
})();