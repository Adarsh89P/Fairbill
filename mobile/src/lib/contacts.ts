import { Contact, ContactField, requestPermissionsAsync } from 'expo-contacts';
import { Platform } from 'react-native';

export interface PhoneContact {
  id: string;
  name: string;
  phones: string[];
}

export class ContactsError extends Error {}

export const contactsSupported = Platform.OS === 'ios' || Platform.OS === 'android';

/** Contacts with a name, sorted A–Z. Only names and phone numbers are read, and nothing leaves the phone. */
export async function loadContacts(): Promise<PhoneContact[]> {
  if (!contactsSupported) throw new ContactsError('Contacts are only available in the phone app.');
  const perm = await requestPermissionsAsync();
  if (!perm.granted) throw new ContactsError('Contacts access is off. Allow it in Settings to pick friends from your contacts.');
  const rows = await Contact.getAllDetails([ContactField.FULL_NAME, ContactField.PHONES] as const);
  const out: PhoneContact[] = [];
  for (const r of rows) {
    const name = (r.fullName ?? '').trim();
    if (!name) continue;
    const phones = Array.from(new Set((r.phones ?? []).map((p: { number?: string | null }) => (p.number ?? '').trim()).filter(Boolean)));
    out.push({ id: r.id, name, phones });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
