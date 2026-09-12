import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Image,
  Keyboard,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import WebView from 'react-native-webview/lib/WebView.android';
import type {
  WebViewHttpErrorEvent,
  WebViewMessageEvent,
  WebViewNavigation,
} from 'react-native-webview/lib/WebViewTypes';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

const configuredHost =
  process.env.EXPO_PUBLIC_DOMAIN || 'join-up--teddywfrantz.replit.app';
const JOINNOW_URL = /^https?:\/\//.test(configuredHost)
  ? configuredHost
  : `https://${configuredHost}`;
const JOINNOW_ORIGIN = new URL(JOINNOW_URL).origin;
const ANDROID_USER_AGENT = 'JoinNowAndroid/1.0';

const ANDROID_BRIDGE_SCRIPT = `
  (() => {
    if (window.__joinNowAndroidBridgeInstalled) return true;
    const send = (payload) => {
      window.ReactNativeWebView?.postMessage(JSON.stringify(payload));
    };
    const sendPath = () => send({ type: 'navigation', path: window.location.pathname });

    ['pushState', 'replaceState'].forEach((method) => {
      const original = window.history[method];
      window.history[method] = function (...args) {
        const result = original.apply(this, args);
        setTimeout(sendPath, 0);
        return result;
      };
    });
    window.addEventListener('popstate', sendPath);
    window.addEventListener('hashchange', sendPath);

    let nextInputId = 1;
    document.addEventListener('focusin', (event) => {
      const element = event.target;
      if (!(element instanceof HTMLInputElement)) return;
      const supportedTypes = ['text', 'search', 'email', 'tel', 'url', 'number', 'password'];
      if (!supportedTypes.includes(element.type)) return;

      if (!element.dataset.joinNowAndroidInputId) {
        element.dataset.joinNowAndroidInputId = String(nextInputId++);
      }
      send({
        type: 'inputFocus',
        id: element.dataset.joinNowAndroidInputId,
        value: element.value,
        placeholder: element.placeholder || '',
        inputType: element.type
      });
    }, true);

    const style = document.createElement('style');
    style.textContent = [
      'header button.md\\\\:hidden{display:none!important}',
      '[data-join-now-user-profile]{',
      'width:calc(100vw - 16px)!important;',
      'max-width:none!important;',
      'max-height:calc(95dvh - 8px)!important;',
      'top:5dvh!important;',
      'transform:translateX(-50%)!important;',
      'padding-bottom:32px!important;',
      '}'
    ].join('');
    document.documentElement.appendChild(style);
    window.__joinNowAndroidBridgeInstalled = true;
    sendPath();
    return true;
  })();
`;

const MAIN_TABS = [
  { label: 'Map', path: '/map', icon: 'map' },
  { label: 'Active', path: '/active-meet', icon: 'star' },
  { label: 'Friends', path: '/friends', icon: 'users' },
  { label: 'Profile', path: '/profile', icon: 'user' },
] as const;

const MORE_TABS = [
  { label: 'Group', path: '/groups', icon: 'users' },
  { label: 'Leaderboards', path: '/leaderboards', icon: 'award' },
  { label: 'Settings', path: '/settings', icon: 'settings' },
] as const;

type FocusedInput = {
  id: string;
  value: string;
  placeholder: string;
  inputType: string;
};

export function JoinNowWeb() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const webView = useRef<any>(null);
  const focusedInputRef = useRef<FocusedInput | null>(null);
  const keyboardHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [currentPath, setCurrentPath] = useState('/');
  const [focusedInput, setFocusedInput] = useState<FocusedInput | null>(null);
  const [failed, setFailed] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const finishEditing = useCallback(() => {
    const input = focusedInputRef.current;
    if (input) {
      webView.current?.injectJavaScript(`
        (() => {
          const input = document.querySelector('[data-join-now-android-input-id="${input.id}"]');
          if (!input) return true;
          const keyboardEvent = (name) => input.dispatchEvent(new KeyboardEvent(name, {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
          }));
          keyboardEvent('keydown');
          keyboardEvent('keypress');
          keyboardEvent('keyup');
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.blur();
          return true;
        })();
      `);
    }
    focusedInputRef.current = null;
    Keyboard.dismiss();
    setFocusedInput(null);
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (focusedInput) {
          finishEditing();
          return true;
        }
        if (moreOpen) {
          setMoreOpen(false);
          return true;
        }
        if (!canGoBack) return false;
        webView.current?.goBack();
        return true;
      },
    );
    return () => subscription.remove();
  }, [canGoBack, focusedInput, moreOpen]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      if (keyboardHideTimer.current) {
        clearTimeout(keyboardHideTimer.current);
        keyboardHideTimer.current = null;
      }
      setKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
      keyboardHideTimer.current = setTimeout(() => {
        finishEditing();
        keyboardHideTimer.current = null;
      }, 350);
    });
    return () => {
      if (keyboardHideTimer.current) clearTimeout(keyboardHideTimer.current);
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [finishEditing]);

  const onNavigationStateChange = useCallback((state: WebViewNavigation) => {
    setCanGoBack(state.canGoBack);
    try {
      const url = new URL(state.url);
      if (url.origin === JOINNOW_ORIGIN) setCurrentPath(url.pathname);
    } catch {
      // Keep the last known route if Android reports a transient invalid URL.
    }
  }, []);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as
        | { type: 'navigation'; path: string }
        | ({ type: 'inputFocus' } & FocusedInput);
      if (message.type === 'navigation') {
        setCurrentPath(message.path);
      } else if (message.type === 'inputFocus') {
        const nextInput = {
          id: message.id,
          value: message.value,
          placeholder: message.placeholder,
          inputType: message.inputType,
        };
        focusedInputRef.current = nextInput;
        setFocusedInput(nextInput);
        setMoreOpen(false);
      }
    } catch {
      // Ignore messages not created by the Android wrapper bridge.
    }
  }, []);

  const updateWebsiteInput = useCallback((id: string, value: string) => {
    webView.current?.injectJavaScript(`
      (() => {
        const input = document.querySelector('[data-join-now-android-input-id="${id}"]');
        if (!input) return true;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(input, ${JSON.stringify(value)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })();
    `);
  }, []);

  const navigateTo = useCallback((path: string) => {
    finishEditing();
    setMoreOpen(false);
    setCurrentPath(path);
    webView.current?.injectJavaScript(`
      window.location.assign(${JSON.stringify(`${JOINNOW_ORIGIN}${path}`)});
      true;
    `);
  }, [finishEditing]);

  const isSelected = useCallback((path: string) => {
    if (path === '/map') return currentPath === '/' || currentPath.startsWith('/map');
    return currentPath.startsWith(path);
  }, [currentPath]);

  const moreSelected = MORE_TABS.some((tab) => isSelected(tab.path));
  const hideNavigation =
    keyboardVisible ||
    !!focusedInput ||
    ['/auth', '/login', '/register'].some((path) => currentPath.startsWith(path));

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
          paddingBottom: 0,
        },
      ]}
    >
      <WebView
        ref={webView}
        source={{ uri: JOINNOW_URL }}
        style={styles.webView}
        applicationNameForUserAgent={ANDROID_USER_AGENT}
        originWhitelist={[JOINNOW_ORIGIN]}
        injectedJavaScriptBeforeContentLoaded={ANDROID_BRIDGE_SCRIPT}
        thirdPartyCookiesEnabled
        domStorageEnabled
        javaScriptEnabled
        geolocationEnabled
        mediaPlaybackRequiresUserAction={false}
        setSupportMultipleWindows={false}
        onNavigationStateChange={onNavigationStateChange}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={(request) => {
          try {
            const url = new URL(request.url);
            if (url.origin === JOINNOW_ORIGIN) return true;
            Linking.openURL(request.url);
            return false;
          } catch {
            return request.url === 'about:blank';
          }
        }}
        onError={() => setFailed(true)}
        onHttpError={(event: WebViewHttpErrorEvent) => {
          if (event.nativeEvent.statusCode >= 500) setFailed(true);
        }}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <Image
              accessibilityLabel="JoinNow loading"
              resizeMode="cover"
              source={require('../assets/images/splash.png')}
              style={styles.loadingImage}
            />
          </View>
        )}
      />
      {focusedInput ? (
        <View
          style={[
            styles.focusEditor,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              bottom: insets.bottom + 8,
            },
          ]}
        >
          <TextInput
            autoFocus
            autoCapitalize={focusedInput.inputType === 'email' ? 'none' : 'sentences'}
            autoCorrect={focusedInput.inputType !== 'email'}
            keyboardType={
              focusedInput.inputType === 'email'
                ? 'email-address'
                : focusedInput.inputType === 'tel'
                  ? 'phone-pad'
                  : focusedInput.inputType === 'number'
                    ? 'numeric'
                    : focusedInput.inputType === 'url'
                      ? 'url'
                      : 'default'
            }
            onChangeText={(value) => {
              const nextInput = { ...focusedInput, value };
              focusedInputRef.current = nextInput;
              setFocusedInput(nextInput);
              updateWebsiteInput(focusedInput.id, value);
            }}
            onSubmitEditing={finishEditing}
            placeholder={focusedInput.placeholder}
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="done"
            secureTextEntry={focusedInput.inputType === 'password'}
            selectionColor={colors.primary}
            style={[
              styles.focusInput,
              {
                backgroundColor: colors.background,
                borderColor: colors.primary,
                color: colors.foreground,
              },
            ]}
            value={focusedInput.value}
          />
          <Pressable
            accessibilityRole="button"
            onPress={finishEditing}
            style={[styles.doneButton, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.doneText, { color: colors.primaryForeground }]}>
              Done
            </Text>
          </Pressable>
        </View>
      ) : null}
      {!hideNavigation ? (
        <>
          {moreOpen ? (
            <>
              <Pressable
                accessibilityLabel="Close navigation menu"
                accessibilityRole="button"
                onPress={() => setMoreOpen(false)}
                style={[styles.moreDismiss, { bottom: 64 + insets.bottom }]}
              />
              <View
                accessibilityLabel="More navigation"
                accessibilityRole="menu"
                style={[
                  styles.moreMenu,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    bottom: 64 + insets.bottom,
                  },
                ]}
              >
                {MORE_TABS.map((tab) => (
                  <Pressable
                    accessibilityRole="menuitem"
                    key={tab.path}
                    onPress={() => navigateTo(tab.path)}
                    style={[
                      styles.moreItem,
                      isSelected(tab.path) && { backgroundColor: colors.accent },
                    ]}
                  >
                    <Feather
                      name={tab.icon}
                      size={20}
                      color={isSelected(tab.path) ? colors.primary : colors.mutedForeground}
                    />
                    <Text
                      style={[
                        styles.moreText,
                        {
                          color: isSelected(tab.path)
                            ? colors.foreground
                            : colors.mutedForeground,
                        },
                      ]}
                    >
                      {tab.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
          <View
            style={[
              styles.bottomNav,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                paddingBottom: insets.bottom,
              },
            ]}
          >
            {MAIN_TABS.map((tab) => {
              const selected = isSelected(tab.path);
              return (
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  key={tab.path}
                  onPress={() => navigateTo(tab.path)}
                  style={styles.navItem}
                >
                  <View style={[styles.navIcon, selected && { backgroundColor: colors.accent }]}>
                    <Feather
                      name={tab.icon}
                      size={21}
                      color={selected ? colors.primary : colors.mutedForeground}
                    />
                  </View>
                  <Text
                    style={[
                      styles.navLabel,
                      { color: selected ? colors.foreground : colors.mutedForeground },
                    ]}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ expanded: moreOpen, selected: moreSelected }}
              accessibilityLabel="More navigation options"
              onPress={() => setMoreOpen((open) => !open)}
              style={styles.navItem}
            >
              <View style={[styles.navIcon, moreSelected && { backgroundColor: colors.accent }]}>
                <Feather
                  name="more-horizontal"
                  size={22}
                  color={moreSelected ? colors.primary : colors.mutedForeground}
                />
              </View>
              <Text
                style={[
                  styles.navLabel,
                  { color: moreSelected ? colors.foreground : colors.mutedForeground },
                ]}
              >
                More
              </Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  webView: { flex: 1 },
  loading: {
    ...StyleSheet.absoluteFill,
  },
  loadingImage: { height: '100%', width: '100%' },
  bottomNav: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 64,
  },
  navItem: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 64,
    paddingVertical: 6,
  },
  navIcon: {
    alignItems: 'center',
    borderRadius: 18,
    height: 32,
    justifyContent: 'center',
    width: 48,
  },
  navLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    marginTop: 2,
  },
  moreMenu: {
    borderRadius: 12,
    borderWidth: 1,
    elevation: 8,
    padding: 6,
    position: 'absolute',
    right: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    width: 210,
    zIndex: 20,
  },
  moreDismiss: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 10,
  },
  moreItem: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  moreText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
  focusEditor: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    elevation: 10,
    flexDirection: 'row',
    gap: 8,
    left: 10,
    padding: 8,
    position: 'absolute',
    right: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    zIndex: 30,
  },
  focusInput: {
    borderRadius: 8,
    borderWidth: 2,
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 17,
    height: 50,
    paddingHorizontal: 14,
  },
  doneButton: {
    alignItems: 'center',
    borderRadius: 8,
    height: 50,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  doneText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
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