import { PatientsClient } from "@/components/patients/patients-client";
import { requireRole } from "@/lib/auth";
import { listPatientsForUser } from "@/lib/patient-queries";

export default async function PatientsPage() {
  const user = await requireRole("ADMIN");
  const result = await listPatientsForUser(user);
  return <PatientsClient initialResult={result ?? { patients: [], page: 1, pageSize: 20, total: 0, totalPages: 1 }} />;
}
