'use client';

import { ErrorPanel } from '../../components/shell/error-panel.tsx';

// Unexpected failure outside the shell (sign-in screens): same message on the light canvas.
export default function LocaleError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="min-h-dvh bg-sx-page ps-4 pe-4 py-8">
      <ErrorPanel reset={reset} />
    </main>
  );
}
