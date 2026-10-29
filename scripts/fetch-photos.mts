// Fetch category photos from the official Unsplash API.
//   UNSPLASH_ACCESS_KEY=xxxx npx tsx scripts/fetch-photos.mts
// Follows the API guidelines: the download endpoint is triggered and photographer credits are saved
// to public/img/categories/credits.json (shown in the site footer).
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const key = process.env.UNSPLASH_ACCESS_KEY;
if (!key) {
  console.error("Zet UNSPLASH_ACCESS_KEY (https://unsplash.com/developers, gratis demo-app).");
  process.exit(1);
}

const QUERIES: Record<string, string> = {
  coffee: "minimal coffee cup neutral background",
  bakery: "minimal croissant neutral background",
  supermarket: "minimal groceries paper bag neutral",
  green: "minimal park path green trees",
  surprise: "minimal windmill viewpoint landscape",
  loop: "minimal running path",
};

const out = path.join(process.cwd(), "public", "img", "categories");
await mkdir(out, { recursive: true });
const headers = { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" };
const credits: Record<string, { photographer: string; profile: string; photo: string }> = {};

for (const [file, query] of Object.entries(QUERIES)) {
  const res = await fetch(`https://api.unsplash.com/search/photos?per_page=5&orientation=landscape&content_filter=high&query=${encodeURIComponent(query)}`, { headers });
  if (!res.ok) throw new Error(`Zoeken mislukt voor ${file}: ${res.status}`);
  const photo = ((await res.json()) as { results: any[] }).results[0];
  if (!photo) {
    console.warn(`Geen resultaat voor ${file}`);
    continue;
  }
  await fetch(photo.links.download_location, { headers }); // required by the API guidelines
  const img = await fetch(`${photo.urls.raw}&w=1000&q=80&fit=crop&crop=entropy&ar=4:3&fm=jpg`);
  if (!img.ok) throw new Error(`Downloaden mislukt voor ${file}: ${img.status}`);
  await writeFile(path.join(out, `${file}.jpg`), Buffer.from(await img.arrayBuffer()));
  credits[file] = { photographer: photo.user.name, profile: `${photo.user.links.html}?utm_source=rondjehardlopen&utm_medium=referral`, photo: `${photo.links.html}?utm_source=rondjehardlopen&utm_medium=referral` };
  console.log(`${file}.jpg  ${photo.user.name}  ${photo.links.html}`);
}
await writeFile(path.join(out, "credits.json"), JSON.stringify(credits, null, 2));
console.log("Klaar. Bekijk de foto's en vervang er een met de hand als er een niet bevalt.");
