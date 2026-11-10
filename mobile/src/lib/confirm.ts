import { Alert, Platform } from 'react-native';

/** Destructive-action confirmation that also works on web. */
export function confirmAction(title: string, message: string, onYes: () => void, yes = 'Delete') {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onYes();
    return;
  }
  Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: yes, style: 'destructive', onPress: onYes }]);
}

export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') window.alert(message ? `${title}\n\n${message}` : title);
  else Alert.alert(title, message);
}
