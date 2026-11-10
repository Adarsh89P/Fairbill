import { Alert, Platform } from 'react-native';

export interface DialogRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm?: () => void; // absent = information only
}

type Listener = (d: DialogRequest) => void;
let listener: Listener | null = null;

/** The in-app dialog host registers here (browser pop-ups are blocked in embedded views). */
export function setDialogListener(l: Listener | null) {
  listener = l;
}

/** Destructive-action confirmation. Uses the native alert on phones, an in-app dialog on web. */
export function confirmAction(title: string, message: string, onYes: () => void, yes = 'Delete') {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: yes, style: 'destructive', onPress: onYes }]);
    return;
  }
  listener?.({ title, message, confirmLabel: yes, destructive: true, onConfirm: onYes });
}

export function notify(title: string, message?: string) {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message);
    return;
  }
  listener?.({ title, message });
}
