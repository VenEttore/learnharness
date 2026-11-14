import { externalRequestRefusal, submitFindings } from "@/src/server";

/** The Bot Teacher's findings into the knowledge graph (fork, ADR 0001):
 *  src/server/graph-findings.ts. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
	const refused = externalRequestRefusal(req);
	if (refused) return refused;
	const { id } = await params;
	const body: unknown = await req.json().catch(() => null);
	return submitFindings(id, body);
}
