"use client";

import { useEffect, useId, useRef } from "react";
import { ToolContentResponse, MessageResponse } from "@/components/ai-elements/message";
import { blockLayout, GRAPH_PAD, PlanDiagram, TEXT_CAP_SCALE } from "@/components/plan-block";
import { CONFIDENCE_STOPS, type QuestionCard as QuestionCardData, type QuestionCardQuestion } from "@/src/core";

/**
 * THE QUESTION CARD (fork, external-teacher ticket 22): a read-only,
 * phone-width (390 px) view of the open question for a screenshot. The
 * Bot Teacher sends the image in Grok Bot chat; the learner replies with
 * option numbers. No inputs, no buttons, no requests: the lesson page's
 * own renderers (ToolContentResponse for question text and math,
 * PlanDiagram for the map) draw the content so it reads the same.
 *
 * It covers the app shell (sidebar) with a fixed full-viewport sheet so
 * the screenshot holds only the card.
 */

// Streamdown's link safety draws every link as a <button> (it opens a
// confirm dialog on click). The card hides buttons, which hid the link
// text with them; plain <a> links keep the words in the screenshot.
const PLAIN_LINKS = { enabled: false } as const;

const PHASE_LABEL = { probe: "Probe", plan: "Plan", teach: "Teach" } as const;

function Label({ children }: { children: React.ReactNode }) {
	return <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{children}</div>;
}

function kindLine(q: QuestionCardQuestion): string {
	const parts: string[] = [q.kindLabel];
	if (q.role === "predict") parts.push("prediction");
	else if (q.role === "check") parts.push("check");
	if (q.mode === "multi-select") parts.push("select all that apply");
	return parts.join(" · ");
}

function replyHint(q: QuestionCardQuestion): string {
	if (q.mode === "text") return "Type your answer in your own words.";
	const pick = q.mode === "multi-select" ? "the numbers of every option you pick" : "the number of your pick";
	return `Reply with ${pick}${q.quiz ? " and a confidence" : ""}.`;
}

// The map's width on a 390 px phone (the sheet pads 16 px each side), the
// node title size in svg units (text-xs), and the smallest title worth
// drawing (plan map and charts alike). Below that the card shows the
// current node's title alone, or a note for a chart.
const CARD_MAP_WIDTH = 358;
const NODE_TEXT_UNITS = 11;
const MIN_NODE_TEXT_PX = 10;
const MAP_PAD = GRAPH_PAD + 8;

/** The plan map, when its node titles stay readable at 390 px. Height is
 *  free (the screenshot crops to the page), so only width scales it. */
function PlanMap({ plan }: { plan: NonNullable<QuestionCardData["plan"]> }) {
	const markerId = useId().replace(/[^a-zA-Z0-9-]/g, "");
	const visited = new Set(plan.visited);
	const statusOf = (id: string) => (id === plan.current ? "current" : visited.has(id) ? "visited" : "upcoming");
	const currentTitle = plan.current ? plan.tree.nodes.find((n) => n.id === plan.current)?.title : undefined;
	const layout = blockLayout(plan.tree.nodes, plan.tree.edges);
	const scale = Math.min(CARD_MAP_WIDTH / (Math.max(layout.width, 1) + 2 * MAP_PAD), TEXT_CAP_SCALE);
	const legible = scale * NODE_TEXT_UNITS >= MIN_NODE_TEXT_PX;
	return (
		<div data-testid="card-plan">
			{legible && (
				<PlanDiagram
					nodes={plan.tree.nodes}
					edges={plan.tree.edges}
					statusOf={statusOf}
					glowId={plan.current}
					markerId={markerId}
					pad={MAP_PAD}
					textCapScale={TEXT_CAP_SCALE}
				/>
			)}
			<p className="mt-2 text-sm">
				<span className="text-muted-foreground">Now: </span>
				<span data-testid="card-current-node">{currentTitle ?? "not started"}</span>
			</p>
		</div>
	);
}

// Zoom does not scale text linearly, so the fit steps toward the target,
// undershooting each step so it cannot stall a few pixels short.
const FIT_STEPS = 10;
const FIT_UNDERSHOOT = 0.97;
// Mermaid draws labels at 16 svg units unless its styles say otherwise.
const CHART_TEXT_UNITS = 16;
const TOO_WIDE = "data-card-too-wide";
// The note an unreadable chart shows instead (the attribute is set by the fit).
const TOO_WIDE_CSS = `[${TOO_WIDE}] > * { display: none !important; }
[${TOO_WIDE}]::after { content: "This diagram does not fit a phone screenshot. Open the lesson page to see it."; display: block; padding: 12px; border: 1px dashed var(--border); border-radius: 8px; color: var(--muted-foreground); font-size: 14px; }`;

/** A screenshot cannot scroll sideways. The page's renderers put wide
 *  display math, tables and code blocks in horizontal scrollers; shrink
 *  their content to the column instead (CSS zoom). Runs again once fonts
 *  load (KaTeX widths change) and whenever the card's DOM changes (code
 *  highlighting replaces its nodes after mount), once per frame. */
function useFitWideContent(ref: React.RefObject<HTMLDivElement | null>) {
	useEffect(() => {
		let frame = 0;
		const schedule = () => {
			if (frame) return;
			frame = requestAnimationFrame(() => {
				frame = 0;
				fit();
			});
		};
		// Each pass starts from the natural layout (its own zoom and wrap
		// cleared), so repeated passes give the same result.
		const fit = () => {
			const root = ref.current;
			if (!root) return;
			const scrollers: HTMLElement[] = [];
			for (const el of root.querySelectorAll<HTMLElement>("*")) {
				if (el.classList.contains("katex-mathml")) continue; // visually hidden
				const overflow = getComputedStyle(el).overflowX;
				if (overflow === "auto" || overflow === "scroll") scrollers.push(el);
			}
			const maths = [...root.querySelectorAll<HTMLElement>(".katex")].filter((m) => !m.closest(".katex-display"));
			for (const el of scrollers) {
				for (const child of el.children) (child as HTMLElement).style.zoom = "";
				const pre = el.querySelector("pre");
				if (pre) pre.style.whiteSpace = "";
			}
			for (const math of maths) math.style.zoom = "";
			const charts = [...root.querySelectorAll<HTMLElement>('[data-streamdown="mermaid"]')];
			for (const chart of charts) chart.removeAttribute(TOO_WIDE);
			for (const el of scrollers) {
				if (el.scrollWidth <= el.clientWidth + 1) continue;
				const factor = el.clientWidth / el.scrollWidth;
				// Text stops shrinking near 3 px, so a very long code line
				// cannot zoom to fit: past half size, wrap that block instead
				// (complete, if its continuation lines start under the gutter).
				const pre = el.querySelector("pre");
				if (pre && factor < 0.5) {
					pre.style.whiteSpace = "pre-wrap";
					continue;
				}
				// Text shrinks less than the zoom does (a w-full table also
				// re-flows), so step until it fits, from this pass's clean
				// start, undershooting each step so the steps cannot stall a
				// few pixels short.
				let zoom = factor;
				for (let step = 0; step < FIT_STEPS; step++) {
					for (const child of el.children) (child as HTMLElement).style.zoom = String(zoom);
					if (el.scrollWidth <= el.clientWidth + 1) break;
					zoom *= (el.clientWidth / el.scrollWidth) * FIT_UNDERSHOOT;
				}
			}
			// A chart is an svg scaled to the column: it cannot wrap or zoom
			// back up. Like the plan map, hide one whose labels would read
			// under MIN_NODE_TEXT_PX; the sheet's style shows a note instead.
			for (const chart of charts) {
				const svg = chart.querySelector("svg");
				const viewWidth = svg?.viewBox.baseVal?.width;
				if (!svg || !viewWidth) continue;
				// Judge by the smallest label: a title or quadrant name is drawn
				// larger than the tick and point labels next to it.
				let units = Infinity;
				for (const label of svg.querySelectorAll(".nodeLabel, text")) {
					if (!label.textContent?.trim()) continue;
					units = Math.min(units, parseFloat(getComputedStyle(label).fontSize) || CHART_TEXT_UNITS);
				}
				if (units === Infinity) units = CHART_TEXT_UNITS;
				if ((svg.getBoundingClientRect().width / viewWidth) * units < MIN_NODE_TEXT_PX) chart.setAttribute(TOO_WIDE, "");
			}
			// Inline math is no scroller: KaTeX keeps a formula on one line
			// (white-space: nowrap), so one with no break point can run past
			// its box. Shrink it to its nearest block's content width.
			for (const math of maths) {
				let block = math.parentElement;
				while (block && block !== root && getComputedStyle(block).display.startsWith("inline")) block = block.parentElement;
				if (!block) continue;
				const style = getComputedStyle(block);
				const room = block.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
				if (room <= 0) continue;
				// Zoom is not linear here either: step with the same undershoot.
				let zoom = 1;
				for (let step = 0; step < FIT_STEPS; step++) {
					const width = math.getBoundingClientRect().width;
					if (width <= room + 1) break;
					zoom *= (room / width) * FIT_UNDERSHOOT;
					math.style.zoom = String(zoom);
				}
			}
		};
		fit();
		void document.fonts?.ready.then(schedule);
		// Only content changes re-fit: zoom writes are style attributes,
		// which this observer ignores, so a fit never re-triggers itself.
		const observer = typeof MutationObserver === "undefined" ? null : new MutationObserver(schedule);
		if (ref.current) observer?.observe(ref.current, { childList: true, subtree: true, characterData: true });
		return () => {
			observer?.disconnect();
			if (frame) cancelAnimationFrame(frame);
		};
	}, [ref]);
}

/** The card renders inside the root layout's app shell (sidebar, banners).
 *  Hide every sibling on the path from the card up to <body>, so the card
 *  is the whole page: a full-page screenshot then holds the whole card and
 *  nothing else, and no shell control sits on the page. Restored on
 *  unmount. Keeps the upstream root layout untouched. */
function useCardOnlyPage(ref: React.RefObject<HTMLDivElement | null>) {
	useEffect(() => {
		const hidden: Array<[HTMLElement, string]> = [];
		let node: HTMLElement | null = ref.current;
		while (node && node !== document.body) {
			const parent: HTMLElement | null = node.parentElement;
			if (!parent) break;
			for (const sibling of parent.children) {
				if (sibling === node || !(sibling instanceof HTMLElement)) continue;
				hidden.push([sibling, sibling.style.display]);
				sibling.style.display = "none";
			}
			node = parent;
		}
		return () => {
			for (const [el, display] of hidden) el.style.display = display;
		};
	}, [ref]);
}

function CardSheet({ title, tag, children }: { title: string; tag: string; children: React.ReactNode }) {
	const ref = useRef<HTMLDivElement>(null);
	useCardOnlyPage(ref);
	useFitWideContent(ref);
	return (
		// In the page flow (not a fixed layer) so the document is as tall as
		// the card and a full-page screenshot captures all of it. Long words
		// break instead of widening the page; the shared renderers' copy
		// buttons (code, tables) are hidden: the card has no controls. Code
		// blocks do not wrap (a wrapped line would run into the line-number
		// gutter); useFitWideContent shrinks them to the column instead.
		<div
			ref={ref}
			data-testid="question-card"
			className="min-h-dvh w-full bg-background text-foreground [overflow-wrap:anywhere] [&_button]:hidden"
		>
			<style>{TOO_WIDE_CSS}</style>
			<main className="mx-auto w-full max-w-[430px] px-4 pb-10 pt-5">
				<header className="mb-5 border-b border-border pb-3">
					<div className="flex items-baseline justify-between gap-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
						<span>LearnHarness</span>
						<span data-testid="card-phase">{tag}</span>
					</div>
					<h1 className="mt-1.5 font-title text-lg leading-snug">{title}</h1>
				</header>
				{children}
			</main>
		</div>
	);
}

/** Practice sessions have no phases or question dock; their problem dock
 *  is not on the card, so the card says so instead of claiming a phase. */
export function PracticeCardNote({ title }: { title: string }) {
	return (
		<CardSheet title={title} tag="Practice">
			<section
				data-testid="card-practice-note"
				className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground"
			>
				The question card covers lessons only. Open this practice session on its page.
			</section>
		</CardSheet>
	);
}

export function QuestionCard({ title, card }: { title: string; card: QuestionCardData }) {
	const q = card.question;
	return (
		<CardSheet title={title} tag={`Phase · ${PHASE_LABEL[card.phase]}`}>
			{card.teaching && (
				<section className="mb-5" data-testid="card-teaching">
					<Label>{q ? "Before the question" : "Latest"}</Label>
					<MessageResponse linkSafety={PLAIN_LINKS} className="text-[15px] leading-relaxed">{card.teaching}</MessageResponse>
				</section>
			)}

			{!q && (
				<section
					data-testid="card-no-question"
					className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground"
				>
					{card.malformed ? "The open question arrived malformed." : "No open question"}
				</section>
			)}

			{q && (
				<section data-testid="card-question" className="rounded-xl border border-border bg-card px-4 pb-4 pt-3.5">
					<div data-testid="card-kind" className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
						{kindLine(q)}
					</div>
					{q.leadIn && (
						<div data-testid="card-lead-in" className="mb-3 text-[15px] leading-relaxed">
							<MessageResponse linkSafety={PLAIN_LINKS}>{q.leadIn}</MessageResponse>
						</div>
					)}
					<div data-testid="card-question-text" className="mb-3 text-base font-medium leading-snug">
						<ToolContentResponse linkSafety={PLAIN_LINKS}>{q.question}</ToolContentResponse>
					</div>
					{q.details && (
						<div className="mb-3 text-sm text-muted-foreground">
							<ToolContentResponse linkSafety={PLAIN_LINKS}>{q.details}</ToolContentResponse>
						</div>
					)}

					{q.options.length > 0 && (
						<ol className="flex flex-col gap-2" data-testid="card-options">
							{q.options.map((opt) => (
								<li
									key={opt.number}
									data-testid="card-option"
									data-number={opt.number}
									className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5"
								>
									<span className="mt-px w-6 shrink-0 text-center text-lg font-semibold leading-6 tabular-nums">
										{opt.number}
									</span>
									<span className="min-w-0 flex-1 text-[15px] leading-6">
										<ToolContentResponse linkSafety={PLAIN_LINKS}>{opt.label}</ToolContentResponse>
										{opt.description && (
											<ToolContentResponse linkSafety={PLAIN_LINKS} className="lh-prose block text-xs text-muted-foreground">
												{opt.description}
											</ToolContentResponse>
										)}
									</span>
								</li>
							))}
							{q.quiz && (
								<li className="flex items-start gap-3 rounded-lg border border-dashed border-border px-3 py-2.5 text-muted-foreground">
									<span className="w-6 shrink-0 text-center leading-6">·</span>
									<span className="text-[15px] leading-6">I don&apos;t know</span>
								</li>
							)}
							{q.other && (
								<li className="flex items-start gap-3 rounded-lg border border-dashed border-border px-3 py-2.5 text-muted-foreground">
									<span className="w-6 shrink-0 text-center leading-6">·</span>
									<span className="text-[15px] leading-6">Other: your own answer</span>
								</li>
							)}
						</ol>
					)}

					{q.mode === "text" && (
						<div
							data-testid="card-typed-answer"
							className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground"
						>
							Typed answer expected
						</div>
					)}

					<p data-testid="card-reply-hint" className="mt-3 text-xs leading-relaxed text-muted-foreground">
						{replyHint(q)}
						{q.quiz && <> Confidence: {CONFIDENCE_STOPS.join(" · ")}.</>}
					</p>
				</section>
			)}
			{card.plan && card.phase !== "probe" && (
				<section className="mt-6">
					<Label>Plan</Label>
					<PlanMap plan={card.plan} />
				</section>
			)}
		</CardSheet>
	);
}
