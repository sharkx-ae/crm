import { setRequestLocale } from 'next-intl/server';
import { ContactsScreen } from '../../../../../../components/contacts/contacts-screen.tsx';
import { parseContactsAddress } from '../../../../../../lib/contacts-url.ts';
import { getContact, getContacts } from '../../../../../../lib/data/contacts.ts';
import { guardRoute } from '../../../../../../lib/nav/guard.ts';

// Contacts (F4b): staff only. A client user never reaches this page (guardRoute 404s). The address is the state
// (?q&limit&contact); the api does the search and the paging.
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
  const { filters, contactId } = parseContactsAddress(await searchParams);

  const [data, profile] = await Promise.all([
    getContacts(projectId, filters),
    contactId ? getContact(projectId, contactId) : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <ContactsScreen
        projectId={projectId}
        data={data}
        filters={filters}
        profile={profile}
        contactId={contactId}
        contactMissing={Boolean(contactId) && profile === null}
      />
    </div>
  );
}
