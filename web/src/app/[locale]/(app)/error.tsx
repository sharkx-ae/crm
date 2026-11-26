'use client';

import { ErrorPanel } from '../../../components/shell/error-panel.tsx';

// Unexpected failure inside the shell: the frame stays, the page area shows the generic message.
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return <ErrorPanel reset={reset} />;
}
