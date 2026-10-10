import React, { useState, useEffect } from 'react';

interface RotatingThinkingPhraseProps {
  isRtl?: boolean;
}

export const RotatingThinkingPhrase: React.FC<RotatingThinkingPhraseProps> = ({ isRtl = false }) => {
  const [index, setIndex] = useState(0);

  const phrasesAr = [
    'يجري التفكير...',
    'جارِ التخطيط...',
    'تحليل المعطيات...',
    'تصميم الهيكلة...',
    'معالجة الخوارزميات...',
    'صياغة الأفكار...',
    'ترتيب العناصر...',
    'توليد الاستدلال...',
    'هندسة المحتوى...',
    'تجهيز الإجابة...'
  ];

  const phrasesEn = [
    'Thinking...',
    'Figuring...',
    'Analyzing...',
    'Designing...',
    'Processing...',
    'Structuring...',
    'Synthesizing...',
    'Reasoning...',
    'Formulating...',
    'Architecting...'
  ];

  const list = isRtl ? phrasesAr : phrasesEn;

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % list.length);
    }, 2000);
    return () => clearInterval(timer);
  }, [list.length]);

  return <span>{list[index]}</span>;
};
