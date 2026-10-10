/**
 * Utility functions for mathematical formula processing,
 * converting LaTeX syntax into clean, human-readable Unicode text
 * for clipboard copying and accessible text representations.
 */

// Mapping of Greek letter LaTeX macros to Unicode characters
const GREEK_LETTERS: Record<string, string> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  varepsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  vartheta: 'θ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  pi: 'π',
  varpi: 'π',
  rho: 'ρ',
  varrho: 'ρ',
  sigma: 'σ',
  varsigma: 'σ',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'φ',
  varphi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Xi: 'Ξ',
  Pi: 'Π',
  Sigma: 'Σ',
  Upsilon: 'Υ',
  Phi: 'Φ',
  Psi: 'Ψ',
  Omega: 'Ω',
};

// Mapping of mathematical operators and symbols
const MATH_SYMBOLS: Record<string, string> = {
  times: '×',
  cdot: '·',
  pm: '±',
  mp: '∓',
  div: '÷',
  approx: '≈',
  neq: '≠',
  ne: '≠',
  leq: '≤',
  le: '≤',
  geq: '≥',
  ge: '≥',
  ll: '≪',
  gg: '≫',
  infty: '∞',
  partial: '∂',
  nabla: '∇',
  in: '∈',
  notin: '∉',
  subset: '⊂',
  subseteq: '⊆',
  supset: '⊃',
  supseteq: '⊇',
  cap: '∩',
  cup: '∪',
  forall: '∀',
  exists: '∃',
  nexists: '∄',
  neg: '¬',
  to: '→',
  rightarrow: '→',
  leftarrow: '←',
  leftrightarrow: '↔',
  Rightarrow: '⇒',
  Leftarrow: '⇐',
  Leftrightarrow: '⇔',
  circ: '°',
  degree: '°',
  bullet: '•',
  int: '∫',
  iint: '∬',
  iiint: '∭',
  oint: '∮',
  sum: '∑',
  prod: '∏',
  equiv: '≡',
  sim: '∼',
  simeq: '≃',
  cong: '≅',
  perp: '⊥',
  parallel: '∥',
  angle: '∠',
  triangle: '△',
  prime: '′',
  hbar: 'ℏ',
  ell: 'ℓ',
  Re: 'ℜ',
  Im: 'ℑ',
  aleph: 'ℵ',
  emptyset: '∅',
  varnothing: '∅',
  Vert: '||',
  vert: '|',
  langle: '⟨',
  rangle: '⟩',
};

// Common Unicode superscript characters
const SUPERSCRIPTS: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '+': '⁺',
  '-': '⁻',
  '=': '⁼',
  '(': '⁽',
  ')': '⁾',
  'a': 'ᵃ',
  'b': 'ᵇ',
  'c': 'ᶜ',
  'd': 'ᵈ',
  'e': 'ᵉ',
  'f': 'ᶠ',
  'g': 'ᵍ',
  'h': 'ʰ',
  'i': 'ⁱ',
  'j': 'ʲ',
  'k': 'ᵏ',
  'l': 'ˡ',
  'm': 'ᵐ',
  'n': 'ⁿ',
  'o': 'ᵒ',
  'p': 'ᵖ',
  'r': 'ʳ',
  's': 'ˢ',
  't': 'ᵗ',
  'u': 'ᵘ',
  'v': 'ᵛ',
  'w': 'ʷ',
  'x': 'ˣ',
  'y': 'ʸ',
  'z': 'ᶻ',
};

// Common Unicode subscript characters
const SUBSCRIPTS: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
  '+': '₊',
  '-': '₋',
  '=': '₌',
  '(': '₍',
  ')': '₎',
  'a': 'ₐ',
  'e': 'ₑ',
  'h': 'ₕ',
  'i': 'ᵢ',
  'j': 'ⱼ',
  'k': 'ₖ',
  'l': 'ₗ',
  'm': 'ₘ',
  'n': 'ₙ',
  'o': 'ₒ',
  'p': 'ₚ',
  'r': 'ᵣ',
  's': 'ₛ',
  't': 'ₜ',
  'u': 'ᵤ',
  'v': 'ᵥ',
  'x': 'ₓ',
};

// Common simple fractions to Unicode glyphs
const COMMON_FRACTIONS: Record<string, string> = {
  '1/2': '½',
  '1/3': '⅓',
  '2/3': '⅔',
  '1/4': '¼',
  '3/4': '¾',
  '1/5': '⅕',
  '2/5': '⅖',
  '3/5': '⅗',
  '4/5': '⅘',
  '1/6': '⅙',
  '5/6': '⅚',
  '1/8': '⅛',
  '3/8': '⅜',
  '5/8': '⅝',
  '7/8': '⅞',
};

/**
 * Extracts balanced curly braces content from a string starting at startIndex.
 */
function extractBalancedBraces(str: string, startIndex: number): { content: string; endIndex: number } | null {
  if (startIndex >= str.length || str[startIndex] !== '{') return null;
  let depth = 0;
  const start = startIndex + 1;
  for (let i = startIndex; i < str.length; i++) {
    if (str[i] === '{') depth++;
    else if (str[i] === '}') {
      depth--;
      if (depth === 0) {
        return { content: str.substring(start, i), endIndex: i };
      }
    }
  }
  return null;
}

/**
 * Extracts balanced square brackets content from a string starting at startIndex.
 */
function extractBalancedBrackets(str: string, startIndex: number): { content: string; endIndex: number } | null {
  if (startIndex >= str.length || str[startIndex] !== '[') return null;
  let depth = 0;
  const start = startIndex + 1;
  for (let i = startIndex; i < str.length; i++) {
    if (str[i] === '[') depth++;
    else if (str[i] === ']') {
      depth--;
      if (depth === 0) {
        return { content: str.substring(start, i), endIndex: i };
      }
    }
  }
  return null;
}

/**
 * Converts a string of characters to Unicode superscripts if all characters are supported,
 * otherwise formats as `^(...)`.
 */
function toSuperscript(str: string): string {
  const clean = str.trim();
  let result = '';
  for (const char of clean) {
    if (SUPERSCRIPTS[char]) {
      result += SUPERSCRIPTS[char];
    } else {
      return `^(${clean})`;
    }
  }
  return result;
}

/**
 * Converts a string of characters to Unicode subscripts if all characters are supported,
 * otherwise formats as `_(...)`.
 */
function toSubscript(str: string): string {
  const clean = str.trim();
  let result = '';
  for (const char of clean) {
    if (SUBSCRIPTS[char]) {
      result += SUBSCRIPTS[char];
    } else {
      return `_${clean}`;
    }
  }
  return result;
}

/**
 * Recursively parses and converts LaTeX fractions: \frac{num}{den} and \dfrac{num}{den}
 */
function processFractions(latex: string): string {
  let result = '';
  let i = 0;

  while (i < latex.length) {
    const isFrac = latex.startsWith('\\frac', i) || latex.startsWith('\\dfrac', i);
    if (isFrac) {
      const fracLen = latex.startsWith('\\dfrac', i) ? 6 : 5;
      let pos = i + fracLen;
      while (pos < latex.length && /\s/.test(latex[pos])) pos++;

      const numParsed = extractBalancedBraces(latex, pos);
      if (numParsed) {
        pos = numParsed.endIndex + 1;
        while (pos < latex.length && /\s/.test(latex[pos])) pos++;
        const denParsed = extractBalancedBraces(latex, pos);

        if (denParsed) {
          const numConverted = latexToReadableText(numParsed.content).trim();
          const denConverted = latexToReadableText(denParsed.content).trim();

          const simpleKey = `${numConverted}/${denConverted}`;
          if (COMMON_FRACTIONS[simpleKey]) {
            result += COMMON_FRACTIONS[simpleKey];
          } else {
            const wrapNum = /[\s+\-·×±=]/.test(numConverted) && !numConverted.startsWith('(');
            const wrapDen = /[\s+\-·×±=]/.test(denConverted) && !denConverted.startsWith('(');

            const finalNum = wrapNum ? `(${numConverted})` : numConverted;
            const finalDen = wrapDen ? `(${denConverted})` : denConverted;

            result += `${finalNum} / ${finalDen}`;
          }

          i = denParsed.endIndex + 1;
          continue;
        }
      }
    }

    result += latex[i];
    i++;
  }

  return result;
}

/**
 * Recursively parses and converts LaTeX roots: \sqrt{x} and \sqrt[n]{x}
 */
function processRoots(latex: string): string {
  let result = '';
  let i = 0;

  while (i < latex.length) {
    if (latex.startsWith('\\sqrt', i)) {
      let pos = i + 5;
      while (pos < latex.length && /\s/.test(latex[pos])) pos++;

      let rootIndex = '';
      if (latex[pos] === '[') {
        const bracketParsed = extractBalancedBrackets(latex, pos);
        if (bracketParsed) {
          rootIndex = bracketParsed.content.trim();
          pos = bracketParsed.endIndex + 1;
          while (pos < latex.length && /\s/.test(latex[pos])) pos++;
        }
      }

      const braceParsed = extractBalancedBraces(latex, pos);
      if (braceParsed) {
        const radicand = latexToReadableText(braceParsed.content).trim();
        const wrap = /[\s+\-·×±=]/.test(radicand) || radicand.length > 2;
        const formattedRadicand = wrap ? `(${radicand})` : radicand;

        if (!rootIndex) {
          result += `√${formattedRadicand}`;
        } else if (rootIndex === '3') {
          result += `∛${formattedRadicand}`;
        } else if (rootIndex === '4') {
          result += `∜${formattedRadicand}`;
        } else {
          result += `${toSuperscript(rootIndex)}√${formattedRadicand}`;
        }

        i = braceParsed.endIndex + 1;
        continue;
      }
    }

    result += latex[i];
    i++;
  }

  return result;
}

/**
 * Converts LaTeX vector notations: \vec{...}, \vec v, \overrightarrow{...}
 */
function processVectors(latex: string): string {
  let s = latex;

  // \vec{...}
  s = s.replace(/\\vec\{([^}]+)\}/g, (_, content) => {
    const trimmed = content.trim();
    if (trimmed.length === 1) {
      return `${trimmed}\u20D7`; // combining right arrow
    }
    return `${trimmed}\u20D7`;
  });

  // \vec X
  s = s.replace(/\\vec\s+([a-zA-Z])/g, '$1\u20D7');

  // \overrightarrow{...}
  s = s.replace(/\\overrightarrow\{([^}]+)\}/g, '$1\u20D7');

  return s;
}

/**
 * Converts matrices and environments into clean readable format
 */
function processEnvironments(latex: string): string {
  let s = latex;

  // Matrices: \begin{pmatrix}... \end{pmatrix}, bmatrix, vmatrix, matrix
  s = s.replace(/\\begin\{(pmatrix|bmatrix|vmatrix|matrix)\}([\s\S]*?)\\end\{\1\}/g, (_, type, body) => {
    const isParen = type === 'pmatrix';
    const isBracket = type === 'bmatrix';
    const isDet = type === 'vmatrix';

    const rows = body
      .trim()
      .split(/\\\\/)
      .map((row: string) => {
        const cols = row
          .split('&')
          .map((col: string) => latexToReadableText(col.trim()))
          .filter((col: string) => col.length > 0);
        return cols.join(', ');
      })
      .filter((row: string) => row.length > 0);

    const open = isDet ? '|' : isBracket ? '[' : '(';
    const close = isDet ? '|' : isBracket ? ']' : ')';

    if (rows.length === 1) {
      return `${open}${rows[0]}${close}`;
    }
    return `${open} ${rows.join(' ; ')} ${close}`;
  });

  // Cases environment: \begin{cases}... \end{cases}
  s = s.replace(/\\begin\{cases\}([\s\S]*?)\\end\{cases\}/g, (_, body) => {
    const lines = body
      .trim()
      .split(/\\\\/)
      .map((line: string) => {
        const parts = line.split('&').map((p: string) => latexToReadableText(p.trim()));
        return parts.join(' : ');
      })
      .filter((line: string) => line.length > 0);

    return `{ ${lines.join(' | ')} }`;
  });

  return s;
}

/**
 * Converts a LaTeX formula into clean, readable Unicode math text.
 * Suitable for copying to clipboard, plain text files, chat messages, etc.
 *
 * Example transformations:
 *  \vec{F} = m \cdot \vec{a}  ->  F⃗ = m · a⃗
 *  \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}  ->  (-b ± √(b² - 4ac)) / (2a)
 *  E = mc^2  ->  E = mc²
 *  \Delta x = v_0 t + \frac{1}{2} a t^2  ->  Δx = v₀ t + ½ a t²
 */
export function latexToReadableText(formula: string): string {
  if (!formula) return '';

  let text = formula.trim();

  // Strip code blocks or $$ wrappers if present
  text = text
    .replace(/^```(?:math|latex|equation|formula)?/i, '')
    .replace(/```$/, '')
    .replace(/^\$\$/, '')
    .replace(/\$\$$/, '')
    .replace(/^\$/, '')
    .replace(/\$$/, '')
    .trim();

  // 1. Process matrices and multi-line environments
  text = processEnvironments(text);

  // 2. Process fractions
  text = processFractions(text);

  // 3. Process square roots
  text = processRoots(text);

  // 4. Process vectors
  text = processVectors(text);

  // 5. Unwrap text and styling commands
  text = text.replace(/\\(?:text|mathrm|mathbf|mathit|textbf|textit|operatorname|mathbb|mathcal)\{([^}]+)\}/g, '$1');

  // Common blackboard sets
  text = text
    .replace(/\\mathbb\{R\}/g, 'ℝ')
    .replace(/\\mathbb\{N\}/g, 'ℕ')
    .replace(/\\mathbb\{Z\}/g, 'ℤ')
    .replace(/\\mathbb\{Q\}/g, 'ℚ')
    .replace(/\\mathbb\{C\}/g, 'ℂ')
    .replace(/\\mathbb\{P\}/g, 'ℙ');

  // 6. Greek letters
  for (const [macro, glyph] of Object.entries(GREEK_LETTERS)) {
    const regex = new RegExp(`\\\\${macro}(?![a-zA-Z])`, 'g');
    text = text.replace(regex, glyph);
  }

  // 7. Math symbols & operators
  for (const [macro, glyph] of Object.entries(MATH_SYMBOLS)) {
    const regex = new RegExp(`\\\\${macro}(?![a-zA-Z])`, 'g');
    text = text.replace(regex, glyph);
  }

  // 8. Integrals & Summations with limits
  // \int_{a}^{b} or \int_a^b -> ∫[a to b]
  text = text.replace(/\\int_\{([^}]+)\}\^\{([^}]+)\}/g, '∫[$1 to $2] ');
  text = text.replace(/\\int_([a-zA-Z0-9])\^([a-zA-Z0-9])/g, '∫[$1 to $2] ');
  text = text.replace(/\\sum_\{([^}]+)\}\^\{([^}]+)\}/g, '∑[$1..$2] ');
  text = text.replace(/\\prod_\{([^}]+)\}\^\{([^}]+)\}/g, '∏[$1..$2] ');

  // 9. Standard mathematical functions - strip backslash
  const functions = [
    'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
    'arcsin', 'arccos', 'arctan',
    'sinh', 'cosh', 'tanh',
    'ln', 'log', 'exp', 'lim', 'max', 'min', 'det', 'gcd', 'deg',
  ];
  for (const fn of functions) {
    const regex = new RegExp(`\\\\${fn}(?![a-zA-Z])`, 'g');
    text = text.replace(regex, fn);
  }

  // 10. Delimiters
  text = text
    .replace(/\\left\(/g, '(')
    .replace(/\\right\)/g, ')')
    .replace(/\\left\[/g, '[')
    .replace(/\\right\]/g, ']')
    .replace(/\\left\\\{/g, '{')
    .replace(/\\right\\\}/g, '}')
    .replace(/\\\{/g, '{')
    .replace(/\\\}/g, '}')
    .replace(/\\left\|/g, '|')
    .replace(/\\right\|/g, '|')
    .replace(/\\left\./g, '')
    .replace(/\\right\./g, '')
    .replace(/\\|/g, '|');

  // 11. Exponents & Superscripts
  // ^{...} with braces
  text = text.replace(/\^\{([^}]+)\}/g, (_, exp) => toSuperscript(exp));
  // ^X single character
  text = text.replace(/\^([0-9a-zA-Z+\-=])/g, (_, exp) => toSuperscript(exp));

  // 12. Subscripts
  // _{...} with braces
  text = text.replace(/_\{([^}]+)\}/g, (_, sub) => toSubscript(sub));
  // _X single character
  text = text.replace(/_([0-9a-zA-Z+\-=])/g, (_, sub) => toSubscript(sub));

  // 13. Spacing macros
  text = text
    .replace(/\\(?:quad|qquad)/g, '  ')
    .replace(/\\(?:,|;|:|enspace| )/g, ' ')
    .replace(/\\!/g, '')
    .replace(/~/g, ' ');

  // 14. Strip any remaining unsupported backslashes before special characters
  text = text.replace(/\\([#$%&_{}])/g, '$1');

  // 15. Strip leftover LaTeX commands like \displaystyle, \limits
  text = text.replace(/\\(?:displaystyle|textstyle|limits|nolimits)/g, '');

  // 16. Normalize spaces
  text = text.replace(/[ \t]+/g, ' ').trim();

  return text;
}

/**
 * Copies formatted math to clipboard in both plain text (clean readable Unicode format)
 * and rich HTML format (if a rendered KaTeX element is provided), with multiple fallbacks.
 */
export async function copyFormattedMath(
  latexFormula: string,
  renderedHtmlElement?: HTMLElement | null
): Promise<boolean> {
  const readableText = latexToReadableText(latexFormula);

  // 1. Try modern ClipboardItem API for dual format (plain text + HTML)
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard && navigator.clipboard.write) {
      const items: Record<string, Blob> = {
        'text/plain': new Blob([readableText], { type: 'text/plain' }),
      };

      if (renderedHtmlElement) {
        const clone = renderedHtmlElement.cloneNode(true) as HTMLElement;
        const btn = clone.querySelector('button');
        if (btn) btn.remove();
        items['text/html'] = new Blob([clone.innerHTML], { type: 'text/html' });
      }

      await navigator.clipboard.write([new ClipboardItem(items)]);
      return true;
    }
  } catch {
    // ClipboardItem may fail in some environments due to permission or mime constraints
  }

  // 2. Try standard clipboard writeText
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(readableText);
      return true;
    }
  } catch {
    // Fallback below
  }

  // 3. Fallback to textarea execCommand('copy')
  try {
    const textArea = document.createElement('textarea');
    textArea.value = readableText;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textArea);
    return success;
  } catch {
    return false;
  }
}

/**
 * Converts rich message content (including ```math, ```tree, ```diagram, ```chart blocks)
 * into a clean, human-readable text format suitable for copying to the clipboard
 * without exposing raw JSON blobs, raw LaTeX syntax, or SVG markup.
 */
export function formatContentForClipboard(rawText: string, isRtl: boolean = true): string {
  if (!rawText) return '';

  let text = rawText;

  // 1. Convert ```math ... ``` blocks into clean human-readable formulas
  text = text.replace(/```math\s*([\s\S]*?)```/gi, (_, formula) => {
    return '\n' + latexToReadableText(formula.trim()) + '\n';
  });

  // 2. Convert display LaTeX $$...$$ into readable text
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, formula) => {
    return '\n' + latexToReadableText(formula.trim()) + '\n';
  });

  // 3. Convert inline LaTeX $...$ into readable text (ignoring currency signs)
  text = text.replace(/(?<!\$)\$([^\$\n]+)\$(?!\$)/g, (_, formula) => {
    const trimmed = formula.trim();
    if (!trimmed || /^\d+(\.\d+)?$/.test(trimmed)) return `$${formula}$`;
    return latexToReadableText(trimmed);
  });

  // 4. Convert ```tree ... ``` JSON into an elegant plain-text tree
  text = text.replace(/```tree\s*([\s\S]*?)```/gi, (_, jsonStr) => {
    try {
      const data = JSON.parse(jsonStr.trim());
      const lines: string[] = [];
      if (data.title) lines.push(data.title.trim());

      const renderNode = (node: any, prefix: string = '', isLast: boolean = true) => {
        if (!node) return;
        const branch = isLast ? '└── ' : '├── ';
        const label = node.label || node.name || node.title || '';
        if (label) lines.push(`${prefix}${branch}${label}`);
        const childPrefix = prefix + (isLast ? '    ' : '│   ');
        const children = node.children || [];
        children.forEach((child: any, idx: number) => {
          renderNode(child, childPrefix, idx === children.length - 1);
        });
      };

      if (data.root) {
        const rootLabel = data.root.label || data.root.name || data.root.title || '';
        if (rootLabel) lines.push(rootLabel);
        const children = data.root.children || [];
        children.forEach((child: any, idx: number) => {
          renderNode(child, '', idx === children.length - 1);
        });
      }

      return lines.length > 0 ? `\n${lines.join('\n')}\n` : '';
    } catch {
      return '';
    }
  });

  // 5. Convert ```diagram ... ``` JSON into clean process steps
  text = text.replace(/```diagram\s*([\s\S]*?)```/gi, (_, jsonStr) => {
    try {
      const data = JSON.parse(jsonStr.trim());
      const lines: string[] = [];
      if (data.title) lines.push(data.title.trim());
      const nodes = data.nodes || [];
      nodes.forEach((node: any, idx: number) => {
        const nodeTitle = node.title || node.label || `Step ${idx + 1}`;
        const nodeDesc = node.description || node.subtitle || '';
        lines.push(`${idx + 1}. ${nodeTitle}${nodeDesc ? `: ${nodeDesc}` : ''}`);
      });
      return lines.length > 0 ? `\n${lines.join('\n')}\n` : '';
    } catch {
      return '';
    }
  });

  // 6. Convert ```chart ... ``` JSON into a clean summary list
  text = text.replace(/```chart\s*([\s\S]*?)```/gi, (_, jsonStr) => {
    try {
      const data = JSON.parse(jsonStr.trim());
      const lines: string[] = [];
      if (data.title) lines.push(`[${data.title.trim()}]`);
      if (Array.isArray(data.data)) {
        data.data.forEach((row: any) => {
          const rowEntries = Object.entries(row)
            .filter(([k]) => k !== 'name' && k !== 'label')
            .map(([k, v]) => `${k}: ${v}`)
            .join(' | ');
          const rowName = row.name || row.label || '';
          lines.push(`- ${rowName ? `${rowName}: ` : ''}${rowEntries}`);
        });
      }
      return lines.length > 0 ? `\n${lines.join('\n')}\n` : '';
    } catch {
      return '';
    }
  });

  // 7. Strip raw SVG code blocks and replace with brief clean tag
  text = text.replace(/```svg\s*[\s\S]*?```/gi, isRtl ? '\n[رسم توضيحي]\n' : '\n[Vector Illustration]\n');

  // 8. Strip molecule / smiles blocks and convert to readable tag
  text = text.replace(/```(?:smiles|molecule)\s*([\s\S]*?)```/gi, (_, molContent) => {
    try {
      const parsed = JSON.parse(molContent.trim());
      return `\n[${parsed.name || 'Molecule'}: ${parsed.formula || parsed.smiles || ''}]\n`;
    } catch {
      return `\n[${molContent.trim()}]\n`;
    }
  });

  // 9. Normalize multiple consecutive blank lines
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return text;
}

