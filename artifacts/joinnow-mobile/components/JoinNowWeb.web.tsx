import { createElement } from 'react';
import { StyleSheet, View } from 'react-native';

const configuredHost =
  process.env.EXPO_PUBLIC_DOMAIN || 'join-up--teddywfrantz.replit.app';
const JOINNOW_URL = /^https?:\/\//.test(configuredHost)
  ? configuredHost
  : `https://${configuredHost}`;

export function JoinNowWeb() {
  return (
    <View style={styles.root}>
      {createElement('iframe', {
        src: JOINNOW_URL,
        title: 'JoinNow',
        allow: 'geolocation; camera; microphone',
        style: {
          border: 0,
          height: '100%',
          width: '100%',
        },
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: 67,
    paddingBottom: 34,
  },
});