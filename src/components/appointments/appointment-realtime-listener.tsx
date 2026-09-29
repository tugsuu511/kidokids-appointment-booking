"use client";

import { useEffect } from "react";

export type AppointmentChangeEvent = {
  appointmentId: string;
  appointmentDate: string;
  doctorId: string;
  action: "created" | "status-updated";
};

export const appointmentChangedEventName = "kidokids:appointment-changed";

export function AppointmentRealtimeListener() {
  useEffect(() => {
    const events = new EventSource("/api/events/appointments");
    const onAppointment = (message: MessageEvent<string>) => {
      try {
        const change = JSON.parse(message.data) as AppointmentChangeEvent;
        window.dispatchEvent(new CustomEvent<AppointmentChangeEvent>(appointmentChangedEventName, { detail: change }));
      } catch {
        // Ignore a malformed event and leave EventSource to reconnect if needed.
      }
    };

    events.addEventListener("appointment", onAppointment);
    return () => {
      events.removeEventListener("appointment", onAppointment);
      events.close();
    };
  }, []);

  return null;
}
