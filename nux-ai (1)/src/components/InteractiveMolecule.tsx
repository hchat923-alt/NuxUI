import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Atom,
  Copy,
  Check,
  Download,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sun,
  Moon,
  ExternalLink,
  Code2,
  Info,
  Loader2,
} from 'lucide-react';
import SmilesDrawer from 'smiles-drawer';
import { getStoredLanguage } from '../utils/i18n';

interface InteractiveMoleculeProps {
  rawCode: string;
  onOpenArtifact?: (code: string, language: string) => void;
}

interface ParsedMoleculeData {
  smiles: string;
  name?: string;
  formula?: string;
  iupac?: string;
  description?: string;
  svg?: string;
}

function parseMoleculeInput(raw: string): ParsedMoleculeData {
  const trimmed = raw.trim();

  // 1. Check if raw input is JSON format
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      return {
        smiles: parsed.smiles || parsed.SMILES || parsed.structure || '',
        name: parsed.name || parsed.title || parsed.compound || '',
        formula: parsed.formula || parsed.chemicalFormula || '',
        iupac: parsed.iupac || parsed.IUPAC || '',
        description: parsed.description || parsed.notes || '',
        svg: parsed.svg || '',
      };
    } catch (_) {}
  }

  // 2. Check if raw input contains direct SVG
  if (trimmed.includes('<svg') && trimmed.includes('</svg>')) {
    const match = /<svg[\s\S]*?<\/svg>/i.exec(trimmed);
    return {
      smiles: '',
      svg: match ? match[0] : trimmed,
    };
  }

  // 3. Extract SMILES from lines (e.g. "SMILES: CC(=O)OC1=CC=CC=C1C(=O)O" or code snippet)
  const lines = trimmed.split('\n');
  let smiles = '';
  let name = '';
  let formula = '';

  for (const line of lines) {
    const l = line.trim();
    if (/^smiles:\s*/i.test(l)) {
      smiles = l.replace(/^smiles:\s*/i, '').trim();
    } else if (/^name:\s*/i.test(l) || /^compound:\s*/i.test(l)) {
      name = l.replace(/^(?:name|compound):\s*/i, '').trim();
    } else if (/^formula:\s*/i.test(l)) {
      formula = l.replace(/^formula:\s*/i, '').trim();
    } else if (l.includes('MolFromSmiles(')) {
      const match = /MolFromSmiles\(\s*["']([^"']+)["']\s*\)/.exec(l);
      if (match) smiles = match[1];
    }
  }

  if (!smiles) {
    // If single line or first non-empty line without spaces (likely pure SMILES)
    const firstLine = lines.find((l) => l.trim() && !l.trim().startsWith('#') && !l.trim().startsWith('//')) || '';
    const cleanCandidate = firstLine.replace(/['",;]/g, '').trim();
    if (cleanCandidate && !cleanCandidate.includes(' ') && cleanCandidate.length >= 2) {
      smiles = cleanCandidate;
    } else {
      smiles = trimmed;
    }
  }

  return { smiles, name, formula };
}

const getSystemTheme = (): 'dark' | 'light' => {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ||
    document.documentElement.getAttribute('data-theme') === 'dark'
    ? 'dark'
    : 'light';
};

export const InteractiveMolecule: React.FC<InteractiveMoleculeProps> = ({
  rawCode,
  onOpenArtifact,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number>(1);
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>(getSystemTheme);
  const [copied, setCopied] = useState<boolean>(false);
  const [showCode, setShowCode] = useState<boolean>(false);
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [renderError, setRenderError] = useState<boolean>(false);
  const [isRendering, setIsRendering] = useState<boolean>(true);
  const [pubchemImgLoaded, setPubchemImgLoaded] = useState<boolean>(false);

  const lang = getStoredLanguage() || 'ar';
  const isArabic = lang === 'ar';

  // Listen to live theme switches on document.documentElement
  useEffect(() => {
    setThemeMode(getSystemTheme());

    const observer = new MutationObserver(() => {
      setThemeMode(getSystemTheme());
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });

    return () => observer.disconnect();
  }, []);

  const data = useMemo(() => parseMoleculeInput(rawCode), [rawCode]);

  const cleanSmiles = data.smiles.trim();

  // Render molecule via SmilesDrawer SvgDrawer
  useEffect(() => {
    if (!cleanSmiles || data.svg) {
      setIsRendering(false);
      return;
    }

    let isMounted = true;
    setIsRendering(true);
    setRenderError(false);

    try {
      const targetDiv = svgContainerRef.current;
      if (!targetDiv) return;

      targetDiv.innerHTML = '';

      const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      svgElement.setAttribute('width', '100%');
      svgElement.setAttribute('height', '100%');
      svgElement.setAttribute('viewBox', '0 0 500 500');
      svgElement.style.width = '100%';
      svgElement.style.height = '100%';
      svgElement.style.maxHeight = '360px';

      targetDiv.appendChild(svgElement);

      const drawerOptions = {
        width: 500,
        height: 500,
        bondThickness: 2.8,
        bondLength: 32,
        shortBondLength: 0.85,
        bondSpacing: 0.18 * 32,
        atomVisualization: 'default',
        isomeric: true,
        terminalCarbons: false,
        explicitHydrogens: false,
        overlapSensitivity: 0.42,
        overlapResolutionIterations: 2,
        compactDrawing: false,
        fontSizeLarge: 11,
        fontSizeSmall: 7,
        padding: 10,
        themes: {
          dark: {
            C: '#FAFAFA',
            O: '#F87171',
            N: '#60A5FA',
            F: '#34D399',
            CL: '#34D399',
            BR: '#FBBF24',
            I: '#A78BFA',
            P: '#FB923C',
            S: '#FACC15',
            B: '#F472B6',
            SI: '#22D3EE',
            H: '#E4E4E7',
            BACKGROUND: 'transparent',
          },
          light: {
            C: '#09090B',
            O: '#DC2626',
            N: '#2563EB',
            F: '#059669',
            CL: '#059669',
            BR: '#D97706',
            I: '#7C3AED',
            P: '#EA580C',
            S: '#B45309',
            B: '#DB2777',
            SI: '#0891B2',
            H: '#18181B',
            BACKGROUND: 'transparent',
          },
        },
      };

      const svgDrawer = new SmilesDrawer.SvgDrawer(drawerOptions);

      SmilesDrawer.parse(
        cleanSmiles,
        (tree: any) => {
          if (!isMounted) return;
          try {
            svgDrawer.draw(tree, svgElement, themeMode, false);
            setIsRendering(false);
          } catch (drawErr) {
            console.warn('SmilesDrawer draw fallback:', drawErr);
            setRenderError(true);
            setIsRendering(false);
          }
        },
        (parseErr: any) => {
          if (!isMounted) return;
          console.warn('SmilesDrawer parse error, using fallback:', parseErr);
          setRenderError(true);
          setIsRendering(false);
        }
      );
    } catch (err) {
      console.warn('Molecule render exception:', err);
      setRenderError(true);
      setIsRendering(false);
    }

    return () => {
      isMounted = false;
    };
  }, [cleanSmiles, themeMode, data.svg]);

  const handleCopySmiles = () => {
    if (cleanSmiles) {
      navigator.clipboard.writeText(cleanSmiles);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadImage = () => {
    const svgElement = (svgContainerRef.current?.querySelector('svg') || containerRef.current?.querySelector('svg')) as SVGSVGElement | null;

    if (svgElement) {
      try {
        const clone = svgElement.cloneNode(true) as SVGSVGElement;

        // Extract existing viewBox or compute from getBBox or getBoundingClientRect
        let minX = 0;
        let minY = 0;
        let vbWidth = 500;
        let vbHeight = 500;

        const rawVb = svgElement.getAttribute('viewBox');
        if (rawVb) {
          const parts = rawVb.trim().split(/[\s,]+/).map(Number);
          if (parts.length >= 4 && parts[2] > 0 && parts[3] > 0) {
            minX = parts[0];
            minY = parts[1];
            vbWidth = parts[2];
            vbHeight = parts[3];
          }
        } else {
          const rect = svgElement.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            vbWidth = rect.width;
            vbHeight = rect.height;
          }
        }

        // Add padding so bonds and labels are never clipped at edges
        const padX = vbWidth * 0.08;
        const padY = vbHeight * 0.08;
        const paddedMinX = minX - padX;
        const paddedMinY = minY - padY;
        const paddedWidth = vbWidth + padX * 2;
        const paddedHeight = vbHeight + padY * 2;

        // High resolution canvas target
        const exportScale = 3;
        const targetCanvasWidth = Math.round(paddedWidth * exportScale);
        const targetCanvasHeight = Math.round(paddedHeight * exportScale);

        clone.setAttribute('viewBox', `${paddedMinX} ${paddedMinY} ${paddedWidth} ${paddedHeight}`);
        clone.setAttribute('width', `${targetCanvasWidth}`);
        clone.setAttribute('height', `${targetCanvasHeight}`);
        clone.setAttribute('preserveAspectRatio', 'xMidYMid meet');

        const svgString = new XMLSerializer().serializeToString(clone);
        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        const img = new Image();

        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = targetCanvasWidth;
          canvas.height = targetCanvasHeight;
          const ctx = canvas.getContext('2d');

          if (ctx) {
            ctx.fillStyle = themeMode === 'dark' ? '#09090b' : '#FFFFFF';
            ctx.fillRect(0, 0, targetCanvasWidth, targetCanvasHeight);
            ctx.drawImage(img, 0, 0, targetCanvasWidth, targetCanvasHeight);

            const pngUrl = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.href = pngUrl;
            link.download = `${data.name ? data.name.toLowerCase().replace(/\s+/g, '-') : 'chemical-structure'}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }
          URL.revokeObjectURL(url);
        };

        img.src = url;
        return;
      } catch (e) {
        console.warn('Canvas export fallback:', e);
      }
    }

    if (pubchemImgUrl) {
      fetch(pubchemImgUrl)
        .then((res) => res.blob())
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${data.name ? data.name.toLowerCase().replace(/\s+/g, '-') : 'chemical-structure'}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        })
        .catch(() => {
          window.open(pubchemImgUrl, '_blank');
        });
    }
  };

  const pubchemUrl = cleanSmiles
    ? `https://pubchem.ncbi.nlm.nih.gov/#query=${encodeURIComponent(cleanSmiles)}`
    : data.name
    ? `https://pubchem.ncbi.nlm.nih.gov/#query=${encodeURIComponent(data.name)}`
    : null;

  const pubchemImgUrl = cleanSmiles
    ? `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encodeURIComponent(cleanSmiles)}/PNG?image_size=450x450`
    : null;

  return (
    <div
      ref={containerRef}
      className="group relative my-3 rounded-xl bg-transparent transition-all duration-200 select-none font-sans"
    >
      {/* Main Molecule Visual Viewport Card */}
      <div className="relative h-[210px] sm:h-[240px] flex items-center justify-center p-2 sm:p-3 rounded-xl bg-zinc-100/60 dark:bg-zinc-900/40 border border-zinc-200/80 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors select-none overflow-hidden">
        {/* Standalone Floating Controls on Hover */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 absolute top-2.5 inset-x-3 z-20 flex items-center justify-between pointer-events-none">
          {/* Standalone Title & Formula (rendered only when present) */}
          <div className="pointer-events-auto flex items-center gap-2 max-w-[60%] overflow-hidden">
            {data.name && (
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 truncate drop-shadow-xs">
                {data.name}
              </span>
            )}
            {data.formula && (
              <span className="text-[10.5px] font-mono text-zinc-500 dark:text-zinc-400 truncate">
                {data.formula}
              </span>
            )}
          </div>

          {/* Standalone Action Icons */}
          <div className="pointer-events-auto flex items-center gap-1.5 shrink-0">
            {cleanSmiles && (
              <button
                type="button"
                onClick={handleCopySmiles}
                className="text-zinc-400 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors cursor-pointer p-1"
                title={isArabic ? 'نسخ صيغة SMILES' : 'Copy SMILES'}
              >
                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </button>
            )}

            {/* Download as Image PNG */}
            <button
              type="button"
              onClick={handleDownloadImage}
              className="text-zinc-400 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors cursor-pointer p-1"
              title={isArabic ? 'تنزيل التركيبة كصورة PNG' : 'Download Image (PNG)'}
            >
              <Download className="w-4 h-4" />
            </button>

            {onOpenArtifact && (
              <button
                type="button"
                onClick={() => onOpenArtifact(rawCode, 'molecule')}
                className="text-zinc-400 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors cursor-pointer p-1"
                title={isArabic ? 'فتح في مساحة العمل' : 'Open in Artifacts'}
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {isRendering && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/5 dark:bg-black/20 backdrop-blur-xs z-10">
            <Loader2 className="w-5 h-5 text-zinc-700 dark:text-zinc-300 animate-spin" />
          </div>
        )}

        {/* Standalone Zoom Controls on Hover */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 absolute bottom-2.5 start-3 flex items-center gap-1.5 text-zinc-400 dark:text-zinc-400 z-10">
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(2.5, s + 0.2))}
            className="hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer p-1"
            title={isArabic ? 'تكبير' : 'Zoom In'}
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(0.6, s - 0.2))}
            className="hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer p-1"
            title={isArabic ? 'تصغير' : 'Zoom Out'}
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setScale(1)}
            className="hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer p-1"
            title={isArabic ? 'إعادة الضبط' : 'Reset'}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 1. Direct SVG Rendering */}
        {data.svg ? (
          <div
            style={{ transform: `scale(${scale})`, transformOrigin: 'center center', transition: 'transform 0.15s ease-out' }}
            className="w-full h-full flex items-center justify-center text-zinc-900 dark:text-zinc-100 [&_svg]:max-h-[190px] [&_svg]:max-w-full"
            dangerouslySetInnerHTML={{ __html: data.svg }}
          />
        ) : renderError && pubchemImgUrl ? (
          /* 2. Fallback to High-Resolution PubChem Structure */
          <div
            style={{ transform: `scale(${scale})`, transformOrigin: 'center center', transition: 'transform 0.15s ease-out' }}
            className="flex items-center justify-center p-2 max-w-full max-h-full"
          >
            <img
              src={pubchemImgUrl}
              alt={data.name || cleanSmiles}
              onLoad={() => setPubchemImgLoaded(true)}
              className={`max-h-[300px] object-contain transition-opacity duration-300 ${
                pubchemImgLoaded ? 'opacity-100' : 'opacity-0'
              } ${themeMode === 'dark' ? 'invert hue-rotate-180 brightness-95 contrast-125' : ''}`}
            />
          </div>
        ) : (
          /* 3. Client-Side Interactive SmilesDrawer SVG */
          <div
            ref={svgContainerRef}
            style={{ transform: `scale(${scale})`, transformOrigin: 'center center', transition: 'transform 0.15s ease-out' }}
            className="w-full h-full flex items-center justify-center"
          />
        )}
      </div>

      {/* Description rendered only if present and non-empty - zero layout shift/empty space when missing */}
      {data.description && data.description.trim() ? (
        <div className="mt-1.5 px-1 text-start">
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
            {data.description.trim()}
          </p>
        </div>
      ) : null}
    </div>
  );
};
