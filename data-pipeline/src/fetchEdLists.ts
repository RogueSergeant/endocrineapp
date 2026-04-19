import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { request } from "undici";

const LIST_IDS = [1, 2, 3] as const;
const RAW_DIR = join(process.cwd(), "data", "raw");

async function fetchList(listId: 1 | 2 | 3): Promise<void> {
  const url = `https://edlists.org/export/list/${listId}?_format=xlsx`;
  console.log(`[fetch] list ${listId} from ${url}`);
  const { statusCode, body } = await request(url, {
    headers: { "user-agent": "ed-scanner-etl/0.1 (+research)" },
  });
  if (statusCode !== 200) {
    throw new Error(`list ${listId} returned HTTP ${statusCode}`);
  }
  const buf = Buffer.from(await body.arrayBuffer());
  const outPath = join(RAW_DIR, `list-${listId}.xlsx`);
  await writeFile(outPath, buf);
  console.log(`[fetch] wrote ${outPath} (${buf.byteLength} bytes)`);
}

export async function fetchAllLists(): Promise<void> {
  await mkdir(RAW_DIR, { recursive: true });
  for (const id of LIST_IDS) {
    await fetchList(id);
  }
  await writeFile(
    join(RAW_DIR, "_fetched-at.json"),
    JSON.stringify({ fetchedAt: new Date().toISOString() }, null, 2),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fetchAllLists().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
