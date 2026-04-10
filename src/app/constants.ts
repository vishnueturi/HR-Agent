const ENV_CONFIG = {
  local: {
    ONBLICK_API_BASE_URL: 'https://localhost:44444',
  },
  demo: {
    ONBLICK_API_BASE_URL: 'https://demoapi.onblick.com',
  },
  prod: {
    ONBLICK_API_BASE_URL: 'https://api.onblick.com',
  },
} as const;

type EnvName = keyof typeof ENV_CONFIG;

// const ACTIVE_ENV: EnvName = 'local';
const ACTIVE_ENV: EnvName = 'demo';
// const ACTIVE_ENV: EnvName = 'prod';

export default ENV_CONFIG[ACTIVE_ENV];
