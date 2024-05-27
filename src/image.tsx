import { Hono } from "hono";

const app = new Hono();

app.get("/avatars/original/missing.png", (c) => {
  return c.html(
    <svg
      width="24px"
      height="24px"
      stroke-width="1.5"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      color="#000000"
    >
      <title>Default avatar</title>
      <path
        d="M5 20V19C5 15.134 8.13401 12 12 12V12C15.866 12 19 15.134 19 19V20"
        stroke="#000000"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M12 12C14.2091 12 16 10.2091 16 8C16 5.79086 14.2091 4 12 4C9.79086 4 8 5.79086 8 8C8 10.2091 9.79086 12 12 12Z"
        stroke="#000000"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>,
    200,
    { "Content-Type": "image/svg+xml" },
  );
});

app.get("/headers/original/missing.png", (c) => {
  const emptyPng = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0xd, 0xa, 0x1a, 0xa, 0x0, 0x0, 0x0, 0xd, 0x49, 0x48,
    0x44, 0x52, 0x0, 0x0, 0x0, 0x1, 0x0, 0x0, 0x0, 0x1, 0x8, 0x4, 0x0, 0x0, 0x0,
    0xb5, 0x1c, 0xc, 0x2, 0x0, 0x0, 0x0, 0xb, 0x49, 0x44, 0x41, 0x54, 0x78, 0x1,
    0x63, 0x60, 0x60, 0x0, 0x0, 0x0, 0x3, 0x0, 0x1, 0x8c, 0xf8, 0x39, 0x3a, 0x0,
    0x0, 0x0, 0x0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
  return c.body(emptyPng.buffer as ArrayBuffer);
});

export default app;
