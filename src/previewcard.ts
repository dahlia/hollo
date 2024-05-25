import ogs from "open-graph-scraper";

export interface PreviewCard {
  url: string;
  title: string;
  description: string | null;
  image: {
    url: string;
    type: string | null;
    width: number | null;
    height: number | null;
  } | null;
}

export async function fetchPreviewCard(
  url: string | URL,
): Promise<PreviewCard | null> {
  const { error, result } = await ogs({ url: url.toString() });
  if (error || !result.success || result.ogTitle == null) return null;
  return {
    url: result.ogUrl ?? url.toString(),
    title: result.ogTitle,
    description: result.ogDescription ?? "",
    image:
      result.ogImage == null || result.ogImage.length < 1
        ? null
        : {
            url: result.ogImage[0].url,
            type: result.ogImage[0].type ?? null,
            width: result.ogImage[0].width ?? null,
            height: result.ogImage[0].height ?? null,
          },
  };
}
