/**
 * SignalR event state — aligned with Recco.App notifications/store/signalRSlice.js.
 * Use for storing server-pushed SignalR event data (e.g. notifications, custom events).
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type SignalREventPayload = Record<string, unknown> | unknown[];

const initialState: Record<string, SignalREventPayload> = {};

const signalRSlice = createSlice({
  name: 'signalR',
  initialState,
  reducers: {
    setSignalREvent: (
      state,
      action: PayloadAction<{ eventType: string; data: SignalREventPayload }>
    ) => {
      const { eventType, data } = action.payload;
      state[eventType] = data;
    },
    clearSignalREvent: (state, action: PayloadAction<string>) => {
      const eventType = action.payload;
      delete state[eventType];
    },
  },
});

export const { setSignalREvent, clearSignalREvent } = signalRSlice.actions;

/** Selector to retrieve data for a specific event (Recco pattern). */
export const selectSignalRDataForEvent =
  (eventName: string) =>
  (state: { signalR: Record<string, SignalREventPayload> }): SignalREventPayload | undefined =>
    state.signalR[eventName];

export default signalRSlice.reducer;
