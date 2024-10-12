import { PutObjectCommand } from "@aws-sdk/client-s3";
import { desc, isNotNull, ne } from "drizzle-orm";
import { Hono } from "hono";
import { DashboardLayout } from "../components/DashboardLayout";
import db from "../db";
import { loginRequired } from "../login";
import { S3_BUCKET, S3_URL_BASE, s3 } from "../s3";
import { accounts, customEmojis, posts, reactions } from "../schema";

const emojis = new Hono();

emojis.use(loginRequired);

emojis.get("/", async (c) => {
  const emojis = await db.query.customEmojis.findMany({
    orderBy: [customEmojis.category, desc(customEmojis.created)],
  });

  return c.html(
    <DashboardLayout title="Hollo: Custom emojis" selectedMenu="emojis">
      <hgroup>
        <h1>Custom emojis</h1>
        <p>You can register custom emojis for your Hollo accounts.</p>
      </hgroup>
      {emojis.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Short code</th>
              <th>Image</th>
            </tr>
          </thead>
          <tbody>
            {emojis.map((emoji) => (
              <tr>
                <td>{emoji.category}</td>
                <td>
                  <tt>:{emoji.shortcode}:</tt>
                </td>
                <td>
                  <img
                    src={emoji.url}
                    alt={`:${emoji.shortcode}:`}
                    style="height: 24px"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div role="group">
        <a role="button" href="/emojis/new">
          Add a custom emoji
        </a>
        <a role="button" href="/emojis/import" class="secondary">
          Import custom emojis
        </a>
      </div>
    </DashboardLayout>,
  );
});

emojis.get("/new", async (c) => {
  const categories = await db
    .select({ category: customEmojis.category })
    .from(customEmojis)
    .where(isNotNull(customEmojis.category))
    .groupBy(customEmojis.category);
  return c.html(
    <DashboardLayout title="Hollo: Add custom emoji" selectedMenu="emojis">
      <hgroup>
        <h1>Add custom emoji</h1>
        <p>You can add a custom emoji to your Hollo server.</p>
      </hgroup>
      <form method="post" action="/emojis" enctype="multipart/form-data">
        <fieldset class="grid">
          <label>
            Category
            <select
              name="category"
              onchange="this.form.new.disabled = this.value != 'new'"
            >
              <option>None</option>
              <option value="new">New category</option>
              <hr />
              {categories.map(({ category }) => (
                <option value={`category:${category}`}>{category}</option>
              ))}
            </select>
          </label>
          <label>
            New category
            <input type="text" name="new" disabled={true} />
          </label>
        </fieldset>
        <label>
          <span>Short code</span>
          <input
            type="text"
            name="shortcode"
            required
            pattern="^:(-|[a-z0-9_])+:$"
            placeholder=":shortcode:"
          />
        </label>
        <label>
          <span>Image</span>
          <input
            type="file"
            name="image"
            required
            accept="image/png, image/jpeg, image/gif, image/webp"
          />
        </label>
        <button type="submit">Add</button>
      </form>
    </DashboardLayout>,
  );
});

emojis.post("/", async (c) => {
  const form = await c.req.formData();
  const categoryValue = form.get("category")?.toString();
  const category = categoryValue?.startsWith("category:")
    ? categoryValue.slice(9)
    : categoryValue === "new"
      ? (form.get("new")?.toString() ?? "")
      : null;
  let shortcode = form.get("shortcode")?.toString();
  if (shortcode == null) {
    return c.text("No shortcode provided", 400);
  }
  shortcode = shortcode.replace(/^:|:$/g, "");
  const image = form.get("image");
  if (image == null || !(image instanceof File)) {
    return c.text("No image provided", 400);
  }
  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: `emojis/${shortcode}`,
      Body: new Uint8Array(await image.arrayBuffer()),
      ContentType: image.type,
      ACL: "public-read",
    }),
  );
  const url = new URL(`emojis/${shortcode}`, S3_URL_BASE).href;
  await db.insert(customEmojis).values({
    category,
    shortcode,
    url,
  });
  return c.redirect("/emojis");
});

emojis.get("/import", async (c) => {
  const postList = await db.query.posts.findMany({
    with: { account: true },
    where: ne(posts.emojis, {}),
    orderBy: desc(posts.updated),
    limit: 500,
  });
  const reactionList = await db.query.reactions.findMany({
    with: { account: true },
    where: isNotNull(reactions.customEmoji),
    orderBy: desc(reactions.created),
    limit: 500,
  });
  const accountList = await db.query.accounts.findMany({
    where: ne(accounts.emojis, {}),
    orderBy: desc(accounts.updated),
    limit: 500,
  });
  const customEmojis = await db.query.customEmojis.findMany();
  const customEmojiCodes = new Set<string>();
  const customEmojiUrls = new Set<string>();
  const categories = new Set<string>();
  for (const customEmoji of customEmojis) {
    customEmojiCodes.add(customEmoji.shortcode);
    customEmojiUrls.add(customEmoji.url);
    if (customEmoji.category != null) categories.add(customEmoji.category);
  }
  const emojis: Record<
    string,
    { id: string; shortcode: string; url: string; domain: string }
  > = {};
  for (const post of postList) {
    for (let shortcode in post.emojis) {
      const url = post.emojis[shortcode];
      shortcode = shortcode.replace(/^:|:$/g, "");
      if (customEmojiCodes.has(shortcode)) continue;
      if (customEmojiUrls.has(url)) continue;
      const domain = post.account.handle.replace(/^@?[^@]+@/, "");
      const id = `${shortcode}@${domain}`;
      emojis[id] = {
        id,
        shortcode,
        url,
        domain,
      };
    }
  }
  for (const reaction of reactionList) {
    if (reaction.customEmoji == null) continue;
    const shortcode = reaction.emoji.replace(/^:|:$/g, "");
    if (customEmojiCodes.has(shortcode)) continue;
    if (customEmojiUrls.has(reaction.customEmoji)) continue;
    const domain = reaction.account.handle.replace(/^@?[^@]+@/, "");
    const id = `${shortcode}@${domain}`;
    emojis[id] = {
      id,
      shortcode,
      url: reaction.customEmoji,
      domain,
    };
  }
  for (const account of accountList) {
    for (let shortcode in account.emojis) {
      const url = account.emojis[shortcode];
      shortcode = shortcode.replace(/^:|:$/g, "");
      if (customEmojiCodes.has(shortcode)) continue;
      if (customEmojiUrls.has(url)) continue;
      const domain = account.handle.replace(/^@?[^@]+@/, "");
      const id = `${shortcode}@${domain}`;
      emojis[id] = {
        id,
        shortcode,
        url,
        domain,
      };
    }
  }
  return c.html(
    <DashboardLayout title="Hollo: Import custom emojis" selectedMenu="emojis">
      <hgroup>
        <h1>Import custom emojis</h1>
        <p>You can import custom emojis from your peer servers.</p>
      </hgroup>
      <form method="post">
        <table>
          <thead>
            <tr>
              <th>Check</th>
              <th>Short code</th>
              <th>Domain</th>
              <th>Image</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(emojis).map(({ id, shortcode, url, domain }) => (
              <tr>
                <td>
                  <input
                    type="checkbox"
                    id={id}
                    name="import"
                    value={JSON.stringify({ shortcode, url })}
                  />
                </td>
                <td>
                  <label for={id}>
                    <tt>:{shortcode}:</tt>
                  </label>
                </td>
                <td>
                  <label for={id}>{domain}</label>
                </td>
                <td>
                  <label for={id}>
                    <img
                      src={url}
                      alt={`:${shortcode}:`}
                      style="height: 24px"
                    />
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <fieldset class="grid">
          <label>
            Category
            <select
              name="category"
              onchange="this.form.new.disabled = this.value != 'new'"
            >
              <option>None</option>
              <option value="new">New category</option>
              <hr />
              {[...categories].map((category) => (
                <option value={`category:${category}`}>{category}</option>
              ))}
            </select>
          </label>
          <label>
            New category
            <input type="text" name="new" disabled={true} />
          </label>
        </fieldset>
        <button type="submit">Import selected custom emojis</button>
      </form>
    </DashboardLayout>,
  );
});

emojis.post("/import", async (c) => {
  const form = await c.req.formData();
  const categoryValue = form.get("category")?.toString();
  const category = categoryValue?.startsWith("category:")
    ? categoryValue.slice(9)
    : categoryValue === "new"
      ? (form.get("new")?.toString() ?? "")
      : null;
  const imports = form.getAll("import").map((i) => JSON.parse(i.toString()));
  await db.insert(customEmojis).values(
    imports.map(({ shortcode, url }) => ({
      category,
      shortcode,
      url,
    })),
  );
  return c.redirect("/emojis");
});

export default emojis;
