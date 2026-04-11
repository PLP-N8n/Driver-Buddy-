import React from 'react';
import { DashboardScreen, type DashboardManualEntryRequest, type ManualShiftPayload } from './dashboard/DashboardScreen';

export type { DashboardManualEntryRequest, ManualShiftPayload };

export const Dashboard: React.FC<React.ComponentProps<typeof DashboardScreen>> = (props) => <DashboardScreen {...props} />;
