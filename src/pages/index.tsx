import { Hono } from "hono";
import accounts from "./accounts";
import accountsId from "./accounts/accountsId";
import accountsNew from "./accounts/accountsNew";
import home from "./home";
import login from "./login";
import profile from "./profile";
import profilePost from "./profile/profilePost";
import setup from "./setup";
import tags from "./tags";

const page = new Hono();

page.route("/", home);
page.route("/", profile.route("/:id", profilePost));
page.route("/", login);
page.route("/", setup);
page.route("/", accounts.route("/new", accountsNew).route("/:id", accountsId));
page.route("/tags", tags);

export default page;
