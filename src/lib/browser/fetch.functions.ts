import { z } from "zod";
import { fetchRemoteFile } from "@/lib/browser/fetch.browser";

const schema = z.object({ url: z.string().min(4).max(2000) });

export async function downloadRemoteFile(input: { data: z.infer<typeof schema> }) {
  return fetchRemoteFile(schema.parse(input.data).url);
}
