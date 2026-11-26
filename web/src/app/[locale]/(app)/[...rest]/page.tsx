import { notFound } from 'next/navigation';

// Any address the app does not know shows the same in-shell not-found page as a denied one.
export default function UnknownPage(): never {
  notFound();
}
