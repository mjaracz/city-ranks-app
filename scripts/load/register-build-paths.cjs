const { register } = require('tsconfig-paths');

register({
  baseUrl: require('node:path').resolve(process.cwd(), '.codex/load-build'),
  paths: {
    '@libs/config': ['libs/config/src/index'],
    '@libs/config/*': ['libs/config/src/*'],
    '@libs/contracts': ['libs/contracts/src/index'],
    '@libs/contracts/*': ['libs/contracts/src/*'],
    '@libs/messaging': ['libs/messaging/src/index'],
    '@libs/messaging/*': ['libs/messaging/src/*'],
    '@libs/models': ['libs/models/src/index'],
    '@libs/models/*': ['libs/models/src/*'],
  },
});
