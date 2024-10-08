import starlight from "@astrojs/starlight";
// @ts-check
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: "Hollo",
      logo: {
        dark: "./src/assets/logo-white.svg",
        light: "./src/assets/logo-black.svg",
        replacesTitle: true,
      },
      customCss: ["./src/styles/custom.css"],
      social: {
        mastodon: "https://hollo.social/@hollo",
        github: "https://github.com/dahlia/hollo",
      },
      locales: {
        root: {
          label: "English",
          lang: "en",
        },
        ko: {
          label: "한국어",
        },
        ja: {
          label: "日本語",
        },
      },
      sidebar: [
        {
          slug: "intro",
          label: "What is Hollo?",
          translations: {
            ko: "Hollo란?",
            ja: "Holloとは？",
          },
        },
        {
          label: "Installation",
          translations: {
            ko: "설치",
            ja: "インストール",
          },
          items: [
            {
              label: "Deploy to Railway",
              translations: {
                ko: "Railway에 배포",
                ja: "Railwayにデプロイ",
              },
              slug: "install/railway",
            },
            {
              label: "Deploy using Docker",
              translations: {
                ko: "Docker로 배포",
                ja: "Dockerでデプロイ",
              },
              slug: "install/docker",
            },
            {
              label: "Manual installation",
              translations: {
                ko: "수동 설치",
                ja: "手動インストール",
              },
              slug: "install/manual",
            },
            {
              label: "Environment variables",
              translations: {
                ko: "환경 변수",
                ja: "環境変数",
              },
              slug: "install/env",
            },
            {
              label: "Setting up",
              translations: {
                ko: "설정하기",
                ja: "初期設定",
              },
              slug: "install/setup",
            },
          ],
        },
      ],
      head:
        process.env.PLAUSIBLE_DOMAIN == null
          ? []
          : [
              {
                tag: "script",
                attrs: {
                  defer: true,
                  "data-domain": process.env.PLAUSIBLE_DOMAIN,
                  src: "https://plausible.io/js/script.outbound-links.js",
                },
              },
            ],
    }),
  ],
});
