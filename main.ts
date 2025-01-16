import { Context, Hono } from "hono";

const app = new Hono();

// Mastodonのエイリアス
const MASTODON_ALIASES: Record<string, string> = {
  "@puzakura@puzakura.com": "@dampuzakura@fedibird.com",
};

const parseAlias = (alias: string) => {
  const match = alias.match(/^@(?<targetHandle>[^@]+)@(?<targetInstance>[^@]+)$/);
  if (!match?.groups) return null;
  return match.groups;
};

const getAliasData = (handle: string, instance: string) => {
  const alias = MASTODON_ALIASES[`@${handle}@${instance}`];
  if (!alias) return null;
  return parseAlias(alias);
};

const buildRedirectUrl = (targetHandle: string, targetInstance: string) => {
  return `https://${targetInstance}/@${targetHandle}`;
};

app.get("/.well-known/webfinger", (c: Context) => {
  const { resource } = c.req.query();
  if (!resource) {
    return c.json({ error: "resource query is required" }, 400);
  }

  const resourceMatch = resource.match(
    /^(acct:(?<requestedHandle>[^@]+)@(?<requestedInstance>[^@]+)|https?:\/\/(?<requestedInstance>[^\/]+)\/(@(?<requestedHandle>[^\/]+)|users\/(?<requestedHandle>[^\/]+)))$/,
  );
  if (!resourceMatch?.groups) {
    return c.json({ error: "invalid resource format" }, 400);
  }

  const { requestedHandle, requestedInstance } = resourceMatch.groups;
  const aliasData = getAliasData(requestedHandle, requestedInstance);
  if (!aliasData) {
    return c.json({ error: "Not Found" }, 404);
  }

  const { targetHandle, targetInstance } = aliasData;

  return c.json({
    subject: `acct:${targetHandle}@${targetInstance}`,
    aliases: [
      `https://${targetInstance}/@${targetHandle}`,
      `https://${targetInstance}/users/${targetHandle}`,
    ],
    links: [
      {
        rel: "http://webfinger.net/rel/profile-page",
        type: "text/html",
        href: `https://${targetInstance}/@${targetHandle}`,
      },
      {
        rel: "self",
        type: "application/activity+json",
        href: `https://${targetInstance}/users/${targetHandle}`,
      },
      {
        rel: "http://ostatus.org/schema/1.0/subscribe",
        template: `https://${targetInstance}/authorize_interaction?uri={uri}`,
      },
    ],
  });
});

const handleRedirect = (c: Context, handle: string) => {
  const instance = c.req.header("Host");
  if (!instance) {
    return c.json({ error: "Host header is required" }, 400);
  }
  const aliasData = getAliasData(handle, instance);
  if (!aliasData) {
    return c.json({ error: "Not Found" }, 404);
  }
  const { targetHandle, targetInstance } = aliasData;
  return c.redirect(buildRedirectUrl(targetHandle, targetInstance), 308);
};

app.get("/:path", (c: Context) => {
  const { path } = c.req.param();
  const pathMatch = path.match(/^@(?<handle>[^@]+)$/);
  if (!pathMatch?.groups) {
    return c.json({ error: "invalid path format" }, 400);
  }
  const { handle } = pathMatch.groups;
  return handleRedirect(c, handle);
});

app.get("/users/:handle", (c: Context) => {
  const { handle } = c.req.param();
  return handleRedirect(c, handle);
});

app.onError((error: Context, c: Context) => {
  console.error(error);
  return c.json({ error: "Internal Server Error" }, 500);
});

Deno.serve(app.fetch);
