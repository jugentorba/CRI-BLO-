import { z } from "zod";
import { proxyPage } from "@/lib/browser/proxy.browser";

const schema = z.object({ url: z.string().min(4).max(2000) });

export async function openRemotePage(input: { data: z.infer<typeof schema> }) {
  return proxyPage(schema.parse(input.data).url);
}
