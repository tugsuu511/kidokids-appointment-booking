import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { canAccessAppointmentData } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { subscribeToAppointmentChanges } from "@/lib/appointment-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canAccessAppointmentData(user.role)) return NextResponse.json({ error: "Мэдээлэлд хандах эрхгүй байна." }, { status: 403 });

  let unsubscribe = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  const cleanup = () => {
    closed = true;
    unsubscribe();
    if (heartbeat) clearInterval(heartbeat);
  };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, payload: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
      };

      // A manager can become a nurse while this connection is open. Recheck
      // the account before delivering data, not only when opening the stream.
      const sendAuthorized = async (payload?: unknown) => {
        if (closed) return;
        try {
          const current = await prisma.user.findUnique({
            where: { id: user.id },
            select: { role: true, isActive: true, sessionVersion: true },
          });
          if (closed) return;
          if (!current?.isActive || current.sessionVersion !== (user.sessionVersion ?? 0) || !canAccessAppointmentData(current.role)) {
            cleanup();
            controller.close();
            return;
          }
          if (payload !== undefined) send("appointment", payload);
          else controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          if (!closed) { cleanup(); controller.close(); }
        }
      };

      unsubscribe = subscribeToAppointmentChanges((change) => { void sendAuthorized(change); });
      send("ready", { connectedAt: new Date().toISOString() });
      heartbeat = setInterval(() => { void sendAuthorized(); }, 25_000);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
