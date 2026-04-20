import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';

configureReanimatedLogger({
  strict: true,
  level: ReanimatedLogLevel.warn,
});
