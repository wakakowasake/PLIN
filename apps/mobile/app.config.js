const appJson = require('./app.json');

const baseConfig = appJson.expo || {};
const envProjectId = process.env.EXPO_PUBLIC_PLIN_EAS_PROJECT_ID || process.env.EXPO_EAS_PROJECT_ID || '';
const existingProjectId = baseConfig.extra?.eas?.projectId || '';
const isIosDevWorkaroundEnabled = process.env.EXPO_PUBLIC_PLIN_IOS_DEV_WORKAROUND === '1';
const webBasePath = normalizeWebBasePath(process.env.EXPO_PUBLIC_PLIN_WEB_BASE_PATH || '');

function normalizeWebBasePath(value) {
  const normalized = String(value || '').trim();

  if (!normalized || normalized === '/') {
    return '';
  }

  return `/${normalized.replace(/^\/+/, '').replace(/\/+$/, '')}`;
}

function getPluginName(plugin) {
  return Array.isArray(plugin) ? plugin[0] : plugin;
}

const filteredPlugins = Array.isArray(baseConfig.plugins)
  ? baseConfig.plugins.filter((plugin) => {
      if (!isIosDevWorkaroundEnabled) {
        return true;
      }

      const pluginName = getPluginName(plugin);
      return pluginName !== 'expo-apple-authentication' && pluginName !== 'expo-notifications';
    })
  : [];

const iosConfig = {
  ...(baseConfig.ios || {})
};
const webConfig = {
  ...(baseConfig.web || {})
};
const experimentsConfig = {
  ...(baseConfig.experiments || {})
};

if (isIosDevWorkaroundEnabled) {
  delete iosConfig.usesAppleSignIn;

  const nextEntitlements = {
    ...(iosConfig.entitlements || {})
  };

  delete nextEntitlements['aps-environment'];
  delete nextEntitlements['com.apple.developer.applesignin'];

  if (Object.keys(nextEntitlements).length > 0) {
    iosConfig.entitlements = nextEntitlements;
  } else {
    delete iosConfig.entitlements;
  }
}

if (webBasePath) {
  webConfig.output = webConfig.output || 'single';
  experimentsConfig.baseUrl = webBasePath;
}

module.exports = () => ({
  ...baseConfig,
  plugins: filteredPlugins,
  ios: iosConfig,
  web: webConfig,
  experiments: experimentsConfig,
  extra: {
    ...(baseConfig.extra || {}),
    eas: {
      ...(baseConfig.extra?.eas || {}),
      ...(envProjectId || existingProjectId
        ? { projectId: envProjectId || existingProjectId }
        : {})
    },
    devWorkarounds: {
      ...(baseConfig.extra?.devWorkarounds || {}),
      iosCapabilityBypass: isIosDevWorkaroundEnabled
    }
  }
});
