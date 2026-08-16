/**
 * In-browser PDF text extraction using pdf.js.
 * The worker is bundled as a static asset (`?url`) so the build stays portable.
 */
export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const workerModule = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;

  const data = await file.arrayBuffer();
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  const pages: string[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    const parts: string[] = [];
    for (const item of content.items as Array<{ str?: string; transform?: number[] }>) {
      if (typeof item.str !== "string") continue;
      const y = item.transform ? item.transform[5] : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) parts.push("\n");
      parts.push(item.str);
      if (y !== null) lastY = y;
    }
    pages.push(parts.join(" ").replace(/[ \t]+/g, " ").replace(/\n /g, "\n").trim());
  }

  await task.destroy();
  return pages.filter(Boolean).join("\n\n").trim();
}
