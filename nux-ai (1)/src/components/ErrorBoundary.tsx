import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in UI:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center bg-zinc-50 dark:bg-[#141416] text-zinc-900 dark:text-zinc-100 p-6 text-center select-none font-sans">
          <div className="max-w-md w-full p-8 rounded-2xl bg-white dark:bg-[#1B1B1F] border border-zinc-200 dark:border-zinc-800 shadow-xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 mx-auto flex items-center justify-center font-bold text-xl border border-zinc-200 dark:border-zinc-700">
              !
            </div>
            <h2 className="text-xl font-semibold">
              حدث خطأ غير متوقع
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              تم اكتشاف خطأ في عرض الواجهة. يمكنك إعادة التحميل لمتابعة محادثاتك بأمان.
            </p>
            {this.state.error?.message && (
              <pre className="text-[11px] font-mono text-start p-3 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-x-auto text-red-500">
                {this.state.error.message}
              </pre>
            )}
            <button
              type="button"
              onClick={this.handleReset}
              className="w-full py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-black dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium transition-colors cursor-pointer shadow-md"
            >
              إعادة تحميل التطبيق
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
