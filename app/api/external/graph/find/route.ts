import { externalRequestRefusal, findGraphCandidates } from "@/src/server";

/** The auditor's candidate search for the Bot Teacher (fork, ADR 0001): src/server/graph-reads.ts. */
export async function POST(req: Request) {
	const refused = externalRequestRefusal(req);
	if (refused) return refused;
	const body: unknown = await req.json().catch(() => null);
	return findGraphCandidates(body);
}
