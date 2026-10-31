// Application-wide external links and endpoints

export const APP_LINKS = {
  GITHUB_REPO: 'https://github.com/MinakowDev/freakcloud',
  EXTENSION_REPO: 'https://github.com/MinakowDev/freakcloud-extension',
  SOUNDCLOUD_HOME: 'https://soundcloud.com',
} as const;

export const LOOPBACK_CONFIG = {
  PORT: 49281,
  STATUS_URL: 'http://127.0.0.1:49281/status',
  LOGIN_URL: 'http://127.0.0.1:49281/login',
} as const;
