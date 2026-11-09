import { externalRequestRefusal, listGraphSessions } from "@/src/server";

/** The graph's birth sessions for the Bot Teacher (fork, ADR 0001): src/server/graph-reads.ts. */
export async function GET(req: Request) {
	const refused = externalRequestRefusal(req);
	if (refused) return refused;
	return listGraphSessions();
}
