import { NextResponse } from "next/server";
import { requireStaffRegistryAccess, staffApiError } from "@/lib/staff-api";
import { createStaff, createStaffSchema, deleteStaff, getStaffRegistry, staffTargetSchema, updateStaff, updateStaffSchema } from "@/lib/staff-registry";

export async function GET() {
  try {
    await requireStaffRegistryAccess();
    return NextResponse.json(await getStaffRegistry(), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return staffApiError(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await requireStaffRegistryAccess();
    const parsed = createStaffSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    return NextResponse.json({ member: await createStaff(actor, parsed.data) }, { status: 201 });
  } catch (error) { return staffApiError(error); }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireStaffRegistryAccess();
    const parsed = updateStaffSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    return NextResponse.json({ member: await updateStaff(actor, parsed.data) });
  } catch (error) { return staffApiError(error); }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requireStaffRegistryAccess();
    const parsed = staffTargetSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Ажилтан сонгоно уу." }, { status: 400 });
    await deleteStaff(actor, parsed.data);
    return NextResponse.json({ success: true });
  } catch (error) { return staffApiError(error); }
}
