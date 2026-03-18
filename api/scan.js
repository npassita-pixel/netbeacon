// api/scan.js — Beacon headless scanner
// Vercel serverless function using @sparticuz/chromium for headless Chrome

const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

// ── WCAG checks injected into headless page (bookmarklet-aligned) ───────────
const SCANNER_SCRIPT = `
(function() {
  var issues = [];
  var passes = [];
  var ded = 0;

  function push(id, sev, wcag, title, detail, el) {
    var snippet = '';
    var imgSrc = '';
    if (el) {
      try { snippet = el.outerHTML ? el.outerHTML.slice(0,120) : ''; } catch(e) {}
      if (el.tagName === 'IMG') { try { imgSrc = el.src || ''; } catch(e) {} }
    }
    issues.push({ id: id, sev: sev, wcag: wcag, title: title, detail: detail, snippet: snippet, imgSrc: imgSrc });
  }
  function pass(id, title) { passes.push({ id: id, title: title }); }

  function isTrackingPixel(img) {
    var s = img.getAttribute('src') || '';
    var w = img.getAttribute('width'), h = img.getAttribute('height');
    if ((w === '1' || w === 1) && (h === '1' || h === 1)) return true;
    return ['/pixel/','/track/','/beacon','/collect','adsct','bat.bing','trkn.us','arttrk.','adxcel','bidr.io'].some(function(p){return s.includes(p);});
  }

  // 1.1.1 Alt text — separate missing from decorative
  var imgs = document.querySelectorAll('img');
  var miss = [], decorativeImgs = [];
  Array.from(imgs).forEach(function(img) {
    if (isTrackingPixel(img)) return;
    var role = img.getAttribute('role');
    if (role === 'presentation' || role === 'none') return;
    if (!img.hasAttribute('alt')) miss.push(img);
    else if (img.getAttribute('alt').trim() === '') decorativeImgs.push(img);
  });
  if (miss.length) { ded += miss.length<=2?4:miss.length<=5?7:10; push('1.1.1','critical','1.1.1','Images missing alt text ('+miss.length+')','Images with no alt attribute are invisible to screen readers.',miss[0]); }
  else pass('1.1.1','Alt text present on all images');
  if (decorativeImgs.length) push('1.1.1b','minor','1.1.1',decorativeImgs.length+' image(s) with empty alt — verify decorative','Images with alt="" are treated as decorative. Confirm they add no meaning.',decorativeImgs[0]);

  // 1.2.2 Video captions
  var videos = document.querySelectorAll('video');
  var noCaptions = Array.from(videos).filter(function(v){ return !v.querySelector('track[kind=captions]'); });
  if(noCaptions.length) { ded += 6; push('1.2.2','serious','1.2.2',noCaptions.length+' video(s) without captions','Videos must have synchronized captions.',noCaptions[0]); }

  // 1.3.1 Heading structure
  var h1s = document.querySelectorAll('h1');
  if (h1s.length === 0) { ded += 4; push('1.3.1a','serious','1.3.1','Missing H1 heading','Page has no H1. Screen readers use H1 as the main landmark.',null); }
  else if (h1s.length > 1) { ded += 2; push('1.3.1b','moderate','1.3.1','Multiple H1 headings ('+h1s.length+')','Only one H1 per page is recommended.',h1s[1]); }
  else pass('1.3.1','Single H1 present');

  // Heading skip
  var hLevels = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map(function(h){return parseInt(h.tagName[1]);});
  var skipped = false;
  for (var i=1;i<hLevels.length;i++) { if(hLevels[i]-hLevels[i-1]>1){skipped=true;break;} }
  if (skipped) { ded += 3; push('1.3.1c','moderate','1.3.1','Heading levels skipped','Heading levels jump (e.g. H2 to H4). Screen reader users lose navigation context.',null); }
  else pass('1.3.1c','Heading hierarchy is sequential');

  // 1.3.1 Unlabeled inputs
  var inputs = Array.from(document.querySelectorAll('input,select,textarea')).filter(function(inp){
    if(inp.type==='hidden'||inp.type==='submit'||inp.type==='button'||inp.type==='reset') return false;
    var id = inp.id;
    var hasLabel = id && document.querySelector('label[for="'+id+'"]');
    var hasAria = inp.getAttribute('aria-label') || inp.getAttribute('aria-labelledby');
    var hasTitle = inp.getAttribute('title');
    var wrapped = inp.closest('label');
    return !hasLabel && !hasAria && !hasTitle && !wrapped;
  });
  if (inputs.length) { ded += inputs.length<=2?6:10; push('1.3.1d','critical','1.3.1',inputs.length+' unlabeled form input(s)','Form fields must have associated labels for screen readers.',inputs[0]); }
  else pass('1.3.1d','All form inputs have labels');

  // 1.4.1 Color only
  var colorLinks = Array.from(document.querySelectorAll('a')).filter(function(a){
    var s = window.getComputedStyle(a);
    return s.textDecoration.indexOf('underline') === -1 && s.fontWeight < 700;
  });
  if (colorLinks.length > 5) { ded += 3; push('1.4.1','moderate','1.4.1','Links may rely on color alone ('+colorLinks.length+')','Links should be distinguishable without color (underline or bold).',colorLinks[0]); }
  else pass('1.4.1','Links are visually distinguishable');

  // 1.4.2 Autoplay audio
  var autoAudio = document.querySelectorAll('audio[autoplay],video[autoplay]');
  if (autoAudio.length) { ded += 5; push('1.4.2','serious','1.4.2','Autoplaying media found','Media should not autoplay — distracting for screen reader users.',autoAudio[0]); }
  else pass('1.4.2','No autoplaying media');

  // 1.4.3 Color contrast (sample 80 text elements)
  var contrastFails = [];
  function getLuminance(r,g,b){
    var a=[r,g,b].map(function(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});
    return a[0]*0.2126+a[1]*0.7152+a[2]*0.0722;
  }
  function parseColor(c){
    var m=c.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
    return m?[parseInt(m[1]),parseInt(m[2]),parseInt(m[3])]:null;
  }
  function effectiveBg(el) {
    var node = el;
    while (node && node !== document.body.parentElement) {
      var cs = window.getComputedStyle(node);
      var bg = parseColor(cs.backgroundColor);
      if (bg && cs.backgroundColor !== 'transparent' && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') return bg;
      node = node.parentElement;
    }
    return [255, 255, 255];
  }
  var textEls = Array.from(document.querySelectorAll('p,span,a,li,td,th,label,button,h1,h2,h3,h4,h5,h6')).filter(function(el){
    var cs = window.getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }).slice(0,80);
  textEls.forEach(function(el){
    var cs = window.getComputedStyle(el);
    var fg=parseColor(cs.color);
    if(!fg) return;
    var bg=effectiveBg(el);
    var L1=getLuminance(fg[0],fg[1],fg[2]), L2=getLuminance(bg[0],bg[1],bg[2]);
    var ratio=(Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
    var fontSize=parseFloat(cs.fontSize);
    var isBold=parseInt(cs.fontWeight)>=700;
    var isLarge=fontSize>=18||(isBold&&fontSize>=14);
    var required=isLarge?3:4.5;
    if(ratio<required) contrastFails.push({el:el,ratio:ratio.toFixed(2),required:required});
  });
  if(contrastFails.length) { ded += contrastFails.length<=3?5:contrastFails.length<=8?8:12; push('1.4.3','serious','1.4.3',contrastFails.length+' color contrast failure(s)','Text must have '+contrastFails[0].required+':1 contrast ratio. Found '+contrastFails[0].ratio+':1.',contrastFails[0].el); }
  else pass('1.4.3','Color contrast passes on sampled elements');

  // 1.4.4 Zoom disabled
  var viewport = document.querySelector('meta[name=viewport]');
  if (viewport && (viewport.content.includes('user-scalable=no') || viewport.content.includes('maximum-scale=1')))
  { ded += 5; push('1.4.4','serious','1.4.4','Zoom is disabled','user-scalable=no prevents low-vision users from zooming.',viewport); }
  else pass('1.4.4','Zoom not disabled');

  // 1.4.10 Horizontal scroll
  if (document.body.scrollWidth > window.innerWidth + 10)
  { ded += 3; push('1.4.10','moderate','1.4.10','Horizontal scrolling detected','Content should reflow at 320px width without horizontal scroll.',null); }
  else pass('1.4.10','No horizontal scroll at current width');

  // 2.1.1 Positive tabindex
  var posTabs = document.querySelectorAll('[tabindex]');
  var badTabs = Array.from(posTabs).filter(function(el){ return parseInt(el.getAttribute('tabindex')) > 0; });
  if (badTabs.length) { ded += 3; push('2.1.1','moderate','2.1.1','Positive tabindex values found ('+badTabs.length+')','tabindex > 0 disrupts natural focus order.',badTabs[0]); }
  else pass('2.1.1','No positive tabindex values');

  // Negative tabindex on interactive
  var negTabs = Array.from(document.querySelectorAll('a[href][tabindex="-1"],button[tabindex="-1"]'));
  if (negTabs.length) { ded += 3; push('2.1.1b','moderate','2.1.1','Interactive elements removed from tab order ('+negTabs.length+')','tabindex=-1 makes elements unreachable by keyboard.',negTabs[0]); }

  // 2.4.1 Skip navigation
  var skipSelectors = ['a[href="#main-content"]','a[href="#main"]','a[href="#content"]','a[href="#skip"]','.skip-link','.skip-nav','[class*="skip-link"]','[class*="skip-nav"]'];
  var hasSkip = skipSelectors.some(function(sel){ try { return document.querySelector(sel); } catch(e) { return false; } });
  if (!hasSkip) { ded += 3; push('2.4.1','moderate','2.4.1','No skip navigation link','Add a "Skip to main content" link as the first focusable element.',null); }
  else pass('2.4.1','Skip navigation link present');

  // 2.4.2 Page title
  if (!document.title || document.title.trim().length < 2)
  { ded += 4; push('2.4.2','serious','2.4.2','Missing or empty page title','Every page must have a descriptive <title> element.',null); }
  else pass('2.4.2','Page has a title: '+document.title.slice(0,50));

  // 2.4.4 Vague link text
  var vague = ['click here','here','read more','more','learn more','link','this','continue'];
  var vagueLinks = Array.from(document.querySelectorAll('a')).filter(function(a){
    return vague.indexOf(a.textContent.trim().toLowerCase()) !== -1;
  });
  if (vagueLinks.length) { ded += vagueLinks.length<=3?3:5; push('2.4.4','moderate','2.4.4',vagueLinks.length+' vague link(s) found','Link text like "click here" is meaningless out of context.',vagueLinks[0]); }
  else pass('2.4.4','Link text is descriptive');

  // 2.4.4 Empty links
  var emptyLinks = Array.from(document.querySelectorAll('a')).filter(function(a){
    var txt = (a.textContent||'').trim();
    var aria = a.getAttribute('aria-label');
    var hasImg = a.querySelector('img[alt]:not([alt=""])');
    return !txt && !aria && !hasImg;
  });
  if (emptyLinks.length) { ded += emptyLinks.length<=2?3:5; push('2.4.4c','serious','2.4.4','Empty links ('+emptyLinks.length+')','Links with no text are meaningless to screen readers.',emptyLinks[0]); }

  // 2.4.4 target=_blank without warning
  var blankLinks = Array.from(document.querySelectorAll('a[target="_blank"]')).filter(function(a){
    return !(a.getAttribute('aria-label') || '').includes('new') && !(a.textContent || '').includes('new window');
  });
  if (blankLinks.length > 2) { ded += 2; push('2.4.4b','minor','2.4.4',blankLinks.length+' links open new tab without warning','Users should be warned when links open in a new tab.',blankLinks[0]); }

  // 2.4.6 Empty headings
  var emptyH = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).filter(function(h){
    return h.textContent.trim().length === 0;
  });
  if (emptyH.length) { ded += 3; push('2.4.6','moderate','2.4.6',emptyH.length+' empty heading(s)','Empty headings confuse screen reader navigation.',emptyH[0]); }
  else pass('2.4.6','No empty headings');

  // 2.4.11 Focus indicators
  var focusEls = Array.from(document.querySelectorAll('a,button,[tabindex="0"]')).slice(0,30);
  var hiddenFocus = focusEls.filter(function(el){
    try {
      var cs = window.getComputedStyle(el);
      var ow = parseFloat(cs.outlineWidth);
      var os = cs.outlineStyle;
      var shadow = cs.boxShadow;
      return (ow === 0 || os === 'none') && (!shadow || shadow === 'none');
    } catch(e) { return false; }
  });
  if (hiddenFocus.length >= 3) { ded += 5; push('2.4.11','serious','2.4.11','Focus indicator hidden ('+hiddenFocus.length+' elements)','outline:none without replacement makes keyboard navigation invisible.',hiddenFocus[0]); }
  else pass('2.4.11','Focus indicators appear visible');

  // 2.5.3 ARIA label mismatch
  var mismatch = Array.from(document.querySelectorAll('[aria-label]')).filter(function(el){
    var label = (el.getAttribute('aria-label') || '').toLowerCase().trim();
    var text = (el.textContent || '').toLowerCase().trim();
    return text.length > 2 && label.length > 2 && !label.includes(text.slice(0,8)) && !text.includes(label.slice(0,8));
  });
  if (mismatch.length) { ded += mismatch.length<=3?4:6; push('2.5.3','serious','2.5.3','Possible aria-label mismatch ('+mismatch.length+')','aria-label should include visible text so speech users can activate by voice.',mismatch[0]); }

  // 2.5.8 Touch targets
  var smallTargets = Array.from(document.querySelectorAll('a,button,[role=button],[role=link]')).filter(function(el){
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24);
  });
  if (smallTargets.length) { ded += smallTargets.length<=3?3:5; push('2.5.8','moderate','2.5.8',smallTargets.length+' small touch target(s)','Interactive elements should be at least 24x24px (WCAG 2.2).',smallTargets[0]); }
  else pass('2.5.8','Touch targets meet minimum size');

  // 3.1.1 Language
  var lang = document.documentElement.getAttribute('lang');
  if (!lang || lang.trim().length < 2) { ded += 5; push('3.1.1','serious','3.1.1','Page language not set','Add lang attribute to <html> so screen readers use the correct voice.',document.documentElement); }
  else pass('3.1.1','Page language set: '+lang);

  // 3.3.2 Required fields
  var reqInputs = Array.from(document.querySelectorAll('[required],[aria-required=true]'));
  var unlabeledReq = reqInputs.filter(function(inp){
    return !inp.getAttribute('aria-label') && !inp.getAttribute('aria-labelledby') && !(inp.id && document.querySelector('label[for="'+inp.id+'"]'));
  });
  if (unlabeledReq.length) { ded += 3; push('3.3.2','moderate','3.3.2',unlabeledReq.length+' required field(s) not labeled','Required fields must be clearly labeled and indicated.',unlabeledReq[0]); }
  else if (reqInputs.length) pass('3.3.2','Required fields are labeled');

  // 4.1.1 Duplicate IDs
  var allIds = Array.from(document.querySelectorAll('[id]')).map(function(e){return e.id;}).filter(Boolean);
  var idCounts = {};
  allIds.forEach(function(id){ idCounts[id] = (idCounts[id]||0)+1; });
  var dupIds = Object.keys(idCounts).filter(function(id){ return idCounts[id]>1; });
  if (dupIds.length) { ded += dupIds.length<=2?3:5; push('4.1.1','serious','4.1.1','Duplicate IDs ('+dupIds.length+')','Duplicate IDs break label associations and ARIA references.',null); }
  else pass('4.1.1','No duplicate IDs');

  // 4.1.1 Invalid ARIA
  var ariaEls = document.querySelectorAll('[role]');
  var validRoles = ['alert','alertdialog','application','article','banner','button','cell','checkbox','columnheader','combobox','complementary','contentinfo','definition','dialog','directory','document','feed','figure','form','grid','gridcell','group','heading','img','link','list','listbox','listitem','log','main','marquee','math','menu','menubar','menuitem','menuitemcheckbox','menuitemradio','navigation','none','note','option','presentation','progressbar','radio','radiogroup','region','row','rowgroup','rowheader','scrollbar','search','searchbox','separator','slider','spinbutton','status','switch','tab','table','tablist','tabpanel','term','textbox','timer','toolbar','tooltip','tree','treegrid','treeitem'];
  var badRoles = Array.from(ariaEls).filter(function(el){ return validRoles.indexOf(el.getAttribute('role')) === -1; });
  if (badRoles.length) { ded += 4; push('4.1.1b','serious','4.1.1','Invalid ARIA role(s) found ('+badRoles.length+')','Invalid roles are ignored by assistive technologies.',badRoles[0]); }
  else pass('4.1.1b','All ARIA roles are valid');

  // 4.1.2 ARIA widget props
  var ariaFails = Array.from(document.querySelectorAll("[role='switch'],[role='checkbox'],[role='radio']")).filter(function(el){ return !el.hasAttribute('aria-checked'); }).slice(0,5);
  if (ariaFails.length) { ded += 5; push('4.1.2d','serious','4.1.2','ARIA widgets missing required properties ('+ariaFails.length+')','Custom ARIA widgets need required state properties.',ariaFails[0]); }

  // 4.1.2 Unnamed buttons
  var unnamedBtns = Array.from(document.querySelectorAll('button,[role=button]')).filter(function(el){
    return !el.textContent.trim() && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby') && !el.getAttribute('title');
  });
  if (unnamedBtns.length) { ded += unnamedBtns.length<=2?5:8; push('4.1.2','critical','4.1.2',unnamedBtns.length+' unnamed button(s)','Buttons must have accessible names for screen readers.',unnamedBtns[0]); }
  else pass('4.1.2','All buttons have accessible names');

  // 4.1.2 Unnamed iframes
  var iframes = document.querySelectorAll('iframe');
  var badIframes = Array.from(iframes).filter(function(f){ return !f.getAttribute('title') && !f.getAttribute('aria-label'); });
  if (badIframes.length) { ded += 4; push('4.1.2b','serious','4.1.2',badIframes.length+' iframe(s) missing title','Iframes must have a title attribute describing their content.',badIframes[0]); }
  else if (iframes.length) pass('4.1.2b','All iframes have titles');

  // SVG accessible names (skip hidden)
  var badSvg = [];
  document.querySelectorAll('svg').forEach(function(svg){
    if(svg.getAttribute('aria-hidden')==='true'||svg.getAttribute('role')==='presentation') return;
    try{var cs=window.getComputedStyle(svg);if(cs.display==='none'||cs.visibility==='hidden')return;}catch(e){}
    var anc=svg.parentElement;
    while(anc){if(anc.getAttribute&&anc.getAttribute('aria-hidden')==='true')return;anc=anc.parentElement;}
    var hasTitle=svg.querySelector('title');
    var hasAria=svg.getAttribute('aria-label')||svg.getAttribute('aria-labelledby');
    var parentBtn=svg.closest('button,a,[role="button"]');
    var parentHasLabel=parentBtn&&(parentBtn.getAttribute('aria-label')||parentBtn.textContent.trim().length>1);
    if(!hasTitle&&!hasAria&&!parentHasLabel) badSvg.push(svg);
  });
  if(badSvg.length) { ded += badSvg.length<=3?3:badSvg.length<=10?5:7; push('4.1.2c','serious','4.1.2',badSvg.length+' SVG element(s) missing accessible name','Meaningful SVGs need a <title> or aria-label.',badSvg[0]); }
  else pass('4.1.2c','SVGs have accessible names or are decorative');

  // Landmarks
  var hasMain = document.querySelector('main,[role=main]');
  if (!hasMain) { ded += 2; push('1.3.6','minor','1.3.6','No <main> landmark','Page structure is unclear without landmark regions.',null); }
  else pass('1.3.6','Landmarks present');

  // 2.4.11 Sticky elements
  var sticky = Array.from(document.querySelectorAll('*')).slice(0,500).filter(function(el){
    try{var p=window.getComputedStyle(el).position;return p==='sticky'||p==='fixed';}catch(e){return false;}
  });
  if(sticky.length>2) push('2.4.11b','minor','2.4.11',sticky.length+' sticky/fixed element(s)','Sticky elements may obstruct content for zoom users.',sticky[0]);

  // Cognitive load
  var interactive = document.querySelectorAll('a,button,input,select,textarea,[role=button],[role=link],[onclick]');
  if(interactive.length>60) push('cog','minor','3.2.4','High interactive element count ('+interactive.length+')','Pages with 60+ interactive elements may overwhelm users.',null);

  // 1.4.10 Fixed pixel widths
  var fixedWidth = Array.from(document.querySelectorAll('*')).slice(0,500).filter(function(el){
    var s=el.getAttribute('style')||'';
    return /width\\s*:\\s*\\d{4,}px/.test(s);
  });
  if(fixedWidth.length) push('1.4.10b','minor','1.4.10',fixedWidth.length+' element(s) with large fixed pixel width','Fixed pixel widths prevent content from reflowing on small screens.',fixedWidth[0]);

  // 2.3.3 Reduced motion
  var hasMotionQuery = false;
  try{
    Array.from(document.styleSheets).forEach(function(sheet){
      try{
        Array.from(sheet.cssRules||[]).forEach(function(rule){
          if(rule.conditionText&&rule.conditionText.includes('prefers-reduced-motion')) hasMotionQuery=true;
        });
      }catch(e){}
    });
  }catch(e){}
  var hasAnimations = Array.from(document.querySelectorAll('*')).slice(0,200).some(function(el){
    try{var s=window.getComputedStyle(el);return s.animationName!=='none';}catch(e){return false;}
  });
  if(hasAnimations && !hasMotionQuery) { ded += 3; push('2.3.3','moderate','2.3.3','No prefers-reduced-motion media query','Animations should respect user motion preferences (WCAG 2.2).',null); }
  else if(hasMotionQuery) pass('2.3.3','prefers-reduced-motion supported');

  // Score calculation (bookmarklet-aligned)
  var critCount = issues.filter(function(i){return i.sev==='critical';}).length;
  var serCount  = issues.filter(function(i){return i.sev==='serious';}).length;
  var totalChecks = issues.length + passes.length;
  var passRatio = totalChecks > 0 ? passes.length / totalChecks : 0;
  var rawScore = 100 - ded + (passRatio * 15);
  if      (critCount >= 3) rawScore = Math.min(rawScore, 30);
  else if (critCount >= 2) rawScore = Math.min(rawScore, 45);
  else if (critCount === 1) rawScore = Math.min(rawScore, 62);
  else if (serCount  >= 3) rawScore = Math.min(rawScore, 70);
  else if (serCount  >= 1) rawScore = Math.min(rawScore, 82);
  var score = Math.max(0, Math.min(issues.length > 0 ? 99 : 100, Math.round(rawScore)));

  return { issues: issues, passes: passes, score: score };
})();
`;

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url required' });

  // Validate URL
  let parsedUrl;
  try {
    parsedUrl = new URL(url.startsWith('http') ? url : 'https://' + url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 800 },
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    await page.goto(parsedUrl.href, {
      waitUntil: 'networkidle2',
      timeout: 20000,
    });

    // Wait for dynamic content
    await new Promise(r => setTimeout(r, 1500));

    const result = await page.evaluate(SCANNER_SCRIPT);

    return res.status(200).json({
      url: parsedUrl.href,
      scannedAt: new Date().toISOString(),
      scanType: 'headless',
      standards: ['WCAG 2.1 AA', 'WCAG 2.2', 'ADA Title III', 'Section 508'],
      ...result
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }
};

module.exports.config = { maxDuration: 30 };
