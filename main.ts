import { Context, Hono } from "hono";

const app = new Hono();

// Mastodonエイリアス
const MASTODON_ALIASES: Record<string, string> = {
  "@puzakura@puzakura.com": "@dampuzakura@fedibird.com",
};

const getMastodonAliasInfo = (handle: string, instance: string) => {
  const alias = MASTODON_ALIASES[`@${handle}@${instance}`];
  return alias && alias.match(/^@(?<handle>[^@]+)@(?<instance>[^@]+)$/)?.groups;
};

app.get("/.well-known/webfinger", (c: Context) => {
  const { resource } = c.req.query();
  if (!resource) {
    return c.json({ error: "resource query is required" }, 400);
  }

  const resourceMatch = resource.match(
    /^(acct:(?<handle>[^@]+)@(?<instance>[^@]+)|https?:\/\/(?<instance>[^\/]+)\/(@(?<handle>[^\/]+)|users\/(?<handle>[^\/]+)))$/,
  );
  if (!resourceMatch?.groups) {
    return c.json({ error: "invalid resource format" }, 400);
  }

  const { handle, instance } = resourceMatch.groups;
  const aliasInfo = getMastodonAliasInfo(handle, instance);
  if (!aliasInfo) {
    return c.json({ error: "Not Found" }, 404);
  }

  const { handle: targetHandle, instance: targetInstance } = aliasInfo;

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

const redirectMastodonUser = (c: Context, handle: string) => {
  const instance = c.req.header("Host");
  if (!instance) {
    return c.json({ error: "Host header is required" }, 400);
  }
  const aliasInfo = getMastodonAliasInfo(handle, instance);
  if (!aliasInfo) {
    return c.json({ error: "Not Found" }, 404);
  }
  const { handle: targetHandle, instance: targetInstance } = aliasInfo;
  return c.redirect(`https://${targetInstance}/@${targetHandle}`, 308);
};

app.get("/users/:handle", (c: Context) => {
  const { handle } = c.req.param();
  return redirectMastodonUser(c, handle);
});

// Bluesky DID
const BLUESKY_DIDS: Record<string, string> = {
  "@puzakura.com": "did:plc:bsxc4xeomcekctnqkojxws42",
};

const getBlueskyDidInfo = (handle: string) => {
  const did = BLUESKY_DIDS[`@${handle}`];
  return did && did.match(/^@(?<handle>[^@]+)$/)?.groups;
};

app.get("/.well-known/atproto-did", (c: Context) => {
  const handle = c.req.header("Host");
  if (!handle) {
    return c.json({ error: "Host header is required" }, 400);
  }
  const didInfo = getBlueskyDidInfo(handle);
  if (!didInfo) {
    return c.json({ error: "Not Found" }, 404);
  }

  const { did } = didInfo;

  return c.text(`${did}`);
});

const redirectBlueskyUser = (c: Context) => {
  const handle = c.req.header("Host");
  if (!handle) {
    return c.json({ error: "Host header is required" }, 400);
  }
  const didInfo = getBlueskyDidInfo(handle);
  if (!didInfo) {
    return c.json({ error: "Not Found" }, 404);
  }
  const { did: targetDid } = didInfo;
  return c.redirect(`https://bsky.app/profile/${targetDid}`, 308);
};

app.get("/:path", (c: Context) => {
  const { path } = c.req.param();
  if (path === "bluesky") {
    return redirectBlueskyUser(c);
  }
  const pathMatch = path.match(/^@(?<handle>[^@]+)$/);
  if (!pathMatch?.groups) {
    return c.json({ error: "invalid path format" }, 400);
  }
  const { handle } = pathMatch.groups;
  return redirectMastodonUser(c, handle);
});

app.onError((error: Context, c: Context) => {
  console.error(error);
  return c.json({ error: "Internal Server Error" }, 500);
});

Deno.serve(app.fetch);
