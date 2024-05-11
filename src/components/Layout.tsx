import type { FC, PropsWithChildren } from "hono/jsx";

export interface LayoutProps {
  title: string;
}

export const Layout: FC<PropsWithChildren<LayoutProps>> = (props) => {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{props.title}</title>
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
