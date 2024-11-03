import type { PropsWithChildren } from "hono/jsx";
import { Layout, type LayoutProps } from "./Layout";

export type Menu = "accounts" | "emojis" | "federation" | "auth";

export interface DashboardLayoutProps extends LayoutProps {
  selectedMenu?: Menu;
}

export function DashboardLayout(
  props: PropsWithChildren<DashboardLayoutProps>,
) {
  return (
    <Layout {...props}>
      <header>
        <nav>
          <ul>
            <li>
              <picture>
                <source
                  srcset="https://cdn.jsdelivr.net/gh/dahlia/hollo@main/logo-white.svg"
                  media="(prefers-color-scheme: dark)"
                />
                <img
                  src="https://cdn.jsdelivr.net/gh/dahlia/hollo@main/logo-black.svg"
                  width={50}
                  height={50}
                  alt=""
                />
              </picture>
              Hollo Dashboard
            </li>
          </ul>
          <ul>
            <li>
              {props.selectedMenu === "accounts" ? (
                <a href="/accounts" class="contrast">
                  <strong>Accounts</strong>
                </a>
              ) : (
                <a href="/accounts">Accounts</a>
              )}
            </li>
            <li>
              {props.selectedMenu === "emojis" ? (
                <a href="/emojis" class="contrast">
                  <strong>Custom emojis</strong>
                </a>
              ) : (
                <a href="/emojis">Custom emojis</a>
              )}
            </li>
            <li>
              {props.selectedMenu === "federation" ? (
                <a href="/federation" class="contrast">
                  <strong>Federation</strong>
                </a>
              ) : (
                <a href="/federation">Federation</a>
              )}
            </li>
            <li>
              {props.selectedMenu === "auth" ? (
                <a href="/auth" class="contrast">
                  <strong>Auth</strong>
                </a>
              ) : (
                <a href="/auth">Auth</a>
              )}
            </li>
          </ul>
        </nav>
      </header>
      {props.children}
    </Layout>
  );
}
