import { Context, Hono } from "hono";

const app = new Hono();

// Mastodonのエイリアス
const MASTODON_ALIASES: Record<string, string> = {
  "@puzakura@puzakura.com": "@dampuzakura@fedibird.com",
};

app.get("/.well-known/webfinger", (c: Context) => {
  const { resource } = c.req.query();
  if (!resource) {
    return c.json({ error: "resource query is required" }, 400);
  }

  const acctMatch = resource.match(
    /^(acct:(?<reqHandle>[^@]+)@(?<reqInstance>[^@]+)|https?:\/\/(?<reqInstance>[^\/]+)\/(@(?<reqHandle>[^\/]+)|users\/(?<reqHandle>[^\/]+)))$/,
  );
  if (!acctMatch?.groups) {
    return c.json({ error: "invalid resource format" }, 400);
  }

  const { reqHandle, reqInstance } = acctMatch.groups;

  const alias = MASTODON_ALIASES[`@${reqHandle}@${reqInstance}`];
  if (!alias) {
    return c.json({ error: "Not Found" }, 404);
  }

  const aliasMatch = alias.match(
    /^@(?<resHandle>[^@]+)@(?<resInstance>[^@]+)$/,
  );
  if (!aliasMatch?.groups) {
    return c.json({ error: "invalid alias format" }, 500);
  }

  const { resHandle, resInstance } = aliasMatch.groups;

  return c.json({
    subject: `acct:${resHandle}@${resInstance}`,
    aliases: [
      `https://${resInstance}/@${resHandle}`,
      `https://${resInstance}/users/${resHandle}`,
    ],
    links: [
      {
        rel: "http://webfinger.net/rel/profile-page",
        type: "text/html",
        href: `https://${resInstance}/@${resHandle}`,
      },
      {
        rel: "self",
        type: "application/activity+json",
        href: `https://${resInstance}/users/${resHandle}`,
      },
      {
        rel: "http://ostatus.org/schema/1.0/subscribe",
        template: `https://${resInstance}/authorize_interaction?uri={uri}`,
      },
    ],
  });
});

app.get("/:path", (c: Context) => {
  const { path } = c.req.param();

  const pathMatch = path.match(/^@(?<handle>[^@]+)$/);
  if (!pathMatch?.groups) {
    return c.json({ error: "invalid path format" }, 400);
  }

  const { handle } = pathMatch.groups;

  const instance = c.req.header("Host");

  const alias = MASTODON_ALIASES[`@${handle}@${instance}`];
  if (!alias) {
    return c.json({ error: "Not Found" }, 404);
  }

  const aliasMatch = alias.match(
    /^@(?<resHandle>[^@]+)@(?<resInstance>[^@]+)$/,
  );
  if (!aliasMatch?.groups) {
    return c.json({ error: "invalid alias format" }, 500);
  }

  const { resHandle, resInstance } = aliasMatch.groups;

  return c.redirect(`https://${resInstance}/@${resHandle}`,308);
});

app.get("/users/:handle", (c: Context) => {
  const { handle } = c.req.param();

  const instance = c.req.header("Host");
  console.log(handle, instance);

  const alias = MASTODON_ALIASES[`@${handle}@${instance}`];
  if (!alias) {
    return c.json({ error: "Not Found" }, 404);
  }

  const aliasMatch = alias.match(
    /^@(?<resHandle>[^@]+)@(?<resInstance>[^@]+)$/,
  );
  if (!aliasMatch?.groups) {
    return c.json({ error: "invalid alias format" }, 500);
  }

  const { resHandle, resInstance } = aliasMatch.groups;

  return c.redirect(`https://${resInstance}/@${resHandle}`,308);
});

app.onError((err: Context, c: Context) => {
  console.error(err);
  return c.json({ error: "Internal Server Error" }, 500);
});

Deno.serve(app.fetch);
