import { Hono } from "hono";
import { NewAccountPage } from "../../components/AccountNewPage.tsx";

const accountsNew = new Hono();

accountsNew.get("/", (c) => {
  return c.html(<NewAccountPage values={{ language: "en" }} />);
});

export default accountsNew;
