import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffRegistryAccess, staffApiError } from "@/lib/staff-api";
import { createStaffType, createStaffTypeSchema, deleteStaffType } from "@/lib/staff-registry";

export async function POST(request: Request) {
  try {
    const actor = await requireStaffRegistryAccess();
    const parsed = createStaffTypeSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Төрлийн нэр болон олгох эрхийг зөв оруулна уу." }, { status: 400 });
    return NextResponse.json({ type: await createStaffType(actor, parsed.data) }, { status: 201 });
  } catch (error) { return staffApiError(error); }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requireStaffRegistryAccess();
    const parsed = z.object({ id: z.string().min(1) }).safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Ажилтны төрөл сонгоно уу." }, { status: 400 });
    await deleteStaffType(actor, parsed.data.id);
    return NextResponse.json({ success: true });
  } catch (error) { return staffApiError(error); }
}
