import { Hono } from "hono";
import { trimTrailingSlash } from "hono/trailing-slash";
import accounts from "./accounts";
import auth from "./auth";
import emojis from "./emojis";
import federation from "./federation";
import home from "./home";
import login from "./login";
import profile from "./profile";
import setup from "./setup";
import tags from "./tags";

const page = new Hono();

page.use(trimTrailingSlash());
page.route("/", home);
page.route("/:handle{@[^/]+}", profile);
page.route("/login", login);
page.route("/setup", setup);
page.route("/auth", auth);
page.route("/accounts", accounts);
page.route("/emojis", emojis);
page.route("/federation", federation);
page.route("/tags", tags);

export default page;
