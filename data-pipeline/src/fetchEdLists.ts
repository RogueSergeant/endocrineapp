import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { request } from "undici";
import type { ListId } from "./types.ts";

const SOURCES: Record<ListId, string> = {
  1: "https://edlists.org/export/list/1?_format=xlsx",
  2: "https://edlists.org/export/list/2?_format=xlsx",
  3: "https://edlists.org/export/list/3?_format=xlsx",
};

export interface FetchResult {
  listId: ListId;
  filePath: string;
  bytes: number;
  fetchedAt: string;
}

export async function fetchEdLists(rawDir: string): Promise<FetchResult[]> {
  await mkdir(rawDir, { recursive: true });
  const results: FetchResult[] = [];
  for (const [idStr, url] of Object.entries(SOURCES)) {
    const listId = Number(idStr) as ListId;
    process.stdout.write(`  ↓ fetching list ${listId} from ${url}\n`);
    const res = await request(url, {
      method: "GET",
      headers: {
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 ed-scanner-data-pipeline/0.1",
        accept:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel;q=0.9,*/*;q=0.5",
        "accept-language": "en-GB,en;q=0.9",
      },
      maxRedirections: 5,
    });
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(`edlists.org list ${listId}: HTTP ${res.statusCode}`);
    }
    const buf = Buffer.from(await res.body.arrayBuffer());
    const filePath = join(rawDir, `list-${listId}.xlsx`);
    await writeFile(filePath, buf);
    results.push({
      listId,
      filePath,
      bytes: buf.byteLength,
      fetchedAt: new Date().toISOString(),
    });
  }
  await writeFile(
    join(rawDir, "metadata.json"),
    JSON.stringify({ fetchedAt: new Date().toISOString(), sources: results }, null, 2),
  );
  return results;
}
