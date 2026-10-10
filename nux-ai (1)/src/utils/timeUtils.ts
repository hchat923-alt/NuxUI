export function formatTimeAgo(timestamp: number, language: 'ar' | 'en' = 'ar'): string {
  const now = Date.now();
  const diffSecs = Math.max(1, Math.floor((now - timestamp) / 1000));

  if (language === 'ar') {
    if (diffSecs < 60) return 'منذ لحظات';
    const mins = Math.floor(diffSecs / 60);
    if (mins < 60) return `منذ ${mins} ${mins === 1 ? 'دقيقة' : 'دقائق'}`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `منذ ${hours} ${hours === 1 ? 'ساعة' : 'ساعات'}`;
    const days = Math.floor(hours / 24);
    return `منذ ${days} ${days === 1 ? 'يوم' : 'أيام'}`;
  } else {
    if (diffSecs < 60) return 'Just now';
    const mins = Math.floor(diffSecs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
}
