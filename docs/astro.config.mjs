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
      sidebar: [
        // {
        //   label: "Guides",
        //   items: [
        //     // Each item here is one entry in the navigation menu.
        //     { label: "Example Guide", slug: "guides/example" },
        //   ],
        // },
        // {
        //   label: "Reference",
        //   autogenerate: { directory: "reference" },
        // },
        {
          label: "What is Hollo?",
          slug: "intro",
        },
        {
          label: "Installation",
          items: [
            { label: "Deploy to Railway", slug: "install/railway" },
            { label: "Deploy using Docker", slug: "install/docker" },
            { label: "Manual installation", slug: "install/manual" },
            { label: "Environment variables", slug: "install/env" },
            { label: "Setting up", slug: "install/setup" },
          ],
        },
      ],
    }),
  ],
});
