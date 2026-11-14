import { graphDataRevision, graphView } from "@/src/server";

/**
 * The home graph view's data endpoint (W4; vision §1 "Home page") — thin
 * transport: the server entry (src/server/graph.ts) returns nodes, edges,
 * session provenance, and per-session understanding observations.
 */

export const dynamic = "force-dynamic";

export async function GET() {
	// Fork (external-teacher 31): the stamp the view compares with
	// /api/graph/status's, read before the graph so it is never newer.
	const revision = graphDataRevision();
	return Response.json({ ...graphView(), graphDataRevision: revision });
}
