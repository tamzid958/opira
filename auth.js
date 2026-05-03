import NextAuth from "next-auth";
import authConfig from "./auth.config";

const OP_BASE = (process.env.OPENPROJECT_URL || "").replace(/\/$/, "");

// Custom OAuth provider for OpenProject (RFC 6749 Authorization Code + PKCE).
// OpenProject doesn't ship OIDC discovery, so we wire endpoints by hand.
function OpenProjectProvider() {
  return {
    id: "openproject",
    name: "OpenProject",
    type: "oauth",
    authorization: {
      url: `${OP_BASE}/oauth/authorize`,
      params: { scope: "api_v3" },
    },
    token: `${OP_BASE}/oauth/token`,
    userinfo: `${OP_BASE}/api/v3/users/me`,
    clientId: process.env.OPENPROJECT_OAUTH_CLIENT_ID,
    clientSecret: process.env.OPENPROJECT_OAUTH_CLIENT_SECRET,
    checks: ["pkce", "state"],
    profile(profile) {
      const fullName =
        profile.name ||
        [profile.firstName, profile.lastName].filter(Boolean).join(" ") ||
        profile.login ||
        String(profile.id);
      return {
        id: String(profile.id),
        name: fullName,
        email: profile.email || null,
        login: profile.login || null,
        admin: profile.admin === true,
      };
    },
  };
}

async function refreshAccessToken(token) {
  try {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: token.refreshToken,
      client_id: process.env.OPENPROJECT_OAUTH_CLIENT_ID,
      client_secret: process.env.OPENPROJECT_OAUTH_CLIENT_SECRET,
    });
    const res = await fetch(`${OP_BASE}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const next = await res.json();
    if (!res.ok) throw new Error(next.error_description || next.error || `${res.status}`);
    return {
      ...token,
      accessToken: next.access_token,
      refreshToken: next.refresh_token ?? token.refreshToken,
      expiresAt: Date.now() + (next.expires_in ?? 3600) * 1000,
      error: undefined,
    };
  } catch (e) {
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [OpenProjectProvider()],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, account, profile }) {
      // Initial sign-in: capture tokens issued by OpenProject.
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at
            ? account.expires_at * 1000
            : Date.now() + 3600 * 1000,
          opUserId: profile ? String(profile.id) : token.sub,
          login: profile?.login || null,
          admin: profile?.admin === true,
        };
      }
      // Subsequent calls: refresh if close to expiry (60s buffer).
      if (token.expiresAt && Date.now() < token.expiresAt - 60_000) return token;
      if (!token.refreshToken) return { ...token, error: "RefreshAccessTokenError" };
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.error = token.error;
      if (session.user) {
        session.user.id = token.opUserId || token.sub;
        session.user.login = token.login || null;
        session.user.admin = token.admin === true;
      }
      return session;
    },
  },
});
