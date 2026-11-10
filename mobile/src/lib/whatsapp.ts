import { Linking, Platform } from 'react-native';
import { notify } from './confirm';
import { waNumber } from './phone';

/** Opens WhatsApp with a message, to one person when we know their number. */
export async function openWhatsApp(text: string, phone?: string) {
  const n = waNumber(phone);
  const app = `whatsapp://send?${n ? `phone=${n}&` : ''}text=${encodeURIComponent(text)}`;
  const web = `https://wa.me/${n ?? ''}?text=${encodeURIComponent(text)}`;
  try {
    if (Platform.OS !== 'web' && (await Linking.canOpenURL(app))) await Linking.openURL(app);
    else await Linking.openURL(web);
  } catch {
    notify("Couldn't open WhatsApp", 'Copy the message instead and paste it.');
  }
}
