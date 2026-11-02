import puppeteer from "puppeteer-core";
const [, , base, outDir, ...pairs] = process.argv;
const browser = await puppeteer.launch({
	executablePath: "/home/matt/.t3/tools/chrome-headless-shell/linux64/156.0.8078.70/chrome-headless-shell",
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
	await new Promise((r) => setTimeout(r, 1500));
	const h = await page.$eval('[data-testid="question-card"] main', (el) => Math.ceil(el.getBoundingClientRect().height));
	await page.setViewport({ width: 390, height: Math.max(h, 400), deviceScaleFactor: 2 });
	await new Promise((r) => setTimeout(r, 500));
	await page.screenshot({ path: `${outDir}/card-${name}-390.png` });
	await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
	console.log(name, "height", h);
}
console.log("non-GET requests:", JSON.stringify(requests));
await browser.close();
