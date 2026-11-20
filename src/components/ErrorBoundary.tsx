import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let message = error?.message || 'Възникна неочаквана грешка.';
    try {
      const parsed = JSON.parse(message);
      if (parsed?.error) {
        message = parsed.error.includes('Missing or insufficient permissions')
          ? 'Нямате достатъчно права за това действие в базата данни.'
          : parsed.error;
      }
    } catch {
      // Plain error message
    }
    return { hasError: true, message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-film text-ink flex items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full rounded-2xl border border-line bg-sheet p-6 space-y-4 text-xs">
            <div className="flex items-center gap-2.5 text-red font-bold text-base">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>Възникна проблем при работа с данните</span>
            </div>
            <p className="text-ink leading-relaxed">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-mat hover:bg-mat-deep text-white font-semibold transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Презареди приложението</span>
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
