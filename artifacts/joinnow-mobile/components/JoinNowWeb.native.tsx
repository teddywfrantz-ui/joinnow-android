import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import WebView from 'react-native-webview/lib/WebView.android';
import type {
  WebViewHttpErrorEvent,
  WebViewNavigation,
} from 'react-native-webview/lib/WebViewTypes';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

const configuredHost =
  process.env.EXPO_PUBLIC_DOMAIN || 'join-up--teddywfrantz.replit.app';
const JOINNOW_URL = /^https?:\/\//.test(configuredHost)
  ? configuredHost
  : `https://${configuredHost}`;

export function JoinNowWeb() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const webView = useRef<any>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (!canGoBack) return false;
        webView.current?.goBack();
        return true;
      },
    );
    return () => subscription.remove();
  }, [canGoBack]);

  const onNavigationStateChange = useCallback((state: WebViewNavigation) => {
    setCanGoBack(state.canGoBack);
  }, []);

  if (failed) {
    return (
      <View
        style={[
          styles.error,
          {
            backgroundColor: colors.background,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        <Text style={[styles.errorTitle, { color: colors.foreground }]}>
          JoinNow couldn’t connect
        </Text>
        <Text style={[styles.errorBody, { color: colors.mutedForeground }]}>
          Check your internet connection and try again.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setFailed(false)}
          style={[styles.retry, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.retryText, { color: colors.primaryForeground }]}>
            Try again
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      <WebView
        ref={webView}
        source={{ uri: JOINNOW_URL }}
        style={styles.webView}
        originWhitelist={['https://*']}
        thirdPartyCookiesEnabled
        domStorageEnabled
        javaScriptEnabled
        geolocationEnabled
        mediaPlaybackRequiresUserAction={false}
        setSupportMultipleWindows={false}
        onNavigationStateChange={onNavigationStateChange}
        onError={() => setFailed(true)}
        onHttpError={(event: WebViewHttpErrorEvent) => {
          if (event.nativeEvent.statusCode >= 500) setFailed(true);
        }}
        startInLoadingState
        renderLoading={() => (
          <View style={[styles.loading, { backgroundColor: colors.background }]}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  webView: { flex: 1 },
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  errorTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    textAlign: 'center',
  },
  errorBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 10,
    textAlign: 'center',
  },
  retry: {
    borderRadius: 8,
    marginTop: 24,
    minHeight: 48,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
  },
});