import type { PropsWithChildren } from "hono/jsx";

export interface LayoutProps {
  title: string;
  shortTitle?: string | null;
  url?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  links?: { href: string | URL; rel: string; type?: string }[];
}

export function Layout(props: PropsWithChildren<LayoutProps>) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{props.title}</title>
        <meta property="og:title" content={props.shortTitle ?? props.title} />
        {props.description && (
          <>
            <meta name="description" content={props.description} />
            <meta property="og:description" content={props.description} />
          </>
        )}
        {props.url && (
          <>
            <link rel="canonical" href={props.url} />
            <meta property="og:url" content={props.url} />
          </>
        )}
        {props.imageUrl && (
          <meta property="og:image" content={props.imageUrl} />
        )}
        {props.links?.map((link) => (
          <link
            rel={link.rel}
            href={link.href instanceof URL ? link.href.href : link.href}
            type={link.type}
          />
        ))}
        <link rel="stylesheet" href="/public/pico.min.css" />
        <link rel="stylesheet" href="/public/pico.colors.min.css" />
        <link
          rel="icon"
          type="image/png"
          sizes="500x500"
          href="/public/favicon.png"
        />
      </head>
      <body>
        <main className="container">{props.children}</main>
      </body>
    </html>
  );
}
