import type { PropsWithChildren } from "hono/jsx";

export interface LayoutProps {
  title: string;
  shortTitle?: string | null;
  url?: string | null;
  description?: string | null;
  imageUrl?: string | null;
}

export const Layout = (props: PropsWithChildren<LayoutProps>) => {
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
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css"
        />
      </head>
      <body>
        <main className="container">{props.children}</main>
      </body>
    </html>
  );
};

export default Layout;
