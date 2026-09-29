import "server-only";

export type AppointmentChange = {
  appointmentId: string;
  appointmentDate: string;
  doctorId: string;
  action: "created" | "status-updated" | "payment-updated";
};

type Subscriber = (change: AppointmentChange) => void;

const globalForAppointmentEvents = globalThis as typeof globalThis & {
  appointmentEventSubscribers?: Set<Subscriber>;
};

function subscribers() {
  return (globalForAppointmentEvents.appointmentEventSubscribers ??= new Set<Subscriber>());
}

// This process-local fan-out is intentional: production is deployed as one
// long-lived Node.js server. Use a shared pub/sub broker before adding replicas.
export function publishAppointmentChange(change: AppointmentChange) {
  for (const subscriber of subscribers()) subscriber(change);
}

export function subscribeToAppointmentChanges(subscriber: Subscriber) {
  subscribers().add(subscriber);
  return () => subscribers().delete(subscriber);
}
