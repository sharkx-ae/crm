import { NotFoundPanel } from '../../../components/shell/not-found-panel.tsx';

// Every guard denial and every unknown address inside the app ends here, in the shell.
export default function AppNotFound() {
  return <NotFoundPanel />;
}
