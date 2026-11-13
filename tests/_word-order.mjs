// Word's rules for a .docx, shared by every test that writes one
// (tests/a-sabbath-program-is-a-word-file.mjs, tests/evangelistic-meetings-are-yours-to-shape.mjs),
// so the two are held to exactly the same rules and cannot drift apart.
// Not a test itself, so it is not listed in scripts/verify.mjs.

/** Parse XML far enough to check it: well-formed, one root, and each element's children in order. */
export function parseXml(xml) {
  const top = { name: '#document', children: [] };
  const stack = [top];
  const re = /<\?[\s\S]*?\?>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>|([^<]+)|</g;
  let m;
  while ((m = re.exec(xml))) {
    if (m[0].startsWith('<?')) continue;
    if (m[0] === '<') throw new Error(`a "<" that starts no tag, at ${m.index}`);
    if (m[5] !== undefined) {
      if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(m[5])) throw new Error(`a bare "&" at ${m.index}`);
      if (stack.length === 1 && m[5].trim()) throw new Error('text outside the root element');
      continue;
    }
    const [, close, name, attrs, self] = m;
    if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(attrs)) throw new Error(`a bare "&" in <${name}>`);
    if (close) {
      const open = stack.pop();
      if (open.name !== name) throw new Error(`</${name}> closes <${open.name}>`);
    } else {
      const el = { name, children: [] };
      stack[stack.length - 1].children.push(el);
      if (!self) stack.push(el);
    }
  }
  if (stack.length !== 1) throw new Error(`<${stack[stack.length - 1].name}> is never closed`);
  if (top.children.length !== 1) throw new Error('not exactly one root element');
  return top.children[0];
}

// THE ORDER WORD INSISTS ON, from the schema (ECMA-376, WordprocessingML).
// Only the lists this file writes are here; an element that is not on its
// list fails as well, so a new property cannot be added without being placed.
export const ORDER = {
  'w:pPr': ['pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'framePr', 'widowControl', 'numPr',
    'suppressLineNumbers', 'pBdr', 'shd', 'tabs', 'suppressAutoHyphens', 'kinsoku', 'wordWrap',
    'overflowPunct', 'topLinePunct', 'autoSpaceDE', 'autoSpaceDN', 'bidi', 'adjustRightInd', 'snapToGrid',
    'spacing', 'ind', 'contextualSpacing', 'mirrorIndents', 'suppressOverlap', 'jc', 'textDirection',
    'textAlignment', 'textboxTightWrap', 'outlineLvl', 'divId', 'cnfStyle', 'rPr', 'sectPr', 'pPrChange'],
  'w:rPr': ['rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike', 'dstrike', 'outline',
    'shadow', 'emboss', 'imprint', 'noProof', 'snapToGrid', 'vanish', 'webHidden', 'color', 'spacing', 'w',
    'kern', 'position', 'sz', 'szCs', 'highlight', 'u', 'effect', 'bdr', 'shd', 'fitText', 'vertAlign', 'rtl',
    'cs', 'em', 'lang', 'eastAsianLayout', 'specVanish', 'oMath'],
  'w:tblPr': ['tblStyle', 'tblpPr', 'tblOverlap', 'bidiVisual', 'tblStyleRowBandSize', 'tblStyleColBandSize',
    'tblW', 'jc', 'tblCellSpacing', 'tblInd', 'tblBorders', 'shd', 'tblLayout', 'tblCellMar', 'tblLook'],
  'w:tblBorders': ['top', 'left', 'start', 'bottom', 'right', 'end', 'insideH', 'insideV'],
  'w:tblCellMar': ['top', 'left', 'start', 'bottom', 'right', 'end'],
  'w:pBdr': ['top', 'left', 'bottom', 'right', 'between', 'bar'],
  'w:tcPr': ['cnfStyle', 'tcW', 'gridSpan', 'hMerge', 'vMerge', 'tcBorders', 'shd', 'noWrap', 'tcMar',
    'textDirection', 'tcFitText', 'vAlign', 'hideMark'],
  'w:style': ['name', 'aliases', 'basedOn', 'next', 'link', 'autoRedefine', 'hidden', 'uiPriority', 'semiHidden',
    'unhideWhenUsed', 'qFormat', 'locked', 'personal', 'personalCompose', 'personalReply', 'rsid', 'pPr', 'rPr',
    'tblPr', 'trPr', 'tcPr', 'tblStylePr'],
  'w:sectPr': ['headerReference', 'footerReference', 'footnotePr', 'endnotePr', 'type', 'pgSz', 'pgMar'],
  'w:styles': ['docDefaults', 'latentStyles', 'style'],
  'w:docDefaults': ['rPrDefault', 'pPrDefault'],
  'w:tbl': ['tblPr', 'tblGrid', 'tr'],
  'w:tr': ['trPr', 'tc'],
  'w:tc': ['tcPr', 'p'],
  'w:p': ['pPr', 'r'],
  'w:r': ['rPr', 't'],
};

/** Every element out of the order Word's schema gives, in a parsed tree, as a sentence each. */
export function misplacedIn(tree) {
  const misplaced = [];
  const walk = (el) => {
    const order = ORDER[el.name];
    if (order) {
      let last = -1;
      for (const c of el.children) {
        const at = order.indexOf(c.name.replace(/^w:/, ''));
        if (at === -1) misplaced.push(`<${c.name}> is not allowed in <${el.name}>`);
        else if (at < last) misplaced.push(`<${c.name}> comes too late in <${el.name}>`);
        else last = at;
      }
    }
    el.children.forEach(walk);
  };
  walk(tree);
  return misplaced;
}
