import { type Context, Emoji, Image } from "@fedify/fedify";

interface CustomEmoji {
  shortcode: string;
  url: string;
}

export function toEmoji(ctx: Context<unknown>, emoji: CustomEmoji): Emoji {
  const shortcode = emoji.shortcode.replace(/^:|:$/g, "");
  return new Emoji({
    id: ctx.getObjectUri(Emoji, { shortcode }),
    name: `:${shortcode}:`,
    icon: new Image({ url: new URL(emoji.url) }),
  });
}
