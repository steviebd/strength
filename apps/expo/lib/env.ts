import Constants from "expo-constants";

function getExpoHost() {
  const hostUri = Constants.expoConfig?.hostUri;

  if (!hostUri) {
    return null;
  }

  return hostUri.split(":")[0] ?? null;
}

function resolveApiUrl() {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://127.0.0.1:8787";
  const expoHost = getExpoHost();

  if (!expoHost) {
    return configuredUrl;
  }

  try {
    const url = new URL(configuredUrl);

    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      url.hostname = expoHost;
    }

    return url.toString().replace(/\/$/, "");
  } catch {
    return configuredUrl;
  }
}

export const env = {
  apiUrl: resolveApiUrl(),
};
