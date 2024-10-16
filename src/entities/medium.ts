import type { Medium } from "../schema";

// biome-ignore lint/suspicious/noExplicitAny: JSON
export function serializeMedium(medium: Medium): Record<string, any> {
  return {
    id: medium.id,
    type: medium.type.replace(/\/.*$/, ""),
    url: medium.url,
    preview_url: medium.thumbnailUrl,
    remote_url: null,
    text_url: null,
    meta: {
      original: {
        width: medium.width,
        height: medium.height,
        size: `${medium.width}x${medium.height}`,
        aspect: medium.width / medium.height,
      },
      small: {
        width: medium.thumbnailWidth,
        height: medium.thumbnailHeight,
        size: `${medium.thumbnailWidth}x${medium.thumbnailHeight}`,
        aspect: medium.thumbnailWidth / medium.thumbnailHeight,
      },
      focus: { x: 0, y: 0 },
    },
    description: medium.description,
    blurhash: null,
  };
}
