import { externalRequestRefusal, listGraphPropositions } from "@/src/server";

/** One session's propositions for the Bot Teacher (fork, ADR 0001): src/server/graph-reads.ts. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
	const refused = externalRequestRefusal(req);
	if (refused) return refused;
	const { id } = await params;
	return listGraphPropositions(id);
}
