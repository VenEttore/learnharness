"use client";

import { useId } from "react";
import { ToolContentResponse, MessageResponse } from "@/components/ai-elements/message";
import { GRAPH_PAD, PlanDiagram, TEXT_CAP_SCALE } from "@/components/plan-block";
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

function PlanMap({ plan }: { plan: NonNullable<QuestionCardData["plan"]> }) {
	const markerId = useId().replace(/[^a-zA-Z0-9-]/g, "");
	const visited = new Set(plan.visited);
	const statusOf = (id: string) => (id === plan.current ? "current" : visited.has(id) ? "visited" : "upcoming");
	const currentTitle = plan.current ? plan.tree.nodes.find((n) => n.id === plan.current)?.title : undefined;
	return (
		<div data-testid="card-plan">
			<div className="mx-auto max-h-56 overflow-hidden [&_svg]:mx-auto [&_svg]:max-h-56">
				<PlanDiagram
					nodes={plan.tree.nodes}
					edges={plan.tree.edges}
					statusOf={statusOf}
					glowId={plan.current}
					markerId={markerId}
					pad={GRAPH_PAD + 8}
					textCapScale={TEXT_CAP_SCALE}
				/>
			</div>
			<p className="mt-2 text-sm">
				<span className="text-muted-foreground">Now: </span>
				<span data-testid="card-current-node">{currentTitle ?? "not started"}</span>
			</p>
		</div>
	);
}

function CardSheet({ title, tag, children }: { title: string; tag: string; children: React.ReactNode }) {
	return (
		<div
			data-testid="question-card"
			className="fixed inset-0 z-50 overflow-y-auto bg-background text-foreground"
		>
			<main className="mx-auto w-full max-w-[430px] px-4 pb-20 pt-5">
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

				{card.plan && card.phase !== "probe" && (
					<section className="mb-5">
						<Label>Plan</Label>
						<PlanMap plan={card.plan} />
					</section>
				)}

				{card.teaching && (
					<section className="mb-5" data-testid="card-teaching">
						<Label>{q ? "Before the question" : "Latest"}</Label>
						<MessageResponse className="text-[15px] leading-relaxed">{card.teaching}</MessageResponse>
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
								<MessageResponse>{q.leadIn}</MessageResponse>
							</div>
						)}
						<div data-testid="card-question-text" className="mb-3 text-base font-medium leading-snug">
							<ToolContentResponse>{q.question}</ToolContentResponse>
						</div>
						{q.details && (
							<div className="mb-3 text-sm text-muted-foreground">
								<ToolContentResponse>{q.details}</ToolContentResponse>
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
											<ToolContentResponse>{opt.label}</ToolContentResponse>
											{opt.description && (
												<ToolContentResponse className="lh-prose block text-xs text-muted-foreground">
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
		</CardSheet>
	);
}
