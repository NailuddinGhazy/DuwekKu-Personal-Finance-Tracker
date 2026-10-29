import { requireNativeModule } from 'expo-modules-core';
import type { PendingPaymentNotification } from './duwekku-notification-listener.types';

type DuwekkuNotificationListenerModule = {
  isNotificationAccessEnabled(): boolean;
  openNotificationAccessSettings(): void;
  getPendingNotifications(): PendingPaymentNotification[];
  acknowledgeNotification(id: string): void;
};

const DuwekkuNotificationListener =
  requireNativeModule<DuwekkuNotificationListenerModule>(
    'duwekku-notification-listener'
  );

export default DuwekkuNotificationListener;
export type { PendingPaymentNotification };