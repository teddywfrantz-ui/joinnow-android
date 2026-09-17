type NativeIntentEvent = {
  path: string;
  initial: boolean;
};

function isOAuthCallback(path: string) {
  try {
    const url = new URL(path, 'joinnow-mobile://app');
    return (
      (url.protocol === 'joinnow-mobile:' &&
        url.hostname === 'oauth' &&
        url.pathname === '/callback') ||
      url.pathname === '/oauth/callback'
    );
  } catch {
    return /(?:^|\/)oauth\/callback(?:[/?#]|$)/i.test(path);
  }
}

export function redirectSystemPath({ path }: NativeIntentEvent) {
  if (isOAuthCallback(path)) {
    return '/';
  }

  return path;
}