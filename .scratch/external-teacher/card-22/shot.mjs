// Ticket 22: capture /chat/<id>/card at 390 px the way a bot would, with a
// plain full-page screenshot. Usage: node shot.mjs <base url> <out dir> name=<lesson id> ...
// Prints, per card, the document height against the card height (a
// full-page capture must hold the whole card), any element whose content
// is still wider than its box (cut off in a screenshot), any element
// reaching past the card's right edge, any control
// still displayed, and every
// non-GET request the page sent.
import puppeteer from "puppeteer-core";
const [, , base, outDir, ...pairs] = process.argv;
const browser = await puppeteer.launch({
	// CHROME_PATH (docs/development.md) or the host's chrome-headless-shell.
	executablePath: process.env.CHROME_PATH ?? "/home/matt/.t3/tools/chrome-headless-shell/linux64/156.0.8078.70/chrome-headless-shell",
	args: ["--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
const requests = [];
page.on("request", (r) => { if (r.method() !== "GET") requests.push(`${r.method()} ${r.url()}`); });
for (const pair of pairs) {
	const [name, id] = pair.split("=");
	await page.goto(`${base}/chat/${id}/card`, { waitUntil: "load", timeout: 180000 });
	await page.waitForSelector('[data-testid="question-card"]');
	await page.evaluate(() => document.fonts.ready);
	await new Promise((r) => setTimeout(r, 1500));
	const report = await page.evaluate(() => {
		const card = document.querySelector('[data-testid="question-card"]');
		const clipped = [];
		for (const el of card.querySelectorAll("*")) {
			if (el.classList.contains("katex-mathml")) continue;
			const o = getComputedStyle(el).overflowX;
			if (["auto", "scroll", "hidden", "clip"].includes(o) && el.scrollWidth > el.clientWidth + 1)
				clipped.push(`${el.tagName}.${String(el.className?.baseVal ?? el.className).slice(0, 40)} ${el.clientWidth}/${el.scrollWidth}`);
		}
		const cardRight = card.getBoundingClientRect().right;
		const outside = [];
		for (const el of card.querySelectorAll("*")) {
			if (el.closest(".katex-mathml")) continue;
			const r = el.getBoundingClientRect();
			if (r.width > 0 && r.right > cardRight + 1) outside.push(`${el.tagName}.${String(el.className?.baseVal ?? el.className).slice(0, 30)} right=${Math.round(r.right)}`);
		}
		const shownButtons = [...card.querySelectorAll("button, input, textarea, select")].filter((el) => getComputedStyle(el).display !== "none").length;
		return {
			shownButtons,
			documentHeight: document.documentElement.scrollHeight,
			cardHeight: Math.ceil(card.getBoundingClientRect().height),
			documentWidth: document.documentElement.scrollWidth,
			clipped,
			outside: outside.slice(0, 5),
		};
	});
	await page.screenshot({ path: `${outDir}/card-${name}-390.png`, fullPage: true });
	console.log(name, JSON.stringify(report));
}
console.log("non-GET requests:", JSON.stringify(requests));
await browser.close();
