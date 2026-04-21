// ==UserScript==
// @name            SaveMyExams Bypass
// @namespace       http://vmd1.dev/userscripts
// @description     Bypasses SaveMyExams paywalls with Verbose Logging
// @version         16.2
// @license         MIT
// @match           https://www.savemyexams.com/*
// @grant           none
// ==/UserScript==

(function() {
    const CDN_BASE = "https://cdn.savemyexams.com/pdfs/";
    let currentIdOnly = "";
    let pageData = null;

    // Verbose logging helper
    const log = (msg, data = null, type = 'info') => {
        const styles = {
            info: "color: #6366f1; font-weight: bold; border-left: 3px solid #6366f1; padding-left: 5px;",
            warn: "color: #f59e0b; font-weight: bold; border-left: 3px solid #f59e0b; padding-left: 5px;",
            success: "color: #10b981; font-weight: bold; border-left: 3px solid #10b981; padding-left: 5px;",
            error: "color: #ef4444; font-weight: bold; border-left: 3px solid #ef4444; padding-left: 5px;"
        };
        const timestamp = new Date().toLocaleTimeString();
        if (data) {
            console.groupCollapsed(`%c[SME Bypass] [${timestamp}] ${msg}`, styles[type]);
            console.log(data);
            console.groupEnd();
        } else {
            console.log(`%c[SME Bypass] [${timestamp}] ${msg}`, styles[type]);
        }
    };

    function syncPageData() {
        try {
            const nextData = JSON.parse(document.getElementById('__NEXT_DATA__').innerHTML);
            pageData = nextData.props.pageProps;
            const initialRawId = pageData.subtopic?.id;
            if (initialRawId) {
                currentIdOnly = initialRawId.split('_')[1];
                log(`Synced initial page data. ID: ${currentIdOnly}`, pageData, 'success');
            }
        } catch (e) {
            log("Could not sync initial page data from __NEXT_DATA__.", e, 'warn');
        }
    }

    function clearLocalStorage() {
        const items = [
            "SME.topic-question-part-solution-views", "SME.revision-note-views",
            "SME.first-visited-at", "SME.first-viewed-topic-question-at",
            "SME.ai-marking-spotlight-seen", "SME.last-viewed-course",
            "SME.latest-resource-views", "SME.resource-referrer-url",
            "SME.prospect-type", "beacon"
        ];
        let count = 0;
        items.forEach(item => {
            if (localStorage.getItem(item)) {
                localStorage.removeItem(item);
                count++;
            }
        });
        if (count > 0) log(`Cleared ${count} tracker items from LocalStorage.`, null, 'info');
    }

    function injectSolutionModal() {
        if (document.getElementById('custom-solution-modal')) return;

        log("Injecting Custom Solution Modal into DOM.", null, 'info');
        const modalHtml = `
            <div id="custom-solution-modal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.85); backdrop-filter: blur(12px); z-index:10000000; justify-content:center; align-items:center; font-family: 'Inter', system-ui, sans-serif;">
                <div style="background:#0f1014; width:95%; max-width:900px; max-height:85vh; overflow-y:auto; border-radius:24px; position:relative; color: #e2e8f0; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); border: 1px solid #2d3748;">
                    <div style="background: #1a1c23; padding: 20px 35px; border-bottom: 1px solid #2d3748; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 10;">
                        <div style="display: flex; align-items: center; gap: 15px;">
                            <div id="modal-q-label" style="background:#6366f1; color:white; padding:4px 12px; border-radius:8px; font-weight:800; font-size:14px; letter-spacing:1px; box-shadow: 0 0 15px rgba(99, 102, 241, 0.3);">Q??</div>
                            <span style="font-weight:700; font-size:18px; color:#f8fafc;">Expert Mark Scheme</span>
                        </div>
                        <button id="close-solution" style="border:none; background:rgba(255,255,255,0.05); color:#94a3b8; width:36px; height:36px; border-radius:50%; cursor:pointer; font-size:22px; display:flex; align-items:center; justify-content:center;">&times;</button>
                    </div>
                    <div id="solution-content" style="padding: 35px 50px; font-size:18px; line-height:1.8;"></div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        document.getElementById('close-solution').onclick = () => {
            log("Closing solution modal.", null, 'info');
            document.getElementById('custom-solution-modal').style.display = 'none';
        };
    }

    function findById(obj, targetId) {
        if (!obj || typeof obj !== 'object') return null;
        if ((obj.id === targetId || obj.marking_guidance_id === targetId) && obj.solution) return obj;
        for (let key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                let found = findById(obj[key], targetId);
                if (found) return found;
            }
        }
        return null;
    }

    const parseNode = (node) => {
        if (!node) return '';
        if (node.type === 'text') {
            let t = node.text;
            if (node.marks) node.marks.forEach(m => {
                if(m.type==='bold') t = `<strong style="color:#fff; font-weight:700;">${t}</strong>`;
                if(m.type==='italic') t = `<em style="color:#cbd5e1;">${t}</em>`;
            });
            return t;
        }
        if (node.type === 'image' || node.attrs?.src) {
            return `<div style="margin: 30px 0; text-align: center; background: #fff; padding: 15px; border-radius: 12px; border: 1px solid #333;">
                        <img src="${node.attrs?.src || node.src}" style="max-width: 100%; height: auto; display: block; margin: 0 auto;">
                    </div>`;
        }
        let children = (node.content || []).map(parseNode).join('');
        switch (node.type) {
            case 'paragraph': return `<p style="margin-bottom:18px; color:#cbd5e1;">${children}</p>`;
            case 'bulletList': return `<ul style="padding-left:25px; margin-bottom:20px; list-style-type: square; color: #6366f1;">${children}</ul>`;
            case 'listItem': return `<li style="margin-bottom:8px;"><span style="color:#cbd5e1;">${children}</span></li>`;
            case 'heading': return `<h${node.attrs?.level} style="color:#fff; border-left: 4px solid #6366f1; padding-left: 15px; margin: 30px 0 15px; font-weight:800;">${children}</h${node.attrs?.level}>`;
            case 'table': return `<div style="overflow-x:auto; margin: 25px 0; border-radius: 8px; border: 1px solid #2d3748;"><table style="width:100%; border-collapse: collapse; background: #1a1c23; color: #cbd5e1; font-size: 16px;">${children}</table></div>`;
            case 'tableRow': return `<tr style="border-bottom: 1px solid #2d3748;">${children}</tr>`;
            case 'tableCell': return `<td style="padding: 12px 15px; border-right: 1px solid #2d3748;">${children}</td>`;
            case 'hardBreak': return `<br>`;
            default: return children;
        }
    };

    function nukeAndReplaceButton(id) {
        if (!id) return;
        const oldBtn = document.querySelector('button[aria-label="Download notes"]:not([data-unlocked])');
        if (oldBtn) {
            log(`Replacing Paywalled PDF button for resource: ${id}`, null, 'info');
            const newBtn = oldBtn.cloneNode(true);
            const pdfUrl = `${CDN_BASE}${id}.pdf`;
            newBtn.setAttribute('data-unlocked', 'true');
            newBtn.style.backgroundColor = "#10b981"; // Emerald Green
            newBtn.style.color = "white";
            const textSpan = newBtn.querySelector('span');
            if (textSpan) textSpan.innerText = "Download Unlocked PDF";
            newBtn.onclick = (e) => {
                e.preventDefault(); e.stopImmediatePropagation();
                log(`Opening PDF: ${pdfUrl}`, null, 'success');
                window.open(pdfUrl, '_blank');
            };
            if (oldBtn.parentNode) oldBtn.parentNode.replaceChild(newBtn, oldBtn);
        }
    }

    function cleanUp() {
        nukeAndReplaceButton(currentIdOnly);
        injectSolutionModal();

        let removedCount = 0;

        // 1. Remove by predefined selectors
        const selectors = [
            '[class*="limit-wall" i]',
            '[class*="Blur" i]',
            '[data-testid*="limit-wall" i]',
            '.modal-backdrop',
            '[role="dialog"]',
            '.modal.show',
            '[class*="FeatureSliderCTA_"]',
            'div.DownloadRibbon_wrapper__so48d'
        ];

        document.querySelectorAll(selectors.join(', ')).forEach(el => {
            if (el.id !== 'custom-solution-modal' && !el.contains(document.getElementById('custom-solution-modal'))) {
                el.remove();
                removedCount++;
            }
        });

        // 2. TARGET REMOVAL: All divs with both 'limit' AND 'wall'
        document.querySelectorAll('div').forEach(div => {
            const content = (div.innerText || div.textContent || "").toLowerCase();
            const className = (div.className || "").toString().toLowerCase();

            const hasLimit = content.includes('limit') || className.includes('limit');
            const hasWall = content.includes('wall') || className.includes('wall');

            if (hasLimit && hasWall) {
                if (div.id !== 'custom-solution-modal' && !div.contains(document.getElementById('custom-solution-modal'))) {
                    log(`Detected and removed "limit-wall" container.`, { classes: div.className, textPreview: content.substring(0, 100) }, 'warn');
                    div.remove();
                    removedCount++;
                }
            }
        });

        if (removedCount > 0) {
            log(`Cleanup cycle complete. Removed ${removedCount} elements.`, null, 'success');
        }

        if (document.body.classList.contains('modal-open') || document.body.style.overflow === 'hidden') {
            log("Restoring body scroll functionality.", null, 'info');
            document.body.style.setProperty('overflow', 'auto', 'important');
            document.body.classList.remove('modal-open');
        }
    }

    window.onclick = (e) => {
        const btn = e.target.closest('button');
        if (btn && btn.innerText.toLowerCase().includes('view answer')) {
            e.preventDefault(); e.stopPropagation();

            const modal = document.getElementById('custom-solution-modal');
            const contentBox = document.getElementById('solution-content');
            const qLabelBox = document.getElementById('modal-q-label');

            const wrapper = btn.closest('[data-cy="question-part"]');
            const scoreInput = wrapper?.querySelector('input[name*="score-qstnprt_"]');
            const partLabel = wrapper?.querySelector('[class*="QuestionPartNumber_number"]')?.innerText || "??";

            log(`Intercepted 'View Answer' click for Part: ${partLabel}`, null, 'info');

            qLabelBox.innerText = partLabel;
            modal.style.display = 'flex';
            contentBox.innerHTML = '<div style="color:#6366f1; text-align:center; padding:20px; font-style:italic;">Accessing expert data...</div>';

            if (!scoreInput) {
                log("Failed to find question ID (scoreInput missing).", null, 'error');
                contentBox.innerHTML = `<div style="text-align:center; color:#ef4444;">ID Missing. Try refreshing the page.</div>`;
                return;
            }

            const partId = scoreInput.name.replace('score-', '');
            log(`Searching for solution ID: ${partId}...`, null, 'info');

            const match = findById(pageData, partId);

            if (match) {
                log(`Solution found for ID: ${partId}. Rendering content.`, match, 'success');
                contentBox.innerHTML = match.solution.map(parseNode).join('');
            } else {
                log(`Could not find solution for ID: ${partId} in page data.`, pageData, 'error');
                contentBox.innerHTML = `<div style="text-align:center; color:#ef4444;">Unable to locate solution for ID: ${partId}</div>`;
            }
        }
    };

    if (!window._fetchPatched) {
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            const url = args[0];
            const response = await originalFetch(...args);
            if (typeof url === 'string' && url.includes('_next/data')) {
                log(`Intercepted background data fetch: ${url.split('/').pop()}`, null, 'info');
                const clone = response.clone();
                try {
                    const json = await clone.json();
                    pageData = json.pageProps;
                    const rawId = pageData.subtopic?.id;
                    if (rawId && rawId.includes('_')) {
                        currentIdOnly = rawId.split('_')[1];
                        log(`Updated page data via fetch. New Resource ID: ${currentIdOnly}`, null, 'success');
                        cleanUp();
                    }
                } catch (e) {
                    log("Failed to parse intercepted fetch data.", e, 'warn');
                }
            }
            return response;
        };
        window._fetchPatched = true;
    }

    log("Initializing SME Bypass V16.2...", null, 'info');
    syncPageData();
    clearLocalStorage();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            log("DOMContentLoaded: Running first cleanup.", null, 'info');
            cleanUp();
        });
    } else {
        cleanUp();
    }

    const observer = new MutationObserver((mutations) => {
        // Only run cleanup if nodes were added to avoid infinite loops
        if (mutations.some(m => m.addedNodes.length > 0)) {
            cleanUp();
            clearLocalStorage();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    console.log("%c SaveMyExams Bypass V16.2: Active & Verbose ", "color:white; background:#6366f1; padding:10px; font-weight:bold; border-radius:5px;");
})();
