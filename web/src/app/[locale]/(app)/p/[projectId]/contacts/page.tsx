import { setRequestLocale } from 'next-intl/server';
import { ContactsScreen } from '../../../../../../components/contacts/contacts-screen.tsx';
import { parseContactsAddress } from '../../../../../../lib/contacts-url.ts';
import { getContact, getContacts } from '../../../../../../lib/data/contacts.ts';
import { guardRoute } from '../../../../../../lib/nav/guard.ts';
import { lastPage } from '../../../../../../lib/paging.ts';

// Contacts (F4b): staff only. A client user never reaches this page (guardRoute 404s). The address is the state
// (?q&page&size&contact); the api does the search and the paging.
export default async function ContactsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, projectId } = await params;
  setRequestLocale(locale);
  await guardRoute('contacts', projectId);
  const { filters: asked, contactId } = parseContactsAddress(await searchParams);

  const [first, profile] = await Promise.all([
    getContacts(projectId, asked),
    contactId ? getContact(projectId, contactId) : Promise.resolve(null),
  ]);

  // A page past the end: show the last page now, and let the client correct the address.
  const last = lastPage(first.total, asked.size);
  const pageClamped = asked.page > last;
  const filters = pageClamped ? { ...asked, page: last } : asked;
  const data = pageClamped && first.total > 0 ? await getContacts(projectId, filters) : first;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <ContactsScreen
        projectId={projectId}
        data={data}
        filters={filters}
        profile={profile}
        contactId={contactId}
        contactMissing={Boolean(contactId) && profile === null}
        pageClamped={pageClamped}
      />
    </div>
  );
}
