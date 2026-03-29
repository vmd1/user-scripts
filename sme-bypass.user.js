// ==UserScript==
// @name          SaveMyExams Bypass
// @namespace     http://vmd1.dev/userscripts
// @description   Bypasses SaveMyExams paywalls
// @include       https://www.savemyexams.com/*
// @include       https://www.savemyexams.com/
// @version       16.0
// ==/UserScript==

(function() {
    const CDN_BASE = "https://cdn.savemyexams.com/pdfs/";
    let currentIdOnly = "";
    let pageData = null;
    function syncPageData() {
        try {
            const nextData = JSON.parse(document.getElementById('__NEXT_DATA__').innerHTML);
            pageData = nextData.props.pageProps;
            const initialRawId = pageData.subtopic?.id;
            if (initialRawId) currentIdOnly = initialRawId.split('_')[1];
        } catch (e) {
            console.warn("SME Proxy: Could not sync initial page data.");
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
        items.forEach(item => localStorage.removeItem(item));
    }
    function injectSolutionModal() {
        if (document.getElementById('custom-solution-modal')) return;

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
            const newBtn = oldBtn.cloneNode(true);
            const pdfUrl = `${CDN_BASE}${id}.pdf`;
            newBtn.setAttribute('data-unlocked', 'true');
            newBtn.style.backgroundColor = "#28a745";
            newBtn.style.color = "white";
            const textSpan = newBtn.querySelector('span');
            if (textSpan) textSpan.innerText = "Download Unlocked PDF";
            newBtn.onclick = (e) => {
                e.preventDefault(); e.stopImmediatePropagation();
                window.open(pdfUrl, '_blank');
            };
            if (oldBtn.parentNode) oldBtn.parentNode.replaceChild(newBtn, oldBtn);
        }
    }
    function cleanUp() {
        nukeAndReplaceButton(currentIdOnly);
        injectSolutionModal();

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
        const targets = document.querySelectorAll(selectors.join(', '));
        targets.forEach(el => {
            if (el.id === 'custom-solution-modal' || el.contains(document.getElementById('custom-solution-modal'))) {
                return;
            }
            el.remove();
        });

        if (document.body.classList.contains('modal-open') || document.body.style.overflow === 'hidden') {
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
            
            qLabelBox.innerText = partLabel;
            modal.style.display = 'flex';
            contentBox.innerHTML = '<div style="color:#6366f1; text-align:center; padding:20px; font-style:italic;">Accessing expert data...</div>';

            if (!scoreInput) {
                contentBox.innerHTML = `<div style="text-align:center; color:#ef4444;">ID Missing. Try refreshing the page.</div>`;
                return;
            }

            const partId = scoreInput.name.replace('score-', '');
            const match = findById(pageData, partId);

            if (match) {
                contentBox.innerHTML = match.solution.map(parseNode).join('');
            } else {
                contentBox.innerHTML = `<div style="text-align:center; color:#ef4444;">Unable to locate solution for ID: ${partId}</div>`;
            }
        }
    };

    // Prevents multiple patches if script re-runs
    if (!window._fetchPatched) {
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            const response = await originalFetch(...args);
            if (args[0] && typeof args[0] === 'string' && args[0].includes('_next/data')) {
                const clone = response.clone();
                try {
                    const json = await clone.json();
                    pageData = json.pageProps; 
                    const rawId = pageData.subtopic?.id; 
                    if (rawId && rawId.includes('_')) {
                        currentIdOnly = rawId.split('_')[1];
                        cleanUp(); 
                    }
                } catch (e) {}
            }
            return response;
        };
        window._fetchPatched = true;
    }
    syncPageData();
    clearLocalStorage();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', cleanUp);
    } else {
        cleanUp();
    }

    const observer = new MutationObserver(() => {
        cleanUp();
        clearLocalStorage();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    console.log("%c SaveMyExams Bypass V16: Active", "color:white; background:#6366f1; padding:10px; font-weight:bold; border-radius:5px;");
})();
