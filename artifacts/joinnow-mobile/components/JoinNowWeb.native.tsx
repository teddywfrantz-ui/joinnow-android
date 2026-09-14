import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Image,
  Keyboard,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import WebView from 'react-native-webview/lib/WebView.android';
import type {
  WebViewHttpErrorEvent,
  WebViewMessageEvent,
  WebViewNavigation,
} from 'react-native-webview/lib/WebViewTypes';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setAppColorScheme, useColors } from '@/hooks/useColors';

const configuredHost =
  process.env.EXPO_PUBLIC_DOMAIN || 'join-up--teddywfrantz.replit.app';
const JOINNOW_URL = /^https?:\/\//.test(configuredHost)
  ? configuredHost
  : `https://${configuredHost}`;
const JOINNOW_ORIGIN = new URL(JOINNOW_URL).origin;
const ANDROID_USER_AGENT = 'JoinNowAndroid/1.0';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const ANDROID_BRIDGE_SCRIPT = `
  (() => {
    const install = () => {
      if (window.__joinNowAndroidBridgeInstalled || !document.documentElement || !document.body) return false;
      const send = (payload) => {
        window.ReactNativeWebView?.postMessage(JSON.stringify(payload));
      };
      const sendPath = () => send({ type: 'navigation', path: window.location.pathname });
      const sendTheme = () => send({
        type: 'theme',
        scheme: document.documentElement.classList.contains('dark') ? 'dark' : 'light'
      });
      const hideHamburger = () => {
        document.querySelectorAll('svg.lucide-menu').forEach((icon) => {
          const button = icon.closest('button');
          if (button) button.setAttribute('data-join-now-android-hamburger', 'true');
        });
      };
      const hideEmbeddedBottomNavigation = () => {
        document.querySelectorAll('nav').forEach((nav) => {
          const text = (nav.textContent || '').replace(/\\s+/g, ' ').trim();
          const isJoinNowBottomNavigation =
            nav.hasAttribute('data-join-now-mobile-bottom-nav') ||
            (
              /\\bMap\\b/.test(text) &&
              /\\bActive\\b/.test(text) &&
              /\\bMessages\\b/.test(text) &&
              /\\bGroup\\b/.test(text) &&
              /\\bMore\\b/.test(text) &&
              (
                window.getComputedStyle(nav).position === 'fixed' ||
                nav.classList.contains('bottom-0')
              )
            );
          if (!isJoinNowBottomNavigation) return;
          nav.setAttribute('data-join-now-android-embedded-bottom-nav', 'true');
          nav.style.setProperty('display', 'none', 'important');
        });
      };
      const hideOptionalMapControls = () => {
        const controlSelectors = [
          '.gm-bundled-control',
          '.gm-bundled-control-on-bottom',
          '.gm-fullscreen-control',
          '.gm-style-mtc',
          '.gm-style-mtc-bbw',
          '.gm-svpc'
        ];
        document.querySelectorAll(controlSelectors.join(',')).forEach((control) => {
          control.setAttribute('data-join-now-android-map-control', 'true');
        });
        document.querySelectorAll('button[aria-label], button[title]').forEach((button) => {
          const label = [
            button.getAttribute('aria-label') || '',
            button.getAttribute('title') || ''
          ].join(' ');
          if (/zoom|fullscreen|full screen|street view|map type|satellite|terrain|compass|rotate|tilt|camera control|keyboard shortcuts/i.test(label)) {
            button.setAttribute('data-join-now-android-map-control', 'true');
          }
        });
      };
      const expandParticipantViewport = () => {
        const activeTab = Array.from(document.querySelectorAll('[role="tab"][data-state="active"]'))
          .find((tab) => /participants/i.test(tab.textContent || ''));
        const detailsHeader = document.querySelector('#meetup-header');
        if (!activeTab || !detailsHeader || detailsHeader.getAttribute('data-join-now-android-collapsed') === 'true') {
          return;
        }
        detailsHeader.setAttribute('data-join-now-android-collapsed', 'true');
        document.dispatchEvent(new CustomEvent('meetup-details-collapsed', {
          bubbles: true,
          detail: { collapsed: true }
        }));
      };
      const expandMeetDetailsParticipantsDialog = () => {
        document.querySelectorAll('[role="dialog"]').forEach((dialog) => {
          if (!/Meet Details/i.test(dialog.textContent || '')) return;
          const participantList = dialog.querySelector('[class*="h-[300px]"]');
          if (participantList) {
            dialog.setAttribute('data-join-now-android-meet-details-dialog', 'true');
            participantList.setAttribute('data-join-now-android-participants-list', 'true');
          }
        });
      };
      const lockCompleteProfileButtonColor = () => {
        document.querySelectorAll('button, a').forEach((element) => {
          if (!/complete profile/i.test(element.textContent || '')) return;
          element.setAttribute('data-join-now-android-complete-profile', 'true');
        });
      };
      const sizeCreateMeetButton = () => {
        document.querySelectorAll('[role="dialog"]').forEach((dialog) => {
          if (!/Create a New Meet/i.test(dialog.textContent || '')) return;
          const submitButton = dialog.querySelector('button[type="submit"]');
          if (!submitButton) return;
          submitButton.setAttribute('data-join-now-android-create-meet-button', 'true');
          submitButton.parentElement?.setAttribute(
            'data-join-now-android-create-meet-footer',
            'true',
          );
          dialog.setAttribute('data-join-now-android-create-meet-dialog', 'true');
        });
      };
      const applyAndroidOnlyHiding = () => {
        hideHamburger();
        hideEmbeddedBottomNavigation();
        hideOptionalMapControls();
        expandParticipantViewport();
        expandMeetDetailsParticipantsDialog();
        lockCompleteProfileButtonColor();
        sizeCreateMeetButton();
      };

      ['pushState', 'replaceState'].forEach((method) => {
        const original = window.history[method];
        window.history[method] = function (...args) {
          const result = original.apply(this, args);
          setTimeout(() => {
            sendPath();
            sendTheme();
          }, 0);
          return result;
        };
      });
      window.addEventListener('popstate', () => {
        sendPath();
        sendTheme();
      });
      window.addEventListener('hashchange', () => {
        sendPath();
        sendTheme();
      });
      window.addEventListener('pageshow', sendTheme);
      window.addEventListener('focus', sendTheme);
      document.addEventListener('visibilitychange', sendTheme);
      document.addEventListener('click', () => setTimeout(sendTheme, 0), true);
      new MutationObserver(sendTheme).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class']
      });
      new MutationObserver(applyAndroidOnlyHiding).observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-label', 'title', 'class', 'data-state']
      });

      let activeInput = null;
      let activeInputToolbar = null;
      let activeInputCleanupTimer = null;

      const resizeFocusedInput = (element) => {
        if (!(element instanceof HTMLTextAreaElement)) return;
        element.style.height = 'auto';
        element.style.height = Math.min(180, Math.max(50, element.scrollHeight)) + 'px';
      };

      document.addEventListener('focusin', (event) => {
        const element = event.target;
        if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLTextAreaElement)) return;
        const supportedTypes = ['text', 'search', 'email', 'tel', 'url', 'number', 'password'];
        if (element instanceof HTMLInputElement && !supportedTypes.includes(element.type)) return;

        if (activeInputCleanupTimer) clearTimeout(activeInputCleanupTimer);
        if (activeInput && activeInput !== element) {
          activeInput.removeAttribute('data-join-now-android-focused-input');
          activeInput.parentElement?.removeAttribute(
            'data-join-now-android-focused-input-wrapper',
          );
          activeInputToolbar?.removeAttribute(
            'data-join-now-android-focused-input-toolbar',
          );
          activeInput.style.removeProperty('height');
          activeInputToolbar = null;
        }
        activeInput = element;
        element.setAttribute('data-join-now-android-focused-input', 'true');
        const isMeetupSearch =
          element instanceof HTMLInputElement &&
          element.placeholder === 'Search Meets...';
        if (isMeetupSearch) {
          const inputWrapper = element.parentElement;
          inputWrapper?.setAttribute(
            'data-join-now-android-focused-input-wrapper',
            'true',
          );
          activeInputToolbar =
            inputWrapper?.parentElement?.parentElement?.parentElement || null;
          activeInputToolbar?.setAttribute(
            'data-join-now-android-focused-input-toolbar',
            'true',
          );
        }
        resizeFocusedInput(element);
        setTimeout(() => {
          if (document.activeElement === element) {
            element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
          }
        }, 250);
      }, true);
      document.addEventListener('input', (event) => {
        if (event.target === activeInput) resizeFocusedInput(activeInput);
      }, true);
      document.addEventListener('focusout', (event) => {
        if (event.target !== activeInput) return;
        activeInputCleanupTimer = setTimeout(() => {
          if (document.activeElement === activeInput) return;
          activeInput?.removeAttribute('data-join-now-android-focused-input');
          activeInput?.parentElement?.removeAttribute(
            'data-join-now-android-focused-input-wrapper',
          );
          activeInputToolbar?.removeAttribute(
            'data-join-now-android-focused-input-toolbar',
          );
          activeInput?.style.removeProperty('height');
          activeInput = null;
          activeInputToolbar = null;
        }, 100);
      }, true);

      const style = document.createElement('style');
      style.textContent = [
        'button[data-join-now-android-hamburger="true"],',
        'button[data-sidebar="trigger"],',
        '[data-join-now-mobile-bottom-nav],',
        '[data-join-now-android-embedded-bottom-nav="true"]{display:none!important}',
        '[data-join-now-android-map-control="true"],',
        '.gm-bundled-control,',
        '.gm-bundled-control-on-bottom,',
        '.gm-fullscreen-control,',
        '.gm-style-mtc,',
        '.gm-style-mtc-bbw,',
        '.gm-svpc,',
        '.gm-style-cc button,',
        'button[aria-label="Keyboard shortcuts"],',
        'button[title="Keyboard shortcuts"]{display:none!important}',
        'button[aria-label="Toggle list view"] svg{',
        'color:#2563eb!important;',
        'stroke:#2563eb!important;',
        '}',
        '[data-join-now-user-profile]{',
        'width:calc(100vw - 16px)!important;',
        'max-width:none!important;',
        'max-height:calc(95dvh - 8px)!important;',
        'top:5dvh!important;',
        'transform:translateX(-50%)!important;',
        'padding-bottom:32px!important;',
        '}',
        '[data-join-now-android-meet-details-dialog="true"]{',
        'top:8px!important;',
        'bottom:8px!important;',
        'height:auto!important;',
        'max-height:none!important;',
        'transform:translateX(-50%)!important;',
        'display:flex!important;',
        'flex-direction:column!important;',
        'overflow:hidden!important;',
        '}',
        '[data-join-now-android-participants-list="true"]{',
        'height:auto!important;',
        'max-height:none!important;',
        'min-height:0!important;',
        'flex:1 1 auto!important;',
        '}',
        '[data-join-now-android-complete-profile="true"]{',
        'color:#92400e!important;',
        '-webkit-text-fill-color:#92400e!important;',
        '}',
        '[data-join-now-android-complete-profile="true"] svg,',
        '[data-join-now-android-complete-profile="true"] span{',
        'color:#92400e!important;',
        '}',
        '[data-join-now-android-complete-profile="true"] svg{',
        'fill:none!important;',
        'stroke:#92400e!important;',
        '}',
        '[data-join-now-android-create-meet-footer="true"]{',
        'display:flex!important;',
        'align-items:center!important;',
        'justify-content:center!important;',
        'flex:0 0 auto!important;',
        '}',
        '[data-join-now-android-create-meet-button="true"]{',
        'width:auto!important;',
        'min-width:140px!important;',
        '}',
        'textarea[data-join-now-android-focused-input="true"]{',
        'min-height:50px!important;',
        'max-height:180px!important;',
        'overflow-y:auto!important;',
        '}',
        '[data-join-now-android-focused-input-toolbar="true"]{',
        'position:relative!important;',
        '}',
        '[data-join-now-android-focused-input-wrapper="true"]{',
        'position:absolute!important;',
        'top:0!important;',
        'left:0!important;',
        'right:0!important;',
        'width:auto!important;',
        'z-index:2147483646!important;',
        'background:hsl(var(--background))!important;',
        'box-shadow:0 3px 12px rgba(0,0,0,.28)!important;',
        '}'
      ].join('');
      document.documentElement.appendChild(style);
      applyAndroidOnlyHiding();
      setTimeout(expandParticipantViewport, 250);
      setTimeout(expandParticipantViewport, 750);
      window.__joinNowAndroidBridgeInstalled = true;
      window.__joinNowAndroidSendTheme = sendTheme;
      sendPath();
      sendTheme();
      return true;
    };
    if (!install()) {
      document.addEventListener('DOMContentLoaded', install, { once: true });
      setTimeout(install, 0);
    } else {
      window.__joinNowAndroidSendTheme?.();
    }
    return true;
  })();
`;

const MAIN_TABS = [
  { label: 'Map', path: '/map', icon: 'map' },
  { label: 'Active', path: '/active-meet', icon: 'star' },
  { label: 'Messages', path: '/messages', icon: 'message-circle' },
  { label: 'Group', path: '/groups', icon: 'users' },
] as const;

function pushTokenSyncScript(token: string) {
  return `
    (() => {
      const sync = () => fetch('/api/push-tokens', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: ${JSON.stringify(JSON.stringify({ token, platform: 'android' }))}
      }).catch(() => {});
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', sync, { once: true });
      } else {
        sync();
      }
      return true;
    })();
  `;
}

const MORE_TABS = [
  { label: 'Friends', path: '/friends', icon: 'users' },
  { label: 'Profile', path: '/profile', icon: 'user' },
  { label: 'Leaderboards', path: '/leaderboards', icon: 'award' },
  { label: 'Settings', path: '/settings', icon: 'settings' },
] as const;

export function JoinNowWeb() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const webView = useRef<any>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [currentPath, setCurrentPath] = useState('/');
  const [failed, setFailed] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [pushToken, setPushToken] = useState<string | null>(null);

  const syncPushToken = useCallback(() => {
    if (!pushToken) return;
    webView.current?.injectJavaScript(pushTokenSyncScript(pushToken));
  }, [pushToken]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    let cancelled = false;
    const registerForPushNotifications = async () => {
      try {
        await Notifications.setNotificationChannelAsync('joinnow', {
          name: 'JoinNow',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          sound: 'default',
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        });
        const current = await Notifications.getPermissionsAsync();
        const permission = current.granted
          ? current
          : await Notifications.requestPermissionsAsync();
        if (!permission.granted) return;

        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId ??
          Constants.easConfig?.projectId;
        const tokenResponse = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined,
        );
        if (!cancelled) setPushToken(tokenResponse.data);
      } catch (error) {
        console.warn('JoinNow push registration failed', error);
      }
    };

    void registerForPushNotifications();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pushToken) return;
    const timeout = setTimeout(syncPushToken, 300);
    return () => clearTimeout(timeout);
  }, [pushToken, syncPushToken]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (keyboardVisible) {
          webView.current?.injectJavaScript('document.activeElement?.blur(); true;');
          Keyboard.dismiss();
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
  }, [canGoBack, keyboardVisible, moreOpen]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const onNavigationStateChange = useCallback((state: WebViewNavigation) => {
    setCanGoBack(state.canGoBack);
    try {
      const url = new URL(state.url);
      if (url.origin === JOINNOW_ORIGIN) setCurrentPath(url.pathname);
    } catch {
      // Keep the last known route if Android reports a transient invalid URL.
    }
    if (pushToken) setTimeout(syncPushToken, 250);
  }, [pushToken, syncPushToken]);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as
        | { type: 'navigation'; path: string }
        | { type: 'theme'; scheme: 'light' | 'dark' };
      if (message.type === 'navigation') {
        setCurrentPath(message.path);
      } else if (message.type === 'theme') {
        setAppColorScheme(message.scheme);
      }
    } catch {
      // Ignore messages not created by the Android wrapper bridge.
    }
  }, []);

  const navigateTo = useCallback((path: string) => {
    webView.current?.injectJavaScript('document.activeElement?.blur(); true;');
    Keyboard.dismiss();
    setMoreOpen(false);
    setCurrentPath(path);
    webView.current?.injectJavaScript(`
      window.history.pushState({}, '', ${JSON.stringify(path)});
      window.dispatchEvent(new PopStateEvent('popstate'));
      true;
    `);
  }, []);

  useEffect(() => {
    const openNotificationLink = (response: Notifications.NotificationResponse) => {
      const link = response.notification.request.content.data?.link;
      if (typeof link === 'string' && link.startsWith('/')) {
        navigateTo(link);
      }
    };
    const subscription =
      Notifications.addNotificationResponseReceivedListener(openNotificationLink);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openNotificationLink(response);
    });
    return () => subscription.remove();
  }, [navigateTo]);

  const isSelected = useCallback((path: string) => {
    if (path === '/map') return currentPath === '/' || currentPath.startsWith('/map');
    return currentPath.startsWith(path);
  }, [currentPath]);

  const moreSelected = MORE_TABS.some((tab) => isSelected(tab.path));
  const hideNavigation =
    keyboardVisible ||
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
         onLoadEnd={() => {
           webView.current?.injectJavaScript(ANDROID_BRIDGE_SCRIPT);
           syncPushToken();
         }}
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