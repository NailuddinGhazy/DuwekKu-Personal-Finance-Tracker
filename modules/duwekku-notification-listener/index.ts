// Reexport the native module. On web, it will be resolved to DuwekkuNotificationListener.web.ts
// and on native platforms to DuwekkuNotificationListener.ts.
export { default } from './src/DuwekkuNotificationListener';
export * from './src/duwekku-notification-listener.types';
