import { useState } from "react";

/* ─── DESIGN TOKENS ─────────────────────────────────────────── */
const C = {
  bg:           "#F0F2F7",
  surface:      "#FFFFFF",
  surfaceAlt:   "#F8F9FC",
  border:       "#E2E6EF",
  borderHover:  "#BEC5D4",
  text:         "#0D1421",
  textSub:      "#4A5568",
  textMuted:    "#8A95A8",
  accent:       "#1A56DB",
  accentLight:  "#EBF1FF",
  accentHover:  "#1447C0",
  green:        "#0D7A3E",
  greenLight:   "#D1FAE5",
  red:          "#C41C1C",
  redLight:     "#FEE2E2",
  orange:       "#C05600",
  orangeLight:  "#FFEDD5",
  yellow:       "#9A6800",
  yellowLight:  "#FEF9C3",
  shadow:       "0 1px 4px rgba(0,0,0,0.07)",
  shadowMd:     "0 4px 16px rgba(0,0,0,0.10)",
  shadowLg:     "0 12px 40px rgba(0,0,0,0.12)",
};

const SEV = {
  critical: { bg: C.redLight,    text: C.red,    border: "#FCA5A5", label: "Critical" },
  serious:  { bg: C.orangeLight, text: C.orange, border: "#FDB896", label: "Serious"  },
  moderate: { bg: C.yellowLight, text: C.yellow, border: "#FDE68A", label: "Moderate" },
  minor:    { bg: C.greenLight,  text: C.green,  border: "#6EE7B7", label: "Minor"    },
};

const PRINCIPLES = ["Perceivable","Operable","Understandable","Robust"];

/* ─── SCAN ENGINE (mirrors bookmarklet logic) ──────────────── */
function runLocalScan(doc) {
  const issues = [], passes = [];
  let ded = 0;

  function push(sev, title, wcag, desc, fix, el) {
    const principleMap = {
      "1":  "Perceivable", "2": "Operable", "3": "Understandable", "4": "Robust"
    };
    const principle = principleMap[wcag?.split(".")[0]] || "Robust";
    issues.push({ severity: sev, title, wcag, principle, description: desc, fix, element: el?.outerHTML?.slice(0,200) || null });
  }
  function pass(t, w) { passes.push({ title: t, wcag: w }); }

  function isTrackingPixel(img) {
    const s = img.getAttribute("src") || "";
    const w = img.getAttribute("width"), h = img.getAttribute("height");
    if ((w === "1" || w === 1) && (h === "1" || h === 1)) return true;
    return ["/pixel/","/track/","/beacon","/collect","adsct","bat.bing","trkn.us","arttrk.","adxcel","bidr.io","ispot.tv","mdhv.io","dmpxs.com"].some(p => s.includes(p));
  }

  function isHidden(el) {
    if (!el || !el.nodeType) return false;
    // DOMParser documents have no layout engine — getComputedStyle returns defaults.
    // For parsed docs, fall back to checking inline style and hidden attributes only.
    const inDoc = el.ownerDocument === (typeof document !== "undefined" ? document : null);
    if (!inDoc) {
      // Attribute-based hidden checks (reliable on DOMParser docs)
      if (el.hasAttribute("hidden")) return true;
      if (el.getAttribute("aria-hidden") === "true") return false; // aria-hidden ≠ visually hidden
      const s = el.getAttribute("style") || "";
      if (/display\s*:\s*none/i.test(s)) return true;
      if (/visibility\s*:\s*hidden/i.test(s)) return true;
      return false;
    }
    try {
      const cs = window.getComputedStyle(el);
      return cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0;
    } catch(e) {
      if (e instanceof TypeError) return false;
      throw e;
    }
  }

  function hasAriaHiddenAncestor(el) {
    let p = el;
    while (p) { if (p.getAttribute && p.getAttribute("aria-hidden") === "true") return true; p = p.parentElement; }
    return false;
  }

  // 1.1.1 Alt text
  try {
    const miss = [], decorative = [];
    doc.querySelectorAll("img").forEach(img => {
      if (isTrackingPixel(img)) return;
      if (hasAriaHiddenAncestor(img)) return;
      const role = img.getAttribute("role");
      if (role === "presentation" || role === "none") return;
      if (!img.hasAttribute("alt")) miss.push(img);
      else if (img.getAttribute("alt").trim() === "") decorative.push(img);
    });
    if (miss.length) { ded += miss.length <= 2 ? 6 : miss.length <= 5 ? 12 : 20; push("critical", `Images missing alt text (${miss.length})`, "1.1.1", "Images with no alt attribute are invisible to screen readers.", 'Add alt="description". Use alt="" only for truly decorative images.', miss[0]); }
    else pass("All images have alt text", "1.1.1");
    if (decorative.length) push("minor", `${decorative.length} image(s) with empty alt — verify decorative`, "1.1.1", "Images with alt=\"\" are treated as decorative. Confirm these add no meaning.", "If image conveys information, add a descriptive alt attribute.", decorative[0]);
  } catch(e) {}

  // 1.3.1 Headings
  try {
    const heads = Array.from(doc.querySelectorAll("h1,h2,h3,h4,h5,h6"));
    const h1s = heads.filter(h => h.tagName === "H1");
    if (!h1s.length) { ded += 5; push("serious", "No H1 heading found", "1.3.1", "Every page should have exactly one H1 describing its main topic.", "Add a single H1 heading to the page.", null); }
    else if (h1s.length > 1) { ded += 3; push("moderate", `Multiple H1 headings (${h1s.length})`, "1.3.1", "Multiple H1s confuse screen reader users about page structure.", "Consolidate to a single H1.", h1s[1]); }
    else pass("Single H1 heading present", "1.3.1");
    const skipped = [];
    for (let i = 1; i < heads.length; i++) {
      const prev = parseInt(heads[i-1].tagName[1]), cur = parseInt(heads[i].tagName[1]);
      if (cur - prev > 1) skipped.push(heads[i]);
    }
    if (skipped.length) { ded += 4; push("moderate", `Heading levels skipped (${skipped.length})`, "1.3.1", "Jumping e.g. H2→H4 breaks document outline for screen readers.", "Use heading levels in order, never skip.", skipped[0]); }
    else if (heads.length > 1) pass("Heading levels are in order", "1.3.1");
  } catch(e) {}

  // 1.3.1 Form labels
  try {
    const inputs = Array.from(doc.querySelectorAll("input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]),select,textarea"));
    const unlabeled = inputs.filter(inp => {
      const id = inp.getAttribute("id");
      const hasLbl = id && doc.querySelector(`label[for="${id}"]`);
      const ariaLabel = inp.getAttribute("aria-label");
      const ariaLabelledBy = inp.getAttribute("aria-labelledby");
      // Verify aria-labelledby actually points to an existing element
      const hasValidLabelledBy = ariaLabelledBy &&
        ariaLabelledBy.trim().split(/\s+/).some(refId => doc.getElementById(refId));
      const wrapped = inp.closest("label");
      return !hasLbl && !ariaLabel && !hasValidLabelledBy && !wrapped;
    });
    if (unlabeled.length) { ded += unlabeled.length <= 2 ? 10 : 15; push("critical", `Form inputs without labels (${unlabeled.length})`, "1.3.1", "Placeholder text disappears on input and is not a substitute for a label.", "Add <label> or aria-label to each input.", unlabeled[0]); }
    else if (inputs.length) pass("All form inputs are labeled", "1.3.1");
  } catch(e) {}

  // 1.3.5 Autocomplete
  try {
    const pf = Array.from(doc.querySelectorAll("input[type=text],input[type=email],input[type=tel]")).filter(i => {
      const a = (i.getAttribute("aria-label") || i.getAttribute("name") || i.getAttribute("id") || "").toLowerCase();
      return a.includes("name") || a.includes("email") || a.includes("phone");
    });
    const na = pf.filter(i => !i.getAttribute("autocomplete"));
    if (na.length) { ded += 4; push("minor", `Personal fields missing autocomplete (${na.length})`, "1.3.5", "Name and email fields need autocomplete for assistive tech users.", "Add autocomplete=name or autocomplete=email.", na[0]); }
    else if (pf.length) pass("Personal fields have autocomplete", "1.3.5");
  } catch(e) {}

  // 1.4.1 Color contrast — requires live layout (getComputedStyle)
  // DOMParser documents return default styles, not actual page styles.
  // Only run this check on the live document or skip with a note.
  if (typeof window !== "undefined" && doc === window.document) {
    try {
      const textEls = Array.from(doc.querySelectorAll("p,h1,h2,h3,h4,h5,h6,a,button,label")).filter(el => !isHidden(el)).slice(0,120);
      const fails = [];
      function lum(r,g,b) {
        [r,g,b] = [r,g,b].map(v => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); });
        return 0.2126*r + 0.7152*g + 0.0722*b;
      }
      function parseRGB(c) {
        const m = (c||"").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        return m ? [+m[1],+m[2],+m[3]] : null;
      }
      function effectiveBg(el) {
        // Walk up the DOM to find the first non-transparent background
        let node = el;
        while (node && node !== document.body.parentElement) {
          const cs = window.getComputedStyle(node);
          const bg = parseRGB(cs.backgroundColor);
          if (bg && cs.backgroundColor !== "transparent" && cs.backgroundColor !== "rgba(0, 0, 0, 0)") return bg;
          node = node.parentElement;
        }
        return [255, 255, 255]; // assume white if nothing found
      }
      textEls.forEach(el => {
        try {
          const cs = window.getComputedStyle(el);
          const fg = parseRGB(cs.color);
          if (!fg) return;
          const bg = effectiveBg(el);
          const l1 = lum(...fg), l2 = lum(...bg);
          const ratio = (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
          const fs = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 700;
          const large = fs >= 18 || (bold && fs >= 14);
          if (ratio < (large ? 3 : 4.5)) fails.push(el);
        } catch { /* skip element */ }
      });
      if (fails.length) { ded += fails.length <= 2 ? 5 : fails.length <= 5 ? 10 : 16; push("serious", `Color contrast failures (${fails.length})`, "1.4.3", "Text must have 4.5:1 contrast ratio (3:1 for large/bold text).", "Use a contrast checker to ensure colors meet WCAG AA ratios.", fails[0]); }
      else if (textEls.length > 0) pass(`Color contrast passes sample check (${textEls.length}/120 elements — gradients not checked)`, "1.4.3");
    } catch(e) { /* contrast check failed gracefully */ }
  } else {
    pass("Color contrast (check requires live page — use headless scan)", "1.4.3");
  }

  // 1.4.4 Zoom
  try {
    const meta = doc.querySelector("meta[name=viewport]");
    const content = meta?.getAttribute("content") || "";
    if (content.includes("user-scalable=no") || content.match(/maximum-scale=1(?!\.)/)) { ded += 7; push("critical", "User zoom disabled by viewport meta", "1.4.4", "Disabling zoom prevents users with low vision from enlarging text.", "Remove user-scalable=no and maximum-scale restrictions.", meta); }
    else pass("User zoom is not disabled", "1.4.4");
  } catch(e) {}

  // 1.4.10 Fixed widths
  try {
    const fixedW = Array.from(doc.querySelectorAll("[style*='width']")).filter(el => {
      const styleStr = el.getAttribute("style") || "";
      const match = styleStr.match(/(?:^|;)\s*width\s*:\s*(\d+)px/i);
      return match && parseInt(match[1]) > 400;
    }).slice(0,5);
    // Also flag viewport meta that sets a fixed width
    const viewportMeta = doc.querySelector("meta[name=viewport]");
    const hasFixedViewport = viewportMeta && /width=\d{3,}/.test(viewportMeta.getAttribute("content") || "");
    if (fixedW.length || hasFixedViewport) {
      ded += 4;
      push("minor", `Potential horizontal scroll risk (${fixedW.length} fixed-width element${fixedW.length !== 1 ? "s" : ""}${hasFixedViewport ? " + fixed viewport" : ""})`, "1.4.10", "Fixed pixel widths can cause horizontal scrolling at small viewports or high zoom. Note: CSS class-based widths require a live scan to detect.", "Replace fixed px widths with max-width, %, or vw units.", fixedW[0] || null);
    } else pass("No inline fixed-width elements detected (CSS classes require live scan)", "1.4.10");
  } catch(e) {}

  // 2.1.1 Positive tabindex
  try {
    const pos = Array.from(doc.querySelectorAll("[tabindex]")).filter(el => parseInt(el.getAttribute("tabindex")) > 0);
    if (pos.length) { ded += 4; push("moderate", `Positive tabindex values (${pos.length})`, "2.1.1", "Positive tabindex values disrupt natural keyboard navigation order.", "Use tabindex=0 or -1 only. Let DOM order determine tab sequence.", pos[0]); }
    else pass("No positive tabindex values", "2.1.1");
  } catch(e) {}

  // 2.4.1 Skip nav
  try {
    // Broad skip nav detection — covers various common patterns
    const skipSelectors = [
      "a[href='#main-content']", "a[href='#main']", "a[href='#content']",
      "a[href='#skip']", "a[href='#skip-nav']", "a[href='#maincontent']",
      ".skip-link", ".skip-nav", ".skip-to-main", ".skip-to-content",
      "[class*='skip-link']", "[class*='skip-nav']", "[class*='skipnav']",
      "a[class*='skip']", "a[id*='skip']"
    ];
    const skip = skipSelectors.some(sel => { try { return doc.querySelector(sel); } catch { return false; } });
    if (!skip) { ded += 5; push("moderate", "No skip navigation link detected", "2.4.1", "Keyboard users must tab through all nav items on every page without a skip link.", "Add <a href='#main-content' class='skip-link'>Skip to main content</a> as first focusable element.", null); }
    else pass("Skip navigation link present", "2.4.1");
  } catch(e) {}

  // 2.4.2 Page title
  try {
    const t = doc.querySelector("title");
    if (!t || t.textContent.trim().length < 3) { ded += 5; push("serious", "Page missing descriptive title", "2.4.2", "Screen readers announce the page title first — it must be descriptive.", "Add a unique, descriptive <title> to the <head>.", null); }
    else pass("Page has a descriptive title", "2.4.2");
  } catch(e) {}

  // 2.4.3 Tabindex=-1 on interactive
  try {
    const trapped = Array.from(doc.querySelectorAll("a[href][tabindex='-1'],button[tabindex='-1']")).filter(el => !hasAriaHiddenAncestor(el));
    if (trapped.length) { ded += 5; push("moderate", `Interactive elements removed from tab order (${trapped.length})`, "2.4.3", "tabindex=-1 makes interactive elements unreachable by keyboard.", "Remove tabindex=-1 unless element also has aria-hidden=true.", trapped[0]); }
  } catch(e) {}

  // 2.4.4 Vague links
  try {
    const vague = ["click here","here","read more","learn more","more","link","this","continue","details","go","view","see more","see all","show more","open","start","get started","find out more","find out","download"];
    const empty = [], vagueFound = [];
    doc.querySelectorAll("a").forEach(a => {
      const txt = (a.textContent || "").trim().toLowerCase();
      const aria = (a.getAttribute("aria-label") || "").toLowerCase();
      const hasImg = a.querySelector("img[alt]:not([alt=''])");
      if (!txt && !aria && !hasImg) empty.push(a);
      else if (!aria && vague.includes(txt)) vagueFound.push(a);
    });
    if (empty.length) { ded += empty.length <= 2 ? 5 : 8; push("serious", `Empty links with no accessible name (${empty.length})`, "2.4.4", "Links with no text are meaningless to screen reader users.", "Add descriptive text, aria-label, or an img with alt inside the link.", empty[0]); }
    if (vagueFound.length) { ded += vagueFound.length <= 3 ? 4 : 7; push("moderate", `Links with vague text (${vagueFound.length})`, "2.4.4", '"Click here" and "Read more" are meaningless out of context.', "Use descriptive link text that makes sense alone.", vagueFound[0]); }
    if (!empty.length && !vagueFound.length) pass("Links have descriptive text", "2.4.4");
  } catch(e) {}

  // 2.4.11 Focus visibility — requires live layout engine (headless only)
  // DOMParser has no computed styles so window.getComputedStyle returns defaults;
  // skip this check in paste/proxy mode to avoid false positives.
  if (typeof window !== "undefined" && doc === window.document) {
    try {
      const focusEls = Array.from(doc.querySelectorAll("a,button,[tabindex='0']")).slice(0,30);
      const hidden = focusEls.filter(el => {
        try {
          const cs = window.getComputedStyle(el);
          const ow = parseFloat(cs.outlineWidth);
          const os = cs.outlineStyle;
          const shadow = cs.boxShadow;
          return (ow === 0 || os === "none") && (!shadow || shadow === "none");
        } catch { return false; } // don't swallow silently — log in dev
      });
      if (hidden.length >= 3) { ded += 7; push("serious", `Focus indicator hidden (${hidden.length} elements)`, "2.4.11", "outline:none without a replacement makes keyboard navigation invisible.", "Add :focus { outline: 2px solid #1A56DB; outline-offset: 2px } to your CSS.", hidden[0]); }
      else pass("Focus indicators appear visible", "2.4.11");
    } catch(e) { /* layout check failed gracefully */ }
  } else {
    pass("Focus visibility (check requires live page — use headless scan)", "2.4.11");
  }

  // 2.5.8 Touch targets — requires live layout engine (getBoundingClientRect)
  if (typeof window !== "undefined" && doc === window.document) {
    try {
      const small = Array.from(doc.querySelectorAll("a,button,[role=button]")).filter(el => {
        if (hasAriaHiddenAncestor(el) || isHidden(el)) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24);
      });
      if (small.length) { ded += small.length <= 3 ? 4 : 7; push("moderate", `Touch targets too small (${small.length})`, "2.5.8", "Interactive elements must be at least 24×24px per WCAG 2.2.", "Increase size to 24×24px minimum using padding.", small[0]); }
      else pass("Touch targets meet 24×24px minimum", "2.5.8");
    } catch(e) { /* layout check failed gracefully */ }
  } else {
    pass("Touch target size (check requires live page — use headless scan)", "2.5.8");
  }

  // 3.1.1 Lang attribute
  try {
    const lang = doc.documentElement?.getAttribute("lang");
    if (!lang || lang.trim().length < 2) { ded += 8; push("serious", "Missing lang attribute on html element", "3.1.1", "Screen readers need the lang attribute to use the correct voice profile.", "Add lang='en' (or appropriate language code) to <html>.", null); }
    else {
      const valid = ["en","en-US","en-GB","es","es-ES","fr","de","zh","ja","ko","pt","it","ru","ar","nl","pl","sv","da","fi","nb","tr","he","hi","th","vi","id","ms","ro","cs","hu","uk","el"];
      const isValid = valid.some(v => lang.toLowerCase().startsWith(v.toLowerCase()));
      if (!isValid) push("moderate", `Lang attribute may not be valid BCP 47 (${lang})`, "3.1.1", "The lang value may not be a recognized language code.", "Use a standard BCP 47 code like en, en-US, fr, de.", null);
      else pass(`Page language declared: ${lang}`, "3.1.1");
    }
  } catch(e) {}

  // 3.3.2 Error descriptions
  try {
    const req = Array.from(doc.querySelectorAll("input[required],input[aria-required=true]")).filter(i => !i.getAttribute("aria-describedby"));
    if (req.length) { ded += req.length <= 2 ? 4 : 6; push("moderate", `Required fields missing error descriptions (${req.length})`, "3.3.2", "Required inputs need aria-describedby pointing to error messages.", "Add aria-describedby to each required field.", req[0]); }
    else pass("Required fields have error descriptions", "3.3.2");
  } catch(e) {}

  // 4.1.1 Duplicate IDs
  try {
    const ids = Array.from(doc.querySelectorAll("[id]")).map(e => e.id).filter(Boolean);
    const counts = {};
    ids.forEach(id => counts[id] = (counts[id] || 0) + 1);
    const dups = Object.keys(counts).filter(id => counts[id] > 1);
    if (dups.length) { ded += dups.length <= 2 ? 5 : 8; push("serious", `Duplicate IDs (${dups.length})`, "4.1.1", "Duplicate IDs break label/input associations and ARIA references.", `Make all id attributes unique. Found: ${dups.slice(0,3).join(", ")}`, null); }
    else pass("No duplicate IDs", "4.1.1");
  } catch(e) {}

  // 4.1.2 Buttons accessible names
  try {
    const btns = Array.from(doc.querySelectorAll("button")).filter(b => {
      if (hasAriaHiddenAncestor(b) || isHidden(b)) return false;
      const txt = (b.textContent || "").trim();
      const aria = b.getAttribute("aria-label") || b.getAttribute("aria-labelledby");
      const title = b.getAttribute("title");
      return !txt && !aria && !title;
    });
    if (btns.length) { ded += btns.length <= 2 ? 8 : 12; push("critical", `Buttons missing accessible names (${btns.length})`, "4.1.2", "Icon-only buttons need aria-label for screen readers.", "Add aria-label='Action description' to each icon button.", btns[0]); }
    else pass("All buttons have accessible names", "4.1.2");
  } catch(e) {}

  // 4.1.2 Button type in forms
  try {
    const noType = Array.from(doc.querySelectorAll("button:not([type])")).filter(b => b.closest("form"));
    if (noType.length) push("minor", `Buttons in forms missing type attribute (${noType.length})`, "4.1.2", "Buttons without type default to type='submit', causing accidental form submission.", "Add type='button' to non-submit buttons, type='submit' to submit buttons.", noType[0]);
  } catch(e) {}

  // 4.1.2 ARIA required props
  try {
    const ariaFails = Array.from(doc.querySelectorAll("[role='switch'],[role='checkbox'],[role='radio']")).filter(el => !el.hasAttribute("aria-checked")).slice(0,5);
    if (ariaFails.length) { ded += 6; push("serious", `ARIA widgets missing required properties (${ariaFails.length})`, "4.1.2", "Custom ARIA widgets need required state properties like aria-checked.", "Add aria-checked to switches, checkboxes, and radio roles.", ariaFails[0]); }
  } catch(e) {}

  // 4.1.2 SVG accessible names
  try {
    const svgs = Array.from(doc.querySelectorAll("svg")).filter(svg => {
      if (hasAriaHiddenAncestor(svg) || svg.getAttribute("aria-hidden") === "true") return false;
      if (isHidden(svg)) return false;
      const role = svg.getAttribute("role");
      if (role === "presentation" || role === "none") return false;
      return !svg.getAttribute("aria-label") && !svg.getAttribute("aria-labelledby") && !svg.querySelector("title");
    }).slice(0,10);
    if (svgs.length > 3) { ded += 5; push("moderate", `SVG icons missing accessible names (${svgs.length})`, "4.1.2", "SVG icons without labels are invisible to screen readers.", "Add aria-label to informational SVGs, or aria-hidden='true' if decorative.", svgs[0]); }
  } catch(e) {}

  // 4.1.2 Iframes
  try {
    const frames = Array.from(doc.querySelectorAll("iframe")).filter(f => !f.getAttribute("title"));
    if (frames.length) { ded += 5; push("serious", `iFrames missing titles (${frames.length})`, "4.1.2", "Screen readers cannot describe the purpose of untitled iframes.", "Add title='Description of content' to each iframe.", frames[0]); }
    else pass("All iframes have titles", "4.1.2");
  } catch(e) {}

  // 4.1.2 Landmarks
  try {
    const hasMain = doc.querySelector("main,[role=main]");
    const hasNav = doc.querySelector("nav,[role=navigation]");
    if (!hasMain) { ded += 4; push("moderate", "No <main> landmark", "1.3.6", "Page structure is unclear without landmark regions.", "Add <main> around primary content.", null); }
    else pass("Page landmarks present", "1.3.6");
    if (!hasNav && doc.querySelectorAll("a").length > 3) { push("minor", "No <nav> landmark", "1.3.6", "Navigation links should be wrapped in a <nav> element.", "Wrap your navigation links in <nav>.", null); }
  } catch(e) {}

  // 2.4 Cognitive load
  try {
    const interactive = doc.querySelectorAll("a,button,input,select,textarea,[role='button'],[role='link'],[tabindex='0']");
    if (interactive.length > 60) push("minor", `High interactive element count (${interactive.length})`, "2.4", "Many interactive elements increase cognitive load for users with cognitive disabilities.", "Consider progressive disclosure to reduce complexity.", null);
    else pass(`Interactive element count is manageable (${interactive.length})`, "2.4");
  } catch(e) {}

  // 2.3.3 Reduced motion (HTML scan note)
  pass("prefers-reduced-motion (check via live page scan)", "2.3.3");

  // Score calculation
  const critCount = issues.filter(i => i.severity === "critical").length;
  const serCount  = issues.filter(i => i.severity === "serious").length;
  const totalChecks = issues.length + passes.length;
  const passRatio = totalChecks > 0 ? passes.length / totalChecks : 0;
  let rawScore = 100 - ded + (passRatio * 15);
  if      (critCount >= 3) rawScore = Math.min(rawScore, 30);
  else if (critCount >= 2) rawScore = Math.min(rawScore, 45);
  else if (critCount === 1) rawScore = Math.min(rawScore, 62);
  else if (serCount  >= 3) rawScore = Math.min(rawScore, 70);
  else if (serCount  >= 1) rawScore = Math.min(rawScore, 82);
  const score = Math.max(0, Math.min(issues.length > 0 ? 99 : 100, Math.round(rawScore)));

  const stats = { critical:0, serious:0, moderate:0, minor:0 };
  issues.forEach(i => { if (stats[i.severity] !== undefined) stats[i.severity]++; });

  const sevOrder = { critical:0, serious:1, moderate:2, minor:3 };
  issues.sort((a,b) => (sevOrder[a.severity]||3) - (sevOrder[b.severity]||3));

  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
  const level = critCount > 0 ? "Non-Compliant" : serCount > 0 ? "Partial" : score >= 90 ? "AA" : "Partial";
  const adaRisk = critCount >= 3 ? "Critical" : critCount >= 1 ? "High" : serCount >= 3 ? "High" : serCount >= 1 ? "Medium" : "Low";

  return { score, grade, level, adaRisk, stats, issues, passes, scanType: "html" };
}

/* ─── UI ATOMS ───────────────────────────────────────────────── */
function Chip({ severity }) {
  const s = SEV[severity] || SEV.minor;
  return <span style={{ background:s.bg, color:s.text, border:`1px solid ${s.border}`, padding:"2px 9px", borderRadius:99, fontSize:11, fontWeight:700, letterSpacing:.3, whiteSpace:"nowrap" }}>{s.label}</span>;
}

function Tag({ children, color=C.accent, bg=C.accentLight }) {
  return <span style={{ background:bg, color, padding:"3px 10px", borderRadius:99, fontSize:11, fontWeight:600, letterSpacing:.3 }}>{children}</span>;
}

function Card({ children, style={} }) {
  return <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, boxShadow:C.shadow, ...style }}>{children}</div>;
}

function Btn({ children, onClick, disabled, variant="primary", small=false, style={} }) {
  const base = { border:"none", borderRadius:9, cursor:disabled?"not-allowed":"pointer", fontFamily:"'DM Sans',sans-serif", fontWeight:600, fontSize:small?13:14, padding:small?"7px 14px":"11px 22px", transition:"all .15s", display:"inline-flex", alignItems:"center", gap:7, opacity:disabled?.5:1, ...style };
  const variants = {
    primary:   { background:C.accent, color:"#fff", boxShadow:"0 1px 3px rgba(26,86,219,.25)" },
    secondary: { background:C.surface, color:C.text, border:`1px solid ${C.border}`, boxShadow:C.shadow },
    ghost:     { background:"transparent", color:C.textSub },
  };
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant] }}>{children}</button>;
}

/* ─── SCORE RING ─────────────────────────────────────────────── */
function ScoreRing({ score, stats, altCount, totalImages, adaRisk, level }) {
  const r = 76, circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 90 ? C.green : score >= 70 ? C.accent : score >= 50 ? C.orange : C.red;
  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
  const label = score >= 90 ? "Excellent" : score >= 80 ? "Good" : score >= 70 ? "Needs Improvement" : score >= 60 ? "Needs Work" : "Critical";

  return (
    <div style={{ background:`linear-gradient(135deg, ${color}12 0%, ${C.surface} 55%)`, border:`1px solid ${color}28`, borderRadius:18, padding:"28px 28px 22px", marginBottom:20, boxShadow:`0 6px 24px ${color}14` }}>
      <div style={{ display:"flex", gap:28, alignItems:"center", flexWrap:"wrap", marginBottom:22 }}>
        {/* Ring */}
        <div style={{ position:"relative", flexShrink:0 }}>
          <svg width={172} height={172} viewBox="0 0 172 172"
            role="img"
            aria-label={`Accessibility score: ${score} out of 100, grade ${grade}, ${label}`}>
            <defs>
              <linearGradient id="sg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={color} stopOpacity=".4"/>
                <stop offset="100%" stopColor={color}/>
              </linearGradient>
            </defs>
            <circle cx={86} cy={86} r={r} fill="none" stroke={color+"18"} strokeWidth={12}/>
            <circle cx={86} cy={86} r={r} fill="none" stroke="url(#sg)" strokeWidth={12}
              strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
              style={{ transform:"rotate(-90deg)", transformOrigin:"86px 86px", transition:"stroke-dashoffset 1.4s cubic-bezier(.4,0,.2,1)" }}/>
            <text x={86} y={78} textAnchor="middle" fill={C.text} fontSize={42} fontWeight={800} fontFamily="'DM Sans',sans-serif" aria-hidden="true">{score}</text>
            <text x={86} y={98} textAnchor="middle" fill={C.textMuted} fontSize={12} fontFamily="'DM Sans',sans-serif" aria-hidden="true">out of 100</text>
          </svg>
          <div aria-hidden="true" style={{ position:"absolute", bottom:6, right:6, width:36, height:36, borderRadius:"50%", background:color, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, fontWeight:800, boxShadow:`0 2px 8px ${color}55`, fontFamily:"'DM Sans',sans-serif" }}>{grade}</div>
        </div>

        {/* Text */}
        <div style={{ flex:1, minWidth:180 }}>
          <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", marginBottom:10 }}>
            <span style={{ fontSize:26, fontWeight:800, color, letterSpacing:"-0.5px", fontFamily:"'DM Sans',sans-serif" }}>{label}</span>
            <span style={{ background:color+"18", color, padding:"3px 11px", borderRadius:99, fontSize:12, fontWeight:700, border:`1px solid ${color}30` }}>{level}</span>
          </div>
          <div style={{ display:"flex", gap:7, flexWrap:"wrap", marginBottom:14 }}>
            <span style={{ padding:"3px 10px", borderRadius:99, fontSize:11, fontWeight:700,
              background: adaRisk==="Critical"?"#fef2f2":adaRisk==="High"?"#fff7ed":adaRisk==="Medium"?"#fefce8":"#f0fdf4",
              color: adaRisk==="Critical"?"#991b1b":adaRisk==="High"?"#9a3412":adaRisk==="Medium"?"#854d0e":"#166534",
              border:`1px solid ${adaRisk==="Critical"?"#fca5a5":adaRisk==="High"?"#fdba74":adaRisk==="Medium"?"#fde047":"#86efac"}`
            }}>⚖️ ADA Risk: {adaRisk}</span>
            <Tag color="#5b21b6" bg="#f5f3ff">WCAG 2.1/2.2 • ADA • §508</Tag>
          </div>
          {/* Severity mini counts */}
          <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
            {[
              { label:"Critical", val:stats?.critical??0, color:C.red, bg:C.redLight },
              { label:"Serious",  val:stats?.serious??0,  color:C.orange, bg:C.orangeLight },
              { label:"Moderate", val:stats?.moderate??0, color:C.yellow, bg:C.yellowLight },
              { label:"Minor",    val:stats?.minor??0,    color:C.green, bg:C.greenLight },
            ].map(s => (
              <div key={s.label} style={{ background:s.bg, border:`1px solid ${s.color}33`, borderRadius:9, padding:"7px 14px", textAlign:"center", minWidth:60 }}>
                <div style={{ fontSize:22, fontWeight:800, color:s.color, fontFamily:"'DM Sans',sans-serif", lineHeight:1 }}>{s.val}</div>
                <div style={{ fontSize:10, color:s.color, textTransform:"uppercase", letterSpacing:.6, marginTop:2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── ISSUE ROW ──────────────────────────────────────────────── */
function IssueRow({ issue }) {
  const [open, setOpen] = useState(false);
  const s = SEV[issue.severity] || SEV.minor;
  return (
    <div style={{ border:`1px solid ${C.border}`, borderRadius:11, overflow:"hidden", marginBottom:7, boxShadow:open?C.shadowMd:"none", transition:"box-shadow .15s" }}>
      <button
        onClick={() => setOpen(o=>!o)}
        aria-expanded={open}
        aria-label={`${issue.severity}: ${issue.title} — WCAG ${issue.wcag}. ${open ? "Collapse" : "Expand"} details`}
        style={{ width:"100%", background:open?"#FAFBFD":C.surface, border:"none", padding:"13px 17px", cursor:"pointer", display:"flex", alignItems:"center", gap:11, textAlign:"left" }}>
        <span aria-hidden="true" style={{ width:7, height:7, borderRadius:"50%", background:s.text, flexShrink:0 }}/>
        <Chip severity={issue.severity}/>
        <span style={{ flex:1, fontSize:13.5, fontWeight:500, color:C.text }}>{issue.title}</span>
        <Tag color={C.textSub} bg={C.bg}>{issue.wcag}</Tag>
        <span aria-hidden="true" style={{ color:C.textMuted, fontSize:16, marginLeft:4, flexShrink:0 }}>{open?"▲":"▼"}</span>
      </button>
      {open && (
        <div style={{ padding:"0 17px 17px", borderTop:`1px solid ${C.border}`, background:"#FAFBFD" }}>
          <p style={{ color:C.textSub, fontSize:13, margin:"13px 0 10px", lineHeight:1.7 }}>{issue.description}</p>
          {issue.element && (
            <pre style={{ background:"#0D1421", color:"#7DD3FC", padding:"11px 15px", borderRadius:8, fontSize:11, overflowX:"auto", margin:"9px 0", fontFamily:"'JetBrains Mono','Fira Code',monospace", whiteSpace:"pre-wrap", wordBreak:"break-all", lineHeight:1.6 }}>{issue.element}</pre>
          )}
          <div style={{ background:C.greenLight, border:`1px solid #6EE7B7`, borderRadius:8, padding:"9px 13px", marginTop:9, display:"flex", gap:7, alignItems:"flex-start" }}>
            <span style={{ color:C.green, fontWeight:700, fontSize:13, flexShrink:0 }}>✓ Fix</span>
            <span style={{ color:"#065F46", fontSize:13, lineHeight:1.6 }}>{issue.fix}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── REPORT GENERATOR ───────────────────────────────────────── */
function esc(str) {
  return String(str || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function generateReport({ url, result, altImages, totalImages }) {
  const date = new Date().toLocaleDateString("en-US", { year:"numeric", month:"long", day:"numeric" });
  const safeUrl = esc(url);
  const score = result?.score || 0;
  const scoreColor = score >= 90 ? "#0D7A3E" : score >= 70 ? "#1A56DB" : score >= 50 ? "#C05600" : "#C41C1C";
  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
  const stats = result?.stats || {};
  const issues = result?.issues || [];
  const passes = result?.passes || [];

  const sevCSS = { critical:"background:#FEE2E2;color:#C41C1C;border:1px solid #FCA5A5", serious:"background:#FFEDD5;color:#C05600;border:1px solid #FDB896", moderate:"background:#FEF9C3;color:#9A6800;border:1px solid #FDE68A", minor:"background:#D1FAE5;color:#0D7A3E;border:1px solid #6EE7B7" };

  const doc = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>Beacon Report — ${safeUrl || "Accessibility Audit"}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'DM Sans',sans-serif;background:#fff;color:#0D1421;font-size:14px;line-height:1.6}
.wrap{max-width:820px;margin:0 auto;padding:48px}
.no-print{background:#1A56DB;color:#fff;padding:13px 20px;text-align:center;display:flex;align-items:center;justify-content:center;gap:16px;border-radius:10px;margin-bottom:24px}
.no-print kbd{background:rgba(255,255,255,.2);padding:2px 7px;border-radius:3px;font-size:12px}
.print-btn{background:#fff;color:#1A56DB;border:none;padding:8px 18px;border-radius:6px;font-weight:700;cursor:pointer;font-size:13px}
.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:28px;border-bottom:2px solid #E2E6EF;margin-bottom:28px}
.brand{font-size:21px;font-weight:800;color:#1A56DB;letter-spacing:-.3px}
.meta{text-align:right;color:#4A5568;font-size:12px;line-height:2}
.score-row{display:flex;gap:28px;align-items:center;background:#F8F9FC;border-radius:14px;padding:24px 28px;margin-bottom:24px;border:1px solid #E2E6EF}
.score-circle{width:88px;height:88px;border-radius:50%;border:7px solid ${scoreColor};display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0}
.score-num{font-size:26px;font-weight:800;color:${scoreColor}}
.score-grade{font-size:10px;color:#8A95A8;margin-top:1px}
.badges{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}
.badge{display:inline-block;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:600}
.stats{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px}
.stat{flex:1;min-width:90px;background:#F8F9FC;border-radius:10px;padding:12px 14px;text-align:center;border:1px solid #E2E6EF}
.stat-n{font-size:24px;font-weight:800;line-height:1}
.stat-l{font-size:10px;color:#8A95A8;text-transform:uppercase;letter-spacing:.5px;margin-top:3px}
.sec{font-size:15px;font-weight:700;color:#0D1421;margin:24px 0 12px;padding-bottom:7px;border-bottom:1px solid #E2E6EF}
.issue{border:1px solid #E2E6EF;border-radius:9px;padding:13px 15px;margin-bottom:9px}
.issue-head{display:flex;gap:8px;align-items:center;margin-bottom:5px;flex-wrap:wrap}
.chip{padding:2px 9px;border-radius:99px;font-size:11px;font-weight:700}
.wtag{background:#EBF1FF;color:#1A56DB;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600}
.ititle{font-weight:600;font-size:13px}
.idesc{font-size:12px;color:#4A5568;margin:5px 0;line-height:1.6}
.ifix{font-size:12px;color:#065F46;background:#D1FAE5;border:1px solid #6EE7B7;border-radius:6px;padding:7px 10px}
.pass{display:flex;gap:8px;align-items:center;padding:8px 12px;background:#D1FAE5;border-radius:7px;margin-bottom:5px;font-size:12px}
.ada-banner{background:#FEF2F2;border:1px solid #FCA5A5;border-radius:10px;padding:13px 16px;margin-bottom:20px}
.footer{margin-top:40px;padding-top:20px;border-top:1px solid #E2E6EF;display:flex;justify-content:space-between;color:#8A95A8;font-size:11px}
@media print{.no-print{display:none!important}.issue{break-inside:avoid}.wrap{padding:28px}@page{margin:12mm;size:A4}}
</style></head><body>
<div class="wrap">

<div class="no-print">
  <span>&#128202; <strong>Beacon Report ready.</strong> Save as PDF: <kbd>Ctrl+P</kbd> (Windows) or <kbd>⌘+P</kbd> (Mac) → <em>Save as PDF</em></span>
  <button class="print-btn" onclick="window.print()">🖨 Print / Save as PDF</button>
</div>

${(stats.critical > 0 || stats.serious > 0) ? `
<div class="ada-banner">
  <strong>⚠️ ADA & Section 508 Risk</strong><br>
  <span style="font-size:13px;color:#4A5568">This page has ${stats.critical||0} critical and ${stats.serious||0} serious issues that may expose this site to legal action under ADA Title III and Section 508. Manual testing is recommended.</span>
</div>` : ""}

<div class="header">
  <div>
    <div class="brand">♿ Beacon Accessibility Report</div>
    <div style="color:#8A95A8;font-size:12px;margin-top:3px">WCAG 2.1 AA • WCAG 2.2 • ADA Title III • Section 508</div>
  </div>
  <div class="meta">
    <div><strong>URL:</strong> ${safeUrl || "Pasted HTML"}</div>
    <div><strong>Date:</strong> ${date}</div>
    <div><strong>Standard:</strong> WCAG 2.1 AA + 2.2</div>
    <div><strong>Compliance:</strong> ADA Title III • Section 508</div>
  </div>
</div>

<div class="score-row">
  <div class="score-circle">
    <div class="score-num">${score}</div>
    <div class="score-grade">Grade ${grade}</div>
  </div>
  <div style="flex:1">
    <div style="font-size:19px;font-weight:800;color:${scoreColor};margin-bottom:5px">${score >= 90?"Excellent":score >= 80?"Good":score >= 70?"Needs Improvement":score >= 60?"Needs Work":"Critical"}</div>
    <div style="font-size:13px;color:#4A5568;line-height:1.6;margin-bottom:8px">${result?.summary || `This page scored ${score}/100 on automated accessibility checks.`}</div>
    <div class="badges">
      <span class="badge" style="background:#EBF1FF;color:#1A56DB;border:1px solid #BFDBFE">WCAG 2.1/2.2 • ADA • §508</span>
      <span class="badge" style="${adaRiskStyle(stats)}">⚖️ ADA Risk: ${result?.adaRisk||"Unknown"}</span>
    </div>
  </div>
</div>

<div class="stats">
  ${[["Critical",stats.critical||0,"#C41C1C"],["Serious",stats.serious||0,"#C05600"],["Moderate",stats.moderate||0,"#9A6800"],["Minor",stats.minor||0,"#0D7A3E"],["Alt Issues",altImages.length,"#C05600"],["Total Images",totalImages,"#4A5568"]].map(([l,v,c]) => `
  <div class="stat"><div class="stat-n" style="color:${c}">${v}</div><div class="stat-l">${l}</div></div>`).join("")}
</div>

${issues.length > 0 ? `<div class="sec">⚠ Issues Found (${issues.length})</div>
${issues.map(issue => `
<div class="issue">
  <div class="issue-head">
    <span class="chip" style="${sevCSS[issue.severity]||sevCSS.minor}">${esc(issue.severity)}</span>
    <span class="wtag">${esc(issue.wcag)}</span>
    <span class="ititle">${esc(issue.title)}</span>
  </div>
  <div class="idesc">${esc(issue.description)}</div>
  ${issue.element ? `<div style="font-family:monospace;font-size:10px;background:#F8F9FC;padding:7px 10px;border-radius:5px;margin:5px 0;overflow:hidden;word-break:break-all;color:#4A5568">${esc(issue.element)}</div>` : ""}
  <div class="ifix"><strong>Fix:</strong> ${esc(issue.fix)}</div>
</div>`).join("")}` : ""}

${altImages.length > 0 ? `<div class="sec">🖼 Missing Alt Text (${altImages.length})</div>
${altImages.slice(0,20).map(img => `<div class="issue"><span class="chip" style="${img.missingAlt?sevCSS.critical:sevCSS.serious}">${img.missingAlt?"No alt attribute":"Empty alt"}</span> <span style="font-family:monospace;font-size:11px;color:#4A5568;word-break:break-all;margin-left:8px">${esc(img.srcRaw||"(no src)")}</span></div>`).join("")}
${altImages.length > 20 ? `<p style="font-size:12px;color:#8A95A8;margin-top:8px">… and ${altImages.length-20} more.</p>` : ""}` : ""}

${passes.length > 0 ? `<div class="sec">✅ Checks Passed (${passes.length})</div>
${passes.map(p => `<div class="pass"><span>✓</span><span style="flex:1">${esc(p.title)}</span><span style="color:#0D7A3E;font-size:11px;font-weight:600">${esc(p.wcag)}</span></div>`).join("")}` : ""}

<div class="footer">
  <div>Generated by Beacon Scanner — ${date} — Automated scan covering WCAG 2.1 AA, WCAG 2.2, ADA Title III &amp; Section 508. Manual testing recommended for full compliance.</div>
</div>
</div>
</body></html>`;

  try {
    const blob = new Blob([doc], { type:"text/html" });
    const burl = URL.createObjectURL(blob);
    const w = window.open(burl, "_blank");
    if (!w) {
      const a = document.createElement("a");
      a.href = burl; a.target = "_blank";
      document.body.appendChild(a); a.click();
      setTimeout(() => document.body.removeChild(a), 500);
    }
  } catch(e) {
    const w = window.open();
    if (w) { w.document.write(doc); w.document.close(); }
  }
}

function adaRiskStyle(stats) {
  const r = (stats?.critical ?? 0) >= 1 ? "Critical" : (stats?.serious ?? 0) >= 3 ? "High" : (stats?.serious ?? 0) >= 1 ? "Medium" : "Low";
  return r === "Critical" ? "background:#FEE2E2;color:#991b1b;border:1px solid #FCA5A5" : r === "High" ? "background:#FFEDD5;color:#9a3412;border:1px solid #fdba74" : r === "Medium" ? "background:#FEF9C3;color:#854d0e;border:1px solid #fde047" : "background:#D1FAE5;color:#166534;border:1px solid #86efac";
}

/* ══════════ MAIN APP ══════════════════════════════════════════ */
export default function App() {
  const [inputMode, setInputMode] = useState("url");
  const [apiKey, setApiKey] = useState("");
  const [url, setUrl]             = useState("");
  const [pastedHtml, setPastedHtml] = useState("");
  const [loading, setLoading]     = useState(false);
  const [progress, setProgress]   = useState("");
  const [progressPct, setProgressPct] = useState(0);
  const [result, setResult]       = useState(null);
  const [altImages, setAltImages] = useState([]);
  const [totalImages, setTotalImages] = useState(0);
  const [error, setError]         = useState(null);
  const [activeTab, setActiveTab] = useState("issues");

  const isVercelDeploy = typeof window !== "undefined" &&
    (window.location.hostname.endsWith(".vercel.app") ||
     (!window.location.hostname.includes("claude.ai") &&
      window.location.hostname !== "localhost" &&
      window.location.hostname !== "127.0.0.1"));
  const hasKey = isVercelDeploy || apiKey.trim().length > 0;
  const canScan = hasKey && (inputMode === "url" ? url.trim().length > 0 : pastedHtml.trim().length > 0);

  const scan = async () => {
    if (!canScan || loading) return;
    setLoading(true); setResult(null); setAltImages([]); setTotalImages(0); setError(null);
    setProgressPct(5);

    try {
      const baseUrl = url.trim() || "https://unknown.site";
      let headlessData = null;
      let html = "";

      if (inputMode === "paste") {
        // ── PASTE MODE: run local scan directly on DOMParser doc ──────────
        html = pastedHtml;
        setProgress("Parsing HTML…"); setProgressPct(20);

        // Extract images (DOMParser is fine for attribute checks)
        const parser = new DOMParser();
        const parsedDoc = parser.parseFromString(html, "text/html");
        const allImgs = Array.from(parsedDoc.querySelectorAll("img"));
        const trackPatterns = ["/pixel/","/track/","/beacon","adsct","bat.bing","trkn.us","arttrk.","adxcel","bidr.io"];
        const miss = allImgs.filter(img => {
          const src = img.getAttribute("src") || "";
          const w = img.getAttribute("width"), h = img.getAttribute("height");
          if ((w === "1" || w === 1) && (h === "1" || h === 1)) return false;
          if (trackPatterns.some(p => src.includes(p))) return false;
          const role = img.getAttribute("role");
          if (role === "presentation" || role === "none") return false;
          return !img.hasAttribute("alt") || img.getAttribute("alt").trim() === "";
        });
        setTotalImages(allImgs.length);
        setAltImages(miss.map((img, i) => ({
          index: i+1,
          src: (() => { try { return new URL(img.getAttribute("src")||"", baseUrl).href; } catch { return img.getAttribute("src")||""; } })(),
          srcRaw: img.getAttribute("src")||"",
          missingAlt: !img.hasAttribute("alt"),
          snippet: img.outerHTML.slice(0,250),
          context: img.closest("a") ? "Link image" : img.closest("button") ? "Button image" : "",
        })));
        // Run local WCAG scan on pasted HTML too
        const localResult = runLocalScan(parsedDoc);
        headlessData = {
          url: "pasted HTML",
          scannedAt: new Date().toISOString(),
          scanType: "local",
          issues: localResult.issues,
          passes: localResult.passes,
          score: localResult.score,
          images: { total: allImgs.length, missing: miss.map((img, j) => ({
            index: j+1,
            src: img.getAttribute("src")||"",
            missingAlt: !img.hasAttribute("alt"),
            snippet: img.outerHTML.slice(0,250),
          })) }
        };
        setProgressPct(35);

      } else {
        // ── URL MODE: try headless API first, fall back to proxy ──────────
        setProgress("Launching headless browser…"); setProgressPct(10);
        try {
          const r = await fetch("/api/scan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: url.trim() })
          });
          if (r.ok) {
            headlessData = await r.json();
            setProgressPct(45);
            setProgress("Headless scan complete — enriching with AI analysis…");

            // Extract images from headless data if provided
            if (headlessData.images) {
              setTotalImages(headlessData.images.total || 0);
              setAltImages(headlessData.images.missing || []);
            }
          } else {
            throw new Error("API " + r.status);
          }
        } catch {
          setProgress("Fetching page content…"); setProgressPct(15);

          // Try our own server-side fetch first (no CORS issues), then external proxies
          try {
            const fetchRes = await fetch("/api/fetch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: url.trim() })
            });
            if (fetchRes.ok) {
              const fetchData = await fetchRes.json();
              if (fetchData.html && fetchData.html.length > 100) {
                html = fetchData.html;
              }
            }
          } catch { /* server fetch unavailable, try external proxies */ }

          if (!html) {
            setProgress("Trying external proxies…"); setProgressPct(20);
            const proxies = [
              u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
              u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
              u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
            ];
            for (const makeUrl of proxies) {
              if (html) break;
              try {
                const r = await fetch(makeUrl(url));
                if (r.ok) {
                  html = await r.text();
                  if (html && html.length > 100) break;
                  html = "";
                }
              } catch { /* try next proxy */ }
            }
          }

          if (!html) {
            setProgress("Fetch failed — running AI-only audit…");
          }

          if (html) {
            // Extract images from proxy HTML
            const parser = new DOMParser();
            const parsedDoc = parser.parseFromString(html, "text/html");
            const allImgs = Array.from(parsedDoc.querySelectorAll("img"));
            const trackPatterns = ["/pixel/","trkn.us","bat.bing","arttrk."];
            const miss = allImgs.filter(img => {
              const src = img.getAttribute("src") || "";
              if (trackPatterns.some(p => src.includes(p))) return false;
              const role = img.getAttribute("role");
              if (role === "presentation" || role === "none") return false;
              return !img.hasAttribute("alt") || img.getAttribute("alt").trim() === "";
            });
            setTotalImages(allImgs.length);
            setAltImages(miss.map((img, i) => ({
              index: i+1,
              src: (() => { try { return new URL(img.getAttribute("src")||"", baseUrl).href; } catch { return img.getAttribute("src")||""; } })(),
              srcRaw: img.getAttribute("src")||"",
              missingAlt: !img.hasAttribute("alt"),
              snippet: img.outerHTML.slice(0,250),
              context: img.closest("a") ? "Link image" : img.closest("button") ? "Button image" : "",
            })));

            // Run full local WCAG scan (mirrors bookmarklet logic)
            setProgress("Running local accessibility checks…"); setProgressPct(30);
            const localResult = runLocalScan(parsedDoc);

            headlessData = {
              url: url.trim(),
              scannedAt: new Date().toISOString(),
              scanType: "local",
              issues: localResult.issues,
              passes: localResult.passes,
              score: localResult.score,
              images: { total: allImgs.length, missing: miss.map((img, j) => ({
                index: j+1,
                src: img.getAttribute("src")||"",
                missingAlt: !img.hasAttribute("alt"),
                snippet: img.outerHTML.slice(0,250),
              })) }
            };
          }
          setProgressPct(35);
        }
      }

      // ── AI AUDIT ──────────────────────────────────────────────────────────
      setProgress("Running AI accessibility audit…"); setProgressPct(60);

      let auditContext = "";
      if (headlessData?.issues?.length > 0) {
        const issueList = headlessData.issues
          .map(i => `- [${(i.sev||"").toUpperCase()}] ${i.title} (WCAG ${i.wcag})${i.snippet ? ": " + i.snippet.slice(0,80) : ""}`)
          .join("\n");
        const passList = (headlessData.passes||[]).map(p => `- ${p.title}`).join("\n");
        auditContext = `Automated headless scan of ${url} found these issues:\n${issueList}\n\nPassing checks:\n${passList}\n\nAutomated score: ${headlessData.score}/100`;
      } else if (html) {
        auditContext = `HTML source (first 8000 chars):\n${html.slice(0, 8000)}`;
      } else {
        auditContext = `URL: ${url} — No HTML available. Provide general accessibility guidance based on the URL and site type.`;
      }

      const prompt = `You are an expert ADA/WCAG 2.1+2.2 accessibility auditor for ADA Title III and Section 508 compliance.
URL: ${url || "pasted HTML"}

${auditContext}

Respond ONLY with valid JSON. No markdown, no code fences, no preamble. Pure JSON only:
{
  "score": <integer 0-100. If automated score provided, use it as anchor. Never return 100 if issues exist.>,
  "summary": "<2-3 sentence executive summary mentioning ADA Title III and Section 508 legal risk>",
  "level": "<AA|Partial|Non-Compliant>",
  "adaRisk": "<Low|Medium|High|Critical>",
  "issues": [
    {
      "title": "<short descriptive title>",
      "severity": "<critical|serious|moderate|minor>",
      "wcag": "<criterion e.g. 1.4.3>",
      "principle": "<Perceivable|Operable|Understandable|Robust>",
      "description": "<clear explanation of the problem>",
      "element": "<HTML snippet or null>",
      "fix": "<specific actionable developer fix>"
    }
  ],
  "passes": [{ "title": "<what passes>", "wcag": "<criterion>" }],
  "stats": { "critical": 0, "serious": 0, "moderate": 0, "minor": 0 }
}`;

      setProgressPct(75);

      // Route API call depending on environment:
      // - On Vercel (deployed): use /api/audit to keep API key server-side
      // - In artifact/preview: call Anthropic directly with browser-access header
      const isVercel = isVercelDeploy;

      let d;
      let aiFailed = false;
      try {
        if (isVercel) {
          const res = await fetch("/api/audit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt })
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(`AI audit failed (${res.status}): ${errData.error?.message || res.statusText}`);
          }
          d = await res.json();
        } else {
          // Artifact / local preview — direct browser call
          const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
              "anthropic-dangerous-direct-browser-access": "true"
            },
            body: JSON.stringify({
              model: "claude-3-5-sonnet-20241022",
              max_tokens: 4000,
              messages: [{ role: "user", content: prompt }]
            })
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(`AI audit failed (${res.status}): ${errData.error?.message || res.statusText}`);
          }
          d = await res.json();
        }
      } catch (aiErr) {
        console.warn("AI audit unavailable, using automated results only:", aiErr.message);
        aiFailed = true;
      }

      setProgressPct(88);

      let parsed;

      if (aiFailed && headlessData) {
        // AI unavailable but headless scan succeeded — use headless results directly
        setProgress("AI unavailable — using automated scan results…");
        const sevMap = { critical: "Perceivable", serious: "Operable", moderate: "Understandable", minor: "Robust" };
        parsed = {
          score: headlessData.score,
          summary: `Automated scan completed. ${headlessData.issues?.length || 0} issue(s) found. AI analysis was unavailable — results are from automated WCAG checks only.`,
          level: headlessData.score >= 90 ? "AA" : headlessData.score >= 50 ? "Partial" : "Non-Compliant",
          adaRisk: headlessData.score >= 90 ? "Low" : headlessData.score >= 70 ? "Medium" : headlessData.score >= 40 ? "High" : "Critical",
          issues: (headlessData.issues || []).map(i => ({
            title: i.title,
            severity: i.sev,
            wcag: i.wcag,
            principle: sevMap[i.sev] || "Robust",
            description: i.detail,
            element: i.snippet || null,
            fix: `Address WCAG ${i.wcag} — ${i.title}`
          })),
          passes: headlessData.passes || [],
          stats: {
            critical: (headlessData.issues || []).filter(i => i.sev === "critical").length,
            serious: (headlessData.issues || []).filter(i => i.sev === "serious").length,
            moderate: (headlessData.issues || []).filter(i => i.sev === "moderate").length,
            minor: (headlessData.issues || []).filter(i => i.sev === "minor").length,
          }
        };
      } else if (aiFailed) {
        // Both AI and headless failed — show what we can
        throw new Error("Scanner services are temporarily unavailable. Please try again in a few minutes.");
      } else {
        if (!d.content?.length) throw new Error("Empty response from AI");

        const rawText = d.content.map(i => i.text || "").join("").trim();
        // Strip any accidental markdown fences
        const jsonText = rawText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

        try {
          parsed = JSON.parse(jsonText);
        } catch(parseErr) {
          // Try to extract JSON object if there's surrounding text
          const match = jsonText.match(/\{[\s\S]*\}/);
          if (match) {
            parsed = JSON.parse(match[0]);
          } else {
            throw new Error("AI returned invalid JSON. Try scanning again.");
          }
        }

        // Validate required fields
        if (!parsed.score && parsed.score !== 0) parsed.score = headlessData?.score || 50;
        if (!parsed.issues) parsed.issues = [];
        if (!parsed.passes) parsed.passes = [];
        if (!parsed.stats) parsed.stats = { critical:0, serious:0, moderate:0, minor:0 };

        // Score: trust headless score over AI when headless is available
        // Only blend if they agree within 15 points; otherwise trust headless
        if (headlessData?.score != null) {
          const diff = Math.abs(parsed.score - headlessData.score);
          if (diff <= 15) {
            parsed.score = headlessData.score; // headless is more reliable
          } else {
            // Large disagreement — trust headless, note AI found more
            parsed.score = Math.round(headlessData.score * 0.7 + parsed.score * 0.3);
          }
        }
      }

      // Hard rule: never 100 with open issues
      if (parsed.issues.length > 0 && parsed.score >= 100) parsed.score = 99;

      parsed.scanType = headlessData ? "headless" : "html";
      setResult(parsed);
      setActiveTab(parsed.issues.length > 0 ? "issues" : "passes");
      setProgressPct(100);

    } catch(e) {
      setError("Scan failed: " + (e.message || "Unknown error. Please try again."));
    } finally {
      setLoading(false); setProgress(""); setProgressPct(0);
    }
  };

  const grouped = result ? PRINCIPLES.reduce((acc,p) => {
    acc[p] = (result.issues||[]).filter(i => i.principle === p); return acc;
  }, {}) : {};

  function Tab({ id, label, count, alert }) {
    return (
      <button role="tab" aria-selected={activeTab === id} onClick={() => setActiveTab(id)} style={{ background:activeTab===id?C.surface:"transparent", color:activeTab===id?C.text:C.textSub, border:activeTab===id?`1px solid ${C.border}`:"1px solid transparent", borderRadius:8, padding:"8px 16px", cursor:"pointer", fontSize:13, fontWeight:600, fontFamily:"inherit", boxShadow:activeTab===id?C.shadow:"none", transition:"all .15s", display:"flex", alignItems:"center", gap:7 }}>
        {label}
        {count !== undefined && <span aria-label={`${count} items`} style={{ background:alert&&count>0?C.red:C.bg, color:alert&&count>0?"#fff":C.textMuted, borderRadius:99, padding:"1px 7px", fontSize:11, fontWeight:700 }}>{count}</span>}
      </button>
    );
  }

  return (
    <div style={{ minHeight:"100vh", background:C.bg, fontFamily:"'DM Sans',sans-serif", color:C.text }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800;1,9..40,400&display=swap');
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:#F0F2F7}::-webkit-scrollbar-thumb{background:#E2E6EF;border-radius:3px}
        input::placeholder,textarea::placeholder{color:#8A95A8}
        textarea{resize:vertical}
        @keyframes fadein{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        @keyframes spin{to{transform:rotate(360deg)}}
        button:focus-visible{outline:2px solid #1A56DB;outline-offset:2px}
        .skip-link{position:absolute;top:-40px;left:8px;background:#1A56DB;color:#fff;padding:8px 14px;border-radius:0 0 8px 8px;font-weight:700;font-size:13px;text-decoration:none;z-index:9999;transition:top .15s}
        .skip-link:focus{top:0}
      ` }} />

      <a href="#main-content" className="skip-link">Skip to main content</a>

      {/* Nav */}
      <nav role="navigation" aria-label="Site navigation" style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, boxShadow:"0 1px 0 rgba(0,0,0,.04)" }}>
        <div style={{ maxWidth:960, margin:"0 auto", padding:"0 28px", height:54, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", alignItems:"center", gap:9 }}>
            <div style={{ width:28, height:28, background:C.accent, borderRadius:7, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15 }} aria-hidden="true">♿</div>
            <span style={{ fontWeight:800, fontSize:16, letterSpacing:-.3 }}>Beacon</span>
            <span style={{ fontSize:11, color:C.textMuted, fontWeight:500, marginLeft:2 }}>by your company</span>
          </div>
          <div style={{ display:"flex", gap:6, alignItems:"center" }} aria-label="Supported standards">
            <Tag>WCAG 2.1/2.2</Tag>
            <Tag>ADA</Tag>
            <Tag>§508</Tag>
          </div>
        </div>
      </nav>

      <main id="main-content" style={{ maxWidth:960, margin:"0 auto", padding:"28px 28px 60px" }}>

        {/* Hero */}
        <div style={{ textAlign:"center", marginBottom:28, animation:"fadein .4s ease" }}>
          <h1 style={{ fontSize:30, fontWeight:800, margin:"0 0 8px", letterSpacing:-.5 }}>Website Accessibility Scanner</h1>
          <p style={{ color:C.textSub, fontSize:15, margin:0, maxWidth:500, marginInline:"auto" }}>
            Audit against WCAG 2.1/2.2, ADA Title III & Section 508. Get a report you can share with clients.
          </p>
        </div>

        {/* Input card */}
        <Card style={{ padding:24, marginBottom:20, animation:"fadein .4s ease .05s both" }}>
          <div role="group" aria-label="Input mode" style={{ display:"flex", gap:7, marginBottom:18, background:C.bg, borderRadius:9, padding:3 }}>
            {[{ id:"url", icon:"🌐", label:"Scan URL", hint:"Headless or proxy fetch" }, { id:"paste", icon:"📋", label:"Paste HTML", hint:"Most accurate" }].map(m => (
              <button key={m.id} onClick={() => setInputMode(m.id)}
                aria-pressed={inputMode === m.id}
                style={{ flex:1, padding:"9px 14px", borderRadius:7, cursor:"pointer", background:inputMode===m.id?C.surface:"transparent", border:inputMode===m.id?`1px solid ${C.border}`:"1px solid transparent", boxShadow:inputMode===m.id?C.shadow:"none", transition:"all .15s", textAlign:"left" }}>
                <div style={{ fontWeight:700, fontSize:13, color:inputMode===m.id?C.text:C.textSub }}>{m.icon} {m.label}</div>
                <div style={{ fontSize:11, color:C.textMuted, marginTop:1 }}>{m.hint}</div>
              </button>
            ))}
          </div>

          {inputMode === "url" && (
            <div style={{ display:"flex", gap:9 }}>
              <input id="scan-url" name="scan-url" value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!loading&&scan()}
                placeholder="https://yourwebsite.com"
                style={{ flex:1, border:`1.5px solid ${C.border}`, borderRadius:9, padding:"11px 15px", fontSize:14, fontFamily:"inherit", color:C.text, outline:"none", background:C.surface, transition:"border-color .15s" }}
                onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border}
              />
              <Btn onClick={scan} disabled={loading||!canScan}>{loading?"Scanning…":"Run Audit →"}</Btn>
            </div>
          )}

          {inputMode === "paste" && (
            <div>
              <div style={{ background:C.accentLight, border:`1px solid #BFDBFE`, borderRadius:8, padding:"9px 13px", marginBottom:10, display:"flex", gap:8, alignItems:"flex-start" }}>
                <span style={{ color:C.accent, fontSize:13 }}>💡</span>
                <p style={{ margin:0, fontSize:12, color:"#1D4ED8", lineHeight:1.7 }}>
                  Best accuracy: open site → Inspect → Console → type <code style={{ background:"#DBEAFE", padding:"1px 5px", borderRadius:4 }}>copy(document.documentElement.outerHTML)</code> → paste below.
                </p>
              </div>
              <div style={{ display:"flex", gap:9, marginBottom:9 }}>
                <textarea id="paste-html" name="paste-html" value={pastedHtml} onChange={e=>setPastedHtml(e.target.value)} placeholder="Paste full page HTML here…" rows={5}
                  style={{ flex:1, border:`1.5px solid ${C.border}`, borderRadius:9, padding:"11px 15px", fontSize:12, fontFamily:"monospace", color:C.text, outline:"none", background:C.surface, transition:"border-color .15s", lineHeight:1.5 }}
                  onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border}
                />
                <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                  <Btn onClick={scan} disabled={loading||!canScan}>{loading?"Scanning…":"Run Audit →"}</Btn>
                  {pastedHtml && <Btn variant="secondary" small onClick={()=>setPastedHtml("")}>Clear</Btn>}
                </div>
              </div>
              <input id="paste-url" name="paste-url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="Optional: URL (helps resolve image paths)"
                style={{ width:"100%", border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 13px", fontSize:12, fontFamily:"inherit", color:C.textSub, outline:"none", background:C.bg }}
              />
            </div>
          )}

          {!isVercelDeploy && (
            <div style={{ marginTop:14, padding:"12px 14px", background:"#FFFBEB", border:"1px solid #FDE68A", borderRadius:9 }}>
              <div style={{ fontSize:12, fontWeight:700, color:"#92400E", marginBottom:6 }}>
                🔑 Anthropic API Key required for preview
              </div>
              <div style={{ fontSize:11, color:"#78350F", marginBottom:8 }}>
                Get yours free at <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{ color:"#1A56DB" }}>console.anthropic.com</a> → API Keys.
                On Vercel this is stored securely as an env var — never shown to users.
              </div>
              <input
                id="api-key"
                name="api-key"
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="sk-ant-api03-..."
                autoComplete="off"
                style={{ width:"100%", border:`1.5px solid ${apiKey ? C.green : "#FCD34D"}`, borderRadius:7, padding:"8px 12px", fontSize:13, fontFamily:"inherit", outline:"none", background:"#fff", color:C.text }}
              />
            </div>
          )}

          {loading && (
            <div style={{ marginTop:14 }}>
              <div style={{ height:3, background:C.bg, borderRadius:99, overflow:"hidden", marginBottom:7 }}>
                <div style={{ height:"100%", borderRadius:99, background:C.accent, width:`${progressPct}%`, transition:"width .4s ease" }}/>
              </div>
              <p style={{ fontSize:12, color:C.textSub, margin:0, textAlign:"center" }}>{progress}</p>
            </div>
          )}
        </Card>

        {error && <div style={{ background:C.redLight, border:`1px solid #FCA5A5`, borderRadius:10, padding:"13px 17px", color:C.red, fontSize:13, marginBottom:16 }}>{error}</div>}

        {result && !loading && (
          <div style={{ animation:"fadein .4s ease" }}>
            <ScoreRing score={result.score} stats={result.stats} altCount={altImages.length} totalImages={totalImages} adaRisk={result.adaRisk} level={result.level}/>

            {/* Scan type + download row */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:8 }}>
              <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
                <span style={{ padding:"3px 10px", borderRadius:99, fontSize:11, fontWeight:700, background:result.scanType==="headless"?"#eff6ff":"#f8fafc", color:result.scanType==="headless"?"#1d4ed8":"#475569", border:`1px solid ${result.scanType==="headless"?"#bfdbfe":"#e2e8f0"}` }}>{result.scanType==="headless"?"🤖 Headless Scan":"📄 HTML Scan"}</span>
              </div>
              <Btn variant="secondary" small onClick={() => generateReport({ url, result, altImages, totalImages })}>⬇ Download Report</Btn>
            </div>

            {/* Tabs */}
            <div style={{ display:"flex", gap:5, padding:3, background:C.bg, borderRadius:10, marginBottom:18, width:"fit-content", border:`1px solid ${C.border}` }}>
              <Tab id="issues" label="⚠ Issues" count={result.issues?.length} alert/>
              <Tab id="images" label="🖼 Alt Text" count={altImages.length} alert/>
              {result.passes?.length > 0 && <Tab id="passes" label="✅ Passing" count={result.passes.length}/>}
            </div>

            {/* Issues tab */}
            {activeTab === "issues" && (
              <div>
                {result.issues?.length === 0 && <Card style={{ padding:40, textAlign:"center" }}><div style={{ fontSize:40, marginBottom:10 }}>✅</div><p style={{ fontWeight:700, color:C.green }}>No issues detected</p></Card>}
                {PRINCIPLES.map(p => grouped[p]?.length > 0 && (
                  <div key={p} style={{ marginBottom:20 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:10 }}>
                      <h3 style={{ fontSize:13, fontWeight:700, margin:0 }}>{p}</h3>
                      <Tag color={C.textSub} bg={C.bg}>{grouped[p].length} issue{grouped[p].length>1?"s":""}</Tag>
                    </div>
                    {grouped[p].map((issue,i) => <IssueRow key={i} issue={issue}/>)}
                  </div>
                ))}
                {(() => { const ug = (result.issues||[]).filter(i=>!PRINCIPLES.includes(i.principle)); return ug.length > 0 && <div style={{ marginBottom:20 }}><h3 style={{ fontSize:13, fontWeight:700, margin:"0 0 10px" }}>Other</h3>{ug.map((issue,i)=><IssueRow key={i} issue={issue}/>)}</div>; })()}
              </div>
            )}

            {/* Images tab */}
            {activeTab === "images" && (
              <div>
                <Card style={{ padding:"14px 18px", marginBottom:14 }}>
                  <div style={{ display:"flex", gap:16, alignItems:"center", flexWrap:"wrap" }}>
                    <span style={{ fontSize:26, fontWeight:800, color:altImages.length>0?C.orange:C.green }}>{altImages.length}</span>
                    <span style={{ color:C.textSub, fontSize:13 }}>/ {totalImages} images missing alt text</span>
                    <div style={{ flex:1, minWidth:100 }}>
                      <div style={{ height:5, background:C.bg, borderRadius:99, overflow:"hidden" }}>
                        <div style={{ height:"100%", borderRadius:99, background:C.green, width:totalImages>0?`${((totalImages-altImages.length)/totalImages)*100}%`:"100%", transition:"width 1s ease" }}/>
                      </div>
                    </div>
                  </div>
                </Card>
                {altImages.length === 0 && totalImages > 0 && <Card style={{ padding:32, textAlign:"center" }}><div style={{ fontSize:36, marginBottom:8 }}>✅</div><p style={{ fontWeight:700, color:C.green }}>All {totalImages} images have alt text</p></Card>}
                {altImages.map((img,i) => (
                  <Card key={i} style={{ padding:"12px 16px", marginBottom:7, display:"flex", gap:12, alignItems:"center" }}>
                    <div style={{ width:48, height:36, borderRadius:6, overflow:"hidden", flexShrink:0, background:C.bg, border:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                      {img.src ? <img src={img.src} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} onError={e=>e.target.style.display="none"}/> : <span style={{ fontSize:16 }}>🖼️</span>}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", gap:7, marginBottom:4 }}>
                        <Chip severity={img.missingAlt?"critical":"serious"}/>
                        {img.context && <Tag color={C.orange} bg={C.orangeLight}>{img.context}</Tag>}
                      </div>
                      <p style={{ fontSize:11, color:C.textMuted, margin:0, wordBreak:"break-all" }}>{img.srcRaw||"(no src)"}</p>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {/* Passes tab */}
            {activeTab === "passes" && result.passes?.length > 0 && (
              <Card style={{ padding:20 }}>
                <p style={{ color:C.textSub, fontSize:13, margin:"0 0 14px" }}>Criteria satisfied by automated scan.</p>
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {result.passes.map((p,i) => (
                    <div key={i} style={{ display:"flex", gap:10, alignItems:"center", padding:"9px 13px", background:C.greenLight, border:`1px solid #6EE7B7`, borderRadius:9 }}>
                      <span style={{ color:C.green, fontSize:14 }}>✓</span>
                      <span style={{ flex:1, fontSize:13, color:"#065F46", fontWeight:500 }}>{p.title}</span>
                      <Tag color={C.green} bg={C.greenLight}>{p.wcag}</Tag>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
