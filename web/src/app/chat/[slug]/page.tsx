import { PublicChat } from "@/components/public-chat";

export default async function PublicChatPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PublicChat slug={slug} />;
}
